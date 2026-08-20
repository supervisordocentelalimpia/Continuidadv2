// src/utils/parseCevazPdf.js

import { extractTextFromPdf } from "./pdfText";

import {
  detectFrequency,
  FREQUENCIES,
} from "./frecuencia";


/* =========================================================
   BLOQUES HORARIOS CONOCIDOS
   ========================================================= */

const HORARIO_BLOQUES = [
  "8:30 AM - 10:00 AM",
  "10:30 AM - 12:00 PM",
  "1:00 PM - 2:30 PM",
  "2:45 PM - 4:15 PM",
  "4:30 PM - 6:00 PM",
  "6:15 PM - 7:45 PM",

  /*
    Bloques utilizados en algunas frecuencias
    semanales o sabatinas.
  */

  "8:00 AM - 10:40 AM",
  "10:50 AM - 1:30 PM",
  "2:30 PM - 5:10 PM",

  /*
    Semi Intensivo / horarios adicionales.
  */

  "8:30 PM - 10:30 PM",
];


/* =========================================================
   TEXTO
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


const normalizeComparableText = (
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
    .replace(
      /\s+/g,
      " "
    )
    .trim();
};


const normKey = (
  value = ""
) => {
  return normalizeComparableText(
    value
  )
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /[–—]/g,
      "-"
    );
};


/* =========================================================
   NIVEL
   ========================================================= */

export const normalizePdfLevel = (
  raw = ""
) => {
  const value =
    normalizeComparableText(
      raw
    );

  const match =
    value.match(
      /(?:LEVEL|NIVEL|L)?\s*0*(\d{1,2})\b/i
    );

  if (!match) {
    return "N/A";
  }

  const level =
    parseInt(
      match[1],
      10
    );

  if (
    !Number.isFinite(
      level
    ) ||
    level <= 0
  ) {
    return "N/A";
  }

  return `L${String(
    level
  ).padStart(
    2,
    "0"
  )}`;
};


/* =========================================================
   CATEGORÍA
   ========================================================= */

export const normalizePdfCategory = (
  raw = ""
) => {
  const original =
    String(
      raw ?? ""
    );

  const value =
    normalizeComparableText(
      original
    );

  const compact =
    value.replace(
      /[^A-Z]/g,
      ""
    );


  /* -------------------------------------------------------
     ADULTOS
     ------------------------------------------------------- */

  if (
    /\bADULT(?:O|OS)?\b/.test(
      value
    ) ||
    compact.includes(
      "ADULT"
    )
  ) {
    return "Adultos";
  }


  /* -------------------------------------------------------
     JÓVENES
     ------------------------------------------------------- */

  if (
    /\bJOVEN(?:ES)?\b/.test(
      value
    ) ||
    compact.includes(
      "JOVEN"
    )
  ) {
    return "Jóvenes";
  }


  /* -------------------------------------------------------
     NIÑOS

     Tolera:

     NIÑOS
     NINOS
     NI?OS
     NIï¿½OS
     otras corrupciones de la Ñ
     ------------------------------------------------------- */

  if (
    compact.includes(
      "NINOS"
    ) ||
    compact.includes(
      "NIOS"
    ) ||
    /NI.?OS/i.test(
      original
    )
  ) {
    return "Niños";
  }


  return "N/A";
};


/* =========================================================
   HORARIOS
   ========================================================= */

const toMinutes = (
  hour,
  minute,
  meridiem
) => {
  let h =
    Number(
      hour
    );

  const m =
    Number(
      minute
    );

  const mer =
    String(
      meridiem || ""
    ).toUpperCase();


  if (
    !Number.isFinite(
      h
    ) ||
    !Number.isFinite(
      m
    ) ||
    ![
      "AM",
      "PM",
    ].includes(
      mer
    )
  ) {
    return null;
  }


  if (
    h < 1 ||
    h > 12 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }


  if (
    h === 12
  ) {
    h = 0;
  }


  if (
    mer === "PM"
  ) {
    h += 12;
  }


  return (
    h * 60 +
    m
  );
};


const calculateDurationMinutes = ({
  startHour,
  startMinute,
  startMeridiem,

  endHour,
  endMinute,
  endMeridiem,
}) => {
  const start =
    toMinutes(
      startHour,
      startMinute,
      startMeridiem
    );

  const end =
    toMinutes(
      endHour,
      endMinute,
      endMeridiem
    );


  if (
    start === null ||
    end === null
  ) {
    return null;
  }


  let duration =
    end - start;


  /*
    Se permite técnicamente cruzar medianoche,
    aunque después se controla la duración máxima.
  */

  if (
    duration <= 0
  ) {
    duration +=
      24 * 60;
  }


  return duration;
};


/* =========================================================
   INFERENCIA DE AM / PM
   ========================================================= */

/*
  Los PDFs suelen escribir:

  8:30 A 10:00AM
  1:00 A 2:30PM
  4:30 A 6:00PM

  Probamos AM y PM para la hora inicial.

  Solo aceptamos una inferencia cuando una única opción
  produce una duración académicamente razonable.

  Rango considerado razonable:
  30 minutos a 6 horas.
*/

const inferMissingStartMeridiem = ({
  startHour,
  startMinute,

  endHour,
  endMinute,

  endMeridiem,
}) => {
  const candidates =
    [
      "AM",
      "PM",
    ].map(
      (
        meridiem
      ) => {
        const duration =
          calculateDurationMinutes({
            startHour,
            startMinute,
            startMeridiem:
              meridiem,

            endHour,
            endMinute,
            endMeridiem,
          });


        return {
          meridiem,

          duration,

          plausible:
            Number.isFinite(
              duration
            ) &&
            duration >= 30 &&
            duration <= 360,
        };
      }
    );


  const plausible =
    candidates.filter(
      (
        candidate
      ) =>
        candidate.plausible
    );


  if (
    plausible.length ===
    1
  ) {
    return {
      meridiem:
        plausible[0]
          .meridiem,

      duration:
        plausible[0]
          .duration,

      inferred:
        true,

      ambiguous:
        false,
    };
  }


  return {
    meridiem:
      "",

    duration:
      null,

    inferred:
      false,

    ambiguous:
      true,
  };
};


/* =========================================================
   NORMALIZACIÓN DETALLADA DEL HORARIO
   ========================================================= */

export const normalizePdfScheduleDetailed = (
  raw = ""
) => {
  const original =
    String(
      raw ?? ""
    ).trim();


  if (!original) {
    return {
      raw:
        "",

      block:
        "N/A",

      valid:
        false,

      needsReview:
        true,

      reason:
        "missing_schedule",

      startMeridiemInferred:
        false,

      durationMinutes:
        null,
    };
  }


  /*
    Ejemplo:

    TUESDAY & THURSDAY / 8:30 A 10:00AM

    Tomamos la parte ubicada después de "/".
  */

  const timePart =
    original.includes(
      "/"
    )
      ? original
          .split("/")
          .slice(1)
          .join("/")
          .trim()
      : original;


  const cleaned =
    timePart
      .replace(
        /\([^)]*\)/g,
        " "
      )
      .replace(
        /[–—]/g,
        "-"
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  /*
    Formatos soportados:

    8:30 A 10:00AM
    8:30 AM A 10:00 AM
    1:00 A 2:30PM
    10:50 AM A 1:30 PM
    8:30 - 10:00 AM
    8:30 TO 10:00 AM
  */

  const match =
    cleaned.match(
      /(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)?\s*(?:A|TO|-)\s*(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)?/i
    );


  if (!match) {
    const exact =
      HORARIO_BLOQUES.find(
        (
          block
        ) =>
          normKey(
            block
          ) ===
          normKey(
            cleaned
          )
      );


    if (exact) {
      return {
        raw:
          original,

        block:
          exact,

        valid:
          true,

        needsReview:
          false,

        reason:
          "",

        startMeridiemInferred:
          false,

        durationMinutes:
          null,
      };
    }


    return {
      raw:
        original,

      block:
        cleaned ||
        original ||
        "N/A",

      valid:
        false,

      needsReview:
        true,

      reason:
        "unrecognized_schedule_format",

      startMeridiemInferred:
        false,

      durationMinutes:
        null,
    };
  }


  const startHour =
    parseInt(
      match[1],
      10
    );

  const startMinute =
    parseInt(
      match[2],
      10
    );

  let startMeridiem =
    String(
      match[3] ||
      ""
    ).toUpperCase();


  const endHour =
    parseInt(
      match[4],
      10
    );

  const endMinute =
    parseInt(
      match[5],
      10
    );

  const endMeridiem =
    String(
      match[6] ||
      ""
    ).toUpperCase();


  /*
    Si el PDF ni siquiera especifica AM/PM
    al final, no inventamos el horario.
  */

  if (
    !endMeridiem
  ) {
    return {
      raw:
        original,

      block:
        cleaned,

      valid:
        false,

      needsReview:
        true,

      reason:
        "missing_end_meridiem",

      startMeridiemInferred:
        false,

      durationMinutes:
        null,
    };
  }


  let startWasInferred =
    false;


  if (
    !startMeridiem
  ) {
    const inference =
      inferMissingStartMeridiem({
        startHour,
        startMinute,

        endHour,
        endMinute,

        endMeridiem,
      });


    if (
      inference.ambiguous ||
      !inference.meridiem
    ) {
      return {
        raw:
          original,

        block:
          cleaned,

        valid:
          false,

        needsReview:
          true,

        reason:
          "ambiguous_start_meridiem",

        startMeridiemInferred:
          false,

        durationMinutes:
          null,
      };
    }


    startMeridiem =
      inference.meridiem;

    startWasInferred =
      true;
  }


  const duration =
    calculateDurationMinutes({
      startHour,
      startMinute,
      startMeridiem,

      endHour,
      endMinute,
      endMeridiem,
    });


  if (
    !Number.isFinite(
      duration
    ) ||
    duration < 30 ||
    duration > 360
  ) {
    return {
      raw:
        original,

      block:
        cleaned,

      valid:
        false,

      needsReview:
        true,

      reason:
        "implausible_schedule_duration",

      startMeridiemInferred:
        startWasInferred,

      durationMinutes:
        duration,
    };
  }


  const candidate =
    `${startHour}:${String(
      startMinute
    ).padStart(
      2,
      "0"
    )} ${startMeridiem} - ${endHour}:${String(
      endMinute
    ).padStart(
      2,
      "0"
    )} ${endMeridiem}`;


  const mapped =
    HORARIO_BLOQUES.find(
      (
        block
      ) =>
        normKey(
          block
        ) ===
        normKey(
          candidate
        )
    );


  return {
    raw:
      original,

    block:
      mapped ||
      candidate,

    valid:
      true,

    needsReview:
      false,

    reason:
      "",

    startMeridiemInferred:
      startWasInferred,

    durationMinutes:
      duration,
  };
};


export const normalizePdfSchedule = (
  raw = ""
) => {
  return normalizePdfScheduleDetailed(
    raw
  ).block;
};


/* =========================================================
   METADATOS DE SECCIÓN
   ========================================================= */

const createEmptyMeta = () => ({
  periodRaw:
    "",

  categoryRaw:
    "",

  category:
    "N/A",

  levelRaw:
    "",

  levelNorm:
    "N/A",

  scheduleRaw:
    "",

  scheduleBlock:
    "N/A",

  scheduleValid:
    false,

  scheduleNeedsReview:
    false,

  scheduleReviewReason:
    "",

  scheduleStartMeridiemInferred:
    false,

  scheduleDurationMinutes:
    null,

  salonRaw:
    "",

  salon:
    "",

  courseId:
    "",
});


/* =========================================================
   CATEGORÍA DESDE EL PERÍODO
   ========================================================= */

const tryUpdateCategory = (
  text,
  meta
) => {
  const category =
    normalizePdfCategory(
      text
    );


  if (
    category !==
    "N/A"
  ) {
    meta.categoryRaw =
      String(
        text ||
        ""
      ).trim();

    meta.category =
      category;
  }
};


/* =========================================================
   EXTRACCIÓN DE METADATOS
   ========================================================= */

const extractMetaFromLine = (
  line,
  meta
) => {
  const original =
    String(
      line ?? ""
    ).trim();


  if (!original) {
    return;
  }


  /* -------------------------------------------------------
     PERÍODO
     ------------------------------------------------------- */

  const periodMatch =
    original.match(
      /^PER[IÍ]ODO\s*:\s*(.*)$/i
    );


  if (
    periodMatch
  ) {
    meta.periodRaw =
      String(
        periodMatch[1] ||
        ""
      ).trim();


    /*
      Muchos PDFs incluyen la categoría dentro
      del nombre del período.
    */

    tryUpdateCategory(
      meta.periodRaw,
      meta
    );

    return;
  }


  /* -------------------------------------------------------
     CATEGORÍA
     ------------------------------------------------------- */

  const categoryMatch =
    original.match(
      /^CATEGOR[IÍ]A\s*:\s*(.*)$/i
    );


  if (
    categoryMatch
  ) {
    meta.categoryRaw =
      String(
        categoryMatch[1] ||
        ""
      ).trim();


    meta.category =
      normalizePdfCategory(
        meta.categoryRaw
      );

    return;
  }


  /* -------------------------------------------------------
     NIVEL
     ------------------------------------------------------- */

  const levelMatch =
    original.match(
      /^NIVEL\s*:\s*(.*)$/i
    );


  if (
    levelMatch
  ) {
    meta.levelRaw =
      String(
        levelMatch[1] ||
        ""
      ).trim();


    meta.levelNorm =
      normalizePdfLevel(
        meta.levelRaw
      );

    return;
  }


  /* -------------------------------------------------------
     HORARIO
     ------------------------------------------------------- */

  const scheduleMatch =
    original.match(
      /^HORARIO\s*:\s*(.*)$/i
    );


  if (
    scheduleMatch
  ) {
    meta.scheduleRaw =
      String(
        scheduleMatch[1] ||
        ""
      ).trim();


    const schedule =
      normalizePdfScheduleDetailed(
        meta.scheduleRaw
      );


    meta.scheduleBlock =
      schedule.block;

    meta.scheduleValid =
      schedule.valid;

    meta.scheduleNeedsReview =
      schedule.needsReview;

    meta.scheduleReviewReason =
      schedule.reason;

    meta.scheduleStartMeridiemInferred =
      schedule.startMeridiemInferred;

    meta.scheduleDurationMinutes =
      schedule.durationMinutes;

    return;
  }


  /* -------------------------------------------------------
     SALÓN + CURSO ID

     Ejemplo:

     Salón: C11 Curso ID: 65424
     ------------------------------------------------------- */

  const salonAndCourseMatch =
    original.match(
      /^SAL[ÓO]N\s*:\s*(.*?)\s+CURSO\s*ID\s*:\s*([A-Z0-9-]+)/i
    );


  if (
    salonAndCourseMatch
  ) {
    meta.salonRaw =
      original;


    meta.salon =
      String(
        salonAndCourseMatch[1] ||
        ""
      )
        .trim()
        .toUpperCase();


    meta.courseId =
      String(
        salonAndCourseMatch[2] ||
        ""
      ).trim();

    return;
  }


  /*
    Fallback si cambia ligeramente
    el formato de Salón / Curso ID.
  */

  if (
    /CURSO\s*ID\s*:/i.test(
      original
    )
  ) {
    meta.salonRaw =
      original;


    const courseMatch =
      original.match(
        /CURSO\s*ID\s*:\s*([A-Z0-9-]+)/i
      );


    if (
      courseMatch
    ) {
      meta.courseId =
        String(
          courseMatch[1] ||
          ""
        ).trim();
    }


    const salonMatch =
      original.match(
        /SAL[ÓO]N\s*:\s*([A-Z0-9-]+)/i
      );


    if (
      salonMatch
    ) {
      meta.salon =
        String(
          salonMatch[1] ||
          ""
        )
          .trim()
          .toUpperCase();
    }
  }
};


/* =========================================================
   LÍNEAS QUE NO SON ESTUDIANTES
   ========================================================= */

const shouldSkipLine = (
  line
) => {
  const upper =
    normalizeComparableText(
      line
    );


  if (!upper) {
    return true;
  }


  if (
    upper.includes(
      "CENTRO VENEZOLANO"
    )
  ) {
    return true;
  }


  if (
    upper.includes(
      "LISTA DE ALUMNOS"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "R.I.F"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "SEDE:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "FECHA:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "PERIODO:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "CATEGORIA:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "NIVEL:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "HORARIO:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "PROFESOR:"
    )
  ) {
    return true;
  }


  if (
    upper.startsWith(
      "SALON:"
    )
  ) {
    return true;
  }


  if (
    upper.includes(
      "APELLIDOS"
    ) &&
    upper.includes(
      "NOMBRES"
    )
  ) {
    return true;
  }


  if (
    upper.includes(
      "APELLIDOS"
    ) &&
    upper.includes(
      "EMAIL"
    )
  ) {
    return true;
  }


  return false;
};


/* =========================================================
   TELÉFONO
   ========================================================= */

const extractTrailingPhone = (
  value = ""
) => {
  const text =
    String(
      value ?? ""
    ).trim();


  if (!text) {
    return {
      phone:
        "",

      remaining:
        "",
    };
  }


  /*
    Ejemplos:

    04141234567
    0414-1234567
    0414 123 4567
    +584121234567
    +58 424-1234567
  */

  const match =
    text.match(
      /(\+?\d(?:[\d\s().-]*\d)?)\s*$/
    );


  if (!match) {
    return {
      phone:
        "",

      remaining:
        text,
    };
  }


  const candidate =
    String(
      match[1] ||
        ""
    ).trim();


  const digitCount =
    candidate.replace(
      /\D/g,
      ""
    ).length;


  /*
    Evita interpretar pequeños números
    accidentales como teléfono.
  */

  if (
    digitCount < 7 ||
    digitCount > 15
  ) {
    return {
      phone:
        "",

      remaining:
        text,
    };
  }


  return {
    phone:
      candidate,

    remaining:
      text
        .slice(
          0,
          match.index
        )
        .trim(),
  };
};


/* =========================================================
   EMAIL + NOMBRE
   ========================================================= */

const extractEmailAndName = (
  value = ""
) => {
  let text =
    String(
      value ?? ""
    ).trim();


  if (!text) {
    return {
      name:
        "",

      email:
        "",

      emailRaw:
        "",

      emailValid:
        false,

      missingEmail:
        true,
    };
  }


  /*
    Primero buscamos cualquier token que contenga @.

    Incluso si el dominio tiene errores,
    conservamos el contenido para auditoría.
  */

  const emailMatch =
    text.match(
      /(?:^|\s)([^\s]+@[^\s]+)(?=\s|$)/
    );


  if (
    emailMatch
  ) {
    const emailRaw =
      String(
        emailMatch[1] ||
        ""
      ).trim();


    const emailStart =
      emailMatch.index +
      emailMatch[0]
        .indexOf(
          emailRaw
        );


    const name =
      text
        .slice(
          0,
          emailStart
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    return {
      name,

      email:
        emailRaw,

      emailRaw,

      emailValid:
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
          emailRaw
        ),

      missingEmail:
        false,
    };
  }


  /*
    Algunos PDFs pueden tener un correo mal formado
    sin @, pero terminando en una extensión similar
    a .com, .net, etc.

    Lo conservamos como dato para revisión.
  */

  const malformedEmailMatch =
    text.match(
      /(?:^|\s)([^\s]+\.(?:COM|NET|ORG|EDU|VE|ES|CIN|XOM))$/i
    );


  if (
    malformedEmailMatch
  ) {
    const emailRaw =
      String(
        malformedEmailMatch[1] ||
        ""
      ).trim();


    const emailStart =
      malformedEmailMatch.index +
      malformedEmailMatch[0]
        .indexOf(
          emailRaw
        );


    const name =
      text
        .slice(
          0,
          emailStart
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    return {
      name,

      email:
        emailRaw,

      emailRaw,

      emailValid:
        false,

      missingEmail:
        false,
    };
  }


  /*
    Marcadores de correo faltante:

    -
    ...
    .......
  */

  const placeholderMatch =
    text.match(
      /(?:\s|^)(-|\.+)\s*$/
    );


  if (
    placeholderMatch
  ) {
    text =
      text
        .slice(
          0,
          placeholderMatch.index
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    return {
      name:
        text,

      email:
        "",

      emailRaw:
        placeholderMatch[1],

      emailValid:
        false,

      missingEmail:
        true,
    };
  }


  /*
    No encontramos correo.

    Conservamos la parte textual como nombre.
  */

  return {
    name:
      text
        .replace(
          /\s+/g,
          " "
        )
        .trim(),

    email:
      "",

    emailRaw:
      "",

    emailValid:
      false,

    missingEmail:
      true,
  };
};


/* =========================================================
   FILA DE ESTUDIANTE
   ========================================================= */

const parseStudentLine = (
  line,
  meta,
  fileName
) => {
  const original =
    String(
      line ?? ""
    ).trim();


  if (!original) {
    return null;
  }


  /*
    Casos:

    1 17912684 APELLIDO NOMBRE ...
    1 18284765-1 APELLIDO NOMBRE ...
    1 17.738.636-1 APELLIDO NOMBRE ...

    Se conserva la identificación original.
  */

  const match =
    original.match(
      /^(\d+)\s+([A-Z0-9][A-Z0-9.\-]*)\s+(.+)$/i
    );


  if (!match) {
    return null;
  }


  const rowNumber =
    parseInt(
      match[1],
      10
    );


  const id =
    String(
      match[2] ||
        ""
    ).trim();


  let remaining =
    String(
      match[3] ||
        ""
    ).trim();


  if (
    !id ||
    !remaining
  ) {
    return null;
  }


  /* -------------------------------------------------------
     TELÉFONO
     ------------------------------------------------------- */

  const phoneResult =
    extractTrailingPhone(
      remaining
    );


  const phone =
    phoneResult.phone;


  remaining =
    phoneResult.remaining;


  /* -------------------------------------------------------
     EMAIL + NOMBRE
     ------------------------------------------------------- */

  const identity =
    extractEmailAndName(
      remaining
    );


  if (
    !identity.name
  ) {
    return null;
  }


  /* -------------------------------------------------------
     FRECUENCIA

     frecuencia.js decide la frecuencia institucional.

     Puede detectar:

     MARTES Y JUEVES
     MIÉRCOLES Y VIERNES
     LUNES
     SABATINO
     INTENSIVO
     SEMI INTENSIVO

     También tolera errores como THRUSDAY.
     ------------------------------------------------------- */

  const frequency =
    detectFrequency({
      scheduleRaw:
        meta.scheduleRaw,

      periodRaw:
        meta.periodRaw,

      fileName,
    });


  const frequencyNorm =
    frequency.frequency ||
    FREQUENCIES.NA;


  return {
    /* -----------------------------------------------------
       FILA
       ----------------------------------------------------- */

    rowNumber,


    /* -----------------------------------------------------
       IDENTIDAD
       ----------------------------------------------------- */

    id,

    name:
      identity.name,

    email:
      identity.email,

    emailRaw:
      identity.emailRaw,

    emailValid:
      identity.emailValid,

    missingEmail:
      identity.missingEmail,

    phone,


    /* -----------------------------------------------------
       CATEGORÍA
       ----------------------------------------------------- */

    category:
      meta.category ||
      "N/A",

    categoryRaw:
      meta.categoryRaw ||
      "",


    /* -----------------------------------------------------
       NIVEL
       ----------------------------------------------------- */

    level:
      meta.levelRaw ||
      "N/A",

    levelRaw:
      meta.levelRaw ||
      "",

    levelNorm:
      meta.levelNorm ||
      "N/A",


    /* -----------------------------------------------------
       FRECUENCIA
       ----------------------------------------------------- */

    frequencyNorm,

    /*
      Compatibilidad con otras partes del proyecto.
    */

    frequencyBase:
      frequencyNorm,

    frequencyRaw:
      meta.scheduleRaw ||
      "",

    frequencySource:
      frequency.source ||
      "none",

    frequencyConfidence:
      frequency.confidence ||
      "low",

    frequencyDays:
      frequency.days ||
      [],

    frequencyCorrections:
      frequency.corrections ||
      [],


    /* -----------------------------------------------------
       HORARIO
       ----------------------------------------------------- */

    schedule:
      meta.scheduleRaw ||
      "N/A",

    scheduleRaw:
      meta.scheduleRaw ||
      "",

    scheduleBlock:
      meta.scheduleBlock ||
      "N/A",

    scheduleValid:
      Boolean(
        meta.scheduleValid
      ),

    scheduleNeedsReview:
      Boolean(
        meta.scheduleNeedsReview
      ),

    scheduleReviewReason:
      meta.scheduleReviewReason ||
      "",

    scheduleStartMeridiemInferred:
      Boolean(
        meta.scheduleStartMeridiemInferred
      ),

    scheduleDurationMinutes:
      meta.scheduleDurationMinutes,


    /* -----------------------------------------------------
       CURSO
       ----------------------------------------------------- */

    salon:
      meta.salon ||
      "",

    courseId:
      meta.courseId ||
      "",


    /* -----------------------------------------------------
       PERÍODO Y ARCHIVO
       ----------------------------------------------------- */

    periodRaw:
      meta.periodRaw ||
      "",

    sourceFile:
      fileName ||
      "",
  };
};


/* =========================================================
   VALIDACIÓN DE REGISTRO
   ========================================================= */

const validateStudentMetadata = (
  student
) => {
  const warnings = [];


  if (
    !student.category ||
    student.category ===
      "N/A"
  ) {
    warnings.push(
      "category_not_recognized"
    );
  }


  if (
    !student.levelNorm ||
    student.levelNorm ===
      "N/A"
  ) {
    warnings.push(
      "level_not_recognized"
    );
  }


  if (
    !student.frequencyNorm ||
    student.frequencyNorm ===
      FREQUENCIES.NA
  ) {
    warnings.push(
      "frequency_not_recognized"
    );
  }


  if (
    student.scheduleNeedsReview
  ) {
    warnings.push(
      student.scheduleReviewReason ||
      "schedule_needs_review"
    );
  }


  if (
    student.missingEmail
  ) {
    warnings.push(
      "missing_email"
    );
  } else if (
    !student.emailValid
  ) {
    warnings.push(
      "invalid_email_format"
    );
  }


  if (
    !student.phone
  ) {
    warnings.push(
      "missing_phone"
    );
  }


  return warnings;
};


/* =========================================================
   PARSER PRINCIPAL
   ========================================================= */

/*
  IMPORTANTE:

  Esta función está EXPORTADA DIRECTAMENTE.

  Eso corrige el error de Vite:

  "parseCevazPdf is not exported by
   src/utils/parseCevazPdf.js"
*/

export async function parseCevazPdf(
  file
) {
  if (!file) {
    throw new Error(
      "No se recibió un archivo PDF."
    );
  }


  const text =
    await extractTextFromPdf(
      file
    );


  if (
    !String(
      text ||
      ""
    ).trim()
  ) {
    throw new Error(
      `El archivo "${file.name}" no contiene texto extraíble.`
    );
  }


  const lines =
    String(
      text
    )
      .split(
        /\r?\n/
      )
      .map(
        (
          line
        ) =>
          line.trim()
      );


  const meta =
    createEmptyMeta();


  /*
    Fallback inicial de categoría.

    Se usa solamente como apoyo. Las líneas PERÍODO
    y CATEGORÍA pueden actualizarla después.
  */

  const firstDocumentBlock =
    lines
      .slice(
        0,
        40
      )
      .join(
        " "
      );


  tryUpdateCategory(
    firstDocumentBlock,
    meta
  );


  const students = [];


  for (
    const line
    of lines
  ) {
    if (!line) {
      continue;
    }


    /*
      PRIMERO leemos los metadatos.

      Esto es importante porque una línea NIVEL,
      HORARIO o SALÓN debe actualizar el estado
      antes de empezar a leer los estudiantes
      siguientes.
    */

    extractMetaFromLine(
      line,
      meta
    );


    if (
      shouldSkipLine(
        line
      )
    ) {
      continue;
    }


    const student =
      parseStudentLine(
        line,
        meta,
        file.name
      );


    if (!student) {
      continue;
    }


    const parseWarnings =
      validateStudentMetadata(
        student
      );


    students.push({
      ...student,

      parseWarnings,

      hasParseWarnings:
        parseWarnings.length >
        0,
    });
  }


  if (
    !students.length
  ) {
    throw new Error(
      `No se encontraron estudiantes válidos en "${file.name}".`
    );
  }


  return students;
}


/* =========================================================
   EXPORTACIONES PARA APP.JSX
   ========================================================= */

/*
  App.jsx utiliza:

  import {
    parseCevazPdf,
    __HORARIO_BLOQUES__,
  } from "./utils/parseCevazPdf";

  parseCevazPdf ya está exportado directamente arriba.
*/

export const __HORARIO_BLOQUES__ =
  HORARIO_BLOQUES;


/* =========================================================
   EXPORTACIONES PARA TESTS
   ========================================================= */

export const __parseHelpers__ = {
  normalizePdfLevel,

  normalizePdfCategory,

  normalizePdfSchedule,

  normalizePdfScheduleDetailed,

  extractTrailingPhone,

  extractEmailAndName,
};
