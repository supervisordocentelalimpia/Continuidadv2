// src/utils/parseCevazPdf.js

import { extractTextFromPdf } from "./pdfText";

/* =========================================================
   BLOQUES HORARIOS INSTITUCIONALES CONOCIDOS
   ========================================================= */

const HORARIO_BLOQUES = [
  "8:30 AM - 10:00 AM",
  "10:30 AM - 12:00 PM",
  "1:00 PM - 2:30 PM",
  "2:45 PM - 4:15 PM",
  "4:30 PM - 6:00 PM",
  "6:15 PM - 7:45 PM",
  "8:00 AM - 10:40 AM",
  "10:50 AM - 1:30 PM",
  "2:30 PM - 5:10 PM",
];

/* =========================================================
   UTILIDADES GENERALES
   ========================================================= */

const cleanSpaces = (value = "") =>
  String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/*
  Elimina tildes solamente para COMPARACIONES.

  No modifica el texto que se muestra al usuario.
*/
const removeDiacritics = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/*
  Corrige algunos casos frecuentes de texto UTF-8
  interpretado incorrectamente.

  No intenta adivinar caracteres que ya fueron destruidos
  por el extractor del PDF.
*/
const repairCommonMojibake = (value = "") => {
  let text = String(value ?? "");

  const replacements = [
    ["Ã", "Á"],
    ["Ã‰", "É"],
    ["Ã", "Í"],
    ["Ã“", "Ó"],
    ["Ãš", "Ú"],
    ["Ã‘", "Ñ"],
    ["Ãœ", "Ü"],

    ["Ã¡", "á"],
    ["Ã©", "é"],
    ["Ã­", "í"],
    ["Ã³", "ó"],
    ["Ãº", "ú"],
    ["Ã±", "ñ"],
    ["Ã¼", "ü"],

    ["Â", ""],

    ["â€“", "–"],
    ["â€”", "—"],
    ["â€˜", "'"],
    ["â€™", "'"],
    ['â€œ', '"'],
    ['â€', '"'],
  ];

  for (const [bad, good] of replacements) {
    text = text.split(bad).join(good);
  }

  return text;
};

const normalizeComparableText = (value = "") =>
  removeDiacritics(
    repairCommonMojibake(value)
  )
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const normKey = (value = "") =>
  normalizeComparableText(value)
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[.]/g, "");

/* =========================================================
   NIVEL
   ========================================================= */

const normalizeLevel = (raw = "") => {
  const text = normalizeComparableText(raw);

  if (!text) {
    return "N/A";
  }

  const match = text.match(/(\d{1,2})/);

  if (!match) {
    return "N/A";
  }

  const number = parseInt(
    match[1],
    10
  );

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return "N/A";
  }

  return `L${String(number).padStart(
    2,
    "0"
  )}`;
};

/* =========================================================
   CATEGORÍA
   ========================================================= */

const normalizeCategory = (raw = "") => {
  const text =
    normalizeComparableText(raw);

  if (!text) {
    return "N/A";
  }

  if (
    text.includes("ADULTO")
  ) {
    return "Adultos";
  }

  if (
    text.includes("JOVEN")
  ) {
    return "Jóvenes";
  }

  if (
    text.includes("NINO") ||
    text.includes("NI?O") ||
    text.includes("NI�O")
  ) {
    return "Niños";
  }

  return "N/A";
};

/*
  Solo se utiliza como respaldo.

  La categoría principal debe tomarse de cada encabezado:
  "Categoría: CEVAZ PRESENCIAL ADULTOS"
*/
const inferDocumentCategory = (
  text = ""
) => {
  const up =
    normalizeComparableText(text);

  const categories = new Set();

  if (
    up.includes(
      "PRESENCIAL ADULTOS"
    )
  ) {
    categories.add("Adultos");
  }

  if (
    up.includes(
      "PRESENCIAL JOVENES"
    )
  ) {
    categories.add("Jóvenes");
  }

  if (
    up.includes(
      "PRESENCIAL NINOS"
    ) ||
    up.includes(
      "PRESENCIAL NI?OS"
    ) ||
    up.includes(
      "PRESENCIAL NI�OS"
    )
  ) {
    categories.add("Niños");
  }

  /*
    Si todo el PDF contiene una sola categoría,
    se puede utilizar como fallback.

    Si contiene más de una, no se adivina.
  */
  if (categories.size === 1) {
    return Array.from(
      categories
    )[0];
  }

  return "N/A";
};

/* =========================================================
   HORARIOS
   ========================================================= */

const canonicalTime = (
  hour,
  minute,
  meridiem
) => {
  return `${parseInt(
    hour,
    10
  )}:${minute} ${meridiem}`;
};

const buildHorarioCandidate = (
  startHour,
  startMinute,
  startMeridiem,
  endHour,
  endMinute,
  endMeridiem
) => {
  return `${canonicalTime(
    startHour,
    startMinute,
    startMeridiem
  )} - ${canonicalTime(
    endHour,
    endMinute,
    endMeridiem
  )}`;
};

const findKnownHorario = (
  candidate
) => {
  const key =
    normKey(candidate);

  return (
    HORARIO_BLOQUES.find(
      (block) =>
        normKey(block) === key
    ) || null
  );
};

/*
  Busca la combinación AM/PM que coincida
  con un bloque institucional conocido.

  Esto evita errores como interpretar:

  1:00 A 2:30 PM

  como:

  1:00 AM - 2:30 PM
*/
const resolveMissingMeridiem = ({
  startHour,
  startMinute,
  startMeridiem,
  endHour,
  endMinute,
  endMeridiem,
}) => {
  const startOptions =
    startMeridiem
      ? [startMeridiem]
      : ["AM", "PM"];

  const endOptions =
    endMeridiem
      ? [endMeridiem]
      : ["AM", "PM"];

  const possibleKnown = [];

  for (const startMer of startOptions) {
    for (const endMer of endOptions) {
      const candidate =
        buildHorarioCandidate(
          startHour,
          startMinute,
          startMer,
          endHour,
          endMinute,
          endMer
        );

      const known =
        findKnownHorario(
          candidate
        );

      if (known) {
        possibleKnown.push({
          known,
          startMer,
          endMer,
        });
      }
    }
  }

  if (
    possibleKnown.length === 1
  ) {
    return possibleKnown[0];
  }

  if (
    possibleKnown.length > 1
  ) {
    /*
      En caso extremadamente raro de ambigüedad,
      conserva la primera coincidencia institucional.
    */
    return possibleKnown[0];
  }

  /*
    Fallback si el horario no existe todavía
    en HORARIO_BLOQUES.
  */

  let resolvedStart =
    startMeridiem;

  let resolvedEnd =
    endMeridiem;

  if (
    !resolvedStart &&
    resolvedEnd
  ) {
    if (
      resolvedEnd === "AM"
    ) {
      resolvedStart = "AM";
    } else if (
      Number(startHour) >= 8 &&
      Number(startHour) <= 11
    ) {
      resolvedStart = "AM";
    } else {
      resolvedStart = "PM";
    }
  }

  if (
    resolvedStart &&
    !resolvedEnd
  ) {
    /*
      Si inicia en AM y termina cerca de mediodía,
      puede terminar en PM.

      Para otros casos conserva el mismo meridiano.
    */
    if (
      resolvedStart === "AM" &&
      Number(endHour) === 12
    ) {
      resolvedEnd = "PM";
    } else {
      resolvedEnd =
        resolvedStart;
    }
  }

  if (
    !resolvedStart &&
    !resolvedEnd
  ) {
    resolvedStart =
      Number(startHour) >= 8 &&
      Number(startHour) <= 11
        ? "AM"
        : "PM";

    resolvedEnd =
      Number(endHour) === 12
        ? "PM"
        : resolvedStart;
  }

  return {
    known: null,
    startMer: resolvedStart,
    endMer: resolvedEnd,
  };
};

const normalizeHorario = (
  raw = ""
) => {
  if (!raw) {
    return "N/A";
  }

  let value =
    repairCommonMojibake(
      cleanSpaces(raw)
    );

  /*
    El horario suele venir después de "/":

    TUESDAY TO FRIDAY / 1:00 A 2:30PM
  */
  if (value.includes("/")) {
    const parts =
      value.split("/");

    value =
      parts[
        parts.length - 1
      ].trim();
  }

  value = value
    .replace(/[–—]/g, "-")
    .replace(/\(P\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  /*
    Primero busca coincidencia textual exacta
    con bloques conocidos.
  */
  const direct =
    findKnownHorario(value);

  if (direct) {
    return direct;
  }

  /*
    Soporta:

    1:00 A 2:30PM
    1:00 PM A 2:30 PM
    1:00 TO 2:30 PM
    1:00 PM - 2:30 PM
    10:30 A 12:00 PM
  */
  const match =
    value.match(
      /(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)?\s*(?:A|TO|-)\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)?/i
    );

  if (!match) {
    /*
      No inventamos un horario.

      Se conserva el valor para que el usuario
      pueda identificarlo y App.jsx lo muestre
      como posible advertencia.
    */
    return value || "N/A";
  }

  const startHour =
    parseInt(match[1], 10);

  const startMinute =
    match[2];

  const startMeridiem =
    match[3]
      ? match[3].toUpperCase()
      : "";

  const endHour =
    parseInt(match[4], 10);

  const endMinute =
    match[5];

  const endMeridiem =
    match[6]
      ? match[6].toUpperCase()
      : "";

  const resolved =
    resolveMissingMeridiem({
      startHour,
      startMinute,
      startMeridiem,
      endHour,
      endMinute,
      endMeridiem,
    });

  if (resolved.known) {
    return resolved.known;
  }

  const candidate =
    buildHorarioCandidate(
      startHour,
      startMinute,
      resolved.startMer,
      endHour,
      endMinute,
      resolved.endMer
    );

  const mapped =
    findKnownHorario(
      candidate
    );

  return (
    mapped ||
    candidate ||
    value ||
    "N/A"
  );
};

/* =========================================================
   IDENTIFICACIONES
   ========================================================= */

/*
  Aquí NO normalizamos definitivamente la cédula.

  App.jsx conserva:

  idOriginal
  idNorm

  Este parser solo debe evitar perder registros.

  Acepta ejemplos como:

  33500635
  171167
  17738636-1
  V-12345678
  E-12345678
  ABC123456
*/
const isPossibleStudentId = (
  value = ""
) => {
  const token =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (!token) {
    return false;
  }

  if (
    token.length < 5 ||
    token.length > 25
  ) {
    return false;
  }

  /*
    Debe contener por lo menos un número.
  */
  if (!/\d/.test(token)) {
    return false;
  }

  /*
    Caracteres permitidos para identificaciones.
  */
  if (
    !/^[A-Z0-9./-]+$/i.test(
      token
    )
  ) {
    return false;
  }

  /*
    Evita confundir horarios con cédulas.
  */
  if (
    /^\d{1,2}:\d{2}$/.test(
      token
    )
  ) {
    return false;
  }

  return true;
};

/* =========================================================
   EMAIL
   ========================================================= */

const cleanEmail = (
  value = ""
) => {
  return String(value ?? "")
    .trim()
    .replace(
      /^[<({["']+/,
      ""
    )
    .replace(
      /[>)}\]",';,:]+$/,
      ""
    );
};

const findEmailInText = (
  value = ""
) => {
  /*
    Deliberadamente permisivo.

    Queremos capturar incluso correos con errores
    como gmail.cpm para que App.jsx pueda marcarlos
    como advertencia en lugar de perder el alumno.
  */
  const match =
    String(value).match(
      /[^\s<>]+@[^\s<>]+/
    );

  if (!match) {
    return null;
  }

  const raw =
    match[0];

  const email =
    cleanEmail(raw);

  const leadingRemoved =
    raw.indexOf(email);

  const start =
    (match.index || 0) +
    Math.max(
      leadingRemoved,
      0
    );

  return {
    email,
    start,
    end:
      start +
      email.length,
  };
};

/* =========================================================
   TELÉFONO
   ========================================================= */

const cleanPhone = (
  value = ""
) => {
  const text =
    String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const hasPlus =
    text.startsWith("+");

  const digits =
    text.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return hasPlus
    ? `+${digits}`
    : digits;
};

const findPhoneInText = (
  value = ""
) => {
  const text =
    String(value ?? "");

  /*
    Algunos ejemplos reales:

    04129563803
    0424-6512008
    +584146206979
    +58 04127208516
    584246017953
    4127752726
  */
  const regex =
    /\+?\d[\d\s().-]{5,}\d/g;

  const matches = [];

  let match;

  while (
    (match =
      regex.exec(text)) !== null
  ) {
    const cleaned =
      cleanPhone(match[0]);

    const digitCount =
      cleaned.replace(
        /\D/g,
        ""
      ).length;

    if (
      digitCount >= 7 &&
      digitCount <= 15
    ) {
      matches.push({
        raw: match[0],
        phone: cleaned,
        start: match.index,
        end:
          match.index +
          match[0].length,
      });
    }
  }

  if (!matches.length) {
    return null;
  }

  /*
    El teléfono es normalmente el último
    dato de la fila.
  */
  return matches[
    matches.length - 1
  ];
};

/* =========================================================
   METADATOS DE PÁGINA / SECCIÓN
   ========================================================= */

const createEmptyMeta = (
  fallbackCategory = "N/A"
) => ({
  categoryRaw: "",
  category:
    fallbackCategory || "N/A",

  levelRaw: "",
  levelNorm: "",

  scheduleRaw: "",
  scheduleBlock: "",

  salonRaw: "",
  salon: "",

  courseId: "",

  periodRaw: "",
  sedeRaw: "",
  professorRaw: "",
});

const resetSectionMeta = (
  meta,
  fallbackCategory
) => {
  const fresh =
    createEmptyMeta(
      fallbackCategory
    );

  Object.keys(meta).forEach(
    (key) => {
      delete meta[key];
    }
  );

  Object.assign(
    meta,
    fresh
  );
};

const extractAfterLabel = (
  originalLine,
  labelRegex
) => {
  const match =
    originalLine.match(
      labelRegex
    );

  if (!match) {
    return "";
  }

  return cleanSpaces(
    match[1] || ""
  );
};

const extractMetaFromLine = (
  originalLine,
  meta
) => {
  const line =
    repairCommonMojibake(
      cleanSpaces(
        originalLine
      )
    );

  const comparable =
    normalizeComparableText(
      line
    );

  /* -------------------------
     CATEGORÍA
     ------------------------- */

  if (
    comparable.includes(
      "CATEGORIA:"
    )
  ) {
    const raw =
      extractAfterLabel(
        line,
        /CATEGOR[IÍ]A\s*:\s*(.+)$/i
      );

    if (raw) {
      meta.categoryRaw =
        raw;

      meta.category =
        normalizeCategory(
          raw
        );
    }
  }

  /* -------------------------
     NIVEL
     ------------------------- */

  if (
    comparable.includes(
      "NIVEL:"
    ) ||
    comparable.includes(
      "LEVEL:"
    )
  ) {
    let raw =
      extractAfterLabel(
        line,
        /NIVEL\s*:\s*(.+)$/i
      );

    if (!raw) {
      raw =
        extractAfterLabel(
          line,
          /LEVEL\s*:\s*(.+)$/i
        );
    }

    if (raw) {
      meta.levelRaw =
        raw;

      meta.levelNorm =
        normalizeLevel(
          raw
        );
    }
  }

  /* -------------------------
     HORARIO
     ------------------------- */

  if (
    comparable.includes(
      "HORARIO:"
    )
  ) {
    const raw =
      extractAfterLabel(
        line,
        /HORARIO\s*:\s*(.+)$/i
      );

    if (raw) {
      meta.scheduleRaw =
        raw;

      meta.scheduleBlock =
        normalizeHorario(
          raw
        );
    }
  }

  /* -------------------------
     SALÓN
     ------------------------- */

  if (
    comparable.includes(
      "SALON:"
    )
  ) {
    meta.salonRaw =
      line;

    const salonMatch =
      comparable.match(
        /SALON\s*:\s*([A-Z0-9-]+)/
      );

    if (salonMatch) {
      meta.salon =
        salonMatch[1];
    }
  }

  /* -------------------------
     COURSE ID

     Se procesa independientemente del salón.

     Así no perdemos courseId si el PDF modifica
     ligeramente la línea.
     ------------------------- */

  if (
    comparable.includes(
      "CURSO ID:"
    ) ||
    comparable.includes(
      "COURSE ID:"
    )
  ) {
    const courseMatch =
      comparable.match(
        /(?:CURSO|COURSE)\s*ID\s*:\s*(\d+)/
      );

    if (courseMatch) {
      meta.courseId =
        courseMatch[1];
    }
  }

  /* -------------------------
     PERÍODO
     ------------------------- */

  if (
    comparable.startsWith(
      "PERIODO:"
    )
  ) {
    meta.periodRaw =
      extractAfterLabel(
        line,
        /PER[IÍ]ODO\s*:\s*(.+)$/i
      );
  }

  /* -------------------------
     SEDE
     ------------------------- */

  if (
    comparable.startsWith(
      "SEDE:"
    )
  ) {
    meta.sedeRaw =
      extractAfterLabel(
        line,
        /SEDE\s*:\s*(.+)$/i
      );
  }

  /* -------------------------
     PROFESOR
     ------------------------- */

  if (
    comparable.startsWith(
      "PROFESOR:"
    )
  ) {
    meta.professorRaw =
      extractAfterLabel(
        line,
        /PROFESOR\s*:\s*(.+)$/i
      );
  }
};

/* =========================================================
   LÍNEAS QUE NO SON ALUMNOS
   ========================================================= */

const shouldSkipLine = (
  line = ""
) => {
  const up =
    normalizeComparableText(
      line
    );

  if (!up) {
    return true;
  }

  if (
    up.includes(
      "CENTRO VENEZOLANO AMERICANO"
    )
  ) {
    return true;
  }

  if (
    up.includes(
      "LISTA DE ALUMNOS"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "R.I.F"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "SEDE:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "FECHA:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "PERIODO:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "CATEGORIA:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "NIVEL:"
    ) ||
    up.startsWith(
      "LEVEL:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "HORARIO:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "PROFESOR:"
    )
  ) {
    return true;
  }

  if (
    up.startsWith(
      "SALON:"
    )
  ) {
    return true;
  }

  if (
    up.includes(
      "APELLIDOS"
    ) &&
    up.includes(
      "EMAIL"
    )
  ) {
    return true;
  }

  if (
    up.includes(
      "NOMBRES"
    ) &&
    up.includes(
      "TELEFONO"
    )
  ) {
    return true;
  }

  return false;
};

/* =========================================================
   DETECCIÓN DE POSIBLE FILA DE ESTUDIANTE
   ========================================================= */

const looksLikeStudentLine = (
  line = ""
) => {
  const cleaned =
    cleanSpaces(line);

  const rowMatch =
    cleaned.match(
      /^(\d{1,4})\s+(\S+)\s+(.+)$/
    );

  if (!rowMatch) {
    return false;
  }

  const possibleId =
    rowMatch[2];

  return isPossibleStudentId(
    possibleId
  );
};

/* =========================================================
   PARSEO DE FILA DE ESTUDIANTE
   ========================================================= */

const parseStudentLine = (
  originalLine,
  meta
) => {
  const line =
    repairCommonMojibake(
      cleanSpaces(
        originalLine
      )
    );

  /*
    Primero separa únicamente el número de fila.

    Ejemplo:

    6 17738636-1 MACHADO MONTIEL...
  */
  const rowMatch =
    line.match(
      /^(\d{1,4})\s+(.+)$/
    );

  if (!rowMatch) {
    return null;
  }

  const sourceRow =
    parseInt(
      rowMatch[1],
      10
    );

  const afterRow =
    cleanSpaces(
      rowMatch[2]
    );

  /*
    Ahora separa la identificación como primer token.

    A diferencia de la versión anterior,
    NO exige que sean únicamente dígitos.
  */
  const idMatch =
    afterRow.match(
      /^(\S+)\s+(.+)$/
    );

  if (!idMatch) {
    return null;
  }

  const id =
    String(
      idMatch[1]
    ).trim();

  if (
    !isPossibleStudentId(
      id
    )
  ) {
    return null;
  }

  const rest =
    cleanSpaces(
      idMatch[2]
    );

  if (!rest) {
    return null;
  }

  /* =======================================================
     EMAIL
     ======================================================= */

  const emailInfo =
    findEmailInText(
      rest
    );

  let email = "";

  let namePart = "";

  let afterEmail = "";

  if (emailInfo) {
    email =
      emailInfo.email;

    namePart =
      cleanSpaces(
        rest.slice(
          0,
          emailInfo.start
        )
      );

    afterEmail =
      cleanSpaces(
        rest.slice(
          emailInfo.end
        )
      );
  } else {
    /*
      Si no hay email, intentamos detectar teléfono
      al final de la fila.

      Así no convertimos el teléfono en parte del nombre.
    */
    const phoneInfo =
      findPhoneInText(
        rest
      );

    if (phoneInfo) {
      namePart =
        cleanSpaces(
          rest.slice(
            0,
            phoneInfo.start
          )
        );
    } else {
      namePart =
        rest;
    }
  }

  /* =======================================================
     TELÉFONO
     ======================================================= */

  let phone = "";

  if (emailInfo) {
    const phoneInfo =
      findPhoneInText(
        afterEmail
      );

    if (phoneInfo) {
      phone =
        phoneInfo.phone;
    }
  } else {
    const phoneInfo =
      findPhoneInText(
        rest
      );

    if (phoneInfo) {
      phone =
        phoneInfo.phone;
    }
  }

  /* =======================================================
     NOMBRE
     ======================================================= */

  const name =
    cleanSpaces(
      namePart
    );

  if (!name) {
    return null;
  }

  /*
    Evita que una fila de metadatos sea interpretada
    accidentalmente como alumno.
  */
  const nameComparable =
    normalizeComparableText(
      name
    );

  if (
    nameComparable.includes(
      "APELLIDOS"
    ) ||
    nameComparable.includes(
      "NOMBRES"
    ) ||
    nameComparable.includes(
      "CURSO ID"
    )
  ) {
    return null;
  }

  /* =======================================================
     RESULTADO
     ======================================================= */

  return {
    sourceRow,

    id,

    name,

    email,

    phone,

    category:
      meta.category ||
      "N/A",

    categoryRaw:
      meta.categoryRaw ||
      "",

    level:
      meta.levelRaw ||
      "N/A",

    levelNorm:
      meta.levelNorm ||
      "N/A",

    schedule:
      meta.scheduleRaw ||
      "N/A",

    scheduleBlock:
      meta.scheduleBlock ||
      "N/A",

    salon:
      meta.salon ||
      "",

    courseId:
      meta.courseId ||
      "",

    period:
      meta.periodRaw ||
      "",

    sede:
      meta.sedeRaw ||
      "",

    professor:
      meta.professorRaw ||
      "",
  };
};

/* =========================================================
   PARSER PRINCIPAL
   ========================================================= */

export async function parseCevazPdf(
  file
) {
  if (!file) {
    throw new Error(
      "No se recibió un archivo PDF válido."
    );
  }

  const text =
    await extractTextFromPdf(
      file
    );

  if (
    !text ||
    !String(text).trim()
  ) {
    throw new Error(
      `El PDF "${file.name || "sin nombre"}" no contiene texto extraíble.`
    );
  }

  const cleanedText =
    repairCommonMojibake(
      text
    );

  const lines =
    cleanedText
      .split(/\r?\n/)
      .map((line) =>
        cleanSpaces(line)
      )
      .filter(Boolean);

  if (!lines.length) {
    throw new Error(
      `El PDF "${file.name || "sin nombre"}" no produjo líneas procesables.`
    );
  }

  /*
    Solo se usa como fallback en páginas donde,
    por algún problema del PDF, no aparezca la categoría.
  */
  const fallbackCategory =
    inferDocumentCategory(
      cleanedText
    );

  const meta =
    createEmptyMeta(
      fallbackCategory
    );

  const students = [];

  /*
    Estas filas permiten detectar una situación
    peligrosa:

    El parser ve algo que parece un alumno,
    pero no logra interpretarlo.

    Antes simplemente se descartaba silenciosamente.
  */
  const suspiciousRows = [];

  for (
    const originalLine
    of lines
  ) {
    const line =
      cleanSpaces(
        originalLine
      );

    const comparable =
      normalizeComparableText(
        line
      );

    /* =====================================================
       NUEVA PÁGINA / NUEVA SECCIÓN
       ===================================================== */

    if (
      comparable.includes(
        "CENTRO VENEZOLANO AMERICANO"
      )
    ) {
      /*
        Evita que nivel, horario, salón o courseId
        de una página anterior se filtren a la siguiente
        si falta accidentalmente algún encabezado.
      */
      resetSectionMeta(
        meta,
        fallbackCategory
      );
    }

    /*
      MUY IMPORTANTE:

      Se extraen metadatos ANTES de decidir
      si la línea debe omitirse como alumno.
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
        meta
      );

    if (
      student &&
      student.id
    ) {
      students.push(
        student
      );

      continue;
    }

    /*
      Si claramente parece una fila de estudiante
      pero no se pudo interpretar, NO la ocultamos.

      Se registra para detener el análisis y permitir
      detectar una pérdida silenciosa de datos.
    */
    if (
      looksLikeStudentLine(
        line
      )
    ) {
      suspiciousRows.push(
        line
      );
    }
  }

  /* =======================================================
     VALIDACIÓN DE FILAS SOSPECHOSAS
     ======================================================= */

  if (
    suspiciousRows.length
  ) {
    const examples =
      suspiciousRows
        .slice(0, 3)
        .join(" || ");

    throw new Error(
      [
        `Se detectaron ${suspiciousRows.length} fila(s) que parecen corresponder a estudiantes pero no pudieron interpretarse correctamente en "${file.name || "PDF"}".`,
        `Ejemplos: ${examples}`,
        "El análisis fue detenido para evitar omitir alumnos silenciosamente.",
      ].join(" ")
    );
  }

  /* =======================================================
     VALIDACIÓN DE RESULTADO
     ======================================================= */

  if (
    !students.length
  ) {
    throw new Error(
      `No se pudo extraer ningún estudiante del PDF "${file.name || "sin nombre"}".`
    );
  }

  return students;
}

/* =========================================================
   EXPORTACIÓN PARA APP.JSX
   ========================================================= */

export const __HORARIO_BLOQUES__ =
  HORARIO_BLOQUES;
