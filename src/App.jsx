// src/App.jsx
import React, { useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import * as Docx from "docx";
import { saveAs } from "file-saver";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
  Search, Users, Clock, AlertTriangle, Download, CheckCircle, XCircle, Filter, 
  Phone, Upload, RefreshCw, Trash2, MessageCircle, 
  UserPlus, TrendingUp, Edit3, Save, FileText, Printer, FileUp, File
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

if (pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
}

/* =========================
   COLORES Y CONSTANTES
   ========================= */
const FRECUENCIA_COLORS = {
  "MARTES Y JUEVES": "#7c3aed",
  "MIERCOLES Y VIERNES": "#f97316",
  SABATINO: "#2563eb",
  LUNES: "#16a34a",
  "INTENSIVO A": "#c27ba0",
  "INTENSIVO B": "#ead1dc",
  INTENSIVO: "#a855f7",
  "N/A": "#94a3b8",
};

const HORARIO_COLORS = [
  "#2563eb", "#16a34a", "#f97316", "#7c3aed", "#0ea5e9", "#f43f5e", "#22c55e", "#eab308", "#a855f7", "#64748b",
];

const isGraduated = (student) => (student?.levelNorm || "").toUpperCase() === "L19";

/* =========================
   UTILIDADES DE ARCHIVOS
   ========================= */
const FRECUENCIA_ORDER = [
  "MARTES Y JUEVES", "MIERCOLES Y VIERNES", "LUNES", "SABATINO", "INTENSIVO A", "INTENSIVO B", "INTENSIVO", "N/A",
];

const fileKey = (f) => `${f.name}__${f.size}__${f.lastModified}`;

const normalizeFrecuenciaBase = (scheduleRaw = "") => {
  if (!scheduleRaw) return "N/A";
  const left = scheduleRaw.includes("/") ? scheduleRaw.split("/")[0].trim() : scheduleRaw.trim();
  const up = left.toUpperCase().replace(/\s+/g, " ").replace(/&/g, "Y").trim();

  if (!up) return "N/A";
  if (up.includes("MARTES") && up.includes("JUEVES")) return "MARTES Y JUEVES";
  if ((up.includes("MIERCOLES") || up.includes("MIÉRCOLES")) && up.includes("VIERNES")) return "MIERCOLES Y VIERNES";
  if (up.includes("SABADO") || up.includes("SÁBADO") || up.includes("SABAT")) return "SABATINO";
  if (up.includes("LUNES")) return "LUNES";
  if (up.includes("TUESDAY") && up.includes("THURSDAY")) return "MARTES Y JUEVES";
  if (up.includes("WEDNESDAY") && up.includes("FRIDAY")) return "MIERCOLES Y VIERNES";
  if (up.includes("SATURDAY")) return "SABATINO";
  if (up.includes("MONDAY") && !up.includes("TO")) return "LUNES";
  if (up.includes(" TO ") || /\sA\s/.test(up)) return "INTENSIVO";

  return left || "N/A";
};

const extractDateKeyFromName = (name = "") => {
  const up = (name || "").toUpperCase();
  let m = up.match(/(20\d{2})[\/_\-](\d{1,2})[\/_\-](\d{1,2})/);
  if (m) return parseInt(m[1], 10) * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
  m = up.match(/(^|[^0-9])(\d{1,2})[\/_\-](\d{1,2})([^0-9]|$)/);
  if (m) return parseInt(m[3], 10) * 100 + parseInt(m[2], 10);
  return null;
};

const sortFilesSmart = (files = []) => {
  const meta = files.map((f, idx) => {
    const dk = extractDateKeyFromName(f.name);
    return { f, idx, hasDate: dk !== null, dk: dk ?? Number.POSITIVE_INFINITY, name: (f.name || "").toUpperCase() };
  });

  meta.sort((a, b) => {
    if (a.hasDate && b.hasDate) {
      if (a.dk !== b.dk) return a.dk - b.dk;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.idx - b.idx;
    }
    if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.idx - b.idx;
  });
  return meta.map((x) => x.f);
};

const isIntensivoFileHint = (fileName = "") => {
  const up = (fileName || "").toUpperCase();
  return up.includes("INTENS") || up.includes("_INT_") || up.includes(" INT ") || up.includes("TUESDAY TO FRIDAY") || up.includes("MARTES A VIERNES");
};

const buildIntensivoLabelMap = (filesOrdered = []) => {
  const intensivo = filesOrdered.filter((f) => isIntensivoFileHint(f.name));
  const map = new Map();
  for (let i = 0; i < intensivo.length; i++) {
    map.set(fileKey(intensivo[i]), i === 0 ? "INTENSIVO A" : "INTENSIVO B");
  }
  return map;
};

const parseMany = async (files) => {
  const filesOrdered = sortFilesSmart(files);
  const intensivoLabelByFile = buildIntensivoLabelMap(filesOrdered);
  const failed = [];
  const all = [];

  for (let rank = 0; rank < filesOrdered.length; rank++) {
    const f = filesOrdered[rank];
    let list = [];
    try {
      list = await parseCevazPdf(f);
      if (!list?.length) failed.push(f.name);
    } catch {
      failed.push(f.name);
      list = [];
    }

    const fk = fileKey(f);
    for (const s of list || []) {
      const base = normalizeFrecuenciaBase(s.schedule || "");
      const freq = base === "INTENSIVO" ? intensivoLabelByFile.get(fk) || "INTENSIVO" : base;
      all.push({ ...s, frequencyRaw: s.schedule || "", frequencyNorm: freq, __fileRank: rank, __fileName: f.name });
    }
  }

  if (!all.length) throw new Error("No se pudo extraer alumnos de los PDFs seleccionados. Asegúrate de no usar PDFs escaneados (imágenes).");
  return { all, failed };
};

const uniqByIdPreferLatest = (arr) => {
  const map = new Map();
  for (const s of arr) {
    if (!s?.id) continue;
    const prev = map.get(s.id);
    if (!prev) { map.set(s.id, s); continue; }
    const rPrev = Number.isFinite(prev.__fileRank) ? prev.__fileRank : -1;
    const rNow = Number.isFinite(s.__fileRank) ? s.__fileRank : -1;
    if (rNow >= rPrev) map.set(s.id, s);
  }
  return Array.from(map.values());
};

/* =========================
   COMPONENTE PRINCIPAL
   ========================= */
const DashboardContinuidad = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const fileInputRef = useRef(null);

  const [pdfOldFiles, setPdfOldFiles] = useState([]);
  const [pdfNewFiles, setPdfNewFiles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");

  const [oldStudents, setOldStudents] = useState([]);
  const [newStudents, setNewStudents] = useState([]);
  const [dropouts, setDropouts] = useState([]);

  const [crmData, setCrmData] = useState({});
  const [crmModal, setCrmModal] = useState({ isOpen: false, student: null });

  const [stats, setStats] = useState({
    eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0,
    nuevosLost: 0, regularesLost: 0, transiciones: 0, avgDensity: 0, topHorarioFugas: "N/A"
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedFrecuencia, setSelectedFrecuencia] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [selectedHorario, setSelectedHorario] = useState("All");

  const [levelChartCategory, setLevelChartCategory] = useState("All");
  const [pieMode, setPieMode] = useState("horario");

  const mergeFiles = (prev, incoming) => {
    const map = new Map(prev.map((f) => [fileKey(f), f]));
    for (const f of incoming) map.set(fileKey(f), f);
    return Array.from(map.values());
  };

  const removeOldAt = (idx) => setPdfOldFiles((prev) => prev.filter((_, i) => i !== idx));
  const removeNewAt = (idx) => setPdfNewFiles((prev) => prev.filter((_, i) => i !== idx));

  const resetAll = () => {
    setPdfOldFiles([]); setPdfNewFiles([]); setOldStudents([]); setNewStudents([]); setDropouts([]);
    setCrmData({}); setSearchTerm(""); setSelectedCategory("All"); setSelectedFrecuencia("All");
    setSelectedLevel("All"); setSelectedHorario("All"); setLevelChartCategory("All"); setPieMode("horario");
    setStats({ eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0, nuevosLost: 0, regularesLost: 0, transiciones: 0, avgDensity: 0, topHorarioFugas: "N/A" });
    setErrorMsg(""); setWarnMsg(""); setActiveTab("upload");
  };

  const resetFilters = () => {
    setSearchTerm(""); setSelectedCategory("All"); setSelectedFrecuencia("All"); setSelectedLevel("All"); setSelectedHorario("All"); setLevelChartCategory("All");
  };

  const processPdfs = async () => {
    setErrorMsg(""); setWarnMsg("");
    if (!pdfOldFiles.length || !pdfNewFiles.length) {
      setErrorMsg("Debes seleccionar al menos 1 PDF ANTERIOR y 1 PDF ACTUAL."); return;
    }

    try {
      setLoading(true);
      const [{ all: oldAll, failed: failedOld }, { all: newAll, failed: failedNew }] =
        await Promise.all([parseMany(pdfOldFiles), parseMany(pdfNewFiles)]);

      const oldU = uniqByIdPreferLatest(oldAll);
      const newU = uniqByIdPreferLatest(newAll);

      const newIds = new Set(newU.map((s) => s.id));
      const eligibleOld = oldU.filter((s) => !isGraduated(s));
      const reenrolled = eligibleOld.filter((s) => newIds.has(s.id));
      const lost = eligibleOld.filter((s) => !newIds.has(s.id));

      const reenrolledPct = eligibleOld.length ? Math.round((reenrolled.length / eligibleOld.length) * 100) : 0;
      const lostPct = eligibleOld.length ? Math.round((lost.length / eligibleOld.length) * 100) : 0;

      const nuevosLost = lost.filter(s => s.levelNorm === "L01").length;
      const regularesLost = lost.length - nuevosLost;

      let transiciones = 0;
      reenrolled.forEach(newS => {
        const oldS = oldU.find(o => o.id === newS.id);
        if (oldS && oldS.category !== newS.category && oldS.category !== "Otra" && newS.category !== "Otra") {
          transiciones++;
        }
      });

      const activeCourses = new Set(newU.filter(s => s.courseId).map(s => s.courseId));
      const avgDensity = activeCourses.size > 0 ? (newU.length / activeCourses.size).toFixed(1) : 0;

      const byHorario = lost.reduce((acc, s) => { 
        if(s.scheduleBlock && s.scheduleBlock !== "N/A") acc[s.scheduleBlock] = (acc[s.scheduleBlock] || 0) + 1; 
        return acc; 
      }, {});
      const topHorarioFugas = Object.entries(byHorario).sort((a,b) => b[1]-a[1])[0]?.[0] || "N/A";

      setOldStudents(oldU); setNewStudents(newU); setDropouts(lost); setCrmData({});
      setStats({ eligibleOld: eligibleOld.length, reenrolled: reenrolled.length, reenrolledPct, lost: lost.length, lostPct, nuevosLost, regularesLost, transiciones, avgDensity, topHorarioFugas });
      resetFilters();

      const allFailed = [...(failedOld || []), ...(failedNew || [])];
      if (allFailed.length) setWarnMsg(`Ojo: no pude leer ${allFailed.length} PDF(s): ${allFailed.join(", ")}`);
      setActiveTab("dashboard");
    } catch (e) {
      setErrorMsg(e?.message || "Error procesando PDFs.");
    } finally {
      setLoading(false);
    }
  };

  const contactedCount = Object.values(crmData).filter(c => c.status && c.status !== "Pendiente").length;
  const rescuedCount = Object.values(crmData).filter(c => c.status === "Rescatado").length;
  const winBackRate = contactedCount > 0 ? Math.round((rescuedCount / contactedCount) * 100) : 0;

  const saveCrmData = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    setCrmData(prev => ({
      ...prev,
      [crmModal.student.id]: {
        status: formData.get("status"),
        motive: formData.get("motive"),
        notes: formData.get("notes")
      }
    }));
    setCrmModal({ isOpen: false, student: null });
  };

  const getCrmStatusColor = (status) => {
    switch (status) {
      case "Rescatado": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "En Gestión": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Pérdida Definitiva": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  /* =========================
     IMPORTAR / EXPORTAR DATOS
     ========================= */
  const exportExcel = () => {
    if (!dropouts.length) return;
    const rows = dropouts.map((s) => {
      const crm = crmData[s.id] || {};
      return {
        Cedula: s.id,
        Estudiante: s.name,
        "Estatus CRM": crm.status || "Pendiente",
        Motivo: crm.motive || "",
        Notas: crm.notes || "",
        Categoria: s.category,
        Nivel: s.levelNorm,
        Frecuencia: s.frequencyNorm || "N/A",
        Horario: s.scheduleBlock,
        Email: s.email || "",
        Telefono: s.phone || "",
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base Continuidad");
    XLSX.writeFile(wb, `BD_Continuidad_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      const newCrmData = { ...crmData };
      data.forEach(row => {
        if(row.Cedula) {
          newCrmData[String(row.Cedula)] = {
            status: row["Estatus CRM"] || "Pendiente",
            motive: row.Motivo || "",
            notes: row.Notas || ""
          };
        }
      });
      setCrmData(newCrmData);
      e.target.value = ""; 
    };
    reader.readAsBinaryString(file);
  };

  /* =========================
     REPORTES CORPORATIVOS
     ========================= */
  const generatePDFReport = () => {
    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      header: { text: 'REPORTE CORPORATIVO DE CONTINUIDAD', margin: [40, 20, 40, 0], fontSize: 10, color: '#64748b', alignment: 'right' },
      content: [
        { text: 'DASHBOARD DE CONTINUIDAD', style: 'title' },
        { text: 'Informe Ejecutivo de Retención Académica', style: 'subtitle' },
        { text: `Fecha de emisión: ${new Date().toLocaleDateString()}`, style: 'date' },
        '\n',
        { text: '1. Resumen de Desempeño General', style: 'sectionHeader' },
        { text: `En el presente análisis de continuidad, partiendo de una base de ${stats.eligibleOld} estudiantes regulares (excluyendo graduados), se logró la reinscripción de ${stats.reenrolled} alumnos. Esto representa una Tasa de Retención Institucional del ${stats.reenrolledPct}%. Por otro lado, la tasa de deserción se ubica en el ${stats.lostPct}%, con un total de ${stats.lost} estudiantes que no formalizaron su inscripción.`, alignment: 'justify', margin: [0, 0, 0, 10], lineHeight: 1.5 },
        { text: '2. Indicadores Clave de Rendimiento (KPIs)', style: 'sectionHeader' },
        {
          style: 'kpiTable',
          table: {
            widths: ['*', '*', '*'],
            body: [
              [
                { text: 'Densidad Promedio', style: 'kpiLabel' },
                { text: 'Transición de Categorías', style: 'kpiLabel' },
                { text: 'Win-back Rate (Rescate)', style: 'kpiLabel' }
              ],
              [
                { text: `${stats.avgDensity} / Salón`, style: 'kpiValue' },
                { text: `${stats.transiciones} Promovidos`, style: 'kpiValue' },
                { text: `${winBackRate}%`, style: 'kpiValue' }
              ]
            ]
          },
          layout: 'lightHorizontalLines'
        },
        '\n',
        {
          ul: [
            { text: `Fuga Estructural: Se registra una pérdida de ${stats.nuevosLost} alumnos de nuevo ingreso (L01) frente a ${stats.regularesLost} alumnos regulares.`, margin: [0, 0, 0, 5] },
            { text: `Horario Crítico: El bloque horario con mayor índice de fuga reportado es "${stats.topHorarioFugas}".`, margin: [0, 0, 0, 5] },
            { text: `Gestión de CRM: De ${stats.lost} estudiantes perdidos, se han contactado ${contactedCount} y se han logrado rescatar exitosamente a ${rescuedCount}.` }
          ],
          margin: [0, 0, 0, 20]
        },
        { text: '3. Matriz de Fuga por Categoría', style: 'sectionHeader' },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto'],
            body: [
              [{ text: 'Categoría', style: 'tableHeader' }, { text: 'Alumnos Perdidos', style: 'tableHeader', alignment: 'center' }, { text: '% del Total', style: 'tableHeader', alignment: 'center' }],
              ...Array.from(new Set(dropouts.map(s => s.category))).map(cat => {
                const count = dropouts.filter(s => s.category === cat).length;
                const pct = Math.round((count / stats.lost) * 100) || 0;
                return [cat || "N/A", { text: count.toString(), alignment: 'center' }, { text: `${pct}%`, alignment: 'center' }];
              })
            ]
          },
          layout: 'borders'
        }
      ],
      styles: {
        title: { fontSize: 22, bold: true, color: '#0f172a', alignment: 'center' },
        subtitle: { fontSize: 14, color: '#475569', alignment: 'center', margin: [0, 5, 0, 5] },
        date: { fontSize: 10, color: '#94a3b8', alignment: 'center', margin: [0, 0, 0, 20] },
        sectionHeader: { fontSize: 14, bold: true, color: '#1e293b', margin: [0, 15, 0, 8], decoration: 'underline' },
        kpiTable: { margin: [0, 10, 0, 15] },
        kpiLabel: { fontSize: 10, color: '#64748b', bold: true, alignment: 'center' },
        kpiValue: { fontSize: 16, color: '#0f172a', bold: true, alignment: 'center', margin: [0, 5, 0, 5] },
        tableHeader: { bold: true, fontSize: 11, color: 'white', fillColor: '#334155' }
      }
    };
    pdfMake.createPdf(docDefinition).download(`Dashboard_Continuidad_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const generateWordReport = async () => {
    const tableRows = [
      new Docx.TableRow({
        children: [
          new Docx.TableCell({ children: [new Docx.Paragraph({ text: "Categoría", bold: true })] }),
          new Docx.TableCell({ children: [new Docx.Paragraph({ text: "Total Deserción", bold: true })] })
        ]
      }),
      ...Array.from(new Set(dropouts.map(s => s.category))).map(cat => {
        const count = dropouts.filter(s => s.category === cat).length;
        return new Docx.TableRow({
          children: [
            new Docx.TableCell({ children: [new Docx.Paragraph({ text: cat || "N/A" })] }),
            new Docx.TableCell({ children: [new Docx.Paragraph({ text: count.toString() })] })
          ]
        });
      })
    ];

    const doc = new Docx.Document({
      sections: [{
        properties: {},
        children: [
          new Docx.Paragraph({ text: "DASHBOARD DE CONTINUIDAD", heading: Docx.HeadingLevel.HEADING_1, alignment: Docx.AlignmentType.CENTER }),
          new Docx.Paragraph({ text: "Informe Ejecutivo de Retención Académica", heading: Docx.HeadingLevel.HEADING_2, alignment: Docx.AlignmentType.CENTER }),
          new Docx.Paragraph({ text: `Fecha de emisión: ${new Date().toLocaleDateString()}`, alignment: Docx.AlignmentType.CENTER }),
          new Docx.Paragraph({ text: " " }),
          new Docx.Paragraph({ text: "1. Resumen General Académico", heading: Docx.HeadingLevel.HEADING_3 }),
          new Docx.Paragraph({ text: `En el presente análisis de continuidad, partiendo de una base de ${stats.eligibleOld} estudiantes regulares, se logró la reinscripción de ${stats.reenrolled} alumnos. Esto representa una Tasa de Retención Institucional del ${stats.reenrolledPct}%. Por otro lado, la tasa de deserción se ubica en el ${stats.lostPct}%, con un total de ${stats.lost} estudiantes perdidos.` }),
          new Docx.Paragraph({ text: " " }),
          new Docx.Paragraph({ text: "2. Indicadores Clave de Rendimiento (KPIs)", heading: Docx.HeadingLevel.HEADING_3 }),
          new Docx.Paragraph({ text: `• Transición Generacional: ${stats.transiciones} alumnos promovidos exitosamente entre categorías.` }),
          new Docx.Paragraph({ text: `• Densidad Promedio: ${stats.avgDensity} alumnos por salón activo en el periodo actual.` }),
          new Docx.Paragraph({ text: `• Comportamiento de Fuga: Se perdieron ${stats.nuevosLost} alumnos de nuevo ingreso (L01) frente a ${stats.regularesLost} alumnos regulares.` }),
          new Docx.Paragraph({ text: `• Horario Crítico: El bloque con mayor índice de fuga registrado fue "${stats.topHorarioFugas}".` }),
          new Docx.Paragraph({ text: `• Tasa de Rescate (Win-back): Se contactó a ${contactedCount} alumnos, logrando recuperar a ${rescuedCount} (${winBackRate}% de efectividad).` }),
          new Docx.Paragraph({ text: " " }),
          new Docx.Paragraph({ text: "3. Matriz de Fuga por Categoría", heading: Docx.HeadingLevel.HEADING_3 }),
          new Docx.Table({
            rows: tableRows,
            width: { size: 100, type: Docx.WidthType.PERCENTAGE }
          })
        ]
      }]
    });
    const blob = await Docx.Packer.toBlob(doc);
    saveAs(blob, `Dashboard_Continuidad_${new Date().toISOString().slice(0, 10)}.docx`);
  };

  /* =========================
     FILTROS Y DATOS DE TABLA
     ========================= */
  const filterOptions = useMemo(() => {
    const cats = Array.from(new Set(dropouts.map((s) => s.category).filter(Boolean))).sort();
    const lvls = Array.from(new Set(dropouts.map((s) => s.levelNorm).filter(Boolean))).sort();
    const hrs = Array.from(new Set(dropouts.map((s) => s.scheduleBlock).filter(Boolean)));
    const freqs = Array.from(new Set(dropouts.map((s) => s.frequencyNorm).filter(Boolean)));
    const known = __HORARIO_BLOQUES__ || [];
    const knownSet = new Set(known);
    return {
      categories: ["All", ...cats],
      levels: ["All", ...lvls],
      horarios: ["All", ...known.filter(h => hrs.includes(h)), ...hrs.filter(h => !knownSet.has(h)).sort()],
      frecuencias: ["All", ...FRECUENCIA_ORDER.filter(f => freqs.includes(f)), ...freqs.filter(f => !FRECUENCIA_ORDER.includes(f)).sort()],
    };
  }, [dropouts]);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return dropouts.filter((s) => {
      const matchesSearch = !q || (s.name || "").toLowerCase().includes(q) || (s.id || "").includes(q) || (s.email || "").toLowerCase().includes(q) || (s.phone || "").includes(q);
      const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
      const matchesFrecuencia = selectedFrecuencia === "All" || s.frequencyNorm === selectedFrecuencia;
      const matchesLevel = selectedLevel === "All" || s.levelNorm === selectedLevel;
      const matchesHorario = selectedHorario === "All" || s.scheduleBlock === selectedHorario;
      return matchesSearch && matchesCategory && matchesFrecuencia && matchesLevel && matchesHorario;
    });
  }, [dropouts, searchTerm, selectedCategory, selectedFrecuencia, selectedLevel, selectedHorario]);

  const barSource = useMemo(() => levelChartCategory === "All" ? dropouts : dropouts.filter((s) => s.category === levelChartCategory), [dropouts, levelChartCategory]);

  const chartDataLevel = useMemo(() => {
    const byLevel = barSource.reduce((acc, s) => { const k = s.levelNorm || "N/A"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    return Object.keys(byLevel).map((k) => ({ name: k, count: byLevel[k] })).sort((a, b) => (parseInt(a.name.replace(/\D/g, "")) || 0) - (parseInt(b.name.replace(/\D/g, "")) || 0));
  }, [barSource]);

  const chartDataPie = useMemo(() => {
    const byKey = dropouts.reduce((acc, s) => {
      const key = pieMode === "horario" ? (s.scheduleBlock || "N/A") : (s.frequencyNorm || "N/A");
      acc[key] = (acc[key] || 0) + 1; return acc;
    }, {});
    return Object.keys(byKey).map((k) => ({ name: k, value: byKey[k] })).sort((a, b) => b.value - a.value);
  }, [dropouts, pieMode]);

  /* =========================
     RENDER: UPLOAD VIEW
     ========================= */
  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" /> Dashboard de Continuidad - Carga de Datos
          </h1>
          <p className="text-slate-500 text-sm mt-1">Sube las listas del periodo anterior y actual. Puedes seleccionar varios archivos a la vez.</p>
        </header>

        {errorMsg && <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">{errorMsg}</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">Periodo ANTERIOR</span>
              <button className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2" onClick={() => setPdfOldFiles([])} type="button">
                <Trash2 className="h-4 w-4" /> Eliminar Todos
              </button>
            </div>
            <input type="file" accept="application/pdf" multiple onChange={(e) => { 
                const files = Array.from(e.target.files || []);
                setPdfOldFiles((prev) => mergeFiles(prev, files));
                e.target.value = "";
              }} className="block w-full text-sm" />
            <div className="text-xs text-slate-500 mt-2">{pdfOldFiles.length ? `Seleccionados: ${pdfOldFiles.length}` : "No hay PDFs seleccionados."}</div>
            
            {pdfOldFiles.length > 0 && (
              <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-2">
                {pdfOldFiles.map((f, idx) => (
                  <li key={fileKey(f)} className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded">
                    <span className="text-slate-700 truncate">{f.name}</span>
                    <button type="button" onClick={() => removeOldAt(idx)} className="text-slate-500 hover:text-red-600 inline-flex items-center" title="Quitar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">Periodo ACTUAL</span>
              <button className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2" onClick={() => setPdfNewFiles([])} type="button">
                <Trash2 className="h-4 w-4" /> Eliminar Todos
              </button>
            </div>
            <input type="file" accept="application/pdf" multiple onChange={(e) => { 
                const files = Array.from(e.target.files || []);
                setPdfNewFiles((prev) => mergeFiles(prev, files));
                e.target.value = "";
              }} className="block w-full text-sm" />
            <div className="text-xs text-slate-500 mt-2">{pdfNewFiles.length ? `Seleccionados: ${pdfNewFiles.length}` : "No hay PDFs seleccionados."}</div>
            
            {pdfNewFiles.length > 0 && (
              <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-2">
                {pdfNewFiles.map((f, idx) => (
                  <li key={fileKey(f)} className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded">
                    <span className="text-slate-700 truncate">{f.name}</span>
                    <button type="button" onClick={() => removeNewAt(idx)} className="text-slate-500 hover:text-red-600 inline-flex items-center" title="Quitar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button onClick={processPdfs} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-bold shadow flex items-center gap-2">
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Procesando..." : "Procesar y Comparar"}
          </button>
        </div>
      </div>
    );
  }

  /* =========================
     RENDER: DASHBOARD
     ========================= */
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800 relative print:bg-white print:p-0">
      
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" /> Dashboard de Continuidad
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setActiveTab("upload")} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg shadow-sm text-xs font-medium">
            <Upload className="h-4 w-4" /> PDFs
          </button>
          
          <input type="file" accept=".xlsx, .xls" ref={fileInputRef} className="hidden" onChange={importExcel} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg shadow-sm text-xs font-medium">
            <FileUp className="h-4 w-4" /> Importar BD
          </button>

          <button onClick={exportExcel} disabled={!dropouts.length} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium">
            <Save className="h-4 w-4" /> Excel
          </button>
          <button onClick={generateWordReport} disabled={!dropouts.length} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium">
            <File className="h-4 w-4" /> Word
          </button>
          <button onClick={generatePDFReport} disabled={!dropouts.length} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium">
            <FileText className="h-4 w-4" /> PDF
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg shadow text-xs font-medium">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </header>

      {/* DASHBOARD FLASHCARDS (METRICS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Total Reinscritos</p>
            <CheckCircle className="h-5 w-5 text-emerald-500 print:hidden" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">{stats.reenrolled}</h3>
            <p className="text-xs text-slate-400 font-medium">{stats.reenrolledPct}% de {stats.eligibleOld} regulares</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-rose-500 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Total Pérdida</p>
            <XCircle className="h-5 w-5 text-rose-500 print:hidden" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">{stats.lost}</h3>
            <p className="text-xs text-slate-400 font-medium">{stats.lostPct}% de {stats.eligibleOld} regulares</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Horario Crítico de Fugas</p>
            <Clock className="h-5 w-5 text-amber-500 print:hidden" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-black text-slate-800 truncate" title={stats.topHorarioFugas}>{stats.topHorarioFugas}</h3>
            <p className="text-xs text-slate-400 font-medium">Bloque con mayor deserción</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Tasa Éxito Rescate</p>
            <Phone className="h-5 w-5 text-blue-500 print:hidden" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-blue-600">{winBackRate}%</h3>
            <p className="text-xs text-slate-400 font-medium">{rescuedCount} de {contactedCount} contactados</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Densidad Promedio</p>
            <Users className="h-5 w-5 text-indigo-400 print:hidden" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">{stats.avgDensity}</h3>
            <p className="text-xs text-slate-400 font-medium">Alumnos por salón (Actual)</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Transición Categorías</p>
            <TrendingUp className="h-5 w-5 text-emerald-400 print:hidden" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">{stats.transiciones}</h3>
            <p className="text-xs text-slate-400 font-medium">Promociones a Joven/Adulto</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 md:col-span-2 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Fuga: Nuevos vs Regulares</p>
            <AlertTriangle className="h-5 w-5 text-amber-400 print:hidden" />
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div>
              <span className="text-2xl font-black text-rose-600">{stats.nuevosLost}</span>
              <span className="text-xs text-slate-500 ml-1">Nuevos Ingresos (L01)</span>
            </div>
            <div className="text-slate-300 pb-1">|</div>
            <div>
              <span className="text-2xl font-black text-slate-700">{stats.regularesLost}</span>
              <span className="text-xs text-slate-500 ml-1">Regulares Perdidos</span>
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS (Bar and Pie) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 print:break-inside-avoid">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 print:border print:shadow-none">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-lg font-bold text-slate-800">Volumen de Deserción por Nivel</h3>
            {/* TOGGLE PARA CAMBIAR CATEGORIAS EN EL GRAFICO */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg print:hidden">
              {["All", "Niños", "Jóvenes", "Adultos"].map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setLevelChartCategory(cat)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${levelChartCategory === cat ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {cat === "All" ? "Todos" : cat}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataLevel} onClick={(e) => {if(e?.activeLabel) setSelectedLevel(e.activeLabel)}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                <YAxis />
                <RechartsTooltip cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Estudiantes" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 print:border print:shadow-none">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">Fuga por {pieMode === "horario" ? "Horario" : "Frecuencia"}</h3>
            <button onClick={() => setPieMode(prev => prev === "horario" ? "frecuencia" : "horario")} className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded print:hidden">
              {pieMode === "horario" ? "Ver por Frecuencia" : "Ver por Horario"}
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartDataPie} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                  {chartDataPie.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={pieMode === "frecuencia" ? (FRECUENCIA_COLORS[entry.name] || "#94a3b8") : HORARIO_COLORS[index % HORARIO_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CRM TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden print:border print:shadow-none print:break-before-page">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-4 items-center justify-between print:hidden">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-400"/> Lista de Gestión (CRM)
          </h3>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Buscar alumno..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <button onClick={resetFilters} className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-200">
              <Filter className="h-4 w-4"/> Limpiar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap print:text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold print:bg-gray-100 print:text-gray-800">
                <th className="p-4 border-b border-slate-100">Estatus CRM</th>
                <th className="p-4 border-b border-slate-100">Estudiante</th>
                <th className="p-4 border-b border-slate-100">Cédula</th>
                <th className="p-4 border-b border-slate-100">Categoría</th>
                <th className="p-4 border-b border-slate-100">Nivel</th>
                <th className="p-4 border-b border-slate-100">Frecuencia</th>
                <th className="p-4 border-b border-slate-100">Horario</th>
                <th className="p-4 border-b border-slate-100">Email</th>
                <th className="p-4 border-b border-slate-100 print:hidden">Contacto Directo</th>
                <th className="p-4 border-b border-slate-100">Teléfono</th>
                <th className="p-4 border-b border-slate-100 text-center print:hidden">Acción CRM</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filteredData.map((s) => {
                const crm = crmData[s.id] || { status: "Pendiente" };
                const isManaged = crm.status !== "Pendiente";
                const phoneClean = s.phone ? s.phone.replace(/\D/g, "") : "";

                return (
                  <tr key={s.id} className={`hover:bg-slate-50 ${isManaged ? 'bg-slate-50/50' : ''} print:border-b`}>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border print:border-none print:px-0 ${getCrmStatusColor(crm.status)}`}>
                        {crm.status}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-800">{s.name}</td>
                    <td className="p-4 text-slate-500 font-mono text-xs">{s.id}</td>
                    <td className="p-4 text-slate-600">{s.category}</td>
                    <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600 print:bg-transparent print:px-0">{s.levelNorm}</span></td>
                    <td className="p-4 text-slate-600">{s.frequencyNorm}</td>
                    <td className="p-4 text-slate-600">{s.scheduleBlock}</td>
                    <td className="p-4 text-slate-500">{s.email || "N/A"}</td>
                    <td className="p-4 flex items-center gap-2 print:hidden">
                      {s.phone ? (
                        <>
                          <a href={`https://wa.me/${phoneClean}`} target="_blank" rel="noreferrer" className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors" title="Escribir al WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </a>
                          <a href={`tel:${s.phone}`} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors" title="Llamada Telefónica">
                            <Phone className="h-4 w-4" />
                          </a>
                        </>
                      ) : <span className="text-xs text-slate-400">N/A</span>}
                    </td>
                    <td className="p-4 text-slate-600">{s.phone || "N/A"}</td>
                    <td className="p-4 text-center print:hidden">
                      <button onClick={() => setCrmModal({ isOpen: true, student: s })} className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 mx-auto transition-colors">
                        <Edit3 className="h-3 w-3"/> Gestionar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRM MODAL */}
      {crmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800">Gestionar Alumno</h3>
                <p className="text-xs text-slate-500">{crmModal.student.name} ({crmModal.student.id})</p>
              </div>
              <button onClick={() => setCrmModal({isOpen: false, student: null})} className="text-slate-400 hover:text-slate-600"><XCircle className="h-6 w-6"/></button>
            </div>
            
            <form onSubmit={saveCrmData} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Estatus del Rescate</label>
                <select name="status" defaultValue={crmData[crmModal.student.id]?.status || "Pendiente"} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
                  <option value="Pendiente">Pendiente (No contactado)</option>
                  <option value="En Gestión">En Gestión (Esperando respuesta)</option>
                  <option value="Rescatado">Rescatado (Se reinscribió)</option>
                  <option value="Pérdida Definitiva">Pérdida Definitiva</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Motivo Principal de Fuga</label>
                <select name="motive" defaultValue={crmData[crmModal.student.id]?.motive || ""} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
                  <option value="">Seleccione un motivo...</option>
                  <option value="Económico">Económico / Presupuesto</option>
                  <option value="Horario Incompatible">Horario Incompatible</option>
                  <option value="Viaje / Mudanza">Viaje / Mudanza</option>
                  <option value="Calidad Académica">Descontento Académico</option>
                  <option value="Salud">Salud / Motivos Personales</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Notas del Operador</label>
                <textarea name="notes" defaultValue={crmData[crmModal.student.id]?.notes || ""} placeholder="Detalles de la llamada..." rows="3" className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none"></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setCrmModal({isOpen: false, student: null})} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Guardar Gestión</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardContinuidad;
