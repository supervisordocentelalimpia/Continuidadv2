// src/App.jsx
import React, { useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
  Search, Users, Clock, AlertTriangle, Download, CheckCircle, XCircle, Filter, 
  Phone, Upload, RefreshCw, Trash2, MessageCircle, 
  UserPlus, TrendingUp, Edit3, Save, FileText, Printer, File
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

// Configuración de fuentes para pdfMake
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

      // Calcular horario con más fugas
      const byHorario = lost.reduce((acc, s) => { 
        if(s.scheduleBlock) acc[s.scheduleBlock] = (acc[s.scheduleBlock] || 0) + 1; 
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
        Estatus: crm.status || "Pendiente",
        Motivo: crm.motive || "",
        Notas: crm.notes || "",
        Cedula: s.id,
        Estudiante: s.name,
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
            status: row.Estatus || "Pendiente",
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
      content: [
        { text: 'Dashboard de Continuidad - Reporte Ejecutivo', style: 'header' },
        { text: `Fecha de emisión: ${new Date().toLocaleDateString()}`, style: 'subheader' },
        '\n',
        { text: '1. Resumen General Académico', style: 'sectionHeader' },
        { text: `En el presente análisis de continuidad, partiendo de una base de ${stats.eligibleOld} estudiantes regulares (excluyendo graduados), se logró la reinscripción de ${stats.reenrolled} alumnos. Esto representa una Tasa de Retención institucional del ${stats.reenrolledPct}%. Por otro lado, la tasa de deserción se ubica en el ${stats.lostPct}%, con un total de ${stats.lost} estudiantes no reinscritos.`, alignment: 'justify', margin: [0, 0, 0, 10] },
        { text: '2. Indicadores Críticos', style: 'sectionHeader' },
        {
          ul: [
            `Transición Generacional: ${stats.transiciones} alumnos promovidos exitosamente entre categorías (Niños a Jóvenes / Jóvenes a Adultos).`,
            `Densidad Promedio: ${stats.avgDensity} alumnos por salón activo en el periodo actual.`,
            `Comportamiento de Fuga: Se perdieron ${stats.nuevosLost} alumnos de nuevo ingreso (L01) frente a ${stats.regularesLost} alumnos regulares.`,
            `Horario Crítico: El bloque horario con mayor índice de fuga registrado fue "${stats.topHorarioFugas}".`,
            `Tasa de Rescate (Win-back): Se contactó a ${contactedCount} alumnos desertores, logrando recuperar a ${rescuedCount}, lo que representa una efectividad del ${winBackRate}%.`
          ],
          margin: [0, 0, 0, 15]
        },
        { text: '3. Tabla de Gestión Prioritaria (Muestra)', style: 'sectionHeader' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto'],
            body: [
              [{ text: 'Estatus', bold: true }, { text: 'Estudiante', bold: true }, { text: 'Nivel', bold: true }, { text: 'Teléfono', bold: true }],
              ...dropouts.slice(0, 20).map(s => {
                const crm = crmData[s.id] || { status: 'Pendiente' };
                return [crm.status, s.name, s.levelNorm, s.phone || 'N/A'];
              })
            ]
          }
        }
      ],
      styles: {
        header: { fontSize: 18, bold: true, color: '#1e293b' },
        subheader: { fontSize: 12, italics: true, color: '#64748b', marginBottom: 15 },
        sectionHeader: { fontSize: 14, bold: true, color: '#334155', marginBottom: 5 }
      }
    };
    pdfMake.createPdf(docDefinition).download(`Reporte_Continuidad_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const generateWordReport = async () => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: "Dashboard de Continuidad - Reporte Ejecutivo", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Fecha: ${new Date().toLocaleDateString()}` }),
          new Paragraph({ text: " " }),
          new Paragraph({ text: "1. Resumen General Académico", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: `Base de estudiantes: ${stats.eligibleOld}` }),
          new Paragraph({ text: `Total Reinscritos: ${stats.reenrolled} (${stats.reenrolledPct}%)` }),
          new Paragraph({ text: `Total Pérdida: ${stats.lost} (${stats.lostPct}%)` }),
          new Paragraph({ text: " " }),
          new Paragraph({ text: "2. Indicadores Críticos", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: `Transición Generacional: ${stats.transiciones} alumnos promovidos.` }),
          new Paragraph({ text: `Densidad Promedio: ${stats.avgDensity} alumnos por salón.` }),
          new Paragraph({ text: `Fuga de Nuevos (L01): ${stats.nuevosLost} alumnos.` }),
          new Paragraph({ text: `Fuga de Regulares: ${stats.regularesLost} alumnos.` }),
          new Paragraph({ text: `Horario con más fugas: ${stats.topHorarioFugas}` }),
          new Paragraph({ text: `Tasa de Éxito en Rescate: ${winBackRate}% (${rescuedCount} de ${contactedCount} contactados)` })
        ]
      }]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Reporte_Continuidad_${new Date().toISOString().slice(0, 10)}.docx`);
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
    return Object.keys(byKey).map((k) => ({ name: k, value: byKey
