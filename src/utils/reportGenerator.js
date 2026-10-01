import {
  LOGO_LA_LIMPIA_DATA_URL,
  PATTERN_BLUE_DATA_URL,
  PATTERN_PASTEL_DATA_URL,
} from "./reportAssets.js";

import {
  REPORT_CATEGORY_COLORS,
} from "./reportData.js";

const BRAND = Object.freeze({
  blueDark: "#09458A",
  blue: "#155EA8",
  pastelDark: "#F4EFEB",
  pastel: "#FCF8F5",
  redDark: "#B41620",
  red: "#E61C29",
  ink: "#17324D",
  muted: "#64748B",
});

const FREQUENCY_ACCENTS = Object.freeze({
  "MARTES Y JUEVES": "#7C3AED",
  "MIERCOLES Y VIERNES": "#F59E0B",
  LUNES: "#16A34A",
  SABATINO: "#2563EB",
  INTENSIVO: "#8B5CF6",
  "SEMI INTENSIVO": "#0891B2",
});

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const normalizeFilename = (value = "") =>
  String(value || "reporte")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

const studentRow = (student, extraCells = "") => `
  <tr>
    <td>${escapeHtml(student?.name || "N/A")}</td>
    <td>${escapeHtml(student?.id || student?.idOriginal || "N/A")}</td>
    <td>${escapeHtml(student?.category || "N/A")}</td>
    <td>${escapeHtml(student?.levelNorm || student?.level || "N/A")}</td>
    <td>${escapeHtml(student?.scheduleBlock || student?.schedule || "N/A")}</td>
    ${extraCells}
  </tr>`;

const studentTable = (title, students = [], { extraHeader = "", extraCell = null } = {}) => {
  const rows = students.length
    ? students.map((student) => studentRow(student, extraCell ? extraCell(student) : "")).join("")
    : `<tr><td colspan="${extraHeader ? 6 : 5}" class="empty-cell">Sin casos para esta frecuencia.</td></tr>`;

  return `
    <section class="detail-block">
      <div class="section-heading-row">
        <h3>${escapeHtml(title)}</h3>
        <span class="count-chip">${students.length}</span>
      </div>
      <div class="table-wrap">
        <table class="report-table compact">
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>ID</th>
              <th>Categoría</th>
              <th>Nivel</th>
              <th>Horario</th>
              ${extraHeader}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
};

const chunk = (items = [], size = 18) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
};

const kpiCard = (label, value, detail, tone = "blue") => `
  <div class="kpi-card tone-${tone}">
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value">${escapeHtml(value)}</div>
    <div class="kpi-detail">${detail}</div>
  </div>`;

const actionPlanRows = (plans = []) => {
  if (!plans.length) {
    return `
      <div class="action-editor" contenteditable="true" data-placeholder="Redacta aquí las acciones de Supervisión Docente para esta frecuencia..."></div>
      <div class="action-grid">
        <div contenteditable="true" class="action-box"><strong>Hallazgo / prioridad</strong><br><br></div>
        <div contenteditable="true" class="action-box"><strong>Acción</strong><br><br></div>
        <div contenteditable="true" class="action-box"><strong>Responsable</strong><br><br></div>
        <div contenteditable="true" class="action-box"><strong>Seguimiento / fecha</strong><br><br></div>
      </div>`;
  }

  return `
    <div class="table-wrap">
      <table class="report-table">
        <thead><tr><th>Fecha</th><th>Hallazgo</th><th>Acción</th><th>Responsable</th><th>Seguimiento</th><th>Estado</th></tr></thead>
        <tbody>
          ${plans.map((plan) => `
            <tr>
              <td>${escapeHtml(plan.date || "")}</td>
              <td>${escapeHtml(plan.finding || "")}</td>
              <td>${escapeHtml(plan.action || "")}</td>
              <td>${escapeHtml(plan.owner || "")}</td>
              <td>${escapeHtml(plan.followUpDate || "")}</td>
              <td>${escapeHtml(plan.status || "Pendiente")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="action-editor small" contenteditable="true" data-placeholder="Notas adicionales..."></div>`;
};

export const getFrequencyReportFilename = (frequency, extension = "html") =>
  `INTERIM_STATUS_REPORT_${normalizeFilename(frequency)}.${extension}`;

export function buildFrequencyReportHtml(report, actionPlans = []) {
  if (!report) throw new Error("No se recibió información para generar el reporte.");

  const accent = FREQUENCY_ACCENTS[report.frequency] || BRAND.blue;
  const currentPeriod = report.metadata?.currentPeriods?.join(" · ") || "Período actual";
  const previousPeriod = report.metadata?.previousPeriods?.join(" · ") || "Período anterior";
  const topSchedule = report.analytics?.topScheduleByVolume || {};
  const chartData = report.analytics?.dropoutByCategoryLevel || [];
  const sections = report.analytics?.sectionRows || [];
  const reportActions = (actionPlans || []).filter((plan) => !plan.frequency || plan.frequency === report.frequency);

  let pageNumber = 0;
  const pages = [];

  const page = (title, body, options = {}) => {
    pageNumber += 1;
    const cover = Boolean(options.cover);
    pages.push(`
      <article class="report-page ${cover ? "cover-page" : "content-page"}" data-page="${pageNumber}">
        ${cover ? "" : `
          <header class="page-header">
            <div>
              <div class="header-kicker">INTERIM / STATUS REPORT</div>
              <div class="header-title">${escapeHtml(title)}</div>
            </div>
            <div class="header-frequency" style="--accent:${accent}">${escapeHtml(report.frequency)}</div>
          </header>`}
        ${body}
        ${cover ? "" : `<footer class="page-footer"><span>${pageNumber}</span></footer>`}
      </article>`);
  };

  page("Portada", `
    <div class="cover-pattern"></div>
    <div class="cover-logo-wrap"><img class="cover-logo" src="${LOGO_LA_LIMPIA_DATA_URL}" alt="CEVAZ La Limpia" /></div>
    <div class="cover-content">
      <div class="cover-rule" style="background:${accent}"></div>
      <div class="cover-overline">INTERIM / STATUS</div>
      <div class="cover-report">REPORT</div>
      <div class="cover-meta-grid">
        <div><span>FRECUENCIA</span><strong>${escapeHtml(report.frequency)}</strong></div>
        <div><span>PERÍODO ACTUAL</span><strong>${escapeHtml(currentPeriod)}</strong></div>
      </div>
    </div>
    <div class="cover-footer"></div>
  `, { cover: true });

  page("RESUMEN GENERAL", `
    <main class="page-body">
      <div class="intro-note">
        Para calcular la continuidad y la deserción estudiantil se compara la matrícula del período anterior con las listas SGA suministradas del período actual. Los estudiantes de <strong>Level 18 en Niños y Jóvenes</strong> se clasifican como egresados de su categoría, y los estudiantes de <strong>Level 20 en Adultos</strong> también se clasifican como egresados. Estos estudiantes se muestran como <strong>Graduandos</strong> y <strong>no se contabilizan como pérdida o deserción</strong>.
      </div>
      <div class="kpi-grid">
        ${kpiCard("Continuidad estudiantil", `${report.rates.continuity}%`, `<strong>${report.totals.reenrolled}</strong> estudiantes continuaron de <strong>${report.totals.regularForContinuity}</strong> regulares para este período.`, "green")}
        ${kpiCard("Total pérdida", report.totals.lost, `${report.rates.attrition}% de la base regular para continuidad.`, "red")}
        ${kpiCard("Fuga: nuevos vs regulares", `${report.segmentation.level1Lost} / ${report.segmentation.regularLost}`, `Level 01: <strong>${report.rates.newStudentAttrition}%</strong> · Regulares: <strong>${report.rates.regularAttrition}%</strong>.`, "amber")}
        ${kpiCard("Horario con más fugas", topSchedule.schedule || "N/A", `<strong>${topSchedule.lost || 0}</strong> fugas en este bloque.`, "blue")}
        ${kpiCard("Alumnos por sección", report.totals.avgDensityRounded, `<strong>${report.totals.activeSections}</strong> secciones activas.`, "sky")}
        ${kpiCard("Graduandos", report.totals.graduates, `Egresados terminales excluidos de la pérdida.`, "indigo")}
        ${kpiCard("Ingresos Level 01", report.totals.newLevel1, `Estudiantes de Level 01 no presentes en el período anterior.`, "green")}
        ${kpiCard("Ingresos Level 02+", report.totals.externalLevel2Plus, `Posibles cambios de sede o ingresos por nivelación; requieren validación en SGA.`, "sky")}
      </div>
      <div class="two-col-summary">
        <div class="summary-panel">
          <h3>Transiciones de categoría</h3>
          <div class="metric-line"><span>Niños → Jóvenes</span><strong>${report.transitions.ninosJovenes}</strong></div>
          <div class="metric-line"><span>Niños → Adultos</span><strong>${report.transitions.ninosAdultos}</strong></div>
          <div class="metric-line"><span>Jóvenes → Adultos</span><strong>${report.transitions.jovenesAdultos}</strong></div>
        </div>
        <div class="summary-panel">
          <h3>Movimiento de frecuencia</h3>
          <div class="big-number">${report.totals.frequencyChanges}</div>
          <p>Estudiantes que continuaron, pero cambiaron de familia de frecuencia entre ambos períodos.</p>
        </div>
      </div>
      <div class="source-note">Fuente operativa: listas SGA suministradas · Comparación: ${escapeHtml(previousPeriod)} → ${escapeHtml(currentPeriod)}</div>
    </main>
  `);

  page("DESERCIÓN POR NIVEL Y CATEGORÍA", `
    <main class="page-body">
      <div class="chart-card">
        <div class="chart-card-head">
          <div>
            <h3>Volumen de Deserción por Nivel y Categoría</h3>
            <p>Todos los niveles se muestran en el eje. Los graduandos Level 18 de Niños/Jóvenes y Level 20 de Adultos están excluidos de la deserción.</p>
          </div>
          <div class="chart-buttons" data-chart-buttons>
            <button class="active" data-category="TODOS">TODOS</button>
            <button data-category="Adultos">ADULTOS</button>
            <button data-category="Niños">NIÑOS</button>
            <button data-category="Jóvenes">JÓVENES</button>
          </div>
        </div>
        <div class="chart-legend">
          <span><i style="background:${REPORT_CATEGORY_COLORS.Adultos}"></i>Adultos</span>
          <span><i style="background:${REPORT_CATEGORY_COLORS.Niños}"></i>Niños</span>
          <span><i style="background:${REPORT_CATEGORY_COLORS.Jóvenes}"></i>Jóvenes</span>
        </div>
        <div id="dropoutChart" class="dropout-chart"></div>
      </div>
      <div class="schedule-panel">
        <h3>Horario con más fugas</h3>
        <div class="schedule-main">${escapeHtml(topSchedule.schedule || "N/A")}</div>
        <div class="schedule-sub"><strong>${topSchedule.lost || 0}</strong> estudiantes no continuaron de <strong>${topSchedule.previous || topSchedule.eligible || 0}</strong> que debían continuar en ese horario.</div>
      </div>
    </main>
  `);

  page("MOVIMIENTOS Y TRANSICIONES", `
    <main class="page-body">
      <div class="movement-grid">
        ${kpiCard("Niños → Jóvenes", report.transitions.ninosJovenes, "Transiciones detectadas entre categorías.", "green")}
        ${kpiCard("Niños → Adultos", report.transitions.ninosAdultos, "Transiciones directas detectadas.", "sky")}
        ${kpiCard("Jóvenes → Adultos", report.transitions.jovenesAdultos, "Transiciones detectadas entre categorías.", "blue")}
        ${kpiCard("Cambios de frecuencia", report.totals.frequencyChanges, "Continuidad con cambio de familia de frecuencia.", "amber")}
      </div>
      ${studentTable("Ingresos Level 01", report.lists.newLevel1)}
      ${studentTable("Estudiantes no presentes en el período anterior · Level 02+", report.lists.externalLevel2Plus)}
      ${studentTable("Cambios de frecuencia", report.lists.frequencyChanges, {
        extraHeader: "<th>Cambio</th>",
        extraCell: (student) => `<td>${escapeHtml(student.oldFrequency || "N/A")} → ${escapeHtml(student.newFrequency || student.frequencyNorm || "N/A")}</td>`,
      })}
    </main>
  `);

  const sectionChunks = chunk(sections, 18);
  sectionChunks.forEach((rows, index) => {
    page(index === 0 ? "ALUMNOS POR SECCIÓN" : "ALUMNOS POR SECCIÓN · CONT.", `
      <main class="page-body">
        ${index === 0 ? `<div class="section-overview"><div><strong>${report.totals.avgDensityRounded}</strong><span>estudiantes promedio por sección</span></div><div><strong>${report.totals.activeSections}</strong><span>secciones activas</span></div></div>` : ""}
        <div class="table-wrap">
          <table class="report-table">
            <thead><tr><th>Curso ID</th><th>Categoría</th><th>Nivel</th><th>Horario</th><th>Teacher</th><th>Salón</th><th>Alumnos</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.courseId)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.level)}</td><td>${escapeHtml(row.schedule)}</td><td>${escapeHtml(row.teacher)}</td><td>${escapeHtml(row.room)}</td><td class="number-cell">${row.students}</td></tr>`).join("") : `<tr><td colspan="7" class="empty-cell">Sin secciones detectadas.</td></tr>`}
            </tbody>
          </table>
        </div>
      </main>
    `);
  });

  const detailGroups = [
    ["DESERCIONES / FUGAS", report.lists.lost],
    ["GRADUANDOS", report.lists.graduates],
    ["TRANSICIÓN · NIÑOS → JÓVENES", report.lists.ninosJovenes],
    ["TRANSICIÓN · NIÑOS → ADULTOS", report.lists.ninosAdultos],
    ["TRANSICIÓN · JÓVENES → ADULTOS", report.lists.jovenesAdultos],
  ];

  detailGroups.forEach(([title, students]) => {
    const chunks = chunk(students, 19);
    chunks.forEach((rows, index) => {
      page(index === 0 ? title : `${title} · CONT.`, `
        <main class="page-body">
          ${studentTable(title, rows)}
        </main>`);
    });
  });

  page("ACCIONES DE SUPERVISIÓN DOCENTE", `
    <main class="page-body actions-page">
      <div class="intro-note compact-note">
        Espacio de trabajo para registrar acciones derivadas de los hallazgos de continuidad, deserción, movimientos y composición de secciones. Esta página puede completarse directamente en la versión HTML antes de imprimir o exportar.
      </div>
      ${actionPlanRows(reportActions)}
    </main>
  `);

  const safeChartJson = JSON.stringify(chartData).replace(/</g, "\\u003c");
  const safeColorsJson = JSON.stringify(REPORT_CATEGORY_COLORS).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>INTERIM / STATUS REPORT · ${escapeHtml(report.frequency)}</title>
<style>
  :root { --blue-dark:${BRAND.blueDark}; --blue:${BRAND.blue}; --pastel-dark:${BRAND.pastelDark}; --pastel:${BRAND.pastel}; --red-dark:${BRAND.redDark}; --red:${BRAND.red}; --ink:${BRAND.ink}; --muted:${BRAND.muted}; --accent:${accent}; }
  *{box-sizing:border-box} html,body{margin:0;padding:0;background:#e8edf2;color:var(--ink);font-family:Inter,Arial,Helvetica,sans-serif} body{padding:24px 0}
  .report-page{position:relative;width:210mm;min-height:297mm;margin:0 auto 24px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.16);page-break-after:always;background:var(--pastel)}
  .content-page::before{content:"";position:absolute;inset:18mm 0 10mm;background-image:url('${PATTERN_PASTEL_DATA_URL}');background-size:cover;background-position:center;opacity:.72;z-index:0;pointer-events:none}
  .page-header{position:relative;z-index:3;height:21mm;padding:5mm 12mm;background:linear-gradient(180deg,var(--blue-dark),var(--blue-dark));display:flex;align-items:center;justify-content:space-between;color:white}
  .header-kicker{font-size:8pt;letter-spacing:.18em;font-weight:700;opacity:.82}.header-title{font-size:15pt;font-weight:900;margin-top:1mm}.header-frequency{padding:2mm 4mm;border-radius:999px;background:var(--accent);font-size:8.5pt;font-weight:800;letter-spacing:.06em}
  .page-body{position:relative;z-index:2;padding:10mm 12mm 17mm}.page-footer{position:absolute;z-index:4;left:0;right:0;bottom:0;height:10mm;background:linear-gradient(180deg,var(--red-dark),var(--red));display:flex;justify-content:flex-end;align-items:center;padding:0 12mm;color:#fff;font-size:9pt;font-weight:800}.page-footer span{min-width:10mm;text-align:right}
  .cover-page{background:linear-gradient(180deg,#155EA8 0%,#0D52A0 100%);color:#fff}.cover-pattern{position:absolute;inset:0 0 17mm;background-image:url('${PATTERN_BLUE_DATA_URL}');background-size:cover;background-position:center;opacity:.97}.cover-logo-wrap{position:absolute;top:22mm;left:14mm;width:35mm;height:35mm;display:flex;align-items:center;justify-content:center}.cover-logo{width:100%;height:100%;object-fit:contain}.cover-content{position:absolute;left:16mm;right:14mm;bottom:51mm;z-index:2}.cover-rule{width:25mm;height:2mm;margin-bottom:8mm;border-radius:999px}.cover-overline{font-size:30pt;font-weight:900;line-height:.95;letter-spacing:-.03em}.cover-report{font-size:42pt;font-weight:950;color:#fff;margin-top:2mm;line-height:.95}.cover-meta-grid{display:grid;grid-template-columns:1fr 2fr;gap:10mm;margin-top:10mm;padding-top:7mm;border-top:1px solid rgba(255,255,255,.5)}.cover-meta-grid span{display:block;font-size:7pt;letter-spacing:.22em;opacity:.75}.cover-meta-grid strong{display:block;margin-top:2mm;font-size:12pt;line-height:1.2}.cover-footer{position:absolute;left:0;right:0;bottom:0;height:17mm;background:linear-gradient(180deg,#F4EFEB,#FCF8F5)}
  .intro-note{background:rgba(255,255,255,.91);border-left:4px solid var(--blue-dark);border-radius:10px;padding:5mm 6mm;line-height:1.55;font-size:9.6pt;box-shadow:0 3px 12px rgba(15,23,42,.05)}.compact-note{margin-bottom:7mm}
  .kpi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm;margin-top:6mm}.kpi-card{background:rgba(255,255,255,.95);border-radius:12px;padding:5mm;border:1px solid rgba(9,69,138,.08);border-top:4px solid #2563eb;min-height:31mm}.kpi-label{font-size:8pt;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#52657a}.kpi-value{font-size:26pt;font-weight:950;line-height:1;margin:2mm 0}.kpi-detail{font-size:8.3pt;line-height:1.35;color:#607087}.tone-green{border-top-color:#16a34a}.tone-green .kpi-value{color:#15803d}.tone-red{border-top-color:#e61c29}.tone-red .kpi-value{color:#b41620}.tone-amber{border-top-color:#f59e0b}.tone-amber .kpi-value{color:#b45309}.tone-blue{border-top-color:#2563eb}.tone-blue .kpi-value{color:#1d4ed8}.tone-sky{border-top-color:#38bdf8}.tone-sky .kpi-value{color:#0369a1}.tone-indigo{border-top-color:#6366f1}.tone-indigo .kpi-value{color:#4338ca}
  .two-col-summary{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm}.summary-panel{background:rgba(255,255,255,.94);border-radius:12px;padding:5mm}.summary-panel h3{font-size:10pt;margin:0 0 3mm}.metric-line{display:flex;justify-content:space-between;padding:2mm 0;border-bottom:1px solid #edf2f7;font-size:8.6pt}.metric-line strong{font-size:11pt}.big-number{font-size:28pt;font-weight:950;color:var(--blue-dark)}.summary-panel p{font-size:8.5pt;line-height:1.4;color:#607087}.source-note{margin-top:5mm;font-size:7.5pt;color:#6b7280}
  .chart-card{background:rgba(255,255,255,.96);border-radius:14px;padding:6mm;min-height:180mm}.chart-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:5mm}.chart-card h3{margin:0;font-size:14pt}.chart-card p{margin:1.5mm 0 0;font-size:8.4pt;line-height:1.35;color:#64748b;max-width:116mm}.chart-buttons{display:flex;flex-wrap:wrap;gap:1.5mm;justify-content:flex-end}.chart-buttons button{border:1px solid #dbe4ee;background:#fff;color:#52657a;font-weight:800;font-size:7pt;padding:2mm 3mm;border-radius:999px;cursor:pointer}.chart-buttons button.active{background:var(--blue-dark);border-color:var(--blue-dark);color:#fff}.chart-legend{display:flex;gap:5mm;margin:5mm 0 3mm;font-size:8pt;color:#52657a}.chart-legend span{display:flex;gap:1.5mm;align-items:center}.chart-legend i{width:3mm;height:3mm;border-radius:50%}.dropout-chart{height:116mm;width:100%}.dropout-chart svg{width:100%;height:100%;overflow:visible}.schedule-panel{margin-top:5mm;background:rgba(255,255,255,.95);border-radius:12px;padding:5mm;border-left:4px solid var(--accent)}.schedule-panel h3{margin:0 0 2mm;font-size:9pt;text-transform:uppercase;letter-spacing:.08em}.schedule-main{font-size:20pt;font-weight:950;color:var(--blue-dark)}.schedule-sub{font-size:8.5pt;color:#64748b;margin-top:1mm}
  .movement-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:5mm}.movement-grid .kpi-card{min-height:27mm;padding:4mm}.movement-grid .kpi-value{font-size:20pt}.detail-block{background:rgba(255,255,255,.95);border-radius:12px;padding:4mm;margin-top:4mm}.section-heading-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:2.5mm}.section-heading-row h3{margin:0;font-size:10pt}.count-chip{background:#e7eef7;color:var(--blue-dark);padding:1mm 2.5mm;border-radius:999px;font-size:7.5pt;font-weight:800}
  .table-wrap{width:100%;overflow:hidden;background:rgba(255,255,255,.96);border-radius:10px}.report-table{width:100%;border-collapse:collapse;font-size:7.4pt}.report-table th{background:#e9eff6;color:#27415c;text-transform:uppercase;letter-spacing:.04em;font-size:6.7pt;padding:2.2mm;text-align:left;border-bottom:1px solid #cbd8e6}.report-table td{padding:2.1mm;border-bottom:1px solid #edf1f5;vertical-align:top}.report-table.compact td{padding:1.8mm}.report-table tr:last-child td{border-bottom:0}.number-cell{text-align:center;font-weight:900}.empty-cell{text-align:center;color:#94a3b8;padding:8mm!important}.section-overview{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:5mm}.section-overview>div{background:rgba(255,255,255,.96);padding:5mm;border-radius:12px;display:flex;align-items:baseline;gap:3mm}.section-overview strong{font-size:26pt;color:var(--blue-dark)}.section-overview span{font-size:9pt;color:#607087}
  .actions-page .action-editor{min-height:85mm;background:rgba(255,255,255,.96);border:1.5px dashed #9cb1c8;border-radius:12px;padding:6mm;outline:none;font-size:10pt;line-height:1.55}.actions-page .action-editor.small{min-height:35mm;margin-top:5mm}.action-editor:empty::before{content:attr(data-placeholder);color:#94a3b8}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm}.action-box{min-height:34mm;background:rgba(255,255,255,.96);border-radius:10px;padding:4mm;border:1px solid #e1e8f0;outline:none;font-size:8.5pt}
  @media print{body{background:#fff;padding:0}.report-page{margin:0;box-shadow:none;break-after:page;page-break-after:always}.chart-buttons{display:none}.report-page:last-child{page-break-after:auto}}
  @media(max-width:900px){body{padding:0}.report-page{width:100%;min-height:100vh;margin:0;box-shadow:none}.kpi-grid,.two-col-summary,.movement-grid,.section-overview,.action-grid{grid-template-columns:1fr}.chart-card-head{flex-direction:column}.page-header{height:auto;min-height:72px}.cover-meta-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
${pages.join("\n")}
<script>
  const chartData = ${safeChartJson};
  const categoryColors = ${safeColorsJson};
  let currentCategory = "TODOS";

  function renderDropoutChart(category = "TODOS") {
    currentCategory = category;
    document.querySelectorAll('[data-chart-buttons] button').forEach((button) => {
      button.classList.toggle('active', button.dataset.category === category);
    });

    const root = document.getElementById('dropoutChart');
    if (!root) return;

    const width = 740;
    const height = 390;
    const margin = { top: 20, right: 20, bottom: 48, left: 34 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const categories = category === 'TODOS' ? ['Adultos','Niños','Jóvenes'] : [category];
    const maxValue = Math.max(1, ...chartData.map((row) => categories.reduce((sum, key) => sum + (row[key] || 0), 0)));
    const barGap = 5;
    const barW = Math.max(8, (plotW / chartData.length) - barGap);

    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Deserción por nivel y categoría">';
    for (let step = 0; step <= 4; step += 1) {
      const value = Math.round((maxValue / 4) * step);
      const y = margin.top + plotH - ((value / maxValue) * plotH);
      svg += '<line x1="' + margin.left + '" y1="' + y + '" x2="' + (width-margin.right) + '" y2="' + y + '" stroke="#dce6ef" stroke-width="1"/>';
      svg += '<text x="' + (margin.left-7) + '" y="' + (y+3) + '" text-anchor="end" font-size="10" fill="#6b7d90">' + value + '</text>';
    }

    chartData.forEach((row, index) => {
      const x = margin.left + (index * (plotW / chartData.length)) + (barGap / 2);
      let usedHeight = 0;
      categories.forEach((key) => {
        const value = row[key] || 0;
        if (!value) return;
        const h = (value / maxValue) * plotH;
        const y = margin.top + plotH - usedHeight - h;
        svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="2" fill="' + (categoryColors[key] || '#2563EB') + '"><title>' + row.label + ' · ' + key + ': ' + value + '</title></rect>';
        usedHeight += h;
      });
      svg += '<text x="' + (x + (barW/2)) + '" y="' + (height-23) + '" text-anchor="middle" font-size="8.5" fill="#53687c">' + row.level + '</text>';
    });
    svg += '<text x="' + (width/2) + '" y="' + (height-4) + '" text-anchor="middle" font-size="10" fill="#53687c">Nivel</text></svg>';
    root.innerHTML = svg;
  }

  document.querySelectorAll('[data-chart-buttons] button').forEach((button) => {
    button.addEventListener('click', () => renderDropoutChart(button.dataset.category));
  });

  renderDropoutChart('TODOS');
</script>
</body>
</html>`;
}
