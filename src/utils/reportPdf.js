import {
  LOGO_LA_LIMPIA_DATA_URL,
  PATTERN_BLUE_DATA_URL,
  PATTERN_PASTEL_DATA_URL,
} from "./reportAssets.js";

import {
  REPORT_CATEGORY_COLORS,
} from "./reportData.js";

const BLUE = "#09458A";
const BLUE2 = "#155EA8";
const PASTEL = "#FCF8F5";
const PASTEL_DARK = "#F4EFEB";
const RED = "#E61C29";
const RED_DARK = "#B41620";
const INK = "#17324D";
const MUTED = "#64748B";

const FREQUENCY_ACCENTS = {
  "MARTES Y JUEVES": "#7C3AED",
  "MIERCOLES Y VIERNES": "#F59E0B",
  LUNES: "#16A34A",
  SABATINO: "#2563EB",
  INTENSIVO: "#8B5CF6",
  "SEMI INTENSIVO": "#0891B2",
};

const asText = (value) => String(value ?? "");

const studentRows = (students = [], extra = null) =>
  students.map((student) => [
    asText(student?.name || "N/A"),
    asText(student?.id || student?.idOriginal || "N/A"),
    asText(student?.category || "N/A"),
    asText(student?.levelNorm || student?.level || "N/A"),
    asText(student?.scheduleBlock || student?.schedule || "N/A"),
    ...(extra ? extra(student) : []),
  ]);

const sectionTitle = (text) => ({
  text,
  fontSize: 16,
  bold: true,
  color: BLUE,
  margin: [0, 8, 0, 8],
});

const smallTable = (headers, rows, widths = undefined) => ({
  table: {
    headerRows: 1,
    widths: widths || headers.map(() => "*"),
    body: [
      headers.map((header) => ({ text: header, bold: true, color: INK, fillColor: "#E9EFF6", fontSize: 7 })),
      ...(rows.length ? rows.map((row) => row.map((cell) => ({ text: asText(cell), fontSize: 6.5, color: INK }))) : [[{ text: "Sin casos", colSpan: headers.length, alignment: "center", color: MUTED, fontSize: 8 }, ...Array(headers.length - 1).fill({})]]),
    ],
  },
  layout: {
    hLineColor: () => "#D9E2EC",
    vLineColor: () => "#E5ECF2",
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 3,
    paddingBottom: () => 3,
  },
  margin: [0, 0, 0, 10],
});

const kpi = (label, value, detail, color = BLUE) => ({
  stack: [
    { text: label.toUpperCase(), fontSize: 7, bold: true, color: MUTED, characterSpacing: 0.5 },
    { text: asText(value), fontSize: 24, bold: true, color, margin: [0, 3, 0, 2] },
    { text: detail, fontSize: 7.5, color: MUTED, lineHeight: 1.2 },
  ],
  margin: [8, 8, 8, 8],
});

const buildStaticChartCanvas = (data = []) => {
  const plotX = 25;
  const plotY = 12;
  const plotW = 470;
  const plotH = 150;
  const gap = 4;
  const barSlot = plotW / Math.max(1, data.length);
  const barW = Math.max(4, barSlot - gap);
  const max = Math.max(1, ...data.map((row) => row.total || 0));
  const canvas = [];

  for (let step = 0; step <= 4; step += 1) {
    const value = Math.round((max / 4) * step);
    const y = plotY + plotH - (value / max) * plotH;
    canvas.push({ type: "line", x1: plotX, y1: y, x2: plotX + plotW, y2: y, lineColor: "#DCE6EF", lineWidth: 0.5 });
  }

  data.forEach((row, index) => {
    const x = plotX + index * barSlot + gap / 2;
    let used = 0;
    ["Adultos", "Niños", "Jóvenes"].forEach((category) => {
      const value = row[category] || 0;
      if (!value) return;
      const h = (value / max) * plotH;
      canvas.push({
        type: "rect",
        x,
        y: plotY + plotH - used - h,
        w: barW,
        h,
        color: REPORT_CATEGORY_COLORS[category],
        lineColor: REPORT_CATEGORY_COLORS[category],
        r: 1,
      });
      used += h;
    });
  });

  return canvas;
};

export function buildFrequencyReportPdfDefinition(report, actionPlans = []) {
  const accent = FREQUENCY_ACCENTS[report.frequency] || BLUE2;
  const currentPeriod = report.metadata?.currentPeriods?.join(" · ") || "Período actual";
  const previousPeriod = report.metadata?.previousPeriods?.join(" · ") || "Período anterior";
  const topSchedule = report.analytics?.topScheduleByVolume || {};
  const sectionRows = report.analytics?.sectionRows || [];
  const relevantPlans = (actionPlans || []).filter((plan) => !plan.frequency || plan.frequency === report.frequency);

  const content = [
    {
      stack: [
        { image: LOGO_LA_LIMPIA_DATA_URL, width: 105, margin: [0, 20, 0, 90] },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 70, h: 5, color: accent, lineColor: accent }], margin: [0, 0, 0, 18] },
        { text: "INTERIM / STATUS", fontSize: 30, bold: true, color: "#FFFFFF" },
        { text: "REPORT", fontSize: 44, bold: true, color: "#FFFFFF", margin: [0, -2, 0, 28] },
        {
          columns: [
            { width: "35%", stack: [{ text: "FRECUENCIA", fontSize: 7, color: "#DDEAF7", characterSpacing: 1.2 }, { text: report.frequency, fontSize: 13, bold: true, color: "#FFFFFF", margin: [0, 5, 0, 0] }] },
            { width: "65%", stack: [{ text: "PERÍODO ACTUAL", fontSize: 7, color: "#DDEAF7", characterSpacing: 1.2 }, { text: currentPeriod, fontSize: 11, bold: true, color: "#FFFFFF", margin: [0, 5, 0, 0] }] },
          ],
          columnGap: 20,
        },
      ],
      pageBreak: "after",
    },

    sectionTitle("RESUMEN GENERAL"),
    {
      text: [
        "Para calcular la continuidad y la deserción estudiantil se compara la matrícula del período anterior con las listas SGA suministradas del período actual. Los estudiantes de ",
        { text: "Level 18 en Niños y Jóvenes", bold: true },
        " y los estudiantes de ",
        { text: "Level 20 en Adultos", bold: true },
        " se clasifican como egresados. Se reportan como graduandos y no se contabilizan como pérdida o deserción.",
      ],
      fontSize: 9,
      lineHeight: 1.35,
      color: INK,
      fillColor: "#FFFFFF",
      margin: [0, 0, 0, 10],
    },
    {
      table: {
        widths: ["*", "*"],
        body: [
          [
            kpi("Continuidad estudiantil", `${report.rates.continuity}%`, `${report.totals.reenrolled} estudiantes continuaron de ${report.totals.regularForContinuity} regulares para este período.`, "#15803D"),
            kpi("Total pérdida", report.totals.lost, `${report.rates.attrition}% de la base regular para continuidad.`, RED_DARK),
          ],
          [
            kpi("Fuga: nuevos vs regulares", `${report.segmentation.level1Lost} / ${report.segmentation.regularLost}`, `Level 01: ${report.rates.newStudentAttrition}% · Regulares: ${report.rates.regularAttrition}%`, "#B45309"),
            kpi("Horario con más fugas", topSchedule.schedule || "N/A", `${topSchedule.lost || 0} fugas en este bloque.`, BLUE),
          ],
          [
            kpi("Alumnos por sección", report.totals.avgDensityRounded, `${report.totals.activeSections} secciones activas.`, "#0369A1"),
            kpi("Graduandos", report.totals.graduates, "Egresados terminales excluidos de la pérdida.", "#4338CA"),
          ],
        ],
      },
      layout: "noBorders",
    },
    { text: `Fuente operativa: listas SGA suministradas · Comparación: ${previousPeriod} → ${currentPeriod}`, fontSize: 7, color: MUTED, margin: [0, 8, 0, 0] },
    { text: "", pageBreak: "after" },

    sectionTitle("DESERCIÓN POR NIVEL Y CATEGORÍA"),
    { text: "El gráfico incluye todos los niveles. Los graduandos Level 18 de Niños/Jóvenes y Level 20 de Adultos están excluidos de la deserción.", fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 8] },
    { canvas: buildStaticChartCanvas(report.analytics?.dropoutByCategoryLevel || []), margin: [0, 5, 0, 4] },
    { columns: [
      { text: "● Adultos", color: REPORT_CATEGORY_COLORS.Adultos, fontSize: 8 },
      { text: "● Niños", color: REPORT_CATEGORY_COLORS.Niños, fontSize: 8 },
      { text: "● Jóvenes", color: REPORT_CATEGORY_COLORS.Jóvenes, fontSize: 8 },
    ], margin: [20, 0, 0, 14] },
    { text: "Horario con más fugas", fontSize: 9, bold: true, color: MUTED },
    { text: topSchedule.schedule || "N/A", fontSize: 20, bold: true, color: BLUE, margin: [0, 3, 0, 2] },
    { text: `${topSchedule.lost || 0} estudiantes no continuaron de ${topSchedule.previous || topSchedule.eligible || 0} que debían continuar en ese horario.`, fontSize: 8.5, color: MUTED },
    { text: "", pageBreak: "after" },

    sectionTitle("MOVIMIENTOS Y TRANSICIONES"),
    {
      columns: [
        kpi("Niños → Jóvenes", report.transitions.ninosJovenes, "Transiciones detectadas.", "#15803D"),
        kpi("Niños → Adultos", report.transitions.ninosAdultos, "Transiciones directas.", "#0369A1"),
        kpi("Jóvenes → Adultos", report.transitions.jovenesAdultos, "Transiciones detectadas.", BLUE),
        kpi("Cambios de frecuencia", report.totals.frequencyChanges, "Continuaron en otra frecuencia.", "#B45309"),
      ],
      columnGap: 6,
    },
    sectionTitle("Ingresos Level 01"),
    smallTable(["Estudiante", "ID", "Categoría", "Nivel", "Horario"], studentRows(report.lists.newLevel1), ["*", 62, 55, 35, 80]),
    sectionTitle("Estudiantes no presentes en el período anterior · Level 02+"),
    smallTable(["Estudiante", "ID", "Categoría", "Nivel", "Horario"], studentRows(report.lists.externalLevel2Plus), ["*", 62, 55, 35, 80]),
    { text: "", pageBreak: "after" },

    sectionTitle("ALUMNOS POR SECCIÓN"),
    { columns: [kpi("Promedio por sección", report.totals.avgDensityRounded, "Estudiantes por salón/sección.", BLUE), kpi("Secciones activas", report.totals.activeSections, "Secciones detectadas en las listas del período actual.", accent)], columnGap: 10, margin: [0, 0, 0, 8] },
    smallTable(
      ["Curso", "Categoría", "Nivel", "Horario", "Teacher", "Salón", "Alumnos"],
      sectionRows.map((row) => [row.courseId, row.category, row.level, row.schedule, row.teacher, row.room, row.students]),
      [45, 55, 32, "*", 58, 36, 38]
    ),
    { text: "", pageBreak: "after" },

    sectionTitle("DESERCIONES / FUGAS"),
    smallTable(["Estudiante", "ID", "Categoría", "Nivel", "Horario"], studentRows(report.lists.lost), ["*", 65, 55, 35, 85]),
    sectionTitle("GRADUANDOS"),
    smallTable(["Estudiante", "ID", "Categoría", "Nivel", "Horario"], studentRows(report.lists.graduates), ["*", 65, 55, 35, 85]),
    { text: "", pageBreak: "after" },

    sectionTitle("ACCIONES DE SUPERVISIÓN DOCENTE"),
    relevantPlans.length
      ? smallTable(
          ["Fecha", "Hallazgo", "Acción", "Responsable", "Seguimiento", "Estado"],
          relevantPlans.map((plan) => [plan.date, plan.finding, plan.action, plan.owner, plan.followUpDate, plan.status]),
          [45, "*", "*", 65, 55, 55]
        )
      : {
          stack: [
            { text: "Hallazgo / prioridad", bold: true, fontSize: 9, color: BLUE, margin: [0, 0, 0, 8] },
            { text: "\n\n\n", fillColor: "#FFFFFF", margin: [0, 0, 0, 10] },
            { text: "Acción", bold: true, fontSize: 9, color: BLUE, margin: [0, 0, 0, 8] },
            { text: "\n\n\n", fillColor: "#FFFFFF", margin: [0, 0, 0, 10] },
            { text: "Responsable / seguimiento", bold: true, fontSize: 9, color: BLUE, margin: [0, 0, 0, 8] },
            { text: "\n\n", fillColor: "#FFFFFF" },
          ],
        },
  ];

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [36, 62, 36, 42],
    defaultStyle: { font: "Roboto", color: INK },
    background: (currentPage, pageSize) => {
      if (currentPage === 1) {
        return [
          { canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: BLUE2, lineColor: BLUE2 }] },
          { image: PATTERN_BLUE_DATA_URL, width: pageSize.width, height: pageSize.height - 48, opacity: 0.48 },
          { canvas: [{ type: "rect", x: 0, y: pageSize.height - 48, w: pageSize.width, h: 48, color: PASTEL_DARK, lineColor: PASTEL_DARK }] },
        ];
      }
      return [
        { canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: PASTEL, lineColor: PASTEL }] },
        { image: PATTERN_PASTEL_DATA_URL, width: pageSize.width, height: pageSize.height - 85, opacity: 0.8, margin: [0, 55, 0, 0] },
      ];
    },
    header: (currentPage, pageCount, pageSize) => {
      if (currentPage === 1) return null;
      return {
        margin: [0, 0, 0, 0],
        stack: [
          { canvas: [{ type: "rect", x: 0, y: 0, w: pageSize.width, h: 46, color: BLUE, lineColor: BLUE }] },
          {
            columns: [
              { text: "INTERIM / STATUS REPORT", color: "#FFFFFF", bold: true, fontSize: 9, margin: [36, -35, 0, 0] },
              { text: report.frequency, color: "#FFFFFF", bold: true, fontSize: 8, alignment: "right", margin: [0, -35, 36, 0] },
            ],
          },
        ],
      };
    },
    footer: (currentPage, pageCount, pageSize) => {
      if (currentPage === 1) return null;
      return {
        margin: [0, 0, 0, 0],
        stack: [
          { canvas: [
            { type: "rect", x: 0, y: 0, w: pageSize.width, h: 13, color: RED_DARK, lineColor: RED_DARK },
            { type: "rect", x: 0, y: 13, w: pageSize.width, h: 13, color: RED, lineColor: RED },
          ] },
          { text: String(currentPage), color: "#FFFFFF", bold: true, fontSize: 8, alignment: "right", margin: [0, -19, 36, 0] },
        ],
      };
    },
    content,
    info: {
      title: `Interim Status Report - ${report.frequency}`,
      subject: "Continuidad estudiantil",
      author: "CEVAZ La Limpia",
    },
  };
}
