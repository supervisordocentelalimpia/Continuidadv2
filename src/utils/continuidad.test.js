// src/utils/continuidad.test.js

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  analyzeContinuity,
  assertExpectedMetrics,
  isGraduated,
  normalizeFrequencyFamily,
  normalizeLevel,
  normalizeStudentId,
} from "./continuidad";

/* =========================================================
   HELPERS
   ========================================================= */

const createStudent = ({
  id,
  name,
  level,
  category = "Adultos",
  frequency = "INTENSIVO A",
  frequencyBase = "INTENSIVO",
  schedule = "1:00 PM - 2:30 PM",
  courseId = "1",
}) => {
  return {
    id,
    idOriginal: id,
    idNorm:
      normalizeStudentId(id),

    name,

    category,

    level,
    levelNorm:
      normalizeLevel(level),

    frequencyNorm:
      frequency,

    frequencyBase,

    scheduleBlock:
      schedule,

    courseId,

    email:
      `${normalizeStudentId(
        id
      ).toLowerCase()}@example.com`,

    phone:
      "04141234567",
  };
};

/* =========================================================
   DATASET DE CONTROL JULIO → AGOSTO
   =========================================================

   Valores que queremos proteger:

   JULIO
   ----------------------------------------
   Total                       306
   Graduandos                   12
   Elegibles                   294

   REINSCRIPCIÓN
   ----------------------------------------
   Reinscritos                 274
   Fugas                        20

   L01
   ----------------------------------------
   Elegibles                    28
   Fugas                         4

   REGULARES
   ----------------------------------------
   Elegibles                   266
   Fugas                        16

   AGOSTO
   ----------------------------------------
   Total                       357

   Ingresos L01                 30
   Ingresos L02+                53

   Densidad esperada           12.3

   ========================================================= */

const buildGoldenDataset = () => {
  const oldStudents = [];
  const newStudents = [];

  /* =======================================================
     1. GRADUANDOS JULIO

     12 adultos en L20.

     No deben formar parte de la base elegible.
     ======================================================= */

  for (
    let index = 1;
    index <= 12;
    index++
  ) {
    oldStudents.push(
      createStudent({
        id: `G${String(
          index
        ).padStart(6, "0")}`,

        name:
          `GRADUANDO ${index}`,

        level: "L20",

        frequency:
          "INTENSIVO A",

        frequencyBase:
          "INTENSIVO",

        schedule:
          "1:00 PM - 2:30 PM",

        courseId:
          String(
            ((index - 1) %
              29) +
              1
          ),
      })
    );
  }

  /* =======================================================
     2. L01 DE JULIO

     28 elegibles.

     - 4 fugas
     - 24 continúan en agosto
     ======================================================= */

  for (
    let index = 1;
    index <= 28;
    index++
  ) {
    const id =
      `N${String(
        index
      ).padStart(6, "0")}`;

    oldStudents.push(
      createStudent({
        id,

        name:
          `NUEVO JULIO ${index}`,

        level: "L01",

        frequency:
          "INTENSIVO A",

        frequencyBase:
          "INTENSIVO",

        schedule:
          index <= 4
            ? "1:00 PM - 2:30 PM"
            : "8:30 AM - 10:00 AM",

        courseId:
          String(
            ((index - 1) %
              29) +
              1
          ),
      })
    );

    /*
      Los primeros 4 NO aparecen en agosto.

      Por tanto:
      4 fugas L01.
    */

    if (index > 4) {
      newStudents.push(
        createStudent({
          id,

          name:
            `NUEVO JULIO ${index}`,

          /*
            Para el análisis de continuidad
            solamente importa que el ID exista
            nuevamente.

            Simulamos progresión a L02.
          */
          level: "L02",

          frequency:
            "INTENSIVO B",

          frequencyBase:
            "INTENSIVO",

          schedule:
            "8:30 AM - 10:00 AM",

          courseId:
            String(
              ((newStudents.length) %
                29) +
                1
            ),
        })
      );
    }
  }

  /* =======================================================
     3. REGULARES DE JULIO

     266 elegibles.

     - 16 fugas
     - 250 continúan
     ======================================================= */

  for (
    let index = 1;
    index <= 266;
    index++
  ) {
    const id =
      `R${String(
        index
      ).padStart(6, "0")}`;

    /*
      Distribución entre L02 y L19.

      Ninguno es L20.
    */

    const oldLevel =
      2 +
      ((index - 1) % 18);

    oldStudents.push(
      createStudent({
        id,

        name:
          `REGULAR JULIO ${index}`,

        level:
          `L${String(
            oldLevel
          ).padStart(
            2,
            "0"
          )}`,

        frequency:
          "INTENSIVO A",

        frequencyBase:
          "INTENSIVO",

        /*
          Concentramos las 16 fugas
          en algunos horarios para tener
          datos reales para los gráficos.
        */

        schedule:
          index <= 8
            ? "1:00 PM - 2:30 PM"
            : index <= 16
              ? "6:15 PM - 7:45 PM"
              : "10:30 AM - 12:00 PM",

        courseId:
          String(
            ((index - 1) %
              29) +
              1
          ),
      })
    );

    /*
      Los primeros 16 regulares
      desaparecen en agosto.
    */

    if (index > 16) {
      const nextLevel =
        Math.min(
          oldLevel + 1,
          20
        );

      newStudents.push(
        createStudent({
          id,

          name:
            `REGULAR JULIO ${index}`,

          level:
            `L${String(
              nextLevel
            ).padStart(
              2,
              "0"
            )}`,

          /*
            Cambiar de Intensivo A
            a Intensivo B NO debe contar
            como cambio de frecuencia.
          */

          frequency:
            "INTENSIVO B",

          frequencyBase:
            "INTENSIVO",

          schedule:
            "10:30 AM - 12:00 PM",

          courseId:
            String(
              ((newStudents.length) %
                29) +
                1
            ),
        })
      );
    }
  }

  /* =======================================================
     4. NUEVOS INGRESOS L01 DE AGOSTO

     30 estudiantes.
     ======================================================= */

  for (
    let index = 1;
    index <= 30;
    index++
  ) {
    newStudents.push(
      createStudent({
        id:
          `X${String(
            index
          ).padStart(6, "0")}`,

        name:
          `INGRESO L01 AGOSTO ${index}`,

        level:
          "L01",

        frequency:
          "INTENSIVO B",

        frequencyBase:
          "INTENSIVO",

        schedule:
          "4:30 PM - 6:00 PM",

        courseId:
          String(
            ((newStudents.length) %
              29) +
              1
          ),
      })
    );
  }

  /* =======================================================
     5. INGRESOS L02+ DE AGOSTO

     53 estudiantes.

     No se llaman automáticamente "nivelación";
     simplemente no existían en julio y aparecen
     en agosto en L02 o superior.
     ======================================================= */

  for (
    let index = 1;
    index <= 53;
    index++
  ) {
    const level =
      2 +
      ((index - 1) % 18);

    newStudents.push(
      createStudent({
        id:
          `Y${String(
            index
          ).padStart(6, "0")}`,

        name:
          `INGRESO L02+ AGOSTO ${index}`,

        level:
          `L${String(
            level
          ).padStart(
            2,
            "0"
          )}`,

        frequency:
          "INTENSIVO B",

        frequencyBase:
          "INTENSIVO",

        schedule:
          "4:30 PM - 6:00 PM",

        /*
          Exactamente 29 courseId
          diferentes en agosto.

          357 / 29 = 12.31
          -> 12.3 alumnos/sección.
        */

        courseId:
          String(
            ((newStudents.length) %
              29) +
              1
          ),
      })
    );
  }

  return {
    oldStudents,
    newStudents,
  };
};

/* =========================================================
   PRUEBAS DE IDENTIFICACIÓN
   ========================================================= */

describe(
  "Normalización de identificaciones",
  () => {
    it(
      "conserva una cédula con dígito adicional después de guion",
      () => {
        expect(
          normalizeStudentId(
            "17738636-1"
          )
        ).toBe(
          "177386361"
        );
      }
    );

    it(
      "normaliza puntos y guiones de forma consistente",
      () => {
        expect(
          normalizeStudentId(
            "17.738.636-1"
          )
        ).toBe(
          "177386361"
        );

        expect(
          normalizeStudentId(
            "17738636-1"
          )
        ).toBe(
          "177386361"
        );
      }
    );

    it(
      "elimina prefijo venezolano V",
      () => {
        expect(
          normalizeStudentId(
            "V-12345678"
          )
        ).toBe(
          "12345678"
        );
      }
    );

    it(
      "elimina prefijo venezolano E",
      () => {
        expect(
          normalizeStudentId(
            "E-12345678"
          )
        ).toBe(
          "12345678"
        );
      }
    );

    it(
      "mantiene letras de identificaciones alfanuméricas",
      () => {
        expect(
          normalizeStudentId(
            "ABC-123456"
          )
        ).toBe(
          "ABC123456"
        );
      }
    );
  }
);

/* =========================================================
   PRUEBAS DE NIVEL
   ========================================================= */

describe(
  "Normalización de niveles",
  () => {
    it(
      "normaliza nivel 1 como L01",
      () => {
        expect(
          normalizeLevel(
            "NIVEL 1"
          )
        ).toBe(
          "L01"
        );
      }
    );

    it(
      "normaliza LEVEL 20 como L20",
      () => {
        expect(
          normalizeLevel(
            "LEVEL 20"
          )
        ).toBe(
          "L20"
        );
      }
    );
  }
);

/* =========================================================
   REGLA DE GRADUACIÓN
   ========================================================= */

describe(
  "Regla de graduación",
  () => {
    it(
      "Adultos L20 es graduando",
      () => {
        const student =
          createStudent({
            id:
              "10000001",

            name:
              "ALUMNO L20",

            level:
              "L20",

            category:
              "Adultos",
          });

        expect(
          isGraduated(
            student
          )
        ).toBe(true);
      }
    );

    it(
      "Adultos L19 NO es graduando",
      () => {
        const student =
          createStudent({
            id:
              "10000002",

            name:
              "ALUMNO L19",

            level:
              "L19",

            category:
              "Adultos",
          });

        expect(
          isGraduated(
            student
          )
        ).toBe(false);
      }
    );

    it(
      "no inventa una regla terminal para Niños",
      () => {
        const student =
          createStudent({
            id:
              "10000003",

            name:
              "ALUMNO NIÑOS",

            level:
              "L18",

            category:
              "Niños",
          });

        expect(
          isGraduated(
            student
          )
        ).toBe(false);
      }
    );

    it(
      "no inventa una regla terminal para Jóvenes",
      () => {
        const student =
          createStudent({
            id:
              "10000004",

            name:
              "ALUMNO JÓVENES",

            level:
              "L18",

            category:
              "Jóvenes",
          });

        expect(
          isGraduated(
            student
          )
        ).toBe(false);
      }
    );
  }
);

/* =========================================================
   FRECUENCIAS
   ========================================================= */

describe(
  "Familias de frecuencia",
  () => {
    it(
      "Intensivo A pertenece a INTENSIVO",
      () => {
        expect(
          normalizeFrequencyFamily(
            "INTENSIVO A"
          )
        ).toBe(
          "INTENSIVO"
        );
      }
    );

    it(
      "Intensivo B pertenece a INTENSIVO",
      () => {
        expect(
          normalizeFrequencyFamily(
            "INTENSIVO B"
          )
        ).toBe(
          "INTENSIVO"
        );
      }
    );

    it(
      "pasar de Intensivo A a Intensivo B no constituye un cambio real de frecuencia",
      () => {
        const oldStudent =
          createStudent({
            id:
              "20000001",

            name:
              "ALUMNO INTENSIVO",

            level:
              "L05",

            frequency:
              "INTENSIVO A",

            frequencyBase:
              "INTENSIVO",
          });

        const newStudent =
          createStudent({
            id:
              "20000001",

            name:
              "ALUMNO INTENSIVO",

            level:
              "L06",

            frequency:
              "INTENSIVO B",

            frequencyBase:
              "INTENSIVO",
          });

        const analysis =
          analyzeContinuity({
            oldStudents: [
              oldStudent,
            ],

            newStudents: [
              newStudent,
            ],

            strict: true,
          });

        expect(
          analysis.totals
            .frequencyChanges
        ).toBe(0);
      }
    );
  }
);

/* =========================================================
   GOLDEN DATASET
   ========================================================= */

describe(
  "Dataset de control Julio → Agosto",
  () => {
    const {
      oldStudents,
      newStudents,
    } =
      buildGoldenDataset();

    const analysis =
      analyzeContinuity({
        oldStudents,
        newStudents,
        strict: true,
      });

    it(
      "Julio contiene exactamente 306 estudiantes",
      () => {
        expect(
          analysis.totals
            .previous
        ).toBe(306);
      }
    );

    it(
      "Agosto contiene exactamente 357 estudiantes",
      () => {
        expect(
          analysis.totals
            .current
        ).toBe(357);
      }
    );

    it(
      "identifica exactamente 12 graduandos",
      () => {
        expect(
          analysis.totals
            .graduates
        ).toBe(12);
      }
    );

    it(
      "la base elegible es exactamente 294",
      () => {
        expect(
          analysis.totals
            .eligible
        ).toBe(294);
      }
    );

    it(
      "identifica exactamente 274 reinscritos",
      () => {
        expect(
          analysis.totals
            .reenrolled
        ).toBe(274);
      }
    );

    it(
      "identifica exactamente 20 fugas",
      () => {
        expect(
          analysis.totals
            .lost
        ).toBe(20);
      }
    );

    it(
      "la retención es 93.2%",
      () => {
        expect(
          analysis.rates
            .retention
        ).toBe(93.2);
      }
    );

    it(
      "la pérdida es 6.8%",
      () => {
        expect(
          analysis.rates
            .attrition
        ).toBe(6.8);
      }
    );

    it(
      "la base L01 elegible es 28",
      () => {
        expect(
          analysis
            .segmentation
            .newStudents
            .eligible
        ).toBe(28);
      }
    );

    it(
      "la fuga L01 es exactamente 4",
      () => {
        expect(
          analysis
            .segmentation
            .newStudents
            .lost
        ).toBe(4);
      }
    );

    it(
      "la tasa de fuga L01 es 14.3%",
      () => {
        expect(
          analysis
            .segmentation
            .newStudents
            .attritionRate
        ).toBe(14.3);
      }
    );

    it(
      "la base regular elegible es 266",
      () => {
        expect(
          analysis
            .segmentation
            .regularStudents
            .eligible
        ).toBe(266);
      }
    );

    it(
      "la fuga regular es exactamente 16",
      () => {
        expect(
          analysis
            .segmentation
            .regularStudents
            .lost
        ).toBe(16);
      }
    );

    it(
      "la tasa de fuga regular es 6.0%",
      () => {
        expect(
          analysis
            .segmentation
            .regularStudents
            .attritionRate
        ).toBe(6);
      }
    );

    it(
      "Agosto contiene exactamente 30 ingresos L01",
      () => {
        expect(
          analysis.totals
            .newLevel1
        ).toBe(30);
      }
    );

    it(
      "Agosto contiene exactamente 53 ingresos L02+",
      () => {
        expect(
          analysis.totals
            .externalLevel2Plus
        ).toBe(53);
      }
    );

    it(
      "los ingresos externos suman exactamente 83",
      () => {
        expect(
          analysis.totals
            .externalEntrants
        ).toBe(83);
      }
    );

    it(
      "no interpreta Intensivo A → Intensivo B como cambio de frecuencia",
      () => {
        expect(
          analysis.totals
            .frequencyChanges
        ).toBe(0);
      }
    );

    it(
      "la densidad promedio es 12.3 alumnos por sección",
      () => {
        expect(
          analysis.analytics
            .density.average
        ).toBe(12.3);

        expect(
          analysis.analytics
            .density.sections
        ).toBe(29);
      }
    );

    it(
      "la conciliación del período anterior cierra",
      () => {
        expect(
          analysis.quality
            .reconciliation
            .previous
        ).toBe(true);
      }
    );

    it(
      "la conciliación de elegibles cierra",
      () => {
        expect(
          analysis.quality
            .reconciliation
            .eligible
        ).toBe(true);
      }
    );

    it(
      "la conciliación del período actual cierra",
      () => {
        expect(
          analysis.quality
            .reconciliation
            .current
        ).toBe(true);
      }
    );

    it(
      "la conciliación global es correcta",
      () => {
        expect(
          analysis.quality
            .reconciliation
            .ok
        ).toBe(true);
      }
    );

    it(
      "todos los KPIs de control coinciden simultáneamente",
      () => {
        expect(() =>
          assertExpectedMetrics(
            analysis,
            {
              previous: 306,
              current: 357,

              graduates: 12,
              eligible: 294,

              reenrolled: 274,
              lost: 20,

              retention: 93.2,
              attrition: 6.8,

              newEligible: 28,
              newLost: 4,
              newAttrition: 14.3,

              regularEligible: 266,
              regularLost: 16,
              regularAttrition: 6,

              newLevel1: 30,
              externalLevel2Plus: 53,

              averageDensity: 12.3,
            }
          )
        ).not.toThrow();
      }
    );
  }
);

/* =========================================================
   PRUEBA NEGATIVA DEL SISTEMA DE PROTECCIÓN
   ========================================================= */

describe(
  "Protección contra regresiones",
  () => {
    it(
      "falla deliberadamente cuando un KPI esperado no coincide",
      () => {
        const {
          oldStudents,
          newStudents,
        } =
          buildGoldenDataset();

        const analysis =
          analyzeContinuity({
            oldStudents,
            newStudents,
            strict: true,
          });

        expect(() =>
          assertExpectedMetrics(
            analysis,
            {
              lost: 999,
            }
          )
        ).toThrow(
          /Validación de indicadores fallida/
        );
      }
    );
  }
);
