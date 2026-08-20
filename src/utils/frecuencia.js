// src/utils/frecuencia.js

/* =========================================================
   NORMALIZACIÓN INSTITUCIONAL DE FRECUENCIAS
   =========================================================

   Este módulo convierte las diferentes formas encontradas
   en los PDFs CEVAZ en una única frecuencia estándar.

   FRECUENCIAS SOPORTADAS:

   - MARTES Y JUEVES
   - MIERCOLES Y VIERNES
   - LUNES
   - SABATINO
   - INTENSIVO
   - SEMI INTENSIVO

   IMPORTANTE:

   "INTENSIVO A" y "INTENSIVO B" NO son dos frecuencias
   distintas.

   Ambos pertenecen a:

   INTENSIVO

   Las letras A/B pueden identificar períodos, pero no deben
   producir un cambio de frecuencia entre estudiantes.
   ========================================================= */

export const FREQUENCIES = Object.freeze({
  MARTES_JUEVES: "MARTES Y JUEVES",

  MIERCOLES_VIERNES:
    "MIERCOLES Y VIERNES",

  LUNES: "LUNES",

  SABATINO: "SABATINO",

  INTENSIVO: "INTENSIVO",

  SEMI_INTENSIVO:
    "SEMI INTENSIVO",

  NA: "N/A",
});


/* =========================================================
   UTILIDADES DE TEXTO
   ========================================================= */

const stripDiacritics = (
  value = ""
) => {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
};


const normalizeText = (
  value = ""
) => {
  return stripDiacritics(
    value
  )
    .toUpperCase()

    .replace(
      /[–—]/g,
      "-"
    )

    /*
      Conservamos:

      &
      /
      ,
      _
      -

      porque algunos horarios y nombres
      de archivos los utilizan.
    */

    .replace(
      /[^A-Z0-9&/,_\-]+/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
};


/* =========================================================
   DISTANCIA LEVENSHTEIN
   ========================================================= */

/*
  Permite tolerar pequeños errores de escritura.

  Ejemplos:

  THRUSDAY
  THURSDY
  TUESDY
  WEDNESDY

  sin convertir cualquier palabra arbitraria
  en un día de la semana.
*/

const levenshtein = (
  a = "",
  b = ""
) => {
  const left =
    String(a);

  const right =
    String(b);

  const previous =
    Array.from(
      {
        length:
          right.length + 1,
      },
      (_, index) =>
        index
    );

  for (
    let i = 1;
    i <= left.length;
    i++
  ) {
    let diagonal =
      previous[0];

    previous[0] = i;

    for (
      let j = 1;
      j <= right.length;
      j++
    ) {
      const old =
        previous[j];

      const cost =
        left[i - 1] ===
        right[j - 1]
          ? 0
          : 1;

      previous[j] =
        Math.min(
          previous[j] + 1,

          previous[j - 1] +
            1,

          diagonal + cost
        );

      diagonal = old;
    }
  }

  return previous[
    right.length
  ];
};


/* =========================================================
   DÍAS Y VARIANTES
   ========================================================= */

/*
  La primera palabra de cada grupo es considerada
  la forma canónica inglesa.

  Se incluyen también formas reales encontradas
  en los PDFs y variantes previsibles.
*/

const DAY_ALIASES =
  Object.freeze({
    MONDAY: [
      "MONDAY",
      "LUNES",
    ],

    TUESDAY: [
      "TUESDAY",
      "MARTES",
    ],

    WEDNESDAY: [
      "WEDNESDAY",
      "MIERCOLES",
    ],

    THURSDAY: [
      "THURSDAY",

      /*
        Error REAL observado en PDFs CEVAZ:
        THRUSDAY
      */

      "THRUSDAY",

      "THURDAY",
      "THURDSAY",

      "JUEVES",
    ],

    FRIDAY: [
      "FRIDAY",
      "VIERNES",
    ],

    SATURDAY: [
      "SATURDAY",

      "SABADO",
      "SABADOS",
      "SABATINO",
    ],
  });


/* =========================================================
   VARIANTES CONOCIDAS INCORRECTAS
   ========================================================= */

const KNOWN_TYPOS =
  new Set([
    "THRUSDAY",
    "THURDAY",
    "THURDSAY",
  ]);


/* =========================================================
   TOLERANCIA DE ERROR
   ========================================================= */

const maxDistanceForAlias = (
  alias
) => {
  /*
    Palabras largas admiten máximo dos
    caracteres de diferencia.

    Palabras medianas admiten uno.

    Palabras cortas requieren coincidencia
    exacta para evitar falsos positivos.
  */

  if (
    alias.length >= 8
  ) {
    return 2;
  }

  if (
    alias.length >= 6
  ) {
    return 1;
  }

  return 0;
};


const matchTokenToAlias = (
  token,
  alias
) => {
  if (
    token === alias
  ) {
    return {
      matched: true,

      distance: 0,
    };
  }

  /*
    No aplicamos fuzzy matching
    a palabras demasiado cortas.
  */

  if (
    token.length < 5 ||
    alias.length < 5
  ) {
    return {
      matched: false,

      distance: null,
    };
  }

  if (
    Math.abs(
      token.length -
        alias.length
    ) > 2
  ) {
    return {
      matched: false,

      distance: null,
    };
  }

  const distance =
    levenshtein(
      token,
      alias
    );

  return {
    matched:
      distance <=
      maxDistanceForAlias(
        alias
      ),

    distance,
  };
};


/* =========================================================
   DETECCIÓN DE DÍAS
   ========================================================= */

export function detectWeekdays(
  value = ""
) {
  const normalized =
    normalizeText(
      value
    );

  const tokens =
    normalized

      .replace(
        /[&/,_\-]/g,
        " "
      )

      .split(/\s+/)

      .filter(Boolean);

  const days =
    new Set();

  const corrections =
    [];

  for (
    const token
    of tokens
  ) {
    for (
      const [
        day,
        aliases,
      ]
      of Object.entries(
        DAY_ALIASES
      )
    ) {
      let bestMatch =
        null;

      for (
        const alias
        of aliases
      ) {
        const result =
          matchTokenToAlias(
            token,
            alias
          );

        if (
          !result.matched
        ) {
          continue;
        }

        if (
          !bestMatch ||
          result.distance <
            bestMatch.distance
        ) {
          bestMatch = {
            alias,

            distance:
              result.distance,
          };
        }
      }

      if (!bestMatch) {
        continue;
      }

      days.add(day);

      const canonicalAlias =
        aliases[0];

      /*
        Registramos correcciones:

        - fuzzy matching;
        - errores conocidos como THRUSDAY.
      */

      if (
        bestMatch.distance >
          0 ||
        KNOWN_TYPOS.has(
          token
        )
      ) {
        corrections.push({
          original:
            token,

          interpretedAs:
            canonicalAlias,

          day,

          distance:
            bestMatch.distance,
        });
      }

      break;
    }
  }

  return {
    normalized,

    tokens,

    days:
      Array.from(days),

    corrections,
  };
}


/* =========================================================
   CLASIFICACIÓN DE UNA CADENA
   ========================================================= */

export function classifyFrequencyText(
  value = ""
) {
  const raw =
    String(
      value ?? ""
    ).trim();

  if (!raw) {
    return null;
  }

  /*
    El nombre de frecuencia normalmente
    se encuentra antes del "/".

    Ejemplo:

    TUESDAY & THURSDAY / 8:30 A 10:00AM
  */

  const left =
    raw.includes("/")
      ? raw
          .split("/")[0]
          .trim()
      : raw;

  const normalized =
    normalizeText(
      left
    );

  const weekdayResult =
    detectWeekdays(
      left
    );

  const daySet =
    new Set(
      weekdayResult.days
    );

  const buildResult = (
    frequency,
    confidence = "high"
  ) => ({
    frequency,

    raw,

    sourceText:
      left,

    normalized,

    days:
      weekdayResult.days,

    corrections:
      weekdayResult.corrections,

    confidence,
  });


  /* =======================================================
     SEMI INTENSIVO POR ETIQUETA
     ======================================================= */

  if (
    /\bSEMI\s*-?\s*INT(?:ENSIVO)?\b/.test(
      normalized
    ) ||
    /\bSEMIINT\b/.test(
      normalized
    )
  ) {
    return buildResult(
      FREQUENCIES
        .SEMI_INTENSIVO
    );
  }


  /* =======================================================
     INTENSIVO

     TUESDAY TO FRIDAY
     MARTES A VIERNES
     ======================================================= */

  const hasRangeConnector =
    /\bTO\b/.test(
      normalized
    ) ||
    /\bA\b/.test(
      normalized
    );

  if (
    daySet.has(
      "TUESDAY"
    ) &&
    daySet.has(
      "FRIDAY"
    ) &&
    hasRangeConnector
  ) {
    return buildResult(
      FREQUENCIES.INTENSIVO
    );
  }


  /* =======================================================
     SEMI INTENSIVO

     MONDAY, WEDNESDAY & FRIDAY
     LUNES-MIERCOLES-VIERNES

     IMPORTANTE:
     esto debe evaluarse ANTES que LUNES.
     ======================================================= */

  if (
    daySet.has(
      "MONDAY"
    ) &&
    daySet.has(
      "WEDNESDAY"
    ) &&
    daySet.has(
      "FRIDAY"
    )
  ) {
    return buildResult(
      FREQUENCIES
        .SEMI_INTENSIVO
    );
  }


  /* =======================================================
     MARTES Y JUEVES
     ======================================================= */

  if (
    daySet.has(
      "TUESDAY"
    ) &&
    daySet.has(
      "THURSDAY"
    )
  ) {
    return buildResult(
      FREQUENCIES
        .MARTES_JUEVES
    );
  }


  /* =======================================================
     MIÉRCOLES Y VIERNES
     ======================================================= */

  if (
    daySet.has(
      "WEDNESDAY"
    ) &&
    daySet.has(
      "FRIDAY"
    )
  ) {
    return buildResult(
      FREQUENCIES
        .MIERCOLES_VIERNES
    );
  }


  /* =======================================================
     SABATINO
     ======================================================= */

  if (
    daySet.size === 1 &&
    daySet.has(
      "SATURDAY"
    )
  ) {
    return buildResult(
      FREQUENCIES
        .SABATINO
    );
  }


  /* =======================================================
     LUNES
     ======================================================= */

  if (
    daySet.size === 1 &&
    daySet.has(
      "MONDAY"
    )
  ) {
    return buildResult(
      FREQUENCIES.LUNES
    );
  }


  /* =======================================================
     FALLBACK: INTENSIVO POR TEXTO
     ======================================================= */

  if (
    /\bINTENSIVO\b/.test(
      normalized
    ) ||
    /\bINT\b/.test(
      normalized
    )
  ) {
    return buildResult(
      FREQUENCIES
        .INTENSIVO,

      "medium"
    );
  }


  return buildResult(
    FREQUENCIES.NA,
    "low"
  );
}


/* =========================================================
   DETECCIÓN COMPLETA CON FALLBACKS
   ========================================================= */

/*
  Orden de confianza:

  1. Horario del PDF
  2. Frecuencia raw ya extraída
  3. Periodo del PDF
  4. Nombre del archivo
  5. frequencyNorm existente

  Así el nombre del archivo nunca sustituye
  innecesariamente información más confiable
  que está dentro del PDF.
*/

export function detectFrequency({
  scheduleRaw = "",

  frequencyRaw = "",

  periodRaw = "",

  fileName = "",

  frequencyNorm = "",
} = {}) {
  const candidates = [
    [
      "schedule",
      scheduleRaw,
    ],

    [
      "frequencyRaw",
      frequencyRaw,
    ],

    [
      "period",
      periodRaw,
    ],

    [
      "fileName",
      fileName,
    ],

    [
      "frequencyNorm",
      frequencyNorm,
    ],
  ];

  const attempts =
    [];

  for (
    const [
      source,
      value,
    ]
    of candidates
  ) {
    if (
      !String(
        value ?? ""
      ).trim()
    ) {
      continue;
    }

    const result =
      classifyFrequencyText(
        value
      );

    if (!result) {
      continue;
    }

    attempts.push({
      source,

      ...result,
    });

    if (
      result.frequency !==
      FREQUENCIES.NA
    ) {
      return {
        source,

        ...result,

        attempts,
      };
    }
  }

  return {
    frequency:
      FREQUENCIES.NA,

    source:
      "none",

    raw: "",

    sourceText: "",

    normalized: "",

    days: [],

    corrections: [],

    confidence: "low",

    attempts,
  };
}


/* =========================================================
   NORMALIZACIÓN SIMPLE
   ========================================================= */

export function normalizeFrequency(
  value = ""
) {
  const result =
    classifyFrequencyText(
      value
    );

  return (
    result?.frequency ||
    FREQUENCIES.NA
  );
}


/* =========================================================
   COMPARACIÓN DE FRECUENCIAS
   ========================================================= */

export function frequenciesAreDifferent(
  oldValue,
  newValue
) {
  const oldFrequency =
    normalizeFrequency(
      oldValue
    );

  const newFrequency =
    normalizeFrequency(
      newValue
    );

  /*
    No afirmamos que existe un cambio
    si alguna frecuencia es desconocida.
  */

  if (
    oldFrequency ===
      FREQUENCIES.NA ||
    newFrequency ===
      FREQUENCIES.NA
  ) {
    return false;
  }

  return (
    oldFrequency !==
    newFrequency
  );
}


/* =========================================================
   ORDEN PARA DASHBOARD
   ========================================================= */

export const FREQUENCY_ORDER =
  Object.freeze([
    FREQUENCIES
      .MARTES_JUEVES,

    FREQUENCIES
      .MIERCOLES_VIERNES,

    FREQUENCIES
      .LUNES,

    FREQUENCIES
      .SABATINO,

    FREQUENCIES
      .INTENSIVO,

    FREQUENCIES
      .SEMI_INTENSIVO,

    FREQUENCIES.NA,
  ]);
