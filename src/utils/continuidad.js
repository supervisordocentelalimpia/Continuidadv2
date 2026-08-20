// src/utils/continuidad.js

/* =========================================================
   MOTOR DE CONTINUIDAD ACADÉMICA
   =========================================================

   Este archivo centraliza las reglas de negocio para:

   - Graduandos
   - Elegibles para continuidad
   - Reinscritos
   - Fugas
   - Fuga L01 vs regulares
   - Nuevos ingresos L01
   - Ingresos L02+
   - Cambios de frecuencia
   - Transiciones de categoría
   - Fuga por nivel
   - Fuga por horario
   - Densidad promedio
   - Conciliaciones internas

   REGLA INSTITUCIONAL ACTUAL CONFIRMADA:

   ADULTOS:
   - Graduando = estudiante que estaba en L20
     en el período ANTERIOR.

   IMPORTANTE:
   - L19 NO es graduando.
   - Nivel 1 = nuevo ingreso.
   - Un estudiante no presente en el período anterior
     y ubicado en L02+ se identifica como ingreso externo
     L02+, pero NO se afirma automáticamente que sea
     "nivelación" sin validación del SGA.

   ========================================================= */


/* =========================================================
   VERSIÓN DE REGLAS
   ========================================================= */

export const CONTINUIDAD_RULES_VERSION = "2026-08-20-v1";


/* =========================================================
   REGLAS DE GRADUACIÓN
   ========================================================= */

/*
  Solo incluimos reglas institucionales confirmadas.

  No se deben inventar niveles terminales para Niños
  o Jóvenes sin validación institucional.
*/

export const DEFAULT_GRADUATION_RULES = Object.freeze({
  Adultos: 20,
});


/* =========================================================
   UTILIDADES GENERALES
   ========================================================= */

const toStringSafe = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
};


const cleanSpaces = (value = "") => {
  return toStringSafe(value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};


const removeDiacritics = (value = "") => {
  return toStringSafe(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};


const comparableText = (value = "") => {
  return removeDiacritics(value)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
};


const round1 = (value) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.round(n * 10) / 10;
};


const safePercentage = (
  numerator,
  denominator
) => {
  const num = Number(numerator);
  const den = Number(denominator);

  if (
    !Number.isFinite(num) ||
    !Number.isFinite(den) ||
    den <= 0
  ) {
    return 0;
  }

  return round1(
    (num / den) * 100
  );
};


/* =========================================================
   NORMALIZACIÓN DE CÉDULA / IDENTIFICACIÓN
   ========================================================= */

/*
  Ejemplos:

  17.738.636-1
  -> 177386361

  17738636-1
  -> 177386361

  V-12345678
  -> 12345678

  E-12345678
  -> 12345678

  ABC-123
  -> ABC123

  La identificación original NO se pierde.
  Esta función solo genera la llave de comparación.
*/

export function normalizeStudentId(
  value = ""
) {
  let raw = toStringSafe(value)
    .trim()
    .toUpperCase();

  if (!raw) {
    return "";
  }

  let compact = raw.replace(
    /[^A-Z0-9]/g,
    ""
  );

  /*
    Elimina únicamente V/E cuando son prefijos
    venezolanos y el resto del identificador
    es completamente numérico.
  */

  if (/^[VE]\d+$/.test(compact)) {
    compact = compact.slice(1);
  }

  return compact;
}


/* =========================================================
   VALIDACIÓN DE IDENTIFICACIÓN
   ========================================================= */

export function isValidStudentId(
  value = ""
) {
  const normalized =
    normalizeStudentId(value);

  if (!normalized) {
    return false;
  }

  if (
    normalized.length < 5 ||
    normalized.length > 25
  ) {
    return false;
  }

  return /^[A-Z0-9]+$/.test(
    normalized
  );
}


/* =========================================================
   NORMALIZACIÓN DE NOMBRE
   ========================================================= */

export function normalizeStudentName(
  value = ""
) {
  return cleanSpaces(value);
}


/*
  Se utiliza solamente para comparar nombres.

  No se muestra al usuario.
*/

export function studentNameKey(
  value = ""
) {
  return comparableText(value)
    .replace(/[^A-Z0-9]/g, "");
}


/* =========================================================
   NORMALIZACIÓN DE CATEGORÍA
   ========================================================= */

export function normalizeCategory(
  value = ""
) {
  const original =
    cleanSpaces(value);

  if (!original) {
    return "N/A";
  }

  const normalized =
    comparableText(original);

  if (
    normalized.includes(
      "ADULTO"
    )
  ) {
    return "Adultos";
  }

  if (
    normalized.includes(
      "JOVEN"
    )
  ) {
    return "Jóvenes";
  }

  if (
    normalized.includes(
      "NINO"
    )
  ) {
    return "Niños";
  }

  return original;
}


/* =========================================================
   NORMALIZACIÓN DE NIVEL
   ========================================================= */

export function normalizeLevel(
  value = ""
) {
  const raw =
    cleanSpaces(value);

  if (!raw) {
    return "N/A";
  }

  const match =
    raw.match(/(\d{1,2})/);

  if (!match) {
    return "N/A";
  }

  const number =
    parseInt(
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
}


export function getLevelNumber(
  studentOrLevel
) {
  const raw =
    typeof studentOrLevel ===
    "object"
      ? studentOrLevel?.levelNorm ??
        studentOrLevel?.level ??
        ""
      : studentOrLevel;

  const normalized =
    normalizeLevel(raw);

  const number =
    parseInt(
      normalized.replace(
        /\D/g,
        ""
      ),
      10
    );

  return Number.isFinite(number)
    ? number
    : 0;
}


/* =========================================================
   NORMALIZACIÓN DE HORARIO
   ========================================================= */

export function normalizeScheduleBlock(
  value = ""
) {
  const cleaned =
    cleanSpaces(value);

  return cleaned || "N/A";
}


/* =========================================================
   NORMALIZACIÓN DE FRECUENCIA
   ========================================================= */

/*
  La etiqueta visible puede ser:

  INTENSIVO A
  INTENSIVO B

  Pero ambos pertenecen a la misma familia:

  INTENSIVO

  Por eso pasar de Intensivo A a Intensivo B
  NO se considera cambio de frecuencia.
*/

export function normalizeFrequencyFamily(
  value = ""
) {
  const normalized =
    comparableText(value);

  if (!normalized) {
    return "N/A";
  }

  if (
    normalized.includes(
      "INTENSIVO"
    )
  ) {
    return "INTENSIVO";
  }

  if (
    normalized.includes(
      "MARTES"
    ) &&
    normalized.includes(
      "JUEVES"
    )
  ) {
    return "MARTES Y JUEVES";
  }

  if (
    normalized.includes(
      "MIERCOLES"
    ) &&
    normalized.includes(
      "VIERNES"
    )
  ) {
    return "MIERCOLES Y VIERNES";
  }

  if (
    normalized.includes(
      "TUESDAY"
    ) &&
    normalized.includes(
      "THURSDAY"
    )
  ) {
    return "MARTES Y JUEVES";
  }

  if (
    normalized.includes(
      "WEDNESDAY"
    ) &&
    normalized.includes(
      "FRIDAY"
    )
  ) {
    return "MIERCOLES Y VIERNES";
  }

  if (
    normalized.includes(
      "SABADO"
    ) ||
    normalized.includes(
      "SATURDAY"
    ) ||
    normalized.includes(
      "SABAT"
    )
  ) {
    return "SABATINO";
  }

  if (
    normalized.includes(
      "LUNES"
    ) ||
    normalized ===
      "MONDAY"
  ) {
    return "LUNES";
  }

  return cleanSpaces(value);
}


/* =========================================================
   PREPARACIÓN NORMALIZADA DEL ESTUDIANTE
   ========================================================= */

export function prepareStudent(
  student = {}
) {
  const originalId =
    cleanSpaces(
      student.idOriginal ??
        student.id ??
        ""
    );

  const idNorm =
    normalizeStudentId(
      student.idNorm ||
        originalId
    );

  const category =
    normalizeCategory(
      student.category
    );

  const levelNorm =
    normalizeLevel(
      student.levelNorm ||
        student.level
    );

  const frequencyNorm =
    cleanSpaces(
      student.frequencyNorm ||
        student.frequency ||
        "N/A"
    ) || "N/A";

  const frequencyBase =
    normalizeFrequencyFamily(
      student.frequencyBase ||
        frequencyNorm ||
        student.schedule ||
        ""
    );

  const scheduleBlock =
    normalizeScheduleBlock(
      student.scheduleBlock
    );

  return {
    ...student,

    id:
      originalId ||
      student.id ||
      "",

    idOriginal:
      originalId,

    idNorm,

    name:
      normalizeStudentName(
        student.name
      ),

    category,

    levelNorm,

    frequencyNorm,

    frequencyBase,

    scheduleBlock,
  };
}


/* =========================================================
   GRADUACIÓN
   ========================================================= */

export function isGraduated(
  student,
  graduationRules =
    DEFAULT_GRADUATION_RULES
) {
  if (!student) {
    return false;
  }

  const prepared =
    prepareStudent(student);

  const category =
    prepared.category;

  const terminalLevel =
    graduationRules?.[
      category
    ];

  /*
    Si la categoría no tiene una regla institucional
    confirmada, NO adivinamos.
  */

  if (
    !Number.isFinite(
      Number(terminalLevel)
    )
  ) {
    return false;
  }

  const level =
    getLevelNumber(
      prepared
    );

  /*
    IGUALDAD ESTRICTA.

    Adultos:
    L20 = graduando.
    L19 = NO graduando.
  */

  return (
    level ===
    Number(terminalLevel)
  );
}


/* =========================================================
   DEDUPLICACIÓN
   ========================================================= */

/*
  Si un estudiante aparece repetido dentro del mismo
  período, conservamos el registro procedente del archivo
  con mayor __fileRank.

  Si no existe __fileRank, el último registro encontrado
  tiene prioridad.
*/

export function dedupeStudentsById(
  students = []
) {
  const map = new Map();

  for (
    let index = 0;
    index < students.length;
    index++
  ) {
    const prepared =
      prepareStudent(
        students[index]
      );

    if (!prepared.idNorm) {
      continue;
    }

    const previous =
      map.get(
        prepared.idNorm
      );

    if (!previous) {
      map.set(
        prepared.idNorm,
        {
          student:
            prepared,

          inputIndex:
            index,
        }
      );

      continue;
    }

    const previousRank =
      Number.isFinite(
        Number(
          previous.student
            .__fileRank
        )
      )
        ? Number(
            previous.student
              .__fileRank
          )
        : previous.inputIndex;

    const currentRank =
      Number.isFinite(
        Number(
          prepared.__fileRank
        )
      )
        ? Number(
            prepared.__fileRank
          )
        : index;

    if (
      currentRank >=
      previousRank
    ) {
      map.set(
        prepared.idNorm,
        {
          student:
            prepared,

          inputIndex:
            index,
        }
      );
    }
  }

  return Array.from(
    map.values()
  ).map(
    (entry) =>
      entry.student
  );
}


/* =========================================================
   DETECCIÓN DE DUPLICADOS Y CONFLICTOS
   ========================================================= */

export function inspectIdentityQuality(
  students = []
) {
  const grouped =
    new Map();

  const missingIds = [];

  students.forEach(
    (student, index) => {
      const prepared =
        prepareStudent(
          student
        );

      if (!prepared.idNorm) {
        missingIds.push({
          index,
          student:
            prepared,
        });

        return;
      }

      if (
        !grouped.has(
          prepared.idNorm
        )
      ) {
        grouped.set(
          prepared.idNorm,
          []
        );
      }

      grouped
        .get(
          prepared.idNorm
        )
        .push({
          index,
          student:
            prepared,
        });
    }
  );

  const duplicates = [];

  const nameConflicts = [];

  for (
    const [
      idNorm,
      entries,
    ] of grouped.entries()
  ) {
    if (
      entries.length <= 1
    ) {
      continue;
    }

    duplicates.push({
      idNorm,

      count:
        entries.length,

      students:
        entries.map(
          (entry) =>
            entry.student
        ),
    });

    const names =
      new Set(
        entries
          .map(
            (entry) =>
              studentNameKey(
                entry.student
                  .name
              )
          )
          .filter(Boolean)
      );

    if (
      names.size > 1
    ) {
      nameConflicts.push({
        idNorm,

        students:
          entries.map(
            (entry) =>
              entry.student
          ),
      });
    }
  }

  return {
    missingIds,

    duplicates,

    nameConflicts,
  };
}


/* =========================================================
   LLAVE DE SECCIÓN
   ========================================================= */

export function getSectionKey(
  student
) {
  const s =
    prepareStudent(
      student
    );

  if (s.courseId) {
    return `COURSE:${String(
      s.courseId
    ).trim()}`;
  }

  /*
    Fallback cuando no existe courseId.

    No usamos salón únicamente porque una misma aula
    puede tener múltiples cursos a diferentes horas.
  */

  return [
    s.category ||
      "N/A",

    s.levelNorm ||
      "N/A",

    s.frequencyNorm ||
      "N/A",

    s.scheduleBlock ||
      "N/A",

    s.salon ||
      "N/A",
  ].join("|");
}


/* =========================================================
   FUGA POR NIVEL
   ========================================================= */

export function calculateDropoutByLevel(
  lostStudents = []
) {
  const map = new Map();

  for (const student of lostStudents) {
    const s =
      prepareStudent(
        student
      );

    const level =
      s.levelNorm ||
      "N/A";

    map.set(
      level,
      (map.get(level) || 0) +
        1
    );
  }

  return Array.from(
    map.entries()
  )
    .map(
      ([level, count]) => ({
        level,
        count,
      })
    )
    .sort((a, b) => {
      const aLevel =
        getLevelNumber(
          a.level
        );

      const bLevel =
        getLevelNumber(
          b.level
        );

      if (
        aLevel !== bLevel
      ) {
        return (
          aLevel - bLevel
        );
      }

      return a.level.localeCompare(
        b.level
      );
    });
}


/* =========================================================
   FUGA POR HORARIO
   ========================================================= */

export function calculateScheduleAttrition(
  eligibleStudents = [],
  lostStudents = []
) {
  const eligibleMap =
    new Map();

  const lostMap =
    new Map();

  for (
    const student
    of eligibleStudents
  ) {
    const s =
      prepareStudent(
        student
      );

    const schedule =
      s.scheduleBlock ||
      "N/A";

    eligibleMap.set(
      schedule,
      (eligibleMap.get(
        schedule
      ) || 0) + 1
    );
  }

  for (
    const student
    of lostStudents
  ) {
    const s =
      prepareStudent(
        student
      );

    const schedule =
      s.scheduleBlock ||
      "N/A";

    lostMap.set(
      schedule,
      (lostMap.get(
        schedule
      ) || 0) + 1
    );
  }

  const schedules =
    new Set([
      ...eligibleMap.keys(),
      ...lostMap.keys(),
    ]);

  const rows =
    Array.from(
      schedules
    ).map((schedule) => {
      const eligible =
        eligibleMap.get(
          schedule
        ) || 0;

      const lost =
        lostMap.get(
          schedule
        ) || 0;

      const rate =
        safePercentage(
          lost,
          eligible
        );

      return {
        schedule,

        eligible,

        lost,

        retained:
          Math.max(
            eligible -
              lost,
            0
          ),

        rate,
      };
    });

  rows.sort((a, b) => {
    if (
      b.lost !== a.lost
    ) {
      return (
        b.lost - a.lost
      );
    }

    if (
      b.rate !== a.rate
    ) {
      return (
        b.rate - a.rate
      );
    }

    return a.schedule.localeCompare(
      b.schedule
    );
  });

  return rows;
}


/* =========================================================
   HORARIO CON MAYOR VOLUMEN DE FUGAS
   ========================================================= */

export function getTopDropoutScheduleByVolume(
  scheduleRows = []
) {
  if (!scheduleRows.length) {
    return {
      schedule: "N/A",
      lost: 0,
      eligible: 0,
      rate: 0,
    };
  }

  const sorted = [
    ...scheduleRows,
  ].sort((a, b) => {
    if (
      b.lost !== a.lost
    ) {
      return (
        b.lost - a.lost
      );
    }

    if (
      b.rate !== a.rate
    ) {
      return (
        b.rate - a.rate
      );
    }

    return a.schedule.localeCompare(
      b.schedule
    );
  });

  return sorted[0];
}


/* =========================================================
   HORARIO CON MAYOR TASA DE FUGA
   ========================================================= */

export function getTopDropoutScheduleByRate(
  scheduleRows = []
) {
  if (!scheduleRows.length) {
    return {
      schedule: "N/A",
      lost: 0,
      eligible: 0,
      rate: 0,
    };
  }

  const sorted = [
    ...scheduleRows,
  ].sort((a, b) => {
    if (
      b.rate !== a.rate
    ) {
      return (
        b.rate - a.rate
      );
    }

    if (
      b.lost !== a.lost
    ) {
      return (
        b.lost - a.lost
      );
    }

    if (
      b.eligible !==
      a.eligible
    ) {
      return (
        b.eligible -
        a.eligible
      );
    }

    return a.schedule.localeCompare(
      b.schedule
    );
  });

  return sorted[0];
}


/* =========================================================
   CAMBIOS DE FRECUENCIA
   ========================================================= */

export function detectFrequencyChanges(
  reenrolledPairs = []
) {
  const changes = [];

  for (
    const pair
    of reenrolledPairs
  ) {
    const oldS =
      prepareStudent(
        pair.oldS
      );

    const newS =
      prepareStudent(
        pair.newS
      );

    const oldBase =
      normalizeFrequencyFamily(
        oldS.frequencyBase ||
          oldS.frequencyNorm
      );

    const newBase =
      normalizeFrequencyFamily(
        newS.frequencyBase ||
          newS.frequencyNorm
      );

    if (
      !oldBase ||
      !newBase ||
      oldBase === "N/A" ||
      newBase === "N/A"
    ) {
      continue;
    }

    /*
      INTENSIVO A -> INTENSIVO B

      NO es cambio de frecuencia porque ambos
      pertenecen a INTENSIVO.
    */

    if (
      oldBase === newBase
    ) {
      continue;
    }

    changes.push({
      ...newS,

      oldFrequency:
        oldS.frequencyNorm,

      newFrequency:
        newS.frequencyNorm,

      oldFrequencyBase:
        oldBase,

      newFrequencyBase:
        newBase,

      previousStudent:
        oldS,
    });
  }

  return changes;
}


/* =========================================================
   TRANSICIONES DE CATEGORÍA
   ========================================================= */

export function detectCategoryTransitions(
  reenrolledPairs = []
) {
  const ninosJovenes = [];

  const jovenesAdultos = [];

  for (
    const pair
    of reenrolledPairs
  ) {
    const oldS =
      prepareStudent(
        pair.oldS
      );

    const newS =
      prepareStudent(
        pair.newS
      );

    if (
      oldS.category ===
        "Niños" &&
      newS.category ===
        "Jóvenes"
    ) {
      ninosJovenes.push({
        ...newS,

        oldCategory:
          oldS.category,

        previousStudent:
          oldS,
      });
    }

    if (
      oldS.category ===
        "Jóvenes" &&
      newS.category ===
        "Adultos"
    ) {
      jovenesAdultos.push({
        ...newS,

        oldCategory:
          oldS.category,

        previousStudent:
          oldS,
      });
    }
  }

  return {
    ninosJovenes,

    jovenesAdultos,

    total:
      ninosJovenes.length +
      jovenesAdultos.length,
  };
}


/* =========================================================
   DENSIDAD PROMEDIO
   ========================================================= */

export function calculateAverageDensity(
  students = []
) {
  const prepared =
    students.map(
      prepareStudent
    );

  if (!prepared.length) {
    return {
      students: 0,
      sections: 0,
      average: 0,
    };
  }

  const sections =
    new Set(
      prepared.map(
        getSectionKey
      )
    );

  const sectionCount =
    sections.size;

  const average =
    sectionCount > 0
      ? round1(
          prepared.length /
            sectionCount
        )
      : 0;

  return {
    students:
      prepared.length,

    sections:
      sectionCount,

    average,
  };
}


/* =========================================================
   MOTOR PRINCIPAL DE CONTINUIDAD
   ========================================================= */

export function analyzeContinuity({
  oldStudents = [],
  newStudents = [],

  graduationRules =
    DEFAULT_GRADUATION_RULES,

  strict = true,
} = {}) {
  /* =======================================================
     1. PREPARAR Y AUDITAR IDENTIDADES
     ======================================================= */

  const oldPrepared =
    oldStudents.map(
      prepareStudent
    );

  const newPrepared =
    newStudents.map(
      prepareStudent
    );

  const oldIdentityQuality =
    inspectIdentityQuality(
      oldPrepared
    );

  const newIdentityQuality =
    inspectIdentityQuality(
      newPrepared
    );

  const criticalErrors = [];

  const warnings = [];

  if (
    oldIdentityQuality
      .missingIds.length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldIdentityQuality.missingIds.length} registro(s) sin identificación válida.`
    );
  }

  if (
    newIdentityQuality
      .missingIds.length
  ) {
    criticalErrors.push(
      `Período actual: ${newIdentityQuality.missingIds.length} registro(s) sin identificación válida.`
    );
  }

  if (
    oldIdentityQuality
      .nameConflicts.length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldIdentityQuality.nameConflicts.length} identificación(es) están asociadas a nombres diferentes.`
    );
  }

  if (
    newIdentityQuality
      .nameConflicts.length
  ) {
    criticalErrors.push(
      `Período actual: ${newIdentityQuality.nameConflicts.length} identificación(es) están asociadas a nombres diferentes.`
    );
  }

  if (
    oldIdentityQuality
      .duplicates.length
  ) {
    warnings.push(
      `Período anterior: ${oldIdentityQuality.duplicates.length} identificación(es) repetida(s).`
    );
  }

  if (
    newIdentityQuality
      .duplicates.length
  ) {
    warnings.push(
      `Período actual: ${newIdentityQuality.duplicates.length} identificación(es) repetida(s).`
    );
  }

  if (
    strict &&
    criticalErrors.length
  ) {
    throw new Error(
      [
        "El análisis fue detenido por problemas críticos de identidad.",
        ...criticalErrors,
      ].join(" ")
    );
  }


  /* =======================================================
     2. DEDUPLICAR
     ======================================================= */

  const oldUnique =
    dedupeStudentsById(
      oldPrepared
    );

  const newUnique =
    dedupeStudentsById(
      newPrepared
    );


  /* =======================================================
     3. MAPAS DE IDENTIDAD
     ======================================================= */

  const oldById =
    new Map(
      oldUnique.map(
        (student) => [
          student.idNorm,
          student,
        ]
      )
    );

  const newById =
    new Map(
      newUnique.map(
        (student) => [
          student.idNorm,
          student,
        ]
      )
    );

  const oldIds =
    new Set(
      oldById.keys()
    );

  const newIds =
    new Set(
      newById.keys()
    );


  /* =======================================================
     4. GRADUANDOS
     ======================================================= */

  const graduates =
    oldUnique.filter(
      (student) =>
        isGraduated(
          student,
          graduationRules
        )
    );


  /* =======================================================
     5. ELEGIBLES PARA CONTINUIDAD
     ======================================================= */

  const eligible =
    oldUnique.filter(
      (student) =>
        !isGraduated(
          student,
          graduationRules
        )
    );


  /* =======================================================
     6. REINSCRITOS
     ======================================================= */

  const reenrolledPairs = [];

  for (
    const oldS
    of eligible
  ) {
    const newS =
      newById.get(
        oldS.idNorm
      );

    if (!newS) {
      continue;
    }

    reenrolledPairs.push({
      idNorm:
        oldS.idNorm,

      oldS,

      newS,
    });
  }

  const reenrolledOld =
    reenrolledPairs.map(
      (pair) =>
        pair.oldS
    );

  const reenrolledCurrent =
    reenrolledPairs.map(
      (pair) =>
        pair.newS
    );


  /* =======================================================
     7. FUGAS
     ======================================================= */

  const lost =
    eligible.filter(
      (oldS) =>
        !newIds.has(
          oldS.idNorm
        )
    );


  /* =======================================================
     8. FUGA L01 VS REGULARES
     ======================================================= */

  const newEligible =
    eligible.filter(
      (student) =>
        student.levelNorm ===
        "L01"
    );

  const regularEligible =
    eligible.filter(
      (student) =>
        student.levelNorm !==
        "L01"
    );

  const newLost =
    lost.filter(
      (student) =>
        student.levelNorm ===
        "L01"
    );

  const regularLost =
    lost.filter(
      (student) =>
        student.levelNorm !==
        "L01"
    );


  /* =======================================================
     9. INGRESOS EXTERNOS DEL PERÍODO ACTUAL
     ======================================================= */

  const externalEntrants =
    newUnique.filter(
      (newS) =>
        !oldIds.has(
          newS.idNorm
        )
    );

  const newLevel1 =
    externalEntrants.filter(
      (student) =>
        student.levelNorm ===
        "L01"
    );

  const externalLevel2Plus =
    externalEntrants.filter(
      (student) =>
        student.levelNorm !==
        "L01"
    );


  /* =======================================================
     10. GRADUANDOS QUE APARECEN NUEVAMENTE
     ======================================================= */

  const graduatesPresentAgain =
    graduates.filter(
      (student) =>
        newIds.has(
          student.idNorm
        )
    );

  if (
    graduatesPresentAgain.length
  ) {
    warnings.push(
      `${graduatesPresentAgain.length} graduando(s) del período anterior aparecen nuevamente en el período actual. Revise su situación académica.`
    );
  }


  /* =======================================================
     11. PORCENTAJES
     ======================================================= */

  const retentionPct =
    safePercentage(
      reenrolledPairs.length,
      eligible.length
    );

  const attritionPct =
    safePercentage(
      lost.length,
      eligible.length
    );

  const newAttritionPct =
    safePercentage(
      newLost.length,
      newEligible.length
    );

  const regularAttritionPct =
    safePercentage(
      regularLost.length,
      regularEligible.length
    );


  /* =======================================================
     12. CAMBIOS DE FRECUENCIA
     ======================================================= */

  const frequencyChanges =
    detectFrequencyChanges(
      reenrolledPairs
    );


  /* =======================================================
     13. TRANSICIONES DE CATEGORÍA
     ======================================================= */

  const categoryTransitions =
    detectCategoryTransitions(
      reenrolledPairs
    );

  const categoriesInDataset =
    new Set(
      [
        ...oldUnique,
        ...newUnique,
      ].map(
        (student) =>
          student.category
      )
    );

  const categoryTransitionsAvailable =
    categoriesInDataset.has(
      "Niños"
    ) ||
    categoriesInDataset.has(
      "Jóvenes"
    );


  /* =======================================================
     14. DENSIDAD
     ======================================================= */

  const density =
    calculateAverageDensity(
      newUnique
    );


  /* =======================================================
     15. FUGA POR NIVEL
     ======================================================= */

  const dropoutByLevel =
    calculateDropoutByLevel(
      lost
    );


  /* =======================================================
     16. FUGA POR HORARIO
     ======================================================= */

  const dropoutBySchedule =
    calculateScheduleAttrition(
      eligible,
      lost
    );

  const topScheduleByVolume =
    getTopDropoutScheduleByVolume(
      dropoutBySchedule
    );

  const topScheduleByRate =
    getTopDropoutScheduleByRate(
      dropoutBySchedule
    );


  /* =======================================================
     17. CONCILIACIONES INTERNAS
     ======================================================= */

  const reconciliationOld =
    oldUnique.length ===
    eligible.length +
      graduates.length;

  const reconciliationEligible =
    eligible.length ===
    reenrolledPairs.length +
      lost.length;

  /*
    El período actual debe estar compuesto por:

    - reinscritos elegibles;
    - estudiantes externos nuevos;
    - graduandos del período anterior que aparezcan
      nuevamente, si existiera ese caso.
  */

  const reconciliationNew =
    newUnique.length ===
    reenrolledCurrent.length +
      externalEntrants.length +
      graduatesPresentAgain.length;

  const reconciliationOk =
    reconciliationOld &&
    reconciliationEligible &&
    reconciliationNew;


  if (
    strict &&
    !reconciliationOk
  ) {
    throw new Error(
      [
        "La conciliación interna de continuidad no cerró correctamente.",

        `Anterior=${oldUnique.length}.`,

        `Elegibles=${eligible.length}.`,

        `Graduandos=${graduates.length}.`,

        `Reinscritos=${reenrolledPairs.length}.`,

        `Fugas=${lost.length}.`,

        `Actual=${newUnique.length}.`,

        `Ingresos externos=${externalEntrants.length}.`,

        `Graduandos presentes nuevamente=${graduatesPresentAgain.length}.`,
      ].join(" ")
    );
  }


  /* =======================================================
     18. RESULTADO
     ======================================================= */

  return {
    rulesVersion:
      CONTINUIDAD_RULES_VERSION,

    /* -----------------------
       BASES
       ----------------------- */

    oldStudents:
      oldUnique,

    newStudents:
      newUnique,

    oldById,

    newById,

    /* -----------------------
       TOTALES
       ----------------------- */

    totals: {
      previous:
        oldUnique.length,

      current:
        newUnique.length,

      graduates:
        graduates.length,

      eligible:
        eligible.length,

      reenrolled:
        reenrolledPairs.length,

      lost:
        lost.length,

      externalEntrants:
        externalEntrants.length,

      newLevel1:
        newLevel1.length,

      externalLevel2Plus:
        externalLevel2Plus.length,

      frequencyChanges:
        frequencyChanges.length,

      graduatesPresentAgain:
        graduatesPresentAgain.length,
    },

    /* -----------------------
       TASAS
       ----------------------- */

    rates: {
      retention:
        retentionPct,

      attrition:
        attritionPct,

      newStudentAttrition:
        newAttritionPct,

      regularAttrition:
        regularAttritionPct,
    },

    /* -----------------------
       L01 VS REGULARES
       ----------------------- */

    segmentation: {
      newStudents: {
        eligible:
          newEligible.length,

        lost:
          newLost.length,

        retained:
          newEligible.length -
          newLost.length,

        attritionRate:
          newAttritionPct,
      },

      regularStudents: {
        eligible:
          regularEligible.length,

        lost:
          regularLost.length,

        retained:
          regularEligible.length -
          regularLost.length,

        attritionRate:
          regularAttritionPct,
      },
    },

    /* -----------------------
       LISTAS
       ----------------------- */

    lists: {
      graduates,

      eligible,

      reenrolledOld,

      reenrolledCurrent,

      reenrolledPairs,

      lost,

      newLost,

      regularLost,

      externalEntrants,

      newLevel1,

      externalLevel2Plus,

      frequencyChanges,

      graduatesPresentAgain,

      ninosJovenes:
        categoryTransitions
          .ninosJovenes,

      jovenesAdultos:
        categoryTransitions
          .jovenesAdultos,
    },

    /* -----------------------
       GRÁFICOS / ANÁLISIS
       ----------------------- */

    analytics: {
      dropoutByLevel,

      dropoutBySchedule,

      topScheduleByVolume,

      topScheduleByRate,

      density,

      categoryTransitionsAvailable,

      categoryTransitionsTotal:
        categoryTransitions.total,
    },

    /* -----------------------
       CALIDAD
       ----------------------- */

    quality: {
      previous:
        oldIdentityQuality,

      current:
        newIdentityQuality,

      criticalErrors,

      warnings,

      reconciliation: {
        previous:
          reconciliationOld,

        eligible:
          reconciliationEligible,

        current:
          reconciliationNew,

        ok:
          reconciliationOk,
      },
    },
  };
}


/* =========================================================
   VALIDACIÓN DE RESULTADOS ESPERADOS
   ========================================================= */

/*
  Esta función será utilizada por las pruebas automáticas.

  NO contiene números institucionales hardcoded.

  Las pruebas le pasarán los valores esperados.

  Ejemplo:

  validateExpectedMetrics(
    analysis,
    {
      previous: 306,
      current: 357,
      graduates: 12,
      eligible: 294,
      reenrolled: 274,
      lost: 20
    }
  );
*/

export function validateExpectedMetrics(
  analysis,
  expected = {}
) {
  if (!analysis) {
    throw new Error(
      "No se recibió un análisis de continuidad."
    );
  }

  const actual = {
    previous:
      analysis.totals
        ?.previous,

    current:
      analysis.totals
        ?.current,

    graduates:
      analysis.totals
        ?.graduates,

    eligible:
      analysis.totals
        ?.eligible,

    reenrolled:
      analysis.totals
        ?.reenrolled,

    lost:
      analysis.totals
        ?.lost,

    newLevel1:
      analysis.totals
        ?.newLevel1,

    externalLevel2Plus:
      analysis.totals
        ?.externalLevel2Plus,

    retention:
      analysis.rates
        ?.retention,

    attrition:
      analysis.rates
        ?.attrition,

    newEligible:
      analysis.segmentation
        ?.newStudents
        ?.eligible,

    newLost:
      analysis.segmentation
        ?.newStudents
        ?.lost,

    newAttrition:
      analysis.segmentation
        ?.newStudents
        ?.attritionRate,

    regularEligible:
      analysis.segmentation
        ?.regularStudents
        ?.eligible,

    regularLost:
      analysis.segmentation
        ?.regularStudents
        ?.lost,

    regularAttrition:
      analysis.segmentation
        ?.regularStudents
        ?.attritionRate,

    averageDensity:
      analysis.analytics
        ?.density
        ?.average,
  };

  const mismatches = [];

  for (
    const [
      key,
      expectedValue,
    ] of Object.entries(
      expected
    )
  ) {
    if (
      expectedValue ===
      undefined
    ) {
      continue;
    }

    const actualValue =
      actual[key];

    if (
      actualValue !==
      expectedValue
    ) {
      mismatches.push({
        metric:
          key,

        expected:
          expectedValue,

        actual:
          actualValue,
      });
    }
  }

  return {
    ok:
      mismatches.length ===
      0,

    actual,

    expected,

    mismatches,
  };
}


/* =========================================================
   ASSERT DE RESULTADOS
   ========================================================= */

/*
  Igual que validateExpectedMetrics(), pero lanza error
  automáticamente si algo no coincide.

  Esta función será especialmente útil en GitHub Actions.
*/

export function assertExpectedMetrics(
  analysis,
  expected = {}
) {
  const result =
    validateExpectedMetrics(
      analysis,
      expected
    );

  if (!result.ok) {
    const details =
      result.mismatches
        .map(
          (item) =>
            `${item.metric}: esperado=${item.expected}, recibido=${item.actual}`
        )
        .join(" | ");

    throw new Error(
      `Validación de indicadores fallida. ${details}`
    );
  }

  return true;
}
