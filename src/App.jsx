// src/App.jsx
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
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
  FileText,
  RefreshCw,
  ChevronRight,
  Trash2,
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

/* =========================
   COLORES
   ========================= */

// Colores fijos por FRECUENCIA (modo "frecuencia" en el Pie)
const FRECUENCIA_COLORS = {
  "MARTES Y JUEVES": "#7c3aed", // morado
  "MIERCOLES Y VIERNES": "#f97316", // naranja
  SABATINO: "#2563eb", // azul
  LUNES: "#16a34a", // verde
  "INTENSIVO A": "#c27ba0", // magenta solicitado
  "INTENSIVO B": "#ead1dc", // rosado claro solicitado
  INTENSIVO: "#a855f7", // fallback
  "N/A": "#94a3b8",
};

// Paleta para HORARIOS (modo "horario" en el Pie)
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

const isGraduated = (student) => (student?.levelNorm || "").toUpperCase() === "L19";

/* =========================
   FRECUENCIAS
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

// Frecuencia base desde la parte antes del "/" en "Horario:"
const normalizeFrecuenciaBase = (scheduleRaw = "") => {
  if (!scheduleRaw) return "N/A";

  const left = scheduleRaw.includes("/") ? scheduleRaw.split("/")[0].trim() : scheduleRaw.trim();
  const up = left
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "Y")
    .trim();

  if (!up) return "N/A";

  // Español
  if (up.includes("MARTES") && up.includes("JUEVES")) return "MARTES Y JUEVES";
  if ((up.includes("MIERCOLES") || up.includes("MIÉRCOLES")) && up.includes("VIERNES"))
    return "MIERCOLES Y VIERNES";
  if (up.includes("SABADO") || up.includes("SÁBADO") || up.includes("SABAT")) return "SABATINO";
  if (up.includes("LUNES")) return "LUNES";

  // Inglés
  if (up.includes("TUESDAY") && up.includes("THURSDAY")) return "MARTES Y JUEVES";
  if (up.includes("WEDNESDAY") && up.includes("FRIDAY")) return "MIERCOLES Y VIERNES";
  if (up.includes("SATURDAY")) return "SABATINO";
  if (up.includes("MONDAY") && !up.includes("TO")) return "LUNES";

  // Rangos => intensivo (A/B se decide por PDF)
  if (up.includes(" TO ") || /\sA\s/.test(up)) return "INTENSIVO";

  return left || "N/A";
};

// Extrae fecha del nombre de archivo para ordenar intensivos (A antes que B)
const extractDateKeyFromName = (name = "") => {
  const up = (name || "").toUpperCase();

  // 2026-02-03 / 2026_02_03 / 2026/02/03
  let m = up.match(/(20\d{2})[\/_\-](\d{1,2})[\/_\-](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    return y * 10000 + mo * 100 + d;
  }

  // 03_02 / 03-02 / 03/02 (sin año)
  m = up.match(/(^|[^0-9])(\d{1,2})[\/_\-](\d{1,2})([^0-9]|$)/);
  if (m) {
    const d = parseInt(m[2], 10);
    const mo = parseInt(m[3], 10);
    return mo * 100 + d;
  }

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

// Dentro del mismo lado (Anterior/Actual): primer intensivo => A, segundo => B (según orden por fecha/nombre)
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
      "No se pudo extraer alumnos de los PDFs seleccionados. Posible PDF escaneado (imagen) o formato distinto."
    );
  }

  return { all, failed };
};

// Dedup por cédula, conservando el alumno que viene del PDF “más nuevo” dentro del lado
const uniqByIdPreferLatest = (arr) => {
  const map = new Map();
  for (const s of arr) {
    if (!s?.id) continue;
    const prev = map.get(s.id);
    if (!prev) {
      map.set(s.id, s);
      continue;
    }
    const rPrev = Number.isFinite(prev.__fileRank) ? prev.__fileRank : -1;
    const rNow = Number.isFinite(s.__fileRank) ? s.__fileRank : -1;
    if (rNow >= rPrev) map.set(s.id, s);
  }
  return Array.from(map.values());
};

/* =========================
   COMPONENTE
   ========================= */

const DashboardContinuidad = () => {
  const [activeTab, setActiveTab] = useState("upload");

  // multi PDF
  const [pdfOldFiles, setPdfOldFiles] = useState([]);
  const [pdfNewFiles, setPdfNewFiles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");

  const [oldStudents, setOldStudents] = useState([]);
  const [newStudents, setNewStudents] = useState([]);
  const [dropouts, setDropouts] = useState([]);

  const [stats, setStats] = useState({
    eligibleOld: 0,
    reenrolled: 0,
    reenrolledPct: 0,
    lost: 0,
    lostPct: 0,
  });

  const [contacted, setContacted] = useState(new Set());

  // filtros lista
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedFrecuencia, setSelectedFrecuencia] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [selectedHorario, setSelectedHorario] = useState("All");

  // controles gráficas
  const [levelChartCategory, setLevelChartCategory] = useState("All");
  const [pieMode, setPieMode] = useState("horario"); // horario | frecuencia

  const resetAll = () => {
    setPdfOldFiles([]);
    setPdfNewFiles([]);
    setOldStudents([]);
    setNewStudents([]);
    setDropouts([]);
    setContacted(new Set());
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedFrecuencia("All");
    setSelectedLevel("All");
    setSelectedHorario("All");
    setLevelChartCategory("All");
    setPieMode("horario");
    setStats({ eligibleOld: 0, reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0 });
    setErrorMsg("");
    setWarnMsg("");
    setActiveTab("upload");
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedFrecuencia("All");
    setSelectedLevel("All");
    setSelectedHorario("All");
    setLevelChartCategory("All");
    // si quieres resetear también el modo del pie:
    // setPieMode("horario");
  };

  const mergeFiles = (prev, incoming) => {
    const map = new Map(prev.map((f) => [fileKey(f), f]));
    for (const f of incoming) map.set(fileKey(f), f);
    return Array.from(map.values());
  };

  const removeOldAt = (idx) => setPdfOldFiles((prev) => prev.filter((_, i) => i !== idx));
  const removeNewAt = (idx) => setPdfNewFiles((prev) => prev.filter((_, i) => i !== idx));

  const processPdfs = async () => {
    setErrorMsg("");
    setWarnMsg("");

    if (!pdfOldFiles.length || !pdfNewFiles.length) {
      setErrorMsg("Debes seleccionar al menos 1 PDF ANTERIOR y 1 PDF ACTUAL.");
      return;
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

      const reenrolledPct = eligibleOld.length
        ? Math.round((reenrolled.length / eligibleOld.length) * 100)
        : 0;
      const lostPct = eligibleOld.length ? Math.round((lost.length / eligibleOld.length) * 100) : 0;

      setOldStudents(oldU);
      setNewStudents(newU);
      setDropouts(lost);
      setContacted(new Set());

      setStats({
        eligibleOld: eligibleOld.length,
        reenrolled: reenrolled.length,
        reenrolledPct,
        lost: lost.length,
        lostPct,
      });

      resetFilters();

      const allFailed = [...(failedOld || []), ...(failedNew || [])];
      if (allFailed.length) {
        setWarnMsg(
          `Ojo: no pude leer ${allFailed.length} PDF(s) (probablemente escaneados): ${allFailed.join(", ")}`
        );
      }

      setActiveTab("dashboard");
    } catch (e) {
      console.error(e);
      setErrorMsg(
        e?.message || "No pude leer los PDFs. Si el PDF es escaneado (imagen), no se puede extraer texto."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (id) => {
    const next = new Set(contacted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setContacted(next);
  };

  const filterOptions = useMemo(() => {
    const cats = Array.from(new Set(dropouts.map((s) => s.category).filter(Boolean))).sort();
    const lvls = Array.from(new Set(dropouts.map((s) => s.levelNorm).filter(Boolean))).sort();
    const hrs = Array.from(new Set(dropouts.map((s) => s.scheduleBlock).filter(Boolean)));
    const freqs = Array.from(new Set(dropouts.map((s) => s.frequencyNorm).filter(Boolean)));

    const known = __HORARIO_BLOQUES__ || [];
    const knownSet = new Set(known);
    const orderedHorarios = [
      ...known.filter((h) => hrs.includes(h)),
      ...hrs.filter((h) => !knownSet.has(h)).sort(),
    ];

    const orderedFreqs = [
      ...FRECUENCIA_ORDER.filter((f) => freqs.includes(f)),
      ...freqs.filter((f) => !FRECUENCIA_ORDER.includes(f)).sort(),
    ];

    return {
      categories: ["All", ...cats],
      levels: ["All", ...lvls],
      horarios: ["All", ...orderedHorarios],
      frecuencias: ["All", ...orderedFreqs],
    };
  }, [dropouts]);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return dropouts.filter((s) => {
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.id || "").includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").includes(q);

      const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
      const matchesFrecuencia = selectedFrecuencia === "All" || s.frequencyNorm === selectedFrecuencia;
      const matchesLevel = selectedLevel === "All" || s.levelNorm === selectedLevel;
      const matchesHorario = selectedHorario === "All" || s.scheduleBlock === selectedHorario;

      return matchesSearch && matchesCategory && matchesFrecuencia && matchesLevel && matchesHorario;
    });
  }, [dropouts, searchTerm, selectedCategory, selectedFrecuencia, selectedLevel, selectedHorario]);

  const barSource = useMemo(() => {
    if (levelChartCategory === "All") return dropouts;
    return dropouts.filter((s) => s.category === levelChartCategory);
  }, [dropouts, levelChartCategory]);

  const chartDataLevel = useMemo(() => {
    const byLevel = barSource.reduce((acc, s) => {
      const k = s.levelNorm || "N/A";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(byLevel)
      .map((k) => ({ name: k, count: byLevel[k] }))
      .sort((a, b) => {
        const na = parseInt(a.name.replace(/\D/g, "")) || 0;
        const nb = parseInt(b.name.replace(/\D/g, "")) || 0;
        return na - nb;
      });
  }, [barSource]);

  const chartDataPie = useMemo(() => {
    const byKey = dropouts.reduce((acc, s) => {
      const key = pieMode === "horario" ? (s.scheduleBlock || "N/A") : (s.frequencyNorm || "N/A");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(byKey)
      .map((k) => ({ name: k, value: byKey[k] }))
      .sort((a, b) => b.value - a.value);
  }, [dropouts, pieMode]);

  const totalDropouts = dropouts.length;
  const topPieKey = chartDataPie[0]?.name || "N/A";

  const onClickLevelBar = (e) => {
    const label = e?.activeLabel;
    if (!label) return;
    setSelectedLevel(label);
  };

  const onClickPie = (data) => {
    const name = data?.name || data?.payload?.name;
    if (!name) return;

    if (pieMode === "horario") setSelectedHorario(name);
    else setSelectedFrecuencia(name);
  };

  const togglePieMode = () => {
    setPieMode((prev) => {
      const next = prev === "horario" ? "frecuencia" : "horario";
      if (next === "frecuencia") setSelectedHorario("All");
      else setSelectedFrecuencia("All");
      return next;
    });
  };

  const exportExcel = () => {
    if (!filteredData.length) return;

    const rows = filteredData.map((s) => ({
      Estado: contacted.has(s.id) ? "Contactado" : "Pendiente",
      Cedula: s.id,
      Estudiante: s.name,
      Categoria: s.category,
      Frecuencia: s.frequencyNorm || "N/A",
      Nivel: s.levelNorm,
      Horario: s.scheduleBlock,
      Email: s.email || "",
      Telefono: s.phone || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "No inscritos");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `continuidad_no_inscritos_${today}.xlsx`);
  };

  /* =========================
     UPLOAD VIEW
     ========================= */
  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />
            Continuidad - Cargar PDFs
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Los PDFs se procesan localmente en tu navegador. No se guardan.
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Tip: puedes seleccionar varios a la vez (Ctrl/Shift) o seleccionar otra vez para ir sumando.
          </p>
        </header>

        {errorMsg ? (
          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {errorMsg}
          </div>
        ) : null}

        {warnMsg ? (
          <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            {warnMsg}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* OLD */}
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
                Eliminar
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setPdfOldFiles((prev) => mergeFiles(prev, files));
                e.target.value = "";
              }}
              className="block w-full text-sm"
            />

            <div className="text-xs text-slate-500 mt-2">
              {pdfOldFiles.length ? `Seleccionados: ${pdfOldFiles.length}` : "No hay PDFs seleccionados."}
            </div>

            {pdfOldFiles.length ? (
              <ul className="mt-3 space-y-2">
                {pdfOldFiles.map((f, idx) => (
                  <li key={fileKey(f)} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-700 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeOldAt(idx)}
                      className="text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* NEW */}
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
                Eliminar
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setPdfNewFiles((prev) => mergeFiles(prev, files));
                e.target.value = "";
              }}
              className="block w-full text-sm"
            />

            <div className="text-xs text-slate-500 mt-2">
              {pdfNewFiles.length ? `Seleccionados: ${pdfNewFiles.length}` : "No hay PDFs seleccionados."}
            </div>

            {pdfNewFiles.length ? (
              <ul className="mt-3 space-y-2">
                {pdfNewFiles.map((f, idx) => (
                  <li key={fileKey(f)} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-700 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeNewAt(idx)}
                      className="text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={processPdfs}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-bold shadow-lg inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Procesando..." : "Procesar y Comparar"}
          </button>

          <button
            onClick={resetAll}
            type="button"
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
          >
            <Trash2 className="h-5 w-5" />
            Limpiar todo
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-4">
          Nota: Si un PDF es escaneado (imagen), el sistema no podrá leer los alumnos de ese archivo.
        </p>
      </div>
    );
  }

  /* =========================
     DASHBOARD VIEW
     ========================= */
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />
            Dashboard de Continuidad
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
              Base (sin graduados): {stats.eligibleOld}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
              Reinscritos: {stats.reenrolledPct}%
            </span>
            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-bold">
              Pérdida: {stats.lostPct}%
            </span>
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setActiveTab("upload")}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Cambiar PDFs
          </button>

          <button
            onClick={exportExcel}
            disabled={!filteredData.length}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg shadow"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>

          <button
            onClick={resetAll}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            Borrar
          </button>
        </div>
      </header>

      {warnMsg ? (
        <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          {warnMsg}
        </div>
      ) : null}

      {/* METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Reinscritos</p>
              <h3 className="text-4xl font-bold text-slate-800">{stats.reenrolled}</h3>
            </div>
            <CheckCircle className="h-10 w-10 text-emerald-100" />
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            {stats.reenrolledPct}% del total (sin graduados)
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Pérdida</p>
              <h3 className="text-4xl font-bold text-slate-800">{stats.lost}</h3>
            </div>
            <AlertTriangle className="h-10 w-10 text-red-100" />
          </div>
          <p className="text-xs text-red-600 mt-2 font-medium">
            {stats.lostPct}% del total (sin graduados)
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Acción Requerida</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalDropouts - contacted.size}</h3>
            </div>
            <Phone className="h-10 w-10 text-blue-100" />
          </div>
          <p className="text-xs text-slate-400 mt-2">Pendientes por contactar</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                {pieMode === "horario" ? "Horario con más fugas" : "Frecuencia con más fugas"}
              </p>
              <h3 className="text-lg font-bold text-slate-800 truncate">{topPieKey}</h3>
            </div>
            <Clock className="h-10 w-10 text-indigo-100" />
          </div>
          <p className="text-xs text-indigo-600 mt-2 font-medium">Prioriza este bloque</p>
        </div>
      </div>

      {/* CHARTS */}
      {totalDropouts > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* BAR */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Fugas por Nivel</h3>
                <div className="text-xs text-slate-500">
                  Tip: click en una barra para filtrar la lista por ese nivel.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Categoría:</span>
                <select
                  value={levelChartCategory}
                  onChange={(e) => setLevelChartCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {filterOptions.categories.map((c) => (
                    <option key={c} value={c}>
                      {c === "All" ? "Todas" : c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="h-64 w-full mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataLevel} onClick={onClickLevelBar}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Estudiantes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PIE */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-bold text-slate-800">
                Deserción por {pieMode === "horario" ? "Horario" : "Frecuencia"}
              </h3>

              <button
                onClick={togglePieMode}
                type="button"
                className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg"
                title="Cambiar dimensión del gráfico"
              >
                {pieMode === "horario" ? "Ver por Frecuencia" : "Ver por Horario"}
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
                    onClick={onClickPie}
                  >
                    {chartDataPie.map((entry, index) => {
                      const name = entry?.name || "N/A";

                      const color =
                        pieMode === "frecuencia"
                          ? (FRECUENCIA_COLORS[name] || FRECUENCIA_COLORS["N/A"])
                          : HORARIO_COLORS[index % HORARIO_COLORS.length];

                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Tip: click en un segmento para filtrar la lista por{" "}
              {pieMode === "horario" ? "horario" : "frecuencia"}.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center mb-8">
          <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700">No hay datos para mostrar</h3>
          <p className="text-slate-500 mb-4">Carga los PDFs para comenzar.</p>
          <button onClick={() => setActiveTab("upload")} className="text-blue-600 font-semibold hover:underline">
            Ir a Cargar PDFs
          </button>
        </div>
      )}

      {/* CRM TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <h3 className="text-lg font-bold text-slate-800">Lista de Gestión</h3>

            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-500">
                Mostrando {filteredData.length} de {totalDropouts}
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-2"
                title="Resetear filtros"
              >
                <RefreshCw className="h-4 w-4" />
                Reset filtros
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "All" ? "Todas las categorías" : c}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedFrecuencia}
                onChange={(e) => setSelectedFrecuencia(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.frecuencias.map((f) => (
                  <option key={f} value={f}>
                    {f === "All" ? "Todas las frecuencias" : f}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.levels.map((l) => (
                  <option key={l} value={l}>
                    {l === "All" ? "Todos los niveles" : l}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedHorario}
                onChange={(e) => setSelectedHorario(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.horarios.map((h) => (
                  <option key={h} value={h}>
                    {h === "All" ? "Todos los horarios" : h}
                  </option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar (nombre, cédula, email, teléfono)…"
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold border-b border-slate-100">Estado</th>
                <th className="p-4 font-semibold border-b border-slate-100">Estudiante</th>
                <th className="p-4 font-semibold border-b border-slate-100">Cédula</th>
                <th className="p-4 font-semibold border-b border-slate-100">Categoría</th>
                <th className="p-4 font-semibold border-b border-slate-100">Frecuencia</th>
                <th className="p-4 font-semibold border-b border-slate-100">Nivel</th>
                <th className="p-4 font-semibold border-b border-slate-100">Horario</th>
                <th className="p-4 font-semibold border-b border-slate-100">Email</th>
                <th className="p-4 font-semibold border-b border-slate-100">Teléfono</th>
                <th className="p-4 font-semibold border-b border-slate-100 text-right">Acción</th>
              </tr>
            </thead>

            <tbody className="text-sm text-slate-700 divide-y divide-slate-50">
              {filteredData.length ? (
                filteredData.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-50 transition-colors ${contacted.has(s.id) ? "bg-emerald-50/30" : ""}`}
                  >
                    <td className="p-4">
                      {contacted.has(s.id) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3" />
                          Contactado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <XCircle className="h-3 w-3" />
                          Pendiente
                        </span>
                      )}
                    </td>

                    <td className="p-4 font-medium text-slate-900">{s.name}</td>
                    <td className="p-4 font-mono text-xs">{s.id}</td>
                    <td className="p-4">{s.category}</td>
                    <td className="p-4 text-slate-600">{s.frequencyNorm || "N/A"}</td>

                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                        {s.levelNorm}
                      </span>
                    </td>

                    <td className="p-4 text-slate-600">{s.scheduleBlock}</td>

                    <td className="p-4 text-slate-600">
                      {s.email ? (
                        <a className="text-blue-600 hover:underline" href={`mailto:${s.email}`}>
                          {s.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>

                    <td className="p-4 text-slate-600">
                      {s.phone ? (
                        <a className="text-blue-600 hover:underline" href={`tel:${s.phone}`}>
                          {s.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => toggleContact(s.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          contacted.has(s.id)
                            ? "bg-slate-200 text-slate-500 hover:bg-slate-300"
                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                        }`}
                        title={contacted.has(s.id) ? "Marcar como pendiente" : "Marcar como contactado"}
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="p-8 text-center text-slate-400">
                    No se encontraron estudiantes con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>Continuidad</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardContinuidad;
