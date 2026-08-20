// src/utils/continuidad.js

import {
  FREQUENCIES,
  normalizeFrequency,
} from "./frecuencia";

/* =========================================================
   MOTOR DE CONTINUIDAD ACADÉMICA
   =========================================================

   REGLAS PRINCIPALES

   1. REINSCRITO
      Estaba en el período anterior, debía continuar
      y su misma identificación aparece en el período nuevo.

   2. PÉRDIDA
      Estaba en el período anterior, debía continuar
      y no aparece en ninguna lista del período nuevo.

   3. GRADUANDO
      Adultos L20 en el período anterior que NO aparece
      en el período nuevo.

   4. ADULTO L20 QUE REAPARECE
      No se cuenta como graduando.
      Se marca como situación académica para revisión.

   5. INGRESO NIVEL 01
      Todo estudiante L01 presente en el período nuevo.

   6. ESTUDIANTE NO PRESENTE EN PERÍODO ANTERIOR L02+
      Aparece en el período nuevo, no aparece en el período
      anterior y está en L02 o superior.

      Esto NO significa automáticamente "nivelación".

   7. TRANSICIÓN DE CATEGORÍA
      Niños   -> Jóvenes
      Niños   -> Adultos
      Jóvenes -> Adultos

   8. CAMBIO DE FRECUENCIA
      Se compara la frecuencia normalizada entre ambos
      períodos.

      Ejemplos:

      SABATINO -> MARTES Y JUEVES
      LUNES -> SEMI INTENSIVO
      INTENSIVO -> MIERCOLES Y VIERNES

      INTENSIVO A -> INTENSIVO B NO cuenta como cambio,
      porque ambos se normalizan como INTENSIVO.

   ========================================================= */


/* =========================================================
   VERSIÓN DE LAS REGLAS
   ========================================================= */

export const CONTINUIDAD_RULES_VERSION =
  "2026-08-20-v2";


/* =========================================================
   REGLAS TERMINALES CONFIRMADAS
   ========================================================= */

/*
  Solo utilizamos reglas institucionales confirmadas.

  Actualmente:

  Adultos L20 = nivel terminal.

  No inventamos niveles terminales para Niños o Jóvenes.
*/

export const DEFAULT_GRADUATION_RULES =
  Object.freeze({
    Adultos: 20,
  });


/* =========================================================
   UTILIDADES GENERALES
   ========================================================= */

const toStringSafe = (
  value
) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
};


const cleanSpaces = (
  value = ""
) => {
  return toStringSafe(
    value
  )
    .replace(
      /\u00A0/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
};


const removeDiacritics = (
  value = ""
) => {
  return toStringSafe(
    value
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
};


const comparableText = (
  value = ""
) => {
  return removeDiacritics(
    value
  )
    .toUpperCase()
    .replace(
      /\s+/g,
      " "
    )
    .trim();
};


const round1 = (
  value
) => {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return (
    Math.round(
      number * 10
    ) / 10
  );
};


const safePercentage = (
  numerator,
  denominator
) => {
  const num =
    Number(numerator);

  const den =
    Number(denominator);

  if (
    !Number.isFinite(
      num
    ) ||
    !Number.isFinite(
      den
    ) ||
    den <= 0
  ) {
    return 0;
  }

  return round1(
    (num / den) *
      100
  );
};


/* =========================================================
   IDENTIFICACIÓN
   ========================================================= */

/*
  Ejemplos:

  17.738.636-1
  -> 177386361

  17738636-1
  -> 177386361

  18284765-1
  -> 182847651

  18284765-2
  -> 182847652

  Por tanto:

  -1
  -2
  -3

  continúan distinguiendo estudiantes diferentes.

  También:

  V-12345678
  -> 12345678

  E-12345678
  -> 12345678
*/

export function normalizeStudentId(
  value = ""
) {
  let raw =
    cleanSpaces(
      value
    )
      .toUpperCase();

  if (!raw) {
    return "";
  }

  let compact =
    raw.replace(
      /[^A-Z0-9]/g,
      ""
    );

  /*
    V y E se consideran prefijos venezolanos
    únicamente cuando todo lo demás es numérico.
  */

  if (
    /^[VE]\d+$/.test(
      compact
    )
  ) {
    compact =
      compact.slice(1);
  }

  return compact;
}


export function isValidStudentId(
  value = ""
) {
  const id =
    normalizeStudentId(
      value
    );

  if (!id) {
    return false;
  }

  if (
    id.length < 5 ||
    id.length > 25
  ) {
    return false;
  }

  return /^[A-Z0-9]+$/.test(
    id
  );
}


/* =========================================================
   NOMBRE
   ========================================================= */

export function normalizeStudentName(
  value = ""
) {
  return cleanSpaces(
    value
  );
}


export function studentNameKey(
  value = ""
) {
  return comparableText(
    value
  ).replace(
    /[^A-Z0-9]/g,
    ""
  );
}


/* =========================================================
   CATEGORÍA
   ========================================================= */

export function normalizeCategory(
  value = ""
) {
  const original =
    cleanSpaces(
      value
    );

  if (!original) {
    return "N/A";
  }

  const normalized =
    comparableText(
      original
    );

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

  /*
    Tolera:

    NIÑOS
    NINOS
    NI?OS
    NIï¿½OS
  */

  const compact =
    normalized.replace(
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

  return original;
}


/* =========================================================
   NIVEL
   ========================================================= */

export function normalizeLevel(
  value = ""
) {
  const raw =
    cleanSpaces(
      value
    );

  if (!raw) {
    return "N/A";
  }

  const match =
    raw.match(
      /(\d{1,2})/
    );

  if (!match) {
    return "N/A";
  }

  const number =
    parseInt(
      match[1],
      10
    );

  if (
    !Number.isFinite(
      number
    ) ||
    number <= 0
  ) {
    return "N/A";
  }

  return `L${String(
    number
  ).padStart(
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
      ? (
          studentOrLevel
            ?.levelNorm ??
          studentOrLevel
            ?.level ??
          ""
        )
      : studentOrLevel;

  const normalized =
    normalizeLevel(
      raw
    );

  if (
    normalized ===
    "N/A"
  ) {
    return 0;
  }

  const number =
    parseInt(
      normalized.replace(
        /\D/g,
        ""
      ),
      10
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


/* =========================================================
   HORARIO
   ========================================================= */

export function normalizeScheduleBlock(
  value = ""
) {
  const cleaned =
    cleanSpaces(
      value
    );

  return (
    cleaned ||
    "N/A"
  );
}


/* =========================================================
   FRECUENCIA
   ========================================================= */

/*
  Compatibilidad con el código anterior.

  Antes se utilizaba el concepto frequencyFamily.

  Ahora ya no hablamos de "familia".

  La función simplemente devuelve la frecuencia institucional
  normalizada.
*/

export function normalizeFrequencyFamily(
  value = ""
) {
  return normalizeFrequency(
    value
  );
}


/* =========================================================
   PREPARACIÓN DEL ESTUDIANTE
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

  /*
    Intentamos obtener la frecuencia desde distintas
    propiedades para mantener compatibilidad con versiones
    anteriores del parser y App.jsx.
  */

  const frequencyCandidate =
    student.frequencyNorm ||
    student.frequency ||
    student.frequencyBase ||
    student.frequencyRaw ||
    student.schedule ||
    "";

  const frequencyNorm =
    normalizeFrequency(
      frequencyCandidate
    );

  const scheduleBlock =
    normalizeScheduleBlock(
      student.scheduleBlock
    );

  return {
    ...student,

    id:
      originalId ||
      cleanSpaces(
        student.id
      ),

    idOriginal:
      originalId,

    idNorm,

    name:
      normalizeStudentName(
        student.name
      ),

    category,

    levelNorm,

    /*
      frequencyNorm es SIEMPRE la frecuencia institucional
      normalizada.

      Ya no utilizamos etiquetas como INTENSIVO A o B
      para comparar estudiantes.
    */

    frequencyNorm,

    /*
      Se conserva por compatibilidad temporal con partes
      antiguas del dashboard.
    */

    frequencyBase:
      frequencyNorm,

    scheduleBlock,
  };
}


/* =========================================================
   NIVEL TERMINAL
   ========================================================= */

export function isTerminalLevelStudent(
  student,
  graduationRules =
    DEFAULT_GRADUATION_RULES
) {
  if (!student) {
    return false;
  }

  const prepared =
    prepareStudent(
      student
    );

  const terminalLevel =
    graduationRules?.[
      prepared.category
    ];

  if (
    !Number.isFinite(
      Number(
        terminalLevel
      )
    )
  ) {
    return false;
  }

  return (
    getLevelNumber(
      prepared
    ) ===
    Number(
      terminalLevel
    )
  );
}


/*
  Compatibilidad con pruebas/código anterior.

  IMPORTANTE:

  Esta función responde solamente:

  "¿Está académicamente en el nivel terminal?"

  La clasificación definitiva como GRADUANDO necesita además
  comprobar que NO aparezca en el período nuevo.

  Esa validación se realiza dentro de analyzeContinuity().
*/

export function isGraduated(
  student,
  graduationRules =
    DEFAULT_GRADUATION_RULES
) {
  return isTerminalLevelStudent(
    student,
    graduationRules
  );
}


/* =========================================================
   CONTROL DE CALIDAD POR IDENTIDAD
   ========================================================= */

const academicSignature = (
  student
) => {
  const prepared =
    prepareStudent(
      student
    );

  return [
    prepared.category,
    prepared.levelNorm,
    prepared.frequencyNorm,
    prepared.scheduleBlock,
  ].join("|");
};


export function inspectIdentityQuality(
  students = []
) {
  const grouped =
    new Map();

  const missingIds = [];

  const missingNames = [];

  const missingLevels = [];

  const missingCategories = [];

  const unknownFrequencies =
    [];

  const schedulesToReview =
    [];

  const frequencyCorrections =
    [];

  students.forEach(
    (
      student,
      index
    ) => {
      const prepared =
        prepareStudent(
          student
        );

      if (
        !prepared.idNorm
      ) {
        missingIds.push({
          index,

          student:
            prepared,
        });

        return;
      }

      if (
        !prepared.name
      ) {
        missingNames.push({
          index,

          student:
            prepared,
        });
      }

      if (
        !prepared.levelNorm ||
        prepared.levelNorm ===
          "N/A"
      ) {
        missingLevels.push({
          index,

          student:
            prepared,
        });
      }

      if (
        !prepared.category ||
        prepared.category ===
          "N/A"
      ) {
        missingCategories.push({
          index,

          student:
            prepared,
        });
      }

      if (
        !prepared.frequencyNorm ||
        prepared.frequencyNorm ===
          FREQUENCIES.NA
      ) {
        unknownFrequencies.push({
          index,

          student:
            prepared,
        });
      }

      if (
        prepared
          .scheduleNeedsReview
      ) {
        schedulesToReview.push({
          index,

          student:
            prepared,
        });
      }

      if (
        Array.isArray(
          prepared
            .frequencyCorrections
        ) &&
        prepared
          .frequencyCorrections
          .length
      ) {
        frequencyCorrections.push({
          index,

          student:
            prepared,

          corrections:
            prepared
              .frequencyCorrections,
        });
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

  const academicConflicts =
    [];

  for (
    const [
      idNorm,
      entries,
    ]
    of grouped.entries()
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
                entry.student.name
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

    const signatures =
      new Set(
        entries.map(
          (entry) =>
            academicSignature(
              entry.student
            )
        )
      );

    if (
      signatures.size > 1
    ) {
      academicConflicts.push({
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

    missingNames,

    missingLevels,

    missingCategories,

    unknownFrequencies,

    schedulesToReview,

    frequencyCorrections,

    duplicates,

    nameConflicts,

    academicConflicts,
  };
}


/* =========================================================
   DEDUPLICACIÓN
   ========================================================= */

export function dedupeStudentsById(
  students = []
) {
  const map =
    new Map();

  for (
    let index = 0;
    index <
    students.length;
    index++
  ) {
    const prepared =
      prepareStudent(
        students[index]
      );

    if (
      !prepared.idNorm
    ) {
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

    /*
      Si los archivos contienen __fileRank, conservamos
      la versión procedente del archivo posterior.

      Si no, conservamos el último registro recibido.
    */

    const previousRank =
      Number.isFinite(
        Number(
          previous
            .student
            .__fileRank
        )
      )
        ? Number(
            previous
              .student
              .__fileRank
          )
        : previous
            .inputIndex;

    const currentRank =
      Number.isFinite(
        Number(
          prepared
            .__fileRank
        )
      )
        ? Number(
            prepared
              .__fileRank
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
   LLAVE DE SECCIÓN
   ========================================================= */

export function getSectionKey(
  student
) {
  const prepared =
    prepareStudent(
      student
    );

  if (
    prepared.courseId
  ) {
    return `COURSE:${String(
      prepared.courseId
    ).trim()}`;
  }

  /*
    Fallback cuando falta Curso ID.
  */

  return [
    prepared.category ||
      "N/A",

    prepared.levelNorm ||
      "N/A",

    prepared.frequencyNorm ||
      "N/A",

    prepared.scheduleBlock ||
      "N/A",

    prepared.salon ||
      "N/A",
  ].join("|");
}


/* =========================================================
   DENSIDAD
   ========================================================= */

export function calculateAverageDensity(
  students = []
) {
  const prepared =
    students.map(
      prepareStudent
    );

  if (
    !prepared.length
  ) {
    return {
      students: 0,

      sections: 0,

      average: 0,
    };
  }

  const sectionKeys =
    prepared
      .map(
        getSectionKey
      )
      .filter(Boolean);

  const sections =
    new Set(
      sectionKeys
    );

  const sectionCount =
    sections.size;

  return {
    students:
      prepared.length,

    sections:
      sectionCount,

    average:
      sectionCount > 0
        ? round1(
            prepared.length /
            sectionCount
          )
        : 0,
  };
}


/* =========================================================
   DESERCIÓN POR NIVEL
   ========================================================= */

export function calculateDropoutByLevel(
  lostStudents = []
) {
  const map =
    new Map();

  for (
    const student
    of lostStudents
  ) {
    const prepared =
      prepareStudent(
        student
      );

    const level =
      prepared.levelNorm ||
      "N/A";

    map.set(
      level,

      (
        map.get(
          level
        ) || 0
      ) + 1
    );
  }

  return Array.from(
    map.entries()
  )
    .map(
      (
        [
          level,
          count,
        ]
      ) => ({
        level,

        count,
      })
    )
    .sort(
      (a, b) => {
        const aNumber =
          getLevelNumber(
            a.level
          );

        const bNumber =
          getLevelNumber(
            b.level
          );

        if (
          aNumber !==
          bNumber
        ) {
          return (
            aNumber -
            bNumber
          );
        }

        return a.level.localeCompare(
          b.level
        );
      }
    );
}


/* =========================================================
   DESERCIÓN POR HORARIO
   ========================================================= */

export function calculateScheduleAttrition(
  studentsWhoShouldContinue = [],
  lostStudents = []
) {
  const previousMap =
    new Map();

  const lostMap =
    new Map();

  for (
    const student
    of studentsWhoShouldContinue
  ) {
    const prepared =
      prepareStudent(
        student
      );

    const schedule =
      prepared.scheduleBlock ||
      "N/A";

    previousMap.set(
      schedule,

      (
        previousMap.get(
          schedule
        ) || 0
      ) + 1
    );
  }

  for (
    const student
    of lostStudents
  ) {
    const prepared =
      prepareStudent(
        student
      );

    const schedule =
      prepared.scheduleBlock ||
      "N/A";

    lostMap.set(
      schedule,

      (
        lostMap.get(
          schedule
        ) || 0
      ) + 1
    );
  }

  const schedules =
    new Set([
      ...previousMap.keys(),

      ...lostMap.keys(),
    ]);

  return Array.from(
    schedules
  )
    .map(
      (schedule) => {
        const previous =
          previousMap.get(
            schedule
          ) || 0;

        const lost =
          lostMap.get(
            schedule
          ) || 0;

        return {
          schedule,

          previous,

          /*
            Alias temporal para App.jsx antiguo.
          */

          eligible:
            previous,

          lost,

          retained:
            Math.max(
              previous -
              lost,
              0
            ),

          rate:
            safePercentage(
              lost,
              previous
            ),
        };
      }
    )
    .sort(
      (a, b) => {
        if (
          b.lost !==
          a.lost
        ) {
          return (
            b.lost -
            a.lost
          );
        }

        if (
          b.rate !==
          a.rate
        ) {
          return (
            b.rate -
            a.rate
          );
        }

        return a.schedule.localeCompare(
          b.schedule
        );
      }
    );
}


/* =========================================================
   DESERCIÓN POR FRECUENCIA
   ========================================================= */

export function calculateFrequencyAttrition(
  studentsWhoShouldContinue = [],
  lostStudents = []
) {
  const previousMap =
    new Map();

  const lostMap =
    new Map();

  for (
    const student
    of studentsWhoShouldContinue
  ) {
    const prepared =
      prepareStudent(
        student
      );

    const frequency =
      prepared.frequencyNorm ||
      FREQUENCIES.NA;

    previousMap.set(
      frequency,

      (
        previousMap.get(
          frequency
        ) || 0
      ) + 1
    );
  }

  for (
    const student
    of lostStudents
  ) {
    const prepared =
      prepareStudent(
        student
      );

    const frequency =
      prepared.frequencyNorm ||
      FREQUENCIES.NA;

    lostMap.set(
      frequency,

      (
        lostMap.get(
          frequency
        ) || 0
      ) + 1
    );
  }

  const frequencies =
    new Set([
      ...previousMap.keys(),

      ...lostMap.keys(),
    ]);

  return Array.from(
    frequencies
  )
    .map(
      (frequency) => {
        const previous =
          previousMap.get(
            frequency
          ) || 0;

        const lost =
          lostMap.get(
            frequency
          ) || 0;

        return {
          frequency,

          previous,

          lost,

          retained:
            Math.max(
              previous -
              lost,
              0
            ),

          rate:
            safePercentage(
              lost,
              previous
            ),
        };
      }
    )
    .sort(
      (a, b) => {
        if (
          b.lost !==
          a.lost
        ) {
          return (
            b.lost -
            a.lost
          );
        }

        return a.frequency.localeCompare(
          b.frequency
        );
      }
    );
}


/* =========================================================
   HORARIO CON MAYOR VOLUMEN
   ========================================================= */

export function getTopDropoutScheduleByVolume(
  scheduleRows = []
) {
  if (
    !scheduleRows.length
  ) {
    return {
      schedule:
        "N/A",

      lost: 0,

      previous: 0,

      eligible: 0,

      rate: 0,
    };
  }

  const valid =
    scheduleRows.filter(
      (row) =>
        row.schedule &&
        row.schedule !==
          "N/A"
    );

  if (
    !valid.length
  ) {
    return {
      schedule:
        "N/A",

      lost: 0,

      previous: 0,

      eligible: 0,

      rate: 0,
    };
  }

  const sorted =
    [...valid].sort(
      (a, b) => {
        if (
          b.lost !==
          a.lost
        ) {
          return (
            b.lost -
            a.lost
          );
        }

        if (
          b.rate !==
          a.rate
        ) {
          return (
            b.rate -
            a.rate
          );
        }

        return a.schedule.localeCompare(
          b.schedule
        );
      }
    );

  return sorted[0];
}


/* =========================================================
   HORARIO CON MAYOR TASA
   ========================================================= */

export function getTopDropoutScheduleByRate(
  scheduleRows = []
) {
  if (
    !scheduleRows.length
  ) {
    return {
      schedule:
        "N/A",

      lost: 0,

      previous: 0,

      eligible: 0,

      rate: 0,
    };
  }

  const valid =
    scheduleRows.filter(
      (row) =>
        row.schedule &&
        row.schedule !==
          "N/A"
    );

  if (
    !valid.length
  ) {
    return {
      schedule:
        "N/A",

      lost: 0,

      previous: 0,

      eligible: 0,

      rate: 0,
    };
  }

  const sorted =
    [...valid].sort(
      (a, b) => {
        if (
          b.rate !==
          a.rate
        ) {
          return (
            b.rate -
            a.rate
          );
        }

        if (
          b.lost !==
          a.lost
        ) {
          return (
            b.lost -
            a.lost
          );
        }

        if (
          b.previous !==
          a.previous
        ) {
          return (
            b.previous -
            a.previous
          );
        }

        return a.schedule.localeCompare(
          b.schedule
        );
      }
    );

  return sorted[0];
}


/* =========================================================
   CAMBIOS DE FRECUENCIA
   ========================================================= */

export function detectFrequencyChangesDetailed(
  reenrolledPairs = []
) {
  const changes = [];

  const unresolvedPairs =
    [];

  for (
    const pair
    of reenrolledPairs
  ) {
    const oldStudent =
      prepareStudent(
        pair.oldS
      );

    const newStudent =
      prepareStudent(
        pair.newS
      );

    const oldFrequency =
      normalizeFrequency(
        oldStudent.frequencyNorm
      );

    const newFrequency =
      normalizeFrequency(
        newStudent.frequencyNorm
      );

    /*
      Si alguna frecuencia no pudo reconocerse,
      no afirmamos que hubo cambio.
    */

    if (
      oldFrequency ===
        FREQUENCIES.NA ||
      newFrequency ===
        FREQUENCIES.NA
    ) {
      unresolvedPairs.push({
        idNorm:
          oldStudent.idNorm,

        oldS:
          oldStudent,

        newS:
          newStudent,

        oldFrequency,

        newFrequency,
      });

      continue;
    }

    if (
      oldFrequency ===
      newFrequency
    ) {
      continue;
    }

    changes.push({
      ...newStudent,

      oldFrequency,

      newFrequency,

      previousStudent:
        oldStudent,

      currentStudent:
        newStudent,
    });
  }

  return {
    changes,

    unresolvedPairs,
  };
}


/*
  Compatibilidad:

  Devuelve solamente la lista de cambios.
*/

export function detectFrequencyChanges(
  reenrolledPairs = []
) {
  return detectFrequencyChangesDetailed(
    reenrolledPairs
  ).changes;
}


/* =========================================================
   TRANSICIONES DE CATEGORÍA
   ========================================================= */

export function detectCategoryTransitions(
  reenrolledPairs = []
) {
  const ninosJovenes =
    [];

  const ninosAdultos =
    [];

  const jovenesAdultos =
    [];

  const otherTransitions =
    [];

  const all = [];

  for (
    const pair
    of reenrolledPairs
  ) {
    const oldStudent =
      prepareStudent(
        pair.oldS
      );

    const newStudent =
      prepareStudent(
        pair.newS
      );

    if (
      !oldStudent.category ||
      !newStudent.category ||
      oldStudent.category ===
        "N/A" ||
      newStudent.category ===
        "N/A"
    ) {
      continue;
    }

    if (
      oldStudent.category ===
      newStudent.category
    ) {
      continue;
    }

    const transition = {
      ...newStudent,

      oldCategory:
        oldStudent.category,

      newCategory:
        newStudent.category,

      previousStudent:
        oldStudent,

      currentStudent:
        newStudent,
    };

    all.push(
      transition
    );

    /* -----------------------------------------------------
       NIÑOS -> JÓVENES
       ----------------------------------------------------- */

    if (
      oldStudent.category ===
        "Niños" &&
      newStudent.category ===
        "Jóvenes"
    ) {
      ninosJovenes.push(
        transition
      );

      continue;
    }

    /* -----------------------------------------------------
       NIÑOS -> ADULTOS
       ----------------------------------------------------- */

    if (
      oldStudent.category ===
        "Niños" &&
      newStudent.category ===
        "Adultos"
    ) {
      ninosAdultos.push(
        transition
      );

      continue;
    }

    /* -----------------------------------------------------
       JÓVENES -> ADULTOS
       ----------------------------------------------------- */

    if (
      oldStudent.category ===
        "Jóvenes" &&
      newStudent.category ===
        "Adultos"
    ) {
      jovenesAdultos.push(
        transition
      );

      continue;
    }

    /*
      Cualquier otro cambio se conserva para auditoría.

      Ejemplos:

      Adultos -> Jóvenes
      Jóvenes -> Niños

      No debería descartarse silenciosamente.
    */

    otherTransitions.push(
      transition
    );
  }

  return {
    ninosJovenes,

    ninosAdultos,

    jovenesAdultos,

    otherTransitions,

    all,

    total:
      all.length,
  };
}


/* =========================================================
   MOTOR PRINCIPAL
   ========================================================= */

export function analyzeContinuity({
  oldStudents = [],

  newStudents = [],

  graduationRules =
    DEFAULT_GRADUATION_RULES,

  strict = true,
} = {}) {
  /* =======================================================
     1. NORMALIZAR
     ======================================================= */

  const oldPrepared =
    oldStudents.map(
      prepareStudent
    );

  const newPrepared =
    newStudents.map(
      prepareStudent
    );


  /* =======================================================
     2. CALIDAD DE DATOS
     ======================================================= */

  const oldQuality =
    inspectIdentityQuality(
      oldPrepared
    );

  const newQuality =
    inspectIdentityQuality(
      newPrepared
    );

  const criticalErrors =
    [];

  const warnings =
    [];


  /* -------------------------------------------------------
     IDENTIFICACIÓN
     ------------------------------------------------------- */

  if (
    oldQuality
      .missingIds.length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldQuality.missingIds.length} registro(s) sin identificación válida.`
    );
  }

  if (
    newQuality
      .missingIds.length
  ) {
    criticalErrors.push(
      `Período actual: ${newQuality.missingIds.length} registro(s) sin identificación válida.`
    );
  }


  /* -------------------------------------------------------
     NIVEL
     ------------------------------------------------------- */

  if (
    oldQuality
      .missingLevels.length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldQuality.missingLevels.length} registro(s) sin nivel reconocible.`
    );
  }

  if (
    newQuality
      .missingLevels.length
  ) {
    criticalErrors.push(
      `Período actual: ${newQuality.missingLevels.length} registro(s) sin nivel reconocible.`
    );
  }


  /* -------------------------------------------------------
     CATEGORÍA
     ------------------------------------------------------- */

  if (
    oldQuality
      .missingCategories
      .length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldQuality.missingCategories.length} registro(s) sin categoría reconocible.`
    );
  }

  if (
    newQuality
      .missingCategories
      .length
  ) {
    criticalErrors.push(
      `Período actual: ${newQuality.missingCategories.length} registro(s) sin categoría reconocible.`
    );
  }


  /* -------------------------------------------------------
     MISMA CÉDULA, NOMBRES DIFERENTES
     ------------------------------------------------------- */

  if (
    oldQuality
      .nameConflicts.length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldQuality.nameConflicts.length} identificación(es) están asociadas a nombres diferentes.`
    );
  }

  if (
    newQuality
      .nameConflicts.length
  ) {
    criticalErrors.push(
      `Período actual: ${newQuality.nameConflicts.length} identificación(es) están asociadas a nombres diferentes.`
    );
  }


  /* -------------------------------------------------------
     MISMA CÉDULA, DATOS ACADÉMICOS DIFERENTES
     ------------------------------------------------------- */

  if (
    oldQuality
      .academicConflicts
      .length
  ) {
    criticalErrors.push(
      `Período anterior: ${oldQuality.academicConflicts.length} identificación(es) aparecen con información académica diferente dentro del mismo período.`
    );
  }

  if (
    newQuality
      .academicConflicts
      .length
  ) {
    criticalErrors.push(
      `Período actual: ${newQuality.academicConflicts.length} identificación(es) aparecen con información académica diferente dentro del mismo período.`
    );
  }


  /* -------------------------------------------------------
     DUPLICADOS SIN CONFLICTO
     ------------------------------------------------------- */

  if (
    oldQuality
      .duplicates.length
  ) {
    warnings.push(
      `Período anterior: ${oldQuality.duplicates.length} identificación(es) repetida(s).`
    );
  }

  if (
    newQuality
      .duplicates.length
  ) {
    warnings.push(
      `Período actual: ${newQuality.duplicates.length} identificación(es) repetida(s).`
    );
  }


  /* -------------------------------------------------------
     FRECUENCIAS DESCONOCIDAS
     ------------------------------------------------------- */

  if (
    oldQuality
      .unknownFrequencies
      .length
  ) {
    warnings.push(
      `Período anterior: ${oldQuality.unknownFrequencies.length} registro(s) con frecuencia no reconocida.`
    );
  }

  if (
    newQuality
      .unknownFrequencies
      .length
  ) {
    warnings.push(
      `Período actual: ${newQuality.unknownFrequencies.length} registro(s) con frecuencia no reconocida.`
    );
  }


  /* -------------------------------------------------------
     HORARIOS PARA REVISAR
     ------------------------------------------------------- */

  if (
    oldQuality
      .schedulesToReview
      .length
  ) {
    warnings.push(
      `Período anterior: ${oldQuality.schedulesToReview.length} registro(s) tienen un horario que requiere revisión.`
    );
  }

  if (
    newQuality
      .schedulesToReview
      .length
  ) {
    warnings.push(
      `Período actual: ${newQuality.schedulesToReview.length} registro(s) tienen un horario que requiere revisión.`
    );
  }


  /* -------------------------------------------------------
     ERRORES ORTOGRÁFICOS DE FRECUENCIA CORREGIDOS
     ------------------------------------------------------- */

  const frequencyCorrectionCount =
    oldQuality
      .frequencyCorrections
      .length +
    newQuality
      .frequencyCorrections
      .length;

  if (
    frequencyCorrectionCount >
    0
  ) {
    warnings.push(
      `Se normalizaron ${frequencyCorrectionCount} registro(s) con variantes o errores de escritura en la frecuencia.`
    );
  }


  /* -------------------------------------------------------
     NOMBRES VACÍOS
     ------------------------------------------------------- */

  if (
    oldQuality
      .missingNames.length
  ) {
    warnings.push(
      `Período anterior: ${oldQuality.missingNames.length} registro(s) sin nombre utilizable.`
    );
  }

  if (
    newQuality
      .missingNames.length
  ) {
    warnings.push(
      `Período actual: ${newQuality.missingNames.length} registro(s) sin nombre utilizable.`
    );
  }


  /* -------------------------------------------------------
     BLOQUEO ESTRICTO
     ------------------------------------------------------- */

  if (
    strict &&
    criticalErrors.length
  ) {
    throw new Error(
      [
        "El análisis fue detenido por problemas críticos de calidad de datos.",

        ...criticalErrors,
      ].join(" ")
    );
  }


  /* =======================================================
     3. DEDUPLICAR
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
     4. MAPAS DE IDENTIDAD
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
     5. NIVEL TERMINAL DEL PERÍODO ANTERIOR
     ======================================================= */

  const terminalPrevious =
    oldUnique.filter(
      (student) =>
        isTerminalLevelStudent(
          student,
          graduationRules
        )
    );


  /* =======================================================
     6. GRADUANDOS

     REGLA:

     Adultos L20 anterior
     +
     NO aparece en período nuevo
     ======================================================= */

  const graduates =
    terminalPrevious.filter(
      (student) =>
        !newIds.has(
          student.idNorm
        )
    );


  /* =======================================================
     7. NIVEL TERMINAL QUE REAPARECE

     NO es graduando.

     Tampoco debe mezclarse automáticamente con
     reinscritos regulares.
     ======================================================= */

  const terminalReappeared =
    terminalPrevious.filter(
      (student) =>
        newIds.has(
          student.idNorm
        )
    );

  if (
    terminalReappeared.length
  ) {
    warnings.push(
      `${terminalReappeared.length} estudiante(s) de Adultos L20 del período anterior aparecen nuevamente en el período nuevo. No fueron contados como graduandos y requieren revisión académica.`
    );
  }


  /* =======================================================
     8. ESTUDIANTES QUE DEBÍAN CONTINUAR

     Esta es la base correcta para:

     - reinscripción
     - pérdida

     Ya NO usamos "elegibles" como término de gestión.
     ======================================================= */

  const shouldContinue =
    oldUnique.filter(
      (student) =>
        !isTerminalLevelStudent(
          student,
          graduationRules
        )
    );


  /* =======================================================
     9. REINSCRITOS
     ======================================================= */

  const reenrolledPairs =
    [];

  for (
    const oldStudent
    of shouldContinue
  ) {
    const newStudent =
      newById.get(
        oldStudent.idNorm
      );

    if (
      !newStudent
    ) {
      continue;
    }

    reenrolledPairs.push({
      idNorm:
        oldStudent.idNorm,

      oldS:
        oldStudent,

      newS:
        newStudent,
    });
  }

  const reenrolledPrevious =
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
     10. PÉRDIDAS
     ======================================================= */

  const lost =
    shouldContinue.filter(
      (student) =>
        !newIds.has(
          student.idNorm
        )
    );


  /* =======================================================
     11. L01 VS REGULARES EN EL PERÍODO ANTERIOR

     Esta segmentación sirve para estudiar la fuga.
     ======================================================= */

  const previousLevel1 =
    shouldContinue.filter(
      (student) =>
        student.levelNorm ===
        "L01"
    );

  const previousRegular =
    shouldContinue.filter(
      (student) =>
        getLevelNumber(
          student
        ) >= 2
    );

  const level1Lost =
    lost.filter(
      (student) =>
        student.levelNorm ===
        "L01"
    );

  const regularLost =
    lost.filter(
      (student) =>
        getLevelNumber(
          student
        ) >= 2
    );


  /* =======================================================
     12. ESTUDIANTES NO PRESENTES EN EL PERÍODO ANTERIOR
     ======================================================= */

  const notPresentPrevious =
    newUnique.filter(
      (student) =>
        !oldIds.has(
          student.idNorm
        )
    );


  /* =======================================================
     13. INGRESOS NIVEL 01

     DEFINICIÓN DEL USUARIO:

     Nuevo ingreso = nivel 01.

     Por eso contamos TODOS los L01 de la lista nueva.
     ======================================================= */

  const currentLevel1 =
    newUnique.filter(
      (student) =>
        student.levelNorm ===
        "L01"
    );


  /*
    Se conserva adicionalmente esta lista para auditoría:

    L01 actual que además no estaba en el período anterior.
  */

  const currentLevel1NotPresentPrevious =
    currentLevel1.filter(
      (student) =>
        !oldIds.has(
          student.idNorm
        )
    );


  /* =======================================================
     14. ESTUDIANTES NO PRESENTES EN PERÍODO ANTERIOR L02+

     Este es el nombre correcto.

     NO se denomina automáticamente "nivelación".
     ======================================================= */

  const notPresentPreviousLevel2Plus =
    notPresentPrevious.filter(
      (student) =>
        getLevelNumber(
          student
        ) >= 2
    );


  /* =======================================================
     15. CAMBIOS DE FRECUENCIA
     ======================================================= */

  const frequencyResult =
    detectFrequencyChangesDetailed(
      reenrolledPairs
    );

  const frequencyChanges =
    frequencyResult.changes;

  const unresolvedFrequencyPairs =
    frequencyResult.unresolvedPairs;

  if (
    unresolvedFrequencyPairs.length
  ) {
    warnings.push(
      `${unresolvedFrequencyPairs.length} comparación(es) de frecuencia no pudieron evaluarse porque una de las frecuencias no fue reconocida.`
    );
  }


  /* =======================================================
     16. TRANSICIONES DE CATEGORÍA
     ======================================================= */

  const categoryTransitions =
    detectCategoryTransitions(
      reenrolledPairs
    );

  if (
    categoryTransitions
      .otherTransitions
      .length
  ) {
    warnings.push(
      `${categoryTransitions.otherTransitions.length} cambio(s) de categoría no estándar fueron detectados y requieren revisión.`
    );
  }

  const categoryTransitionsAvailable =
    reenrolledPairs.some(
      (pair) =>
        pair.oldS.category ===
          "Niños" ||
        pair.oldS.category ===
          "Jóvenes"
    );


  /* =======================================================
     17. TASAS
     ======================================================= */

  const retentionRate =
    safePercentage(
      reenrolledPairs.length,
      shouldContinue.length
    );

  const attritionRate =
    safePercentage(
      lost.length,
      shouldContinue.length
    );

  const level1AttritionRate =
    safePercentage(
      level1Lost.length,
      previousLevel1.length
    );

  const regularAttritionRate =
    safePercentage(
      regularLost.length,
      previousRegular.length
    );


  /* =======================================================
     18. DENSIDAD
     ======================================================= */

  const density =
    calculateAverageDensity(
      newUnique
    );


  /* =======================================================
     19. DESERCIÓN POR NIVEL
     ======================================================= */

  const dropoutByLevel =
    calculateDropoutByLevel(
      lost
    );


  /* =======================================================
     20. DESERCIÓN POR HORARIO
     ======================================================= */

  const dropoutBySchedule =
    calculateScheduleAttrition(
      shouldContinue,

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
     21. DESERCIÓN POR FRECUENCIA
     ======================================================= */

  const dropoutByFrequency =
    calculateFrequencyAttrition(
      shouldContinue,

      lost
    );


  /* =======================================================
     22. CONCILIACIONES
     ======================================================= */

  /*
    TOTAL ANTERIOR

    =
    estudiantes que debían continuar
    +
    estudiantes que estaban en nivel terminal
  */

  const reconciliationPrevious =
    oldUnique.length ===
    shouldContinue.length +
      terminalPrevious.length;


  /*
    NIVEL TERMINAL

    =
    graduandos reales
    +
    L20 que reaparecieron
  */

  const reconciliationTerminal =
    terminalPrevious.length ===
    graduates.length +
      terminalReappeared.length;


  /*
    DEBÍAN CONTINUAR

    =
    reinscritos
    +
    pérdidas
  */

  const reconciliationContinuity =
    shouldContinue.length ===
    reenrolledPairs.length +
      lost.length;


  /*
    PERÍODO ACTUAL

    =
    reinscritos normales
    +
    estudiantes no presentes anteriormente
    +
    L20 anterior que reaparecieron
  */

  const reconciliationCurrent =
    newUnique.length ===
    reenrolledCurrent.length +
      notPresentPrevious.length +
      terminalReappeared.length;


  const reconciliationOk =
    reconciliationPrevious &&
    reconciliationTerminal &&
    reconciliationContinuity &&
    reconciliationCurrent;


  if (
    strict &&
    !reconciliationOk
  ) {
    throw new Error(
      [
        "La conciliación interna de continuidad no cerró correctamente.",

        `Anterior=${oldUnique.length}.`,

        `Debían continuar=${shouldContinue.length}.`,

        `Nivel terminal anterior=${terminalPrevious.length}.`,

        `Graduandos=${graduates.length}.`,

        `L20 que reaparecen=${terminalReappeared.length}.`,

        `Reinscritos=${reenrolledPairs.length}.`,

        `Pérdidas=${lost.length}.`,

        `Actual=${newUnique.length}.`,

        `No presentes anteriormente=${notPresentPrevious.length}.`,
      ].join(" ")
    );
  }


  /* =======================================================
     23. RESULTADO
     ======================================================= */

  return {
    rulesVersion:
      CONTINUIDAD_RULES_VERSION,


    /* -----------------------------------------------------
       DATOS BASE
       ----------------------------------------------------- */

    oldStudents:
      oldUnique,

    newStudents:
      newUnique,

    oldById,

    newById,


    /* -----------------------------------------------------
       TOTALES
       ----------------------------------------------------- */

    totals: {
      previous:
        oldUnique.length,

      current:
        newUnique.length,

      /*
        Nueva terminología.
      */

      shouldContinue:
        shouldContinue.length,

      reenrolled:
        reenrolledPairs.length,

      lost:
        lost.length,

      terminalPrevious:
        terminalPrevious.length,

      graduates:
        graduates.length,

      terminalReappeared:
        terminalReappeared.length,

      notPresentPrevious:
        notPresentPrevious.length,

      currentLevel1:
        currentLevel1.length,

      currentLevel1NotPresentPrevious:
        currentLevel1NotPresentPrevious.length,

      notPresentPreviousLevel2Plus:
        notPresentPreviousLevel2Plus.length,

      frequencyChanges:
        frequencyChanges.length,

      categoryTransitions:
        categoryTransitions.total,

      /*
        =====================================================
        ALIASES TEMPORALES

        Se mantienen hasta que reemplacemos App.jsx y los
        tests en los siguientes pasos.

        No son la terminología final del dashboard.
        =====================================================
      */

      eligible:
        shouldContinue.length,

      externalEntrants:
        notPresentPrevious.length,

      newLevel1:
        currentLevel1.length,

      externalLevel2Plus:
        notPresentPreviousLevel2Plus.length,

      graduatesPresentAgain:
        terminalReappeared.length,
    },


    /* -----------------------------------------------------
       TASAS
       ----------------------------------------------------- */

    rates: {
      retention:
        retentionRate,

      attrition:
        attritionRate,

      level1Attrition:
        level1AttritionRate,

      regularAttrition:
        regularAttritionRate,

      /*
        Compatibilidad temporal.
      */

      newStudentAttrition:
        level1AttritionRate,
    },


    /* -----------------------------------------------------
       SEGMENTACIÓN DE FUGA
       ----------------------------------------------------- */

    segmentation: {
      level1: {
        previous:
          previousLevel1.length,

        lost:
          level1Lost.length,

        retained:
          Math.max(
            previousLevel1.length -
            level1Lost.length,
            0
          ),

        attritionRate:
          level1AttritionRate,
      },

      regularStudents: {
        previous:
          previousRegular.length,

        lost:
          regularLost.length,

        retained:
          Math.max(
            previousRegular.length -
            regularLost.length,
            0
          ),

        attritionRate:
          regularAttritionRate,

        /*
          Alias temporal.
        */

        eligible:
          previousRegular.length,
      },

      /*
        Compatibilidad con App.jsx anterior.
      */

      newStudents: {
        previous:
          previousLevel1.length,

        eligible:
          previousLevel1.length,

        lost:
          level1Lost.length,

        retained:
          Math.max(
            previousLevel1.length -
            level1Lost.length,
            0
          ),

        attritionRate:
          level1AttritionRate,
      },
    },


    /* -----------------------------------------------------
       LISTAS
       ----------------------------------------------------- */

    lists: {
      /*
        Graduación
      */

      terminalPrevious,

      graduates,

      terminalReappeared,

      /*
        Continuidad
      */

      shouldContinue,

      reenrolledPrevious,

      reenrolledCurrent,

      reenrolledPairs,

      lost,

      /*
        Fuga L01 vs regulares
      */

      previousLevel1,

      level1Lost,

      previousRegular,

      regularLost,

      /*
        Movimientos del período nuevo
      */

      notPresentPrevious,

      currentLevel1,

      currentLevel1NotPresentPrevious,

      notPresentPreviousLevel2Plus,

      /*
        Frecuencia
      */

      frequencyChanges,

      unresolvedFrequencyPairs,

      /*
        Categorías
      */

      ninosJovenes:
        categoryTransitions
          .ninosJovenes,

      ninosAdultos:
        categoryTransitions
          .ninosAdultos,

      jovenesAdultos:
        categoryTransitions
          .jovenesAdultos,

      otherCategoryTransitions:
        categoryTransitions
          .otherTransitions,

      allCategoryTransitions:
        categoryTransitions
          .all,

      /*
        =====================================================
        ALIASES TEMPORALES
        =====================================================
      */

      eligible:
        shouldContinue,

      externalEntrants:
        notPresentPrevious,

      newLevel1:
        currentLevel1,

      externalLevel2Plus:
        notPresentPreviousLevel2Plus,

      graduatesPresentAgain:
        terminalReappeared,

      newLost:
        level1Lost,
    },


    /* -----------------------------------------------------
       ANALÍTICA
       ----------------------------------------------------- */

    analytics: {
      dropoutByLevel,

      dropoutBySchedule,

      dropoutByFrequency,

      topScheduleByVolume,

      topScheduleByRate,

      density,

      categoryTransitionsAvailable,

      categoryTransitionsTotal:
        categoryTransitions.total,

      categoryTransitions: {
        ninosJovenes:
          categoryTransitions
            .ninosJovenes
            .length,

        ninosAdultos:
          categoryTransitions
            .ninosAdultos
            .length,

        jovenesAdultos:
          categoryTransitions
            .jovenesAdultos
            .length,

        other:
          categoryTransitions
            .otherTransitions
            .length,
      },
    },


    /* -----------------------------------------------------
       CALIDAD DE DATOS
       ----------------------------------------------------- */

    quality: {
      previous:
        oldQuality,

      current:
        newQuality,

      criticalErrors,

      warnings,

      frequencyCorrections:
        frequencyCorrectionCount,

      unresolvedFrequencyComparisons:
        unresolvedFrequencyPairs.length,

      terminalReappeared:
        terminalReappeared.length,

      reconciliation: {
        previous:
          reconciliationPrevious,

        terminal:
          reconciliationTerminal,

        continuity:
          reconciliationContinuity,

        current:
          reconciliationCurrent,

        /*
          Alias temporal para tests anteriores.
        */

        eligible:
          reconciliationContinuity,

        ok:
          reconciliationOk,
      },
    },
  };
}


/* =========================================================
   VALIDACIÓN DE MÉTRICAS ESPERADAS
   ========================================================= */

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

    shouldContinue:
      analysis.totals
        ?.shouldContinue,

    reenrolled:
      analysis.totals
        ?.reenrolled,

    lost:
      analysis.totals
        ?.lost,

    terminalPrevious:
      analysis.totals
        ?.terminalPrevious,

    graduates:
      analysis.totals
        ?.graduates,

    terminalReappeared:
      analysis.totals
        ?.terminalReappeared,

    notPresentPrevious:
      analysis.totals
        ?.notPresentPrevious,

    currentLevel1:
      analysis.totals
        ?.currentLevel1,

    currentLevel1NotPresentPrevious:
      analysis.totals
        ?.currentLevel1NotPresentPrevious,

    notPresentPreviousLevel2Plus:
      analysis.totals
        ?.notPresentPreviousLevel2Plus,

    frequencyChanges:
      analysis.totals
        ?.frequencyChanges,

    categoryTransitions:
      analysis.totals
        ?.categoryTransitions,

    retention:
      analysis.rates
        ?.retention,

    attrition:
      analysis.rates
        ?.attrition,

    level1Previous:
      analysis.segmentation
        ?.level1
        ?.previous,

    level1Lost:
      analysis.segmentation
        ?.level1
        ?.lost,

    level1Attrition:
      analysis.segmentation
        ?.level1
        ?.attritionRate,

    regularPrevious:
      analysis.segmentation
        ?.regularStudents
        ?.previous,

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

    sections:
      analysis.analytics
        ?.density
        ?.sections,

    /*
      =====================================================
      ALIASES PARA TESTS ANTERIORES
      =====================================================
    */

    eligible:
      analysis.totals
        ?.shouldContinue,

    newLevel1:
      analysis.totals
        ?.currentLevel1,

    externalLevel2Plus:
      analysis.totals
        ?.notPresentPreviousLevel2Plus,

    newEligible:
      analysis.segmentation
        ?.level1
        ?.previous,

    newLost:
      analysis.segmentation
        ?.level1
        ?.lost,

    newAttrition:
      analysis.segmentation
        ?.level1
        ?.attritionRate,

    regularEligible:
      analysis.segmentation
        ?.regularStudents
        ?.previous,
  };

  const mismatches =
    [];

  for (
    const [
      key,
      expectedValue,
    ]
    of Object.entries(
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
   ASSERT
   ========================================================= */

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
