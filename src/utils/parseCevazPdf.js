// src/utils/parseCevazPdf.js

import { extractTextFromPdf } from "./pdfText";

import {
  detectFrequency,
  FREQUENCIES,
} from "./frecuencia";

/* =========================================================
   BLOQUES HORARIOS INSTITUCIONALES CONOCIDOS
   =========================================================

   Esta lista NO determina la frecuencia.

   Solamente normaliza bloques horarios conocidos para que:

   8:30 A 10:00AM
   8:30 AM A 10:00 AM
   8:30 AM - 10:00 AM

   terminen representándose igual.

   Si aparece un horario nuevo, el sistema puede conservarlo
   aunque todavía no esté incluido aquí.
   ========================================================= */

const HORARIO_BLOQUES = [
  "8:30 AM - 10:00 AM",
  "10:30 AM - 12:00 PM",
  "1:00 PM - 2:30 PM",
  "2:45 PM - 4:15 PM",
  "4:30 PM - 6:00 PM",
  "6:15 PM - 7:45 PM",

  /*
    Bloques usados en clases de una sesión semanal.
  */

  "8:00 AM - 10:40 AM",
  "10:50 AM - 1:30 PM",
  "2:30 PM - 5:10 PM",

  /*
    Bloque observado en el nuevo Semi Intensivo.
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
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
};


const normKey = (
  value = ""
) => {
  return normalizeComparableText(
    value
  )
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
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
    return String(
      raw || "N/A"
    ).trim();
  }

  const level =
    parseInt(
      match[1],
      10
    );

  if (
    !Number.isFinite(level)
  ) {
    return "N/A";
  }

  return `L${String(
    level
  ).padStart(2, "0")}`;
};


/* =========================================================
   CATEGORÍA
   ========================================================= */

export const normalizePdfCategory = (
  raw = ""
) => {
  const original =
    String(raw ?? "");

  const value =
    normalizeComparableText(
      original
    );

  /*
    Adultos
  */

  if (
    /\bADULT(?:O|OS)?\b/.test(
      value
    )
  ) {
    return "Adultos";
  }

  /*
    Jóvenes

    Cubre:

    JOVENES
    JÓVENES
    JOVEN
  */

  if (
    /\bJOVEN(?:ES)?\b/.test(
      value
    )
  ) {
    return "Jóvenes";
  }

  /*
    Niños

    En PDFs reales encontramos:

    NIÑOS
    NINOS
    NI?OS
    NIï¿½OS
    NIÃ?OS

    Por eso no dependemos de que la Ñ
    sea extraída correctamente.
  */

  const compact =
    value.replace(
      /[^A-Z]/g,
      ""
    );

  if (
    compact.includes(
      "NINOS"
    ) ||
    compact.includes(
      "NIOS"
    ) ||
    /\bNI.?OS\b/i.test(
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

const to12HourMinutes = (
  hour,
  minute,
  meridiem
) => {
  let h =
    Number(hour);

  const m =
    Number(minute);

  const mer =
    String(
      meridiem || ""
    ).toUpperCase();

  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    !["AM", "PM"].includes(
      mer
    )
  ) {
    return null;
  }

  if (h === 12) {
    h = 0;
  }

  if (mer === "PM") {
    h += 12;
  }

  return h * 60 + m;
};


const durationMinutes = (
  startHour,
  startMinute,
  startMeridiem,
  endHour,
  endMinute,
  endMeridiem
) => {
  const start =
    to12HourMinutes(
      startHour,
      startMinute,
      startMeridiem
    );

  const end =
    to12HourMinutes(
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

  let difference =
    end - start;

  /*
    Permite rangos que crucen medianoche,
    aunque actualmente no esperamos clases
    académicas de ese tipo.
  */

  if (difference <= 0) {
    difference +=
      24 * 60;
  }

  return difference;
};


/* =========================================================
   INFERENCIA SEGURA DEL MERIDIANO
   =========================================================

   Muchos PDFs escriben:

   8:30 A 10:00AM
   1:00 A 2:30PM
   4:30 A 6:00PM

   Es decir, omiten AM/PM en la hora inicial.

   Para inferirla probamos AM y PM y seleccionamos únicamente
   una opción si produce una duración académicamente razonable.

   Consideramos razonable una duración entre:

   30 minutos y 6 horas.

   Si ambas opciones fueran razonables o ninguna lo fuera,
   no inventamos el valor.
   ========================================================= */

const inferMissingStartMeridiem = ({
  startHour,
  startMinute,
  endHour,
  endMinute,
  endMeridiem,
}) => {
  const candidates =
    ["AM", "PM"].map(
      (meridiem) => {
        const duration =
          durationMinutes(
            startHour,
            startMinute,
            meridiem,
            endHour,
            endMinute,
            endMeridiem
          );

        const plausible =
          Number.isFinite(
            duration
          ) &&
          duration >= 30 &&
          duration <= 360;

        return {
          meridiem,
          duration,
          plausible,
        };
      }
    );

  const plausible =
    candidates.filter(
      (candidate) =>
        candidate.plausible
    );

  if (
    plausible.length === 1
  ) {
    return {
      meridiem:
        plausible[0]
          .meridiem,

      inferred: true,

      duration:
        plausible[0]
          .duration,

      ambiguous: false,
    };
  }

  return {
    meridiem: "",

    inferred: false,

    duration: null,

    ambiguous: true,
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
      raw: "",

      block: "N/A",

      valid: false,

      needsReview: true,

      reason:
        "missing_schedule",

      startMeridiemInferred:
        false,

      durationMinutes:
        null,
    };
  }

  /*
    La parte anterior al "/" es la frecuencia.

    Ejemplo:

    TUESDAY & THURSDAY / 8:30 A 10:00AM

    Solo procesamos como bloque horario:

    8:30 A 10:00AM
  */

  const timePart =
    original.includes("/")
      ? original
          .split("/")
          .slice(1)
          .join("/")
          .trim()
      : original;

  /*
    Eliminamos anotaciones como:

    (P)

    sin modificar el horario.
  */

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
    Casos soportados:

    8:30 A 10:00AM

    8:30 AM A 10:00 AM

    1:00 A 2:30PM

    10:50 AM A 01:30 PM

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
        (block) =>
          normKey(block) ===
          normKey(cleaned)
      );

    if (exact) {
      return {
        raw: original,

        block: exact,

        valid: true,

        needsReview: false,

        reason: "",

        startMeridiemInferred:
          false,

        durationMinutes:
          null,
      };
    }

    /*
      No destruimos información desconocida.

      Conservamos el texto, pero indicamos que
      necesita revisión.
    */

    return {
      raw: original,

      block:
        cleaned ||
        original ||
        "N/A",

      valid: false,

      needsReview: true,

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
      match[3] || ""
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

  let endMeridiem =
    String(
      match[6] || ""
    ).toUpperCase();

  let inferredStart =
    false;

  let ambiguous =
    false;

  /*
    Si falta también el meridiano final,
    no tenemos suficiente información
    para hacer una inferencia segura.
  */

  if (!endMeridiem) {
    return {
      raw: original,

      block: cleaned,

      valid: false,

      needsReview: true,

      reason:
        "missing_end_meridiem",

      startMeridiemInferred:
        false,

      durationMinutes:
        null,
    };
  }

  /*
    Inferimos únicamente el AM/PM inicial
    cuando falta.
  */

  if (!startMeridiem) {
    const inference =
      inferMissingStartMeridiem({
        startHour,
        startMinute,

        endHour,
        endMinute,

        endMeridiem,
      });

    startMeridiem =
      inference.meridiem;

    inferredStart =
      inference.inferred;

    ambiguous =
      inference.ambiguous;
  }

  if (
    !startMeridiem ||
    ambiguous
  ) {
    return {
      raw: original,

      block: cleaned,

      valid: false,

      needsReview: true,

      reason:
        "ambiguous_start_meridiem",

      startMeridiemInferred:
        false,

      durationMinutes:
        null,
    };
  }

  const duration =
    durationMinutes(
      startHour,
      startMinute,
      startMeridiem,

      endHour,
      endMinute,
      endMeridiem
    );

  /*
    Validación adicional.

    No aceptamos automáticamente una clase
    de más de seis horas.
  */

  if (
    !Number.isFinite(
      duration
    ) ||
    duration < 30 ||
    duration > 360
  ) {
    return {
      raw: original,

      block: cleaned,

      valid: false,

      needsReview: true,

      reason:
        "implausible_schedule_duration",

      startMeridiemInferred:
        inferredStart,

      durationMinutes:
        duration,
    };
  }

  const startHourDisplay =
    startHour;

  const endHourDisplay =
    endHour;

  const candidate =
    `${startHourDisplay}:${String(
      startMinute
    ).padStart(
      2,
      "0"
    )} ${startMeridiem} - ${endHourDisplay}:${String(
      endMinute
    ).padStart(
      2,
      "0"
    )} ${endMeridiem}`;

  /*
    Buscamos primero un bloque institucional
    conocido.
  */

  const mapped =
    HORARIO_BLOQUES.find(
      (block) =>
        normKey(block) ===
        normKey(candidate)
    );

  return {
    raw: original,

    block:
      mapped ||
      candidate,

    valid: true,

    needsReview: false,

    reason: "",

    startMeridiemInferred:
      inferredStart,

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
   METADATOS DE CADA SECCIÓN
   ========================================================= */

const createEmptyMeta = () => ({
  periodRaw: "",

  categoryRaw: "",
  category: "N/A",

  levelRaw: "",
  levelNorm: "N/A",

  scheduleRaw: "",
  scheduleBlock: "N/A",

  scheduleValid: false,
  scheduleNeedsReview: false,
  scheduleReviewReason: "",

  scheduleStartMeridiemInferred:
    false,

  scheduleDurationMinutes:
    null,

  salonRaw: "",
  salon: "",

  courseId: "",
});


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

  /*
    PERÍODO
  */

  const periodMatch =
    original.match(
      /^PER[IÍ]ODO\s*:\s*(.*)$/i
    );

  if (periodMatch) {
    meta.periodRaw =
      String(
        periodMatch[1] ||
          ""
      ).trim();

    return;
  }

  /*
    CATEGORÍA
  */

  const categoryMatch =
    original.match(
      /^CATEGOR[IÍ]A\s*:\s*(.*)$/i
    );

  if (categoryMatch) {
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

  /*
    NIVEL
  */

  const levelMatch =
    original.match(
      /^NIVEL\s*:\s*(.*)$/i
    );

  if (levelMatch) {
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

  /*
    HORARIO
  */

  const scheduleMatch =
    original.match(
      /^HORARIO\s*:\s*(.*)$/i
    );

  if (scheduleMatch) {
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

  /*
    SALÓN + CURSO ID

    Ejemplo:

    Salón: C11 Curso ID: 65424
  */

  const salonMatch =
    original.match(
      /^SAL[ÓO]N\s*:\s*(.*?)\s+CURSO\s*ID\s*:\s*([A-Z0-9-]+)/i
    );

  if (salonMatch) {
    meta.salonRaw =
      original;

    meta.salon =
      String(
        salonMatch[1] ||
          ""
      )
        .trim()
        .toUpperCase();

    meta.courseId =
      String(
        salonMatch[2] ||
          ""
      ).trim();

    return;
  }

  /*
    Por seguridad, si existe "Curso ID" pero
    el salón tiene alguna forma inesperada.
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

    if (courseMatch) {
      meta.courseId =
        String(
          courseMatch[1] ||
            ""
        ).trim();
    }

    const simpleSalon =
      original.match(
        /SAL[ÓO]N\s*:\s*([A-Z0-9-]+)/i
      );

    if (simpleSalon) {
      meta.salon =
        String(
          simpleSalon[1] ||
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
      "CENTRO VENEZOLANO AMERICANO"
    )
  ) {
    return true;
  }

  if (
    upper.includes(
      "LISTA DE ALUMNOS INSCRITOS"
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
      phone: "",
      remaining: "",
    };
  }

  /*
    Detecta al final:

    04141234567
    0414-1234567
    0414 123 4567
    +584121234567
    +58 424-1234567
    584121234567
    50767113740
  */

  const match =
    text.match(
      /(\+?\d(?:[\d\s().-]*\d)?)\s*$/
    );

  if (!match) {
    return {
      phone: "",
      remaining: text,
    };
  }

  const candidate =
    String(
      match[1] || ""
    ).trim();

  const digitCount =
    candidate.replace(
      /\D/g,
      ""
    ).length;

  /*
    Evitamos interpretar accidentalmente
    pequeños números como teléfonos.
  */

  if (
    digitCount < 7 ||
    digitCount > 15
  ) {
    return {
      phone: "",
      remaining: text,
    };
  }

  const remaining =
    text
      .slice(
        0,
        match.index
      )
      .trim();

  return {
    phone: candidate,

    remaining,
  };
};


/* =========================================================
   EMAIL
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
      name: "",
      email: "",
      emailRaw: "",
      emailValid: false,
      missingEmail: true,
    };
  }

  /*
    Primero buscamos cualquier token que tenga @.

    Incluso si el dominio está mal escrito, por ejemplo:

    @hotmail.cin
    @hotmail.xom
    @gm,ail.com

    necesitamos conservarlo para auditoría.
  */

  const atMatch =
    text.match(
      /(?:^|\s)([^\s]+@[^\s]+)(?=\s|$)/
    );

  if (atMatch) {
    const emailRaw =
      String(
        atMatch[1] || ""
      ).trim();

    const emailStart =
      atMatch.index +
      atMatch[0].indexOf(
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

    const emailValid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
        emailRaw
      );

    return {
      name,

      email:
        emailRaw,

      emailRaw,

      emailValid,

      missingEmail: false,
    };
  }

  /*
    Algunos registros pueden tener un correo
    parecido a un email pero sin @.

    Ejemplo real posible:

    nombreusuario gmail.com

    o:

    nombreusuariogmail.com

    No lo descartamos: lo guardamos como emailRaw
    inválido para revisión.
  */

  const malformedEmailMatch =
    text.match(
      /(?:^|\s)([^\s]+\.(?:COM|NET|ORG|ES|EDU|VE|CIN|XOM))$/i
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
      malformedEmailMatch[0].indexOf(
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

      emailValid: false,

      missingEmail: false,
    };
  }

  /*
    PDFs reales también pueden usar:

    -
    ...
    .......

    como marcador de email faltante.
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
      name: text,

      email: "",

      emailRaw:
        placeholderMatch[1],

      emailValid: false,

      missingEmail: true,
    };
  }

  /*
    No existe un separador confiable de email.

    Conservamos toda la parte textual como nombre
    para no eliminar datos silenciosamente.
  */

  return {
    name:
      text
        .replace(
          /\s+/g,
          " "
        )
        .trim(),

    email: "",

    emailRaw: "",

    emailValid: false,

    missingEmail: true,
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
    Ejemplos reales:

    1 17912684 BERMUDEZ FLORES ...

    1 18284765-1 FERNANDEZ ESPINOZA ...

    La segunda columna es el ID.

    NO eliminamos el sufijo "-1", "-2", "-3", etc.
    porque forma parte de la identificación mostrada
    en las listas de Niños/Jóvenes.
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
      match[2] || ""
    ).trim();

  let remaining =
    String(
      match[3] || ""
    ).trim();

  if (
    !id ||
    !remaining
  ) {
    return null;
  }

  /*
    Extraemos primero el teléfono porque siempre
    aparece al final de la fila.
  */

  const phoneResult =
    extractTrailingPhone(
      remaining
    );

  const phone =
    phoneResult.phone;

  remaining =
    phoneResult.remaining;

  /*
    Después identificamos email y nombre.
  */

  const identityResult =
    extractEmailAndName(
      remaining
    );

  const name =
    identityResult.name;

  if (!name) {
    return null;
  }

  /*
    La frecuencia se obtiene de múltiples fuentes.

    Prioridad:

    1. Horario real de la sección.
    2. Periodo.
    3. Nombre del archivo.

    El motor frecuencia.js también tolera errores
    como THRUSDAY.
  */

  const frequency =
    detectFrequency({
      scheduleRaw:
        meta.scheduleRaw,

      periodRaw:
        meta.periodRaw,

      fileName,
    });

  return {
    rowNumber,

    /* -----------------------------------------------------
       IDENTIDAD
       ----------------------------------------------------- */

    id,

    name,

    email:
      identityResult.email,

    emailRaw:
      identityResult.emailRaw,

    emailValid:
      identityResult.emailValid,

    missingEmail:
      identityResult.missingEmail,

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

    frequencyNorm:
      frequency.frequency ||
      FREQUENCIES.NA,

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

    /*
      Compatibilidad temporal.

      El próximo archivo que cambiaremos será
      continuidad.js y después App.jsx.

      Mientras tanto mantenemos schedule.
    */

    schedule:
      meta.scheduleRaw ||
      "N/A",

    /* -----------------------------------------------------
       HORARIO
       ----------------------------------------------------- */

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
       PERÍODO Y ORIGEN
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
   VALIDACIÓN BÁSICA DE METADATOS
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

  if (!student.phone) {
    warnings.push(
      "missing_phone"
    );
  }

  return warnings;
};


/* =========================================================
   PARSER PRINCIPAL
   ========================================================= */

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
      text || ""
    ).trim()
  ) {
    throw new Error(
      `El archivo "${file.name}" no contiene texto extraíble.`
    );
  }

  const lines =
    String(
      text || ""
    )
      .split(/\r?\n/)
      .map(
        (line) =>
          line.trim()
      );

  const meta =
    createEmptyMeta();

  const students = [];

  /*
    El parser actualiza meta cada vez que encuentra:

    Categoría
    Nivel
    Horario
    Salón / Curso ID

    Esto permite que un PDF de muchas páginas contenga
    distintas secciones y niveles sin mezclar sus datos.
  */

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line =
      lines[index];

    if (!line) {
      continue;
    }

    /*
      PRIMERO actualizamos metadatos.

      Después decidimos si la línea debe descartarse
      como posible estudiante.
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

    /*
      Registramos advertencias por estudiante.

      No bloqueamos la importación por un email malo o
      por un teléfono faltante.

      Esos problemas deben aparecer posteriormente como
      calidad de datos.
    */

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

  if (!students.length) {
    throw new Error(
      `No se encontraron estudiantes válidos en "${file.name}".`
    );
  }

  return students;
}


/* =========================================================
   EXPORTACIONES PARA DASHBOARD Y TESTS
   ========================================================= */

export const __HORARIO_BLOQUES__ =
  HORARIO_BLOQUES;

export const __parseHelpers__ = {
  normalizePdfLevel,

  normalizePdfCategory,

  normalizePdfSchedule,

  normalizePdfScheduleDetailed,

  extractTrailingPhone,

  extractEmailAndName,
};
