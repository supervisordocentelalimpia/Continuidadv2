import React, { useMemo, useState, useRef } from "react";
import React, { useMemo, useState } from "react";
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
  UserPlus, TrendingUp, Edit3
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

// Configuración de fuentes para pdfMake
if (pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
}

/* =========================
   COLORES Y CONSTANTES
   ========================= */
@@ -158,7 +149,6 @@ const uniqByIdPreferLatest = (arr) => {
   ========================= */
const DashboardContinuidad = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const fileInputRef = useRef(null);

  const [pdfOldFiles, setPdfOldFiles] = useState([]);
  const [pdfNewFiles, setPdfNewFiles] = useState([]);
@@ -171,12 +161,13 @@ const DashboardContinuidad = () => {
  const [newStudents, setNewStudents] = useState([]);
  const [dropouts, setDropouts] = useState([]);

  const [crmData, setCrmData] = useState({});
  // ESTADO DEL MINI-CRM
  const [crmData, setCrmData] = useState({}); // { id: { status, motive, notes } }
  const [crmModal, setCrmModal] = useState({ isOpen: false, student: null });

  const [stats, setStats] = useState({
    eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0,
    nuevosLost: 0, regularesLost: 0, transiciones: 0, avgDensity: 0, topHorarioFugas: "N/A"
    nuevosLost: 0, regularesLost: 0, transiciones: 0, avgDensity: 0
  });

  const [searchTerm, setSearchTerm] = useState("");
@@ -201,7 +192,7 @@ const DashboardContinuidad = () => {
    setPdfOldFiles([]); setPdfNewFiles([]); setOldStudents([]); setNewStudents([]); setDropouts([]);
    setCrmData({}); setSearchTerm(""); setSelectedCategory("All"); setSelectedFrecuencia("All");
    setSelectedLevel("All"); setSelectedHorario("All"); setLevelChartCategory("All"); setPieMode("horario");
    setStats({ eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0, nuevosLost: 0, regularesLost: 0, transiciones: 0, avgDensity: 0, topHorarioFugas: "N/A" });
    setStats({ eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0, nuevosLost: 0, regularesLost: 0, transiciones: 0, avgDensity: 0 });
    setErrorMsg(""); setWarnMsg(""); setActiveTab("upload");
  };

@@ -245,15 +236,8 @@ const DashboardContinuidad = () => {
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
      setStats({ eligibleOld: eligibleOld.length, reenrolled: reenrolled.length, reenrolledPct, lost: lost.length, lostPct, nuevosLost, regularesLost, transiciones, avgDensity });
      resetFilters();

      const allFailed = [...(failedOld || []), ...(failedNew || [])];
@@ -293,136 +277,6 @@ const DashboardContinuidad = () => {
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
@@ -462,4 +316,368 @@ const DashboardContinuidad = () => {
      const key = pieMode === "horario" ? (s.scheduleBlock || "N/A") : (s.frequencyNorm || "N/A");
      acc[key] = (acc[key] || 0) + 1; return acc;
    }, {});
    return Object.keys(byKey).map((k) => ({ name: k, value: byKey
    return Object.keys(byKey).map((k) => ({ name: k, value: byKey[k] })).sort((a, b) => b.value - a.value);
  }, [dropouts, pieMode]);

  const exportExcel = () => {
    if (!filteredData.length) return;
    const rows = filteredData.map((s) => {
      const crm = crmData[s.id] || {};
      return {
        Estatus: crm.status || "Pendiente",
        Motivo: crm.motive || "N/A",
        Notas: crm.notes || "",
        Cedula: s.id,
        Estudiante: s.name,
        Categoria: s.category,
        Frecuencia: s.frequencyNorm || "N/A",
        Nivel: s.levelNorm,
        Horario: s.scheduleBlock,
        Email: s.email || "",
        Telefono: s.phone || "",
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gestión Continuidad");
    XLSX.writeFile(wb, `continuidad_gestion_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* =========================
     RENDER: UPLOAD VIEW
     ========================= */
  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" /> Continuidad - Cargar PDFs
          </h1>
          <p className="text-slate-500 text-sm mt-1">Sube las listas del periodo anterior y actual. Puedes seleccionar varios archivos a la vez.</p>
        </header>

        {errorMsg && <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">{errorMsg}</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* CARGA ANTERIOR */}
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

          {/* CARGA ACTUAL */}
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
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800 relative">
      
      {/* HEADER CONTROLS */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" /> Inteligencia Académica
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-sm">
            <span className="bg-slate-100 px-3 py-1 rounded-md font-medium">Base: {stats.eligibleOld}</span>
            <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-md font-bold">Retención: {stats.reenrolledPct}%</span>
            <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-md font-bold">Deserción: {stats.lostPct}%</span>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setActiveTab("upload")} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm text-sm font-medium">
            <Upload className="h-4 w-4" /> Cambiar PDFs
          </button>
          <button onClick={exportExcel} disabled={!filteredData.length} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow text-sm font-medium">
            <Download className="h-4 w-4" /> Exportar Gestión
          </button>
        </div>
      </header>

      {/* NEW ADVANCED METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        
        {/* Densidad */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Densidad Promedio</p>
            <Users className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">{stats.avgDensity}</h3>
            <p className="text-xs text-slate-400 font-medium">Alumnos por salón (Actual)</p>
          </div>
        </div>

        {/* Transición Generacional */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Transición Categorías</p>
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">{stats.transiciones}</h3>
            <p className="text-xs text-slate-400 font-medium">Promociones a Joven/Adulto</p>
          </div>
        </div>

        {/* Nuevos vs Regulares */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Fuga: Nuevos vs Regulares</p>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div>
              <span className="text-2xl font-black text-rose-600">{stats.nuevosLost}</span>
              <span className="text-xs text-slate-500 ml-1">L01</span>
            </div>
            <div className="text-slate-300 pb-1">|</div>
            <div>
              <span className="text-2xl font-black text-slate-700">{stats.regularesLost}</span>
              <span className="text-xs text-slate-500 ml-1">Regulares</span>
            </div>
          </div>
        </div>

        {/* Win-back Rate */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-b-4 border-b-blue-500 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">Tasa Éxito Rescate</p>
            <CheckCircle className="h-5 w-5 text-blue-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-3xl font-black text-blue-600">{winBackRate}%</h3>
            <p className="text-xs text-slate-400 font-medium">{rescuedCount} de {contactedCount} contactados</p>
          </div>
        </div>
      </div>

      {/* CHARTS (Bar and Pie) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Volumen de Deserción por Nivel</h3>
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">Fuga por {pieMode === "horario" ? "Horario" : "Frecuencia"}</h3>
            <button onClick={() => setPieMode(prev => prev === "horario" ? "frecuencia" : "horario")} className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">Cambiar Vista</button>
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-4 items-center justify-between">
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
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="p-4 border-b border-slate-100">Estatus CRM</th>
                <th className="p-4 border-b border-slate-100">Estudiante</th>
                <th className="p-4 border-b border-slate-100">Categoría</th>
                <th className="p-4 border-b border-slate-100">Nivel</th>
                <th className="p-4 border-b border-slate-100">Contacto Directo</th>
                <th className="p-4 border-b border-slate-100 text-center">Acción CRM</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {filteredData.map((s) => {
                const crm = crmData[s.id] || { status: "Pendiente" };
                const isManaged = crm.status !== "Pendiente";
                const phoneClean = s.phone ? s.phone.replace(/\D/g, "") : "";

                return (
                  <tr key={s.id} className={`hover:bg-slate-50 ${isManaged ? 'bg-slate-50/50' : ''}`}>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getCrmStatusColor(crm.status)}`}>
                        {crm.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.id}</p>
                    </td>
                    <td className="p-4 text-slate-600">{s.category}</td>
                    <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">{s.levelNorm}</span></td>
                    <td className="p-4 flex items-center gap-2">
                      {s.phone ? (
                        <>
                          <a href={`https://wa.me/${phoneClean}`} target="_blank" rel="noreferrer" className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors" title="Escribir al WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </a>
                          <a href={`tel:${s.phone}`} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors" title="Llamada Telefónica">
                            <Phone className="h-4 w-4" />
                          </a>
                        </>
                      ) : <span className="text-xs text-slate-400">Sin teléfono</span>}
                    </td>
                    <td className="p-4 text-center">
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
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
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
