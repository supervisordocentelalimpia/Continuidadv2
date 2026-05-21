// src/App.jsx
import React, { useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import * as Docx from "docx";
import { saveAs } from "file-saver";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Search, Users, Clock, AlertTriangle, Download, CheckCircle, XCircle, Filter, 
  Phone, Upload, RefreshCw, Trash2, MessageCircle, 
  UserPlus, TrendingUp, Edit3, Save, FileText, Printer, FileUp, File, GraduationCap, ArrowRight
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

if (pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
}

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

// Lógica inteligente para detectar graduados
const isGraduated = (student) => {
  if (!student || !student.levelNorm) return false;
  const lvl = parseInt(student.levelNorm.replace(/\D/g, "")) || 0;
  const cat = student.category || "";
  if (cat === "Adultos" && lvl >= 20) return true;
  if ((cat === "Niños" || cat === "Jóvenes") && lvl >= 18) return true;
  if (student.levelNorm.toUpperCase() === "L19" || student.levelNorm.toUpperCase() === "L20") return true; // Fallback
  return false;
};

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

export default function DashboardContinuidad() {
  const [activeTab, setActiveTab] = useState("upload");
  
  const [pdfOldFiles, setPdfOldFiles] = useState([]);
  const [pdfNewFiles, setPdfNewFiles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");

  // Listas de datos procesados
  const [oldStudents, setOldStudents] = useState([]);
  const [newStudents, setNewStudents] = useState([]);
  const [dropouts, setDropouts] = useState([]);
  const [nuevosL1List, setNuevosL1List] = useState([]);
  const [nivelacionList, setNivelacionList] = useState([]);
  const [freqChangersList, setFreqChangersList] = useState([]);
  const [graduadosList, setGraduadosList] = useState([]);
  const [transNinosJovenesList, setTransNinosJovenesList] = useState([]);
  const [transJovenesAdultosList, setTransJovenesAdultosList] = useState([]);

  const [crmData, setCrmData] = useState({});
  const [crmModal, setCrmModal] = useState({ isOpen: false, student: null });

  // Vistas de la tabla
  const [tableView, setTableView] = useState("desercion"); // desercion | nuevosL1 | nivelacion | cambios | graduados | transNinosJovenes | transJovenesAdultos
  const [filterFugaType, setFilterFugaType] = useState("All"); 

  const [stats, setStats] = useState({
    eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0,
    nuevosLost: 0, regularesLost: 0, transNinosJovenes: 0, transJovenesAdultos: 0, 
    avgDensity: 0, topHorarioFugas: "N/A", graduados: 0, nuevosL1: 0, nivelacion: 0, cambiosFreq: 0
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
    setNuevosL1List([]); setNivelacionList([]); setFreqChangersList([]); 
    setGraduadosList([]); setTransNinosJovenesList([]); setTransJovenesAdultosList([]);
    setCrmData({}); 
    setSearchTerm(""); setSelectedCategory("All"); setSelectedFrecuencia("All");
    setSelectedLevel("All"); setSelectedHorario("All"); setLevelChartCategory("All"); setPieMode("horario");
    setTableView("desercion"); setFilterFugaType("All");
    setStats({ eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0, nuevosLost: 0, regularesLost: 0, transNinosJovenes: 0, transJovenesAdultos: 0, avgDensity: 0, topHorarioFugas: "N/A", graduados: 0, nuevosL1: 0, nivelacion: 0, cambiosFreq: 0 });
    setErrorMsg(""); setWarnMsg(""); setActiveTab("upload");
  };

  const resetFilters = () => {
    setSearchTerm(""); setSelectedCategory("All"); setSelectedFrecuencia("All"); setSelectedLevel("All"); setSelectedHorario("All"); setLevelChartCategory("All"); setFilterFugaType("All");
  };

  const processPdfs = async () => {
    setErrorMsg(""); setWarnMsg("");
    if (!pdfOldFiles.length || !pdfNewFiles.length) {
      setErrorMsg("Selecciona al menos 1 PDF ANTERIOR y 1 PDF ACTUAL."); return;
    }

    try {
      setLoading(true);
      const [{ all: oldAll, failed: failedOld }, { all: newAll, failed: failedNew }] =
        await Promise.all([parseMany(pdfOldFiles), parseMany(pdfNewFiles)]);

      const oldU = uniqByIdPreferLatest(oldAll);
      const newU = uniqByIdPreferLatest(newAll);

      const oldIds = new Set(oldU.map((s) => s.id));
      const newIds = new Set(newU.map((s) => s.id));

      const grads = oldU.filter(isGraduated);
      const eligibleOld = oldU.filter((s) => !isGraduated(s));

      const reenrolled = eligibleOld.filter((s) => newIds.has(s.id));
      const lost = eligibleOld.filter((s) => !newIds.has(s.id));

      const reenrolledPct = eligibleOld.length ? Math.round((reenrolled.length / eligibleOld.length) * 100) : 0;
      const lostPct = eligibleOld.length ? Math.round((lost.length / eligibleOld.length) * 100) : 0;

      const nuevosLost = lost.filter(s => s.levelNorm === "L01").length;
      const regularesLost = lost.length - nuevosLost;

      const transNinosJovenesArr = [];
      const transJovenesAdultosArr = [];
      const freqChangersArr = [];

      reenrolled.forEach(newS => {
        const oldS = oldU.find(o => o.id === newS.id);
        if (oldS) {
          if (oldS.category === "Niños" && (newS.category === "Jóvenes" || newS.category === "JÓVENES")) transNinosJovenesArr.push({...newS, oldCategory: oldS.category});
          if ((oldS.category === "Jóvenes" || oldS.category === "JÓVENES") && newS.category === "Adultos") transJovenesAdultosArr.push({...newS, oldCategory: oldS.category});
          if (oldS.frequencyNorm !== newS.frequencyNorm && oldS.frequencyNorm !== "N/A" && newS.frequencyNorm !== "N/A") {
            freqChangersArr.push({...newS, oldFrequency: oldS.frequencyNorm});
          }
        }
      });

      const newStudentsArr = newU.filter(s => !oldIds.has(s.id));
      const nuevosL1Arr = newStudentsArr.filter(s => s.levelNorm === "L01");
      const nivelacionArr = newStudentsArr.filter(s => s.levelNorm !== "L01");

      const activeCourses = new Set(newU.filter(s => s.courseId).map(s => s.courseId));
      const avgDensity = activeCourses.size > 0 ? (newU.length / activeCourses.size).toFixed(1) : 0;

      const byHorario = lost.reduce((acc, s) => { 
        if(s.scheduleBlock && s.scheduleBlock !== "N/A") acc[s.scheduleBlock] = (acc[s.scheduleBlock] || 0) + 1; 
        return acc; 
      }, {});
      const topHorarioFugas = Object.entries(byHorario).sort((a,b) => b[1]-a[1])[0]?.[0] || "N/A";

      setOldStudents(oldU); setNewStudents(newU); setDropouts(lost); setCrmData({});
      setNuevosL1List(nuevosL1Arr); setNivelacionList(nivelacionArr); setFreqChangersList(freqChangersArr);
      setGraduadosList(grads); setTransNinosJovenesList(transNinosJovenesArr); setTransJovenesAdultosList(transJovenesAdultosArr);
      
      setStats({ 
        eligibleOld: eligibleOld.length, reenrolled: reenrolled.length, reenrolledPct, lost: lost.length, lostPct, 
        nuevosLost, regularesLost, transNinosJovenes: transNinosJovenesArr.length, transJovenesAdultos: transJovenesAdultosArr.length, avgDensity, topHorarioFugas,
        graduados: grads.length, nuevosL1: nuevosL1Arr.length, nivelacion: nivelacionArr.length, cambiosFreq: freqChangersArr.length
      });

      resetFilters();
      setTableView("desercion");
      
      const allFailed = [...(failedOld || []), ...(failedNew || [])];
      if (allFailed.length) setWarnMsg(`Archivos no procesados (posibles escaneos): ${allFailed.join(", ")}`);
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

  const onClickPie = (data) => {
    const name = data?.name || data?.payload?.name;
    if (!name) return;
    setTableView("desercion");
    if (pieMode === "horario") setSelectedHorario(name);
    else setSelectedFrecuencia(name);
  };

  /* =========================
     IMPORTAR / EXPORTAR DATOS
     ========================= */
  const exportExcel = () => {
    if (!filteredData.length) return;
    const rows = filteredData.map((s) => {
      const crm = crmData[s.id] || {};
      const baseRow = {
        Cedula: s.id,
        Estudiante: s.name,
        Categoria: s.category,
        Nivel: s.levelNorm,
        Frecuencia: s.frequencyNorm || "N/A",
        Horario: s.scheduleBlock,
        Email: s.email || "",
        Telefono: s.phone || "",
      };

      if (tableView === "desercion") {
        return { ...baseRow, "Estatus CRM": crm.status || "Pendiente", Motivo: crm.motive || "", Notas: crm.notes || "" };
      } else if (tableView === "cambios") {
        return { ...baseRow, "Frecuencia Anterior": s.oldFrequency || "N/A" };
      } else if (tableView === "transNinosJovenes" || tableView === "transJovenesAdultos") {
        return { ...baseRow, "Categoría Anterior": s.oldCategory || "N/A" };
      } else {
        return baseRow;
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos Continuidad");
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
        if(row.Cedula && row["Estatus CRM"]) {
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
    // ... (El reporte PDF se mantiene igual, adaptando las variables nuevas si se desea)
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
                { text: `${stats.transNinosJovenes + stats.transJovenesAdultos} Promovidos`, style: 'kpiValue' },
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
            { text: `Nuevos Movimientos: ${stats.graduados} Graduados, ${stats.nuevosL1} Ingresos L1, ${stats.nivelacion} Nivelaciones y ${stats.cambiosFreq} Cambios de Frecuencia.`, margin: [0, 0, 0, 5] },
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
          new Docx.Paragraph({ text: `En el presente análisis de continuity, partiendo de una base de ${stats.eligibleOld} estudiantes regulares, se logró la reinscripción de ${stats.reenrolled} alumnos. Esto representa una Tasa de Retención Institucional del ${stats.reenrolledPct}%. Por otro lado, la tasa de deserción se ubica en el ${stats.lostPct}%, con un total de ${stats.lost} estudiantes perdidos.` }),
          new Docx.Paragraph({ text: " " }),
          new Docx.Paragraph({ text: "2. Indicadores Clave de Rendimiento (KPIs)", heading: Docx.HeadingLevel.HEADING_3 }),
          new Docx.Paragraph({ text: `• Transición Generacional: ${stats.transNinosJovenes + stats.transJovenesAdultos} alumnos promovidos exitosamente entre categorías.` }),
          new Docx.Paragraph({ text: `• Movimientos: ${stats.graduados} Graduados, ${stats.nuevosL1} Ingresos L1, ${stats.nivelacion} Nivelaciones.` }),
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
  const getActiveArray = () => {
    switch (tableView) {
      case "desercion": return dropouts;
      case "nuevosL1": return nuevosL1List;
      case "nivelacion": return nivelacionList;
      case "cambios": return freqChangersList;
      case "graduados": return graduadosList;
      case "transNinosJovenes": return transNinosJovenesList;
      case "transJovenesAdultos": return transJovenesAdultosList;
      default: return dropouts;
    }
  };

  const filterOptions = useMemo(() => {
    const activeArr = getActiveArray();
    const cats = Array.from(new Set(activeArr.map((s) => s.category).filter(Boolean))).sort();
    const lvls = Array.from(new Set(activeArr.map((s) => s.levelNorm).filter(Boolean))).sort();
    const hrs = Array.from(new Set(activeArr.map((s) => s.scheduleBlock).filter(Boolean)));
    const freqs = Array.from(new Set(activeArr.map((s) => s.frequencyNorm).filter(Boolean)));
    const known = __HORARIO_BLOQUES__ || [];
    const knownSet = new Set(known);
    return {
      categories: ["All", ...cats],
      levels: ["All", ...lvls],
      horarios: ["All", ...known.filter(h => hrs.includes(h)), ...hrs.filter(h => !knownSet.has(h)).sort()],
      frecuencias: ["All", ...FRECUENCIA_ORDER.filter(f => freqs.includes(f)), ...freqs.filter(f => !FRECUENCIA_ORDER.includes(f)).sort()],
    };
  }, [dropouts, nuevosL1List, nivelacionList, freqChangersList, graduadosList, transNinosJovenesList, transJovenesAdultosList, tableView]);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const sourceData = getActiveArray();

    return sourceData.filter((s) => {
      const matchesSearch = !q || (s.name || "").toLowerCase().includes(q) || (s.id || "").includes(q) || (s.email || "").toLowerCase().includes(q) || (s.phone || "").includes(q);
      const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
      const matchesFrecuencia = selectedFrecuencia === "All" || s.frequencyNorm === selectedFrecuencia;
      const matchesLevel = selectedLevel === "All" || s.levelNorm === selectedLevel;
      const matchesHorario = selectedHorario === "All" || s.scheduleBlock === selectedHorario;
      
      let matchesFugaType = true;
      if (tableView === "desercion") {
          if (filterFugaType === "Nuevos" && s.levelNorm !== "L01") matchesFugaType = false;
          if (filterFugaType === "Regulares" && s.levelNorm === "L01") matchesFugaType = false;
      }

      return matchesSearch && matchesCategory && matchesFrecuencia && matchesLevel && matchesHorario && matchesFugaType;
    });
  }, [dropouts, nuevosL1List, nivelacionList, freqChangersList, graduadosList, transNinosJovenesList, transJovenesAdultosList, tableView, searchTerm, selectedCategory, selectedFrecuencia, selectedLevel, selectedHorario, filterFugaType]);

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

  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" /> Dashboard de Continuidad - Carga de Datos
          </h1>
          <p className="text-slate-500 text-sm mt-1">Sube las listas del periodo anterior y actual.</p>
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
                    <button type="button" onClick={() => removeOldAt(idx)} className="text-slate-500 hover:text-red-600 inline-flex items-center">
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
                    <button type="button" onClick={() => removeNewAt(idx)} className="text-slate-500 hover:text-red-600 inline-flex items-center">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={processPdfs} disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {loading ? "Procesando..." : "Analizar Continuidad"}
          </button>
        </div>
      </div>
    );
  }
}
