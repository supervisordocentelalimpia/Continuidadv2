// src/App.jsx

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import {
  Search,
  Users,
  Clock,
  AlertTriangle,
  Download,
  CheckCircle,
  XCircle,
  Filter,
  Phone,
  Upload,
  RefreshCw,
  Trash2,
  MessageCircle,
  UserPlus,
  TrendingUp,
  Edit3,
  FileSpreadsheet,
  FileText,
  Printer,
  Save,
  FolderOpen,
  BarChart3,
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

pdfMake.vfs = pdfFonts.pdfMake.vfs;

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
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#0ea5e9",
  "#f43f5e",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#64748b",
];

const isGraduated = (student) =>
  (student?.levelNorm || "").toUpperCase() === "L19";

/* =========================
   UTILIDADES DE ARCHIVOS
   ========================= */

const FRECUENCIA_ORDER = [
  "MARTES Y JUEVES",
  "MIERCOLES Y VIERNES",
  "LUNES",
  "SABATINO",
  "INTENSIVO A",
  "INTENSIVO B",
  "INTENSIVO",
  "N/A",
];

const fileKey = (f) => `${f.name}__${f.size}__${f.lastModified}`;

const normalizeFrecuenciaBase = (scheduleRaw = "") => {
  if (!scheduleRaw) return "N/A";

  const left = scheduleRaw.includes("/")
    ? scheduleRaw.split("/")[0].trim()
    : scheduleRaw.trim();

  const up = left
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "Y")
    .trim();

  if (!up) return "N/A";

  if (up.includes("MARTES") && up.includes("JUEVES"))
    return "MARTES Y JUEVES";

  if (
    (up.includes("MIERCOLES") || up.includes("MIÉRCOLES")) &&
    up.includes("VIERNES")
  )
    return "MIERCOLES Y VIERNES";

  if (
    up.includes("SABADO") ||
    up.includes("SÁBADO") ||
    up.includes("SABAT")
  )
    return "SABATINO";

  if (up.includes("LUNES")) return "LUNES";

  if (up.includes("TUESDAY") && up.includes("THURSDAY"))
    return "MARTES Y JUEVES";

  if (up.includes("WEDNESDAY") && up.includes("FRIDAY"))
    return "MIERCOLES Y VIERNES";

  if (up.includes("SATURDAY")) return "SABATINO";

  if (up.includes("MONDAY") && !up.includes("TO")) return "LUNES";

  if (up.includes(" TO ") || /\sA\s/.test(up)) return "INTENSIVO";

  return left || "N/A";
};

const extractDateKeyFromName = (name = "") => {
  const up = (name || "").toUpperCase();

  let m = up.match(/(20\d{2})[\/_\-](\d{1,2})[\/_\-](\d{1,2})/);

  if (m)
    return (
      parseInt(m[1], 10) * 10000 +
      parseInt(m[2], 10) * 100 +
      parseInt(m[3], 10)
    );

  m = up.match(/(^|[^0-9])(\d{1,2})[\/_\-](\d{1,2})([^0-9]|$)/);

  if (m) return parseInt(m[3], 10) * 100 + parseInt(m[2], 10);

  return null;
};

const sortFilesSmart = (files = []) => {
  const meta = files.map((f, idx) => {
    const dk = extractDateKeyFromName(f.name);

    return {
      f,
      idx,
      hasDate: dk !== null,
      dk: dk ?? Number.POSITIVE_INFINITY,
      name: (f.name || "").toUpperCase(),
    };
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

  return (
    up.includes("INTENS") ||
    up.includes("_INT_") ||
    up.includes(" INT ") ||
    up.includes("TUESDAY TO FRIDAY") ||
    up.includes("MARTES A VIERNES")
  );
};

const buildIntensivoLabelMap = (filesOrdered = []) => {
  const intensivo = filesOrdered.filter((f) =>
    isIntensivoFileHint(f.name)
  );

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

      const freq =
        base === "INTENSIVO"
          ? intensivoLabelByFile.get(fk) || "INTENSIVO"
          : base;

      all.push({
        ...s,
        frequencyRaw: s.schedule || "",
        frequencyNorm: freq,
        __fileRank: rank,
        __fileName: f.name,
      });
    }
  }

  if (!all.length) {
    throw new Error(
      "No se pudo extraer alumnos de los PDFs seleccionados."
    );
  }

  return { all, failed };
};

const uniqByIdPreferLatest = (arr) => {
  const map = new Map();

  for (const s of arr) {
    if (!s?.id) continue;

    const prev = map.get(s.id);

    if (!prev) {
      map.set(s.id, s);
      continue;
    }

    const rPrev = Number.isFinite(prev.__fileRank)
      ? prev.__fileRank
      : -1;

    const rNow = Number.isFinite(s.__fileRank)
      ? s.__fileRank
      : -1;

    if (rNow >= rPrev) map.set(s.id, s);
  }

  return Array.from(map.values());
};

/* =========================
   COMPONENTE PRINCIPAL
   ========================= */

const DashboardContinuidad = () => {
  const dashboardRef = useRef(null);

  const [activeTab, setActiveTab] = useState("upload");

  const [pdfOldFiles, setPdfOldFiles] = useState([]);
  const [pdfNewFiles, setPdfNewFiles] = useState([]);

  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");

  const [oldStudents, setOldStudents] = useState([]);
  const [newStudents, setNewStudents] = useState([]);
  const [dropouts, setDropouts] = useState([]);

  const [crmData, setCrmData] = useState({});

  const [crmModal, setCrmModal] = useState({
    isOpen: false,
    student: null,
  });

  const [stats, setStats] = useState({
    eligibleOld: 0,
    reenrolled: 0,
    reenrolledPct: 0,
    lost: 0,
    lostPct: 0,
    nuevosLost: 0,
    regularesLost: 0,
    transiciones: 0,
    avgDensity: 0,
    worstSchedule: "N/A",
    worstScheduleCount: 0,
  });

  const [searchTerm, setSearchTerm] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("All");

  const [selectedFrecuencia, setSelectedFrecuencia] =
    useState("All");

  const [selectedLevel, setSelectedLevel] = useState("All");

  const [selectedHorario, setSelectedHorario] =
    useState("All");

  const [levelChartCategory, setLevelChartCategory] =
    useState("All");

  const [pieMode, setPieMode] = useState("horario");

  const mergeFiles = (prev, incoming) => {
    const map = new Map(prev.map((f) => [fileKey(f), f]));

    for (const f of incoming) map.set(fileKey(f), f);

    return Array.from(map.values());
  };

  const removeOldAt = (idx) =>
    setPdfOldFiles((prev) => prev.filter((_, i) => i !== idx));

  const removeNewAt = (idx) =>
    setPdfNewFiles((prev) => prev.filter((_, i) => i !== idx));

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedFrecuencia("All");
    setSelectedLevel("All");
    setSelectedHorario("All");
    setLevelChartCategory("All");
  };

  const processPdfs = async () => {
    setErrorMsg("");
    setWarnMsg("");

    if (!pdfOldFiles.length || !pdfNewFiles.length) {
      setErrorMsg(
        "Debes seleccionar al menos 1 PDF ANTERIOR y 1 PDF ACTUAL."
      );
      return;
    }

    try {
      setLoading(true);

      const [
        { all: oldAll, failed: failedOld },
        { all: newAll, failed: failedNew },
      ] = await Promise.all([
        parseMany(pdfOldFiles),
        parseMany(pdfNewFiles),
      ]);

      const oldU = uniqByIdPreferLatest(oldAll);
      const newU = uniqByIdPreferLatest(newAll);

      const newIds = new Set(newU.map((s) => s.id));

      const eligibleOld = oldU.filter((s) => !isGraduated(s));

      const reenrolled = eligibleOld.filter((s) =>
        newIds.has(s.id)
      );

      const lost = eligibleOld.filter(
        (s) => !newIds.has(s.id)
      );

      const reenrolledPct = eligibleOld.length
        ? Math.round(
            (reenrolled.length / eligibleOld.length) * 100
          )
        : 0;

      const lostPct = eligibleOld.length
        ? Math.round((lost.length / eligibleOld.length) * 100)
        : 0;

      const nuevosLost = lost.filter(
        (s) => s.levelNorm === "L01"
      ).length;

      const regularesLost = lost.length - nuevosLost;

      let transiciones = 0;

      reenrolled.forEach((newS) => {
        const oldS = oldU.find((o) => o.id === newS.id);

        if (
          oldS &&
          oldS.category !== newS.category &&
          oldS.category !== "Otra" &&
          newS.category !== "Otra"
        ) {
          transiciones++;
        }
      });

      const activeCourses = new Set(
        newU.filter((s) => s.courseId).map((s) => s.courseId)
      );

      const avgDensity =
        activeCourses.size > 0
          ? (newU.length / activeCourses.size).toFixed(1)
          : 0;

      const horarioMap = {};

      lost.forEach((s) => {
        const key = s.scheduleBlock || "N/A";
        horarioMap[key] = (horarioMap[key] || 0) + 1;
      });

      let worstSchedule = "N/A";
      let worstScheduleCount = 0;

      Object.entries(horarioMap).forEach(([k, v]) => {
        if (v > worstScheduleCount) {
          worstSchedule = k;
          worstScheduleCount = v;
        }
      });

      setOldStudents(oldU);
      setNewStudents(newU);
      setDropouts(lost);
      setCrmData({});

      setStats({
        eligibleOld: eligibleOld.length,
        reenrolled: reenrolled.length,
        reenrolledPct,
        lost: lost.length,
        lostPct,
        nuevosLost,
        regularesLost,
        transiciones,
        avgDensity,
        worstSchedule,
        worstScheduleCount,
      });

      resetFilters();

      const allFailed = [
        ...(failedOld || []),
        ...(failedNew || []),
      ];

      if (allFailed.length) {
        setWarnMsg(
          `No pude leer ${allFailed.length} PDF(s): ${allFailed.join(
            ", "
          )}`
        );
      }

      setActiveTab("dashboard");
    } catch (e) {
      setErrorMsg(e?.message || "Error procesando PDFs.");
    } finally {
      setLoading(false);
    }
  };

  const contactedCount = Object.values(crmData).filter(
    (c) => c.status && c.status !== "Pendiente"
  ).length;

  const rescuedCount = Object.values(crmData).filter(
    (c) => c.status === "Rescatado"
  ).length;

  const winBackRate =
    contactedCount > 0
      ? Math.round((rescuedCount / contactedCount) * 100)
      : 0;

  const saveCrmData = (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);

    setCrmData((prev) => ({
      ...prev,
      [crmModal.student.id]: {
        status: formData.get("status"),
        motive: formData.get("motive"),
        notes: formData.get("notes"),
      },
    }));

    setCrmModal({
      isOpen: false,
      student: null,
    });
  };

  const getCrmStatusColor = (status) => {
    switch (status) {
      case "Rescatado":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";

      case "En Gestión":
        return "bg-blue-100 text-blue-800 border-blue-200";

      case "Pérdida Definitiva":
        return "bg-red-100 text-red-800 border-red-200";

      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return dropouts.filter((s) => {
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.id || "").includes(q);

      const matchesCategory =
        selectedCategory === "All" ||
        s.category === selectedCategory;

      const matchesFrecuencia =
        selectedFrecuencia === "All" ||
        s.frequencyNorm === selectedFrecuencia;

      const matchesLevel =
        selectedLevel === "All" ||
        s.levelNorm === selectedLevel;

      const matchesHorario =
        selectedHorario === "All" ||
        s.scheduleBlock === selectedHorario;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesFrecuencia &&
        matchesLevel &&
        matchesHorario
      );
    });
  }, [
    dropouts,
    searchTerm,
    selectedCategory,
    selectedFrecuencia,
    selectedLevel,
    selectedHorario,
  ]);

  const chartDataLevel = useMemo(() => {
    const byLevel = barSource.reduce((acc, s) => {
      const k = s.levelNorm || "N/A";

      acc[k] = (acc[k] || 0) + 1;

      return acc;
    }, {});

    return Object.keys(byLevel)
      .map((k) => ({
        name: k,
        count: byLevel[k],
      }))
      .sort(
        (a, b) =>
          (parseInt(a.name.replace(/\D/g, "")) || 0) -
          (parseInt(b.name.replace(/\D/g, "")) || 0)
      );
  }, []);

  const barSource = useMemo(
    () =>
      levelChartCategory === "All"
        ? dropouts
        : dropouts.filter(
            (s) => s.category === levelChartCategory
          ),
    [dropouts, levelChartCategory]
  );

  const chartDataPie = useMemo(() => {
    const byKey = dropouts.reduce((acc, s) => {
      const key =
        pieMode === "horario"
          ? s.scheduleBlock || "N/A"
          : s.frequencyNorm || "N/A";

      acc[key] = (acc[key] || 0) + 1;

      return acc;
    }, {});

    return Object.keys(byKey)
      .map((k) => ({
        name: k,
        value: byKey[k],
      }))
      .sort((a, b) => b.value - a.value);
  }, [dropouts, pieMode]);

  /* =========================
     EXPORTAR / IMPORTAR
     ========================= */

  const buildRows = () => {
    return filteredData.map((s) => {
      const crm = crmData[s.id] || {};

      return {
        ESTATUS_CRM: crm.status || "Pendiente",
        MOTIVO: crm.motive || "",
        NOTAS: crm.notes || "",
        ESTUDIANTE: s.name,
        CEDULA: s.id,
        CATEGORIA: s.category,
        NIVEL: s.levelNorm,
        FRECUENCIA: s.frequencyNorm,
        HORARIO: s.scheduleBlock,
        EMAIL: s.email || "",
        TELEFONO: s.phone || "",
      };
    });
  };

  const exportExcel = () => {
    const rows = buildRows();

    const ws = XLSX.utils.json_to_sheet(rows);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "CRM");

    XLSX.writeFile(
      wb,
      `dashboard_continuidad_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
  };

  const exportSessionBackup = () => {
    const payload = {
      stats,
      crmData,
      oldStudents,
      newStudents,
      dropouts,
      exportedAt: new Date().toISOString(),
    };

    const ws = XLSX.utils.json_to_sheet([
      {
        DATA: JSON.stringify(payload),
      },
    ]);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "DASHBOARD_BACKUP"
    );

    XLSX.writeFile(wb, "backup_dashboard_continuidad.xlsx");
  };

  const importSessionBackup = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const data = await file.arrayBuffer();

    const wb = XLSX.read(data);

    const ws = wb.Sheets["DASHBOARD_BACKUP"];

    if (!ws) {
      alert("Archivo inválido.");
      return;
    }

    const rows = XLSX.utils.sheet_to_json(ws);

    if (!rows.length) return;

    const parsed = JSON.parse(rows[0].DATA);

    setStats(parsed.stats || {});
    setCrmData(parsed.crmData || {});
    setOldStudents(parsed.oldStudents || []);
    setNewStudents(parsed.newStudents || []);
    setDropouts(parsed.dropouts || []);

    setActiveTab("dashboard");

    alert("Sesión restaurada correctamente.");
  };

  const exportPdfReport = () => {
    const body = [
      [
        "Estatus CRM",
        "Estudiante",
        "Cédula",
        "Categoría",
        "Nivel",
        "Frecuencia",
        "Horario",
        "Email",
        "Teléfono",
      ],
    ];

    filteredData.forEach((s) => {
      const crm = crmData[s.id] || {};

      body.push([
        crm.status || "Pendiente",
        s.name || "",
        s.id || "",
        s.category || "",
        s.levelNorm || "",
        s.frequencyNorm || "",
        s.scheduleBlock || "",
        s.email || "",
        s.phone || "",
      ]);
    });

    const docDefinition = {
      pageOrientation: "landscape",

      content: [
        {
          text: "DASHBOARD DE CONTINUIDAD",
          style: "header",
        },

        {
          text:
            "Informe Ejecutivo de Continuidad Académica y Gestión CRM",
          margin: [0, 0, 0, 20],
        },

        {
          columns: [
            [
              {
                text: "Retención",
                bold: true,
              },
              `${stats.reenrolled} estudiantes (${stats.reenrolledPct}%)`,
            ],
            [
              {
                text: "Deserción",
                bold: true,
              },
              `${stats.lost} estudiantes (${stats.lostPct}%)`,
            ],
            [
              {
                text: "Horario Crítico",
                bold: true,
              },
              `${stats.worstSchedule} (${stats.worstScheduleCount})`,
            ],
          ],
        },

        {
          text: "\nResumen Ejecutivo",
          style: "subheader",
        },

        {
          text: `Durante el análisis de continuidad académica se identificó una tasa de retención de ${stats.reenrolledPct}% y una tasa de deserción de ${stats.lostPct}%. El horario con mayor índice de fuga fue ${stats.worstSchedule}.`,
          margin: [0, 0, 0, 20],
        },

        {
          text: "Base de Gestión CRM",
          style: "subheader",
        },

        {
          table: {
            headerRows: 1,
            widths: [
              60,
              100,
              70,
              70,
              40,
              70,
              70,
              120,
              70,
            ],
            body,
          },
          layout: "lightHorizontalLines",
        },
      ],

      styles: {
        header: {
          fontSize: 22,
          bold: true,
          color: "#1e3a8a",
        },

        subheader: {
          fontSize: 16,
          bold: true,
          margin: [0, 10, 0, 10],
          color: "#0f172a",
        },
      },
    };

    pdfMake
      .createPdf(docDefinition)
      .download("reporte_dashboard_continuidad.pdf");
  };

  const exportWordReport = () => {
    let html = `
      <html>
      <head>
      <meta charset="utf-8">
      <title>Dashboard de Continuidad</title>
      </head>
      <body>
      <h1>Dashboard de Continuidad</h1>

      <h2>Indicadores</h2>

      <ul>
        <li><b>Reinscritos:</b> ${stats.reenrolled} (${stats.reenrolledPct}%)</li>
        <li><b>Pérdida:</b> ${stats.lost} (${stats.lostPct}%)</li>
        <li><b>Densidad:</b> ${stats.avgDensity}</li>
        <li><b>Horario Crítico:</b> ${stats.worstSchedule}</li>
      </ul>

      <h2>Base CRM</h2>

      <table border="1" cellspacing="0" cellpadding="5">
      <tr>
        <th>Estatus</th>
        <th>Estudiante</th>
        <th>Cédula</th>
        <th>Categoría</th>
        <th>Nivel</th>
        <th>Frecuencia</th>
        <th>Horario</th>
        <th>Email</th>
        <th>Teléfono</th>
      </tr>
    `;

    filteredData.forEach((s) => {
      const crm = crmData[s.id] || {};

      html += `
        <tr>
          <td>${crm.status || "Pendiente"}</td>
          <td>${s.name || ""}</td>
          <td>${s.id || ""}</td>
          <td>${s.category || ""}</td>
          <td>${s.levelNorm || ""}</td>
          <td>${s.frequencyNorm || ""}</td>
          <td>${s.scheduleBlock || ""}</td>
          <td>${s.email || ""}</td>
          <td>${s.phone || ""}</td>
        </tr>
      `;
    });

    html += `</table></body></html>`;

    const blob = new Blob([html], {
      type: "application/msword",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "reporte_dashboard_continuidad.doc";

    a.click();
  };

  const printDashboard = () => {
    window.print();
  };

  /* =========================
     RENDER UPLOAD
     ========================= */

  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />
            Dashboard de Continuidad
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Carga PDFs académicos y analiza continuidad,
            retención y deserción.
          </p>
        </header>

        {errorMsg && (
          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {errorMsg}
          </div>
        )}

        {warnMsg && (
          <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm">
            {warnMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ANTERIOR */}

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">
                Periodo ANTERIOR
              </span>

              <button
                className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2"
                onClick={() => setPdfOldFiles([])}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar Todos
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);

                setPdfOldFiles((prev) =>
                  mergeFiles(prev, files)
                );

                e.target.value = "";
              }}
              className="block w-full text-sm"
            />

            <div className="text-xs text-slate-500 mt-2">
              {pdfOldFiles.length
                ? `Seleccionados: ${pdfOldFiles.length}`
                : "No hay PDFs seleccionados."}
            </div>
          </div>

          {/* ACTUAL */}

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                Periodo ACTUAL
              </span>

              <button
                className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2"
                onClick={() => setPdfNewFiles([])}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar Todos
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);

                setPdfNewFiles((prev) =>
                  mergeFiles(prev, files)
                );

                e.target.value = "";
              }}
              className="block w-full text-sm"
            />

            <div className="text-xs text-slate-500 mt-2">
              {pdfNewFiles.length
                ? `Seleccionados: ${pdfNewFiles.length}`
                : "No hay PDFs seleccionados."}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={processPdfs}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-bold shadow flex items-center gap-2"
          >
            <RefreshCw
              className={`h-5 w-5 ${
                loading ? "animate-spin" : ""
              }`}
            />

            {loading
              ? "Procesando..."
              : "Procesar y Comparar"}
          </button>

          <label className="bg-slate-700 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold shadow flex items-center gap-2 cursor-pointer">
            <FolderOpen className="h-5 w-5" />
            Cargar Sesión

            <input
              type="file"
              accept=".xlsx"
              onChange={importSessionBackup}
              hidden
            />
          </label>
        </div>
      </div>
    );
  }

  /* =========================
     DASHBOARD
     ========================= */

  return (
    <div
      ref={dashboardRef}
      className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800"
    >
      {/* HEADER */}

      <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-600" />
              Dashboard de Continuidad
            </h1>

            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm">
              <span className="bg-slate-100 px-3 py-1 rounded-md font-medium">
                Base: {stats.eligibleOld}
              </span>

              <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-md font-bold">
                Retención: {stats.reenrolledPct}%
              </span>

              <span className="bg-rose-100 text-rose-800 px-3 py-1 rounded-md font-bold">
                Deserción: {stats.lostPct}%
              </span>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setActiveTab("upload")}
              className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm text-sm font-medium"
            >
              <Upload className="h-4 w-4" />
              Cambiar PDFs
            </button>

            <button
              onClick={exportExcel}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow text-sm font-medium"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>

            <button
              onClick={exportSessionBackup}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow text-sm font-medium"
            >
              <Save className="h-4 w-4" />
              Guardar Sesión
            </button>

            <button
              onClick={exportPdfReport}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow text-sm font-medium"
            >
              <FileText className="h-4 w-4" />
              PDF Ejecutivo
            </button>

            <button
              onClick={exportWordReport}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg shadow text-sm font-medium"
            >
              <FileText className="h-4 w-4" />
              Word
            </button>

            <button
              onClick={printDashboard}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg shadow text-sm font-medium"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          </div>
        </div>
      </header>

      {/* FLASHCARDS */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-6 mb-8">
        {/* DENSIDAD */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Densidad Promedio
            </p>

            <Users className="h-5 w-5 text-indigo-400" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">
              {stats.avgDensity}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              Alumnos por salón
            </p>
          </div>
        </div>

        {/* REINSCRITOS */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-emerald-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Reinscritos
            </p>

            <CheckCircle className="h-5 w-5 text-emerald-500" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-emerald-600">
              {stats.reenrolled}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {stats.reenrolledPct}% de continuidad
            </p>
          </div>
        </div>

        {/* PERDIDA */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-red-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Pérdida Total
            </p>

            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-red-600">
              {stats.lost}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {stats.lostPct}% de deserción
            </p>
          </div>
        </div>

        {/* HORARIO CRITICO */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-orange-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Horario Crítico
            </p>

            <Clock className="h-5 w-5 text-orange-500" />
          </div>

          <div className="mt-2">
            <h3 className="text-lg font-black text-orange-600">
              {stats.worstSchedule}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {stats.worstScheduleCount} fugas
            </p>
          </div>
        </div>

        {/* TRANSICIONES */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Transición Categorías
            </p>

            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">
              {stats.transiciones}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              Promociones
            </p>
          </div>
        </div>

        {/* NUEVOS VS REGULARES */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Nuevos vs Regulares
            </p>

            <BarChart3 className="h-5 w-5 text-amber-400" />
          </div>

          <div className="mt-2 flex items-end gap-3">
            <div>
              <span className="text-2xl font-black text-rose-600">
                {stats.nuevosLost}
              </span>

              <span className="text-xs text-slate-500 ml-1">
                L01
              </span>
            </div>

            <div className="text-slate-300 pb-1">|</div>

            <div>
              <span className="text-2xl font-black text-slate-700">
                {stats.regularesLost}
              </span>

              <span className="text-xs text-slate-500 ml-1">
                Regulares
              </span>
            </div>
          </div>
        </div>

        {/* WINBACK */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Tasa Éxito Rescate
            </p>

            <CheckCircle className="h-5 w-5 text-blue-500" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-blue-600">
              {winBackRate}%
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {rescuedCount} de {contactedCount}
            </p>
          </div>
        </div>
      </div>

      {/* GRAFICOS */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            Volumen de Deserción por Nivel
          </h3>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartDataLevel}
                onClick={(e) => {
                  if (e?.activeLabel)
                    setSelectedLevel(e.activeLabel);
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                />

                <YAxis />

                <RechartsTooltip />

                <Bar
                  dataKey="count"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">
              Fuga por{" "}
              {pieMode === "horario"
                ? "Horario"
                : "Frecuencia"}
            </h3>

            <button
              onClick={() =>
                setPieMode((prev) =>
                  prev === "horario"
                    ? "frecuencia"
                    : "horario"
                )
              }
              className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded"
            >
              {pieMode === "horario"
                ? "Ver por Frecuencia"
                : "Ver por Horario"}
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartDataPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartDataPie.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        pieMode === "frecuencia"
                          ? FRECUENCIA_COLORS[
                              entry.name
                            ] || "#94a3b8"
                          : HORARIO_COLORS[
                              index %
                                HORARIO_COLORS.length
                            ]
                      }
                    />
                  ))}
                </Pie>

                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* TABLA CRM */}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-4 items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-400" />
            Lista de Gestión CRM
          </h3>

          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

            <input
              type="text"
              placeholder="Buscar alumno..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg w-full text-sm"
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(e.target.value)
              }
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="p-4">Estatus CRM</th>
                <th className="p-4">Estudiante</th>
                <th className="p-4">Cédula</th>
                <th className="p-4">Categoría</th>
                <th className="p-4">Nivel</th>
                <th className="p-4">Frecuencia</th>
                <th className="p-4">Horario</th>
                <th className="p-4">Email</th>
                <th className="p-4">Contacto Directo</th>
                <th className="p-4">Teléfono</th>
                <th className="p-4 text-center">
                  Acción CRM
                </th>
              </tr>
            </thead>

            <tbody className="text-sm divide-y divide-slate-100">
              {filteredData.map((s) => {
                const crm = crmData[s.id] || {
                  status: "Pendiente",
                };

                const phoneClean = s.phone
                  ? s.phone.replace(/\D/g, "")
                  : "";

                return (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getCrmStatusColor(
                          crm.status
                        )}`}
                      >
                        {crm.status}
                      </span>
                    </td>

                    <td className="p-4 font-bold">
                      {s.name}
                    </td>

                    <td className="p-4 font-mono text-xs">
                      {s.id}
                    </td>

                    <td className="p-4">
                      {s.category}
                    </td>

                    <td className="p-4">
                      {s.levelNorm}
                    </td>

                    <td className="p-4">
                      {s.frequencyNorm}
                    </td>

                    <td className="p-4">
                      {s.scheduleBlock}
                    </td>

                    <td className="p-4">
                      {s.email || "-"}
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {s.phone ? (
                          <>
                            <a
                              href={`https://wa.me/${phoneClean}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-green-100 text-green-600 rounded-lg"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>

                            <a
                              href={`tel:${s.phone}`}
                              className="p-2 bg-blue-100 text-blue-600 rounded-lg"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                          </>
                        ) : (
                          "Sin teléfono"
                        )}
                      </div>
                    </td>

                    <td className="p-4">
                      {s.phone || "-"}
                    </td>

                    <td className="p-4 text-center">
                      <button
                        onClick={() =>
                          setCrmModal({
                            isOpen: true,
                            student: s,
                          })
                        }
                        className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}

      {crmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800">
                  Gestionar Alumno
                </h3>

                <p className="text-xs text-slate-500">
                  {crmModal.student.name} (
                  {crmModal.student.id})
                </p>
              </div>

              <button
                onClick={() =>
                  setCrmModal({
                    isOpen: false,
                    student: null,
                  })
                }
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <form
              onSubmit={saveCrmData}
              className="p-5 flex flex-col gap-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Estatus del Rescate
                </label>

                <select
                  name="status"
                  defaultValue={
                    crmData[crmModal.student.id]?.status ||
                    "Pendiente"
                  }
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                >
                  <option value="Pendiente">
                    Pendiente
                  </option>

                  <option value="En Gestión">
                    En Gestión
                  </option>

                  <option value="Rescatado">
                    Rescatado
                  </option>

                  <option value="Pérdida Definitiva">
                    Pérdida Definitiva
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Motivo
                </label>

                <select
                  name="motive"
                  defaultValue={
                    crmData[crmModal.student.id]?.motive ||
                    ""
                  }
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                >
                  <option value="">
                    Seleccione...
                  </option>

                  <option value="Económico">
                    Económico
                  </option>

                  <option value="Horario Incompatible">
                    Horario Incompatible
                  </option>

                  <option value="Viaje / Mudanza">
                    Viaje / Mudanza
                  </option>

                  <option value="Calidad Académica">
                    Calidad Académica
                  </option>

                  <option value="Salud">
                    Salud
                  </option>

                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Notas
                </label>

                <textarea
                  name="notes"
                  defaultValue={
                    crmData[crmModal.student.id]?.notes ||
                    ""
                  }
                  rows="3"
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm resize-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() =>
                    setCrmModal({
                      isOpen: false,
                      student: null,
                    })
                  }
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Guardar Gestión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardContinuidad;
