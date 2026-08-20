// src/App.jsx

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import * as Docx from "docx";
import { saveAs } from "file-saver";

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
  Legend,
} from "recharts";

import {
  Search,
  Users,
  Clock,
  AlertTriangle,
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
  Save,
  FileText,
  Printer,
  FileUp,
  File,
  GraduationCap,
  Info,
  ShieldCheck,
  Database,
} from "lucide-react";

import {
  parseCevazPdf,
  __HORARIO_BLOQUES__,
} from "./utils/parseCevazPdf";

import {
  analyzeContinuity,
  normalizeStudentId,
  normalizeCategory,
  normalizeLevel,
  normalizeScheduleBlock,
  getTopDropoutScheduleByVolume,
  getTopDropoutScheduleByRate,
  CONTINUIDAD_RULES_VERSION,
} from "./utils/continuidad";

/* =========================================================
   PDFMAKE
   ========================================================= */

if (pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
}

/* =========================================================
   CONSTANTES VISUALES
   ========================================================= */

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

/* =========================================================
   ESTADÍSTICAS VACÍAS
   ========================================================= */

const createEmptyStats = () => ({
  oldTotal: 0,
  newTotal: 0,

  eligibleOld: 0,

  reenrolled: 0,
  reenrolledPct: 0,

  lost: 0,
  lostPct: 0,

  nuevosEligible: 0,
  regularesEligible: 0,

  nuevosLost: 0,
  nuevosLostPct: 0,

  regularesLost: 0,
  regularesLostPct: 0,

  transNinosJovenes: 0,
  transJovenesAdultos: 0,
  categoryTransitionsAvailable: false,

  avgDensity: 0,
  activeSections: 0,

  topHorarioFugas: "N/A",
  topHorarioFugasCount: 0,
  topHorarioFugasEligible: 0,
  topHorarioFugasRate: 0,

  topHorarioRate: "N/A",
  topHorarioRatePct: 0,
  topHorarioRateLost: 0,
  topHorarioRateEligible: 0,

  graduados: 0,
  graduadosPresentesNuevamente: 0,

  nuevosL01: 0,
  nuevosNivelacion: 0,
  nuevosExternosTotal: 0,

  cambiosFreq: 0,

  reconciliationOk: false,
});

/* =========================================================
   ARCHIVOS
   ========================================================= */

const fileKey = (file) =>
  `${file.name}__${file.size}__${file.lastModified}`;

const extractDateKeyFromName = (name = "") => {
  const upper = String(name || "").toUpperCase();

  /*
    2026-08-11
    2026_08_11
    2026/08/11
  */
  let match = upper.match(
    /(20\d{2})[\/_\-](\d{1,2})[\/_\-](\d{1,2})/
  );

  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    return year * 10000 + month * 100 + day;
  }

  /*
    09_07
    11_08

    Se interpreta como DD_MM.
  */
  match = upper.match(
    /(^|[^0-9])(\d{1,2})[\/_\-](\d{1,2})([^0-9]|$)/
  );

  if (match) {
    const day = parseInt(match[2], 10);
    const month = parseInt(match[3], 10);

    if (
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      return month * 100 + day;
    }
  }

  return null;
};

const sortFilesSmart = (files = []) => {
  const metadata = files.map((file, index) => {
    const dateKey = extractDateKeyFromName(file.name);

    return {
      file,
      index,
      hasDate: dateKey !== null,
      dateKey: dateKey ?? Number.POSITIVE_INFINITY,
      name: String(file.name || "").toUpperCase(),
    };
  });

  metadata.sort((a, b) => {
    if (a.hasDate && b.hasDate) {
      if (a.dateKey !== b.dateKey) {
        return a.dateKey - b.dateKey;
      }

      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }

      return a.index - b.index;
    }

    if (a.hasDate !== b.hasDate) {
      return a.hasDate ? -1 : 1;
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }

    return a.index - b.index;
  });

  return metadata.map((item) => item.file);
};

/* =========================================================
   FRECUENCIA EXTRAÍDA DEL HORARIO
   ========================================================= */

const normalizeFrecuenciaBase = (scheduleRaw = "") => {
  if (!scheduleRaw) {
    return "N/A";
  }

  const leftSide = scheduleRaw.includes("/")
    ? scheduleRaw.split("/")[0].trim()
    : scheduleRaw.trim();

  const upper = leftSide
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "Y")
    .trim();

  if (!upper) {
    return "N/A";
  }

  if (
    upper.includes("MARTES") &&
    upper.includes("JUEVES")
  ) {
    return "MARTES Y JUEVES";
  }

  if (
    (upper.includes("MIERCOLES") ||
      upper.includes("MIÉRCOLES")) &&
    upper.includes("VIERNES")
  ) {
    return "MIERCOLES Y VIERNES";
  }

  if (
    upper.includes("SABADO") ||
    upper.includes("SÁBADO") ||
    upper.includes("SABAT")
  ) {
    return "SABATINO";
  }

  if (
    upper.includes("LUNES") &&
    !upper.includes(" A ")
  ) {
    return "LUNES";
  }

  if (
    upper.includes("TUESDAY") &&
    upper.includes("THURSDAY")
  ) {
    return "MARTES Y JUEVES";
  }

  if (
    upper.includes("WEDNESDAY") &&
    upper.includes("FRIDAY")
  ) {
    return "MIERCOLES Y VIERNES";
  }

  if (upper.includes("SATURDAY")) {
    return "SABATINO";
  }

  if (
    upper.includes("MONDAY") &&
    !upper.includes(" TO ")
  ) {
    return "LUNES";
  }

  /*
    TUESDAY TO FRIDAY
    MARTES A VIERNES
  */
  if (
    upper.includes(" TO ") ||
    /\sA\s/.test(upper)
  ) {
    return "INTENSIVO";
  }

  return leftSide || "N/A";
};

/* =========================================================
   PARSEO DE MÚLTIPLES PDFs
   ========================================================= */

const parseMany = async (
  files,
  {
    intensivoLabel = "INTENSIVO",
  } = {}
) => {
  const orderedFiles = sortFilesSmart(files);

  const failed = [];
  const all = [];

  for (
    let rank = 0;
    rank < orderedFiles.length;
    rank++
  ) {
    const file = orderedFiles[rank];

    let list = [];

    try {
      list = await parseCevazPdf(file);

      if (!list?.length) {
        failed.push(file.name);
      }
    } catch (error) {
      console.error(
        `Error procesando ${file.name}:`,
        error
      );

      failed.push(file.name);
      list = [];
    }

    for (const original of list || []) {
      const rawId =
        original?.id !== undefined &&
        original?.id !== null
          ? String(original.id).trim()
          : "";

      const idNorm =
        normalizeStudentId(rawId);

      const category =
        normalizeCategory(
          original.category || ""
        );

      const levelNorm =
        normalizeLevel(
          original.levelNorm ||
            original.level ||
            ""
        );

      const frequencyRaw =
        original.schedule ||
        original.frequencyRaw ||
        "";

      const frequencyBase =
        normalizeFrecuenciaBase(
          frequencyRaw
        );

      const frequencyNorm =
        frequencyBase === "INTENSIVO"
          ? intensivoLabel
          : frequencyBase;

      const scheduleBlock =
        normalizeScheduleBlock(
          original.scheduleBlock
        );

      all.push({
        ...original,

        id: rawId,
        idOriginal: rawId,
        idNorm,

        category,
        levelNorm,

        frequencyRaw,
        frequencyBase,
        frequencyNorm,

        scheduleBlock,

        __fileRank: rank,
        __fileName: file.name,
      });
    }
  }

  if (!all.length) {
    throw new Error(
      "No se pudo extraer ningún alumno de los PDFs seleccionados. " +
        "Verifica que los archivos contengan texto seleccionable y no sean únicamente imágenes escaneadas."
    );
  }

  return {
    all,
    failed,
  };
};

/* =========================================================
   VALIDACIONES DE DATOS EXTRAÍDOS
   ========================================================= */

const phoneDigits = (phone = "") =>
  String(phone ?? "").replace(/\D/g, "");

const isLikelyValidEmail = (email = "") => {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
    String(email).trim()
  );
};

const isLikelyValidPhone = (phone = "") => {
  if (!phone) {
    return true;
  }

  const digits = phoneDigits(phone);

  return (
    digits.length >= 7 &&
    digits.length <= 15
  );
};

const evaluateParsedDataQuality = ({
  oldAll,
  newAll,
  failedOld,
  failedNew,
}) => {
  const critical = [];
  const warnings = [];

  if (failedOld?.length) {
    critical.push(
      `Período anterior: no se pudieron procesar ${failedOld.length} archivo(s): ${failedOld.join(
        ", "
      )}`
    );
  }

  if (failedNew?.length) {
    critical.push(
      `Período actual: no se pudieron procesar ${failedNew.length} archivo(s): ${failedNew.join(
        ", "
      )}`
    );
  }

  const missingIdOld = oldAll.filter(
    (student) => !student.idNorm
  );

  const missingIdNew = newAll.filter(
    (student) => !student.idNorm
  );

  if (missingIdOld.length) {
    critical.push(
      `Período anterior: ${missingIdOld.length} registro(s) sin cédula/ID utilizable.`
    );
  }

  if (missingIdNew.length) {
    critical.push(
      `Período actual: ${missingIdNew.length} registro(s) sin cédula/ID utilizable.`
    );
  }

  const missingLevelOld = oldAll.filter(
    (student) =>
      !student.levelNorm ||
      student.levelNorm === "N/A"
  );

  const missingLevelNew = newAll.filter(
    (student) =>
      !student.levelNorm ||
      student.levelNorm === "N/A"
  );

  if (missingLevelOld.length) {
    critical.push(
      `Período anterior: ${missingLevelOld.length} estudiante(s) sin nivel válido.`
    );
  }

  if (missingLevelNew.length) {
    critical.push(
      `Período actual: ${missingLevelNew.length} estudiante(s) sin nivel válido.`
    );
  }

  const missingCategoryOld = oldAll.filter(
    (student) =>
      !student.category ||
      student.category === "N/A"
  );

  const missingCategoryNew = newAll.filter(
    (student) =>
      !student.category ||
      student.category === "N/A"
  );

  if (missingCategoryOld.length) {
    critical.push(
      `Período anterior: ${missingCategoryOld.length} estudiante(s) sin categoría válida.`
    );
  }

  if (missingCategoryNew.length) {
    critical.push(
      `Período actual: ${missingCategoryNew.length} estudiante(s) sin categoría válida.`
    );
  }

  const missingScheduleOld = oldAll.filter(
    (student) =>
      !student.scheduleBlock ||
      student.scheduleBlock === "N/A"
  );

  const missingScheduleNew = newAll.filter(
    (student) =>
      !student.scheduleBlock ||
      student.scheduleBlock === "N/A"
  );

  if (missingScheduleOld.length) {
    warnings.push(
      `Período anterior: ${missingScheduleOld.length} registro(s) sin bloque horario reconocido.`
    );
  }

  if (missingScheduleNew.length) {
    warnings.push(
      `Período actual: ${missingScheduleNew.length} registro(s) sin bloque horario reconocido.`
    );
  }

  const badEmailOld = oldAll.filter(
    (student) =>
      student.email &&
      !isLikelyValidEmail(student.email)
  );

  const badEmailNew = newAll.filter(
    (student) =>
      student.email &&
      !isLikelyValidEmail(student.email)
  );

  if (badEmailOld.length) {
    warnings.push(
      `Período anterior: ${badEmailOld.length} correo(s) con formato posiblemente inválido.`
    );
  }

  if (badEmailNew.length) {
    warnings.push(
      `Período actual: ${badEmailNew.length} correo(s) con formato posiblemente inválido.`
    );
  }

  const badPhoneOld = oldAll.filter(
    (student) =>
      student.phone &&
      !isLikelyValidPhone(student.phone)
  );

  const badPhoneNew = newAll.filter(
    (student) =>
      student.phone &&
      !isLikelyValidPhone(student.phone)
  );

  if (badPhoneOld.length) {
    warnings.push(
      `Período anterior: ${badPhoneOld.length} teléfono(s) con formato posiblemente inválido.`
    );
  }

  if (badPhoneNew.length) {
    warnings.push(
      `Período actual: ${badPhoneNew.length} teléfono(s) con formato posiblemente inválido.`
    );
  }

  return {
    critical,
    warnings,

    details: {
      missingIdOld: missingIdOld.length,
      missingIdNew: missingIdNew.length,

      missingLevelOld: missingLevelOld.length,
      missingLevelNew: missingLevelNew.length,

      missingCategoryOld:
        missingCategoryOld.length,

      missingCategoryNew:
        missingCategoryNew.length,

      missingScheduleOld:
        missingScheduleOld.length,

      missingScheduleNew:
        missingScheduleNew.length,

      badEmailOld: badEmailOld.length,
      badEmailNew: badEmailNew.length,

      badPhoneOld: badPhoneOld.length,
      badPhoneNew: badPhoneNew.length,
    },
  };
};

/* =========================================================
   TELÉFONO / WHATSAPP
   ========================================================= */

const normalizeWhatsAppPhone = (phone = "") => {
  let digits = phoneDigits(phone);

  if (!digits) {
    return "";
  }

  /*
    +58 0414...
    580414...
    -> 58414...
  */
  if (/^5804\d{9}$/.test(digits)) {
    digits = `58${digits.slice(3)}`;
  }

  /*
    0414xxxxxxx
    -> 58414xxxxxxx
  */
  if (/^0(4\d{9})$/.test(digits)) {
    digits = `58${digits.slice(1)}`;
  }

  return digits;
};

/* =========================================================
   PERSISTENCIA CRM
   ========================================================= */

const simpleHash = (value = "") => {
  let hash = 5381;

  for (let i = 0; i < value.length; i++) {
    hash =
      (hash * 33) ^
      value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
};

const buildAnalysisStorageKey = ({
  oldFiles,
  newFiles,
  oldIntensivoLabel,
  newIntensivoLabel,
}) => {
  const oldSignature = sortFilesSmart(
    oldFiles
  )
    .map(
      (file) =>
        `${file.name}:${file.size}`
    )
    .join("||");

  const newSignature = sortFilesSmart(
    newFiles
  )
    .map(
      (file) =>
        `${file.name}:${file.size}`
    )
    .join("||");

  const fingerprint = [
    oldSignature,
    oldIntensivoLabel,
    newSignature,
    newIntensivoLabel,
  ].join("###");

  return `continuidad_crm_${simpleHash(
    fingerprint
  )}`;
};

const loadCrmFromStorage = (storageKey) => {
  if (!storageKey) {
    return {};
  }

  try {
    const raw =
      window.localStorage.getItem(
        storageKey
      );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    return parsed &&
      typeof parsed === "object"
      ? parsed
      : {};
  } catch (error) {
    console.warn(
      "No se pudo cargar CRM local:",
      error
    );

    return {};
  }
};

const saveCrmToStorage = (
  storageKey,
  data
) => {
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(data)
    );
  } catch (error) {
    console.warn(
      "No se pudo guardar CRM local:",
      error
    );
  }
};

/* =========================================================
   COMPONENTE PRINCIPAL
   ========================================================= */

const DashboardContinuidad = () => {
  const [activeTab, setActiveTab] =
    useState("upload");

  const fileInputRef = useRef(null);

  /* =======================================================
     ARCHIVOS
     ======================================================= */

  const [
    pdfOldFiles,
    setPdfOldFiles,
  ] = useState([]);

  const [
    pdfNewFiles,
    setPdfNewFiles,
  ] = useState([]);

  /*
    Para el caso actual:

    Julio = Intensivo A
    Agosto = Intensivo B

    Se mantienen seleccionables para que el sistema
    pueda reutilizarse con futuros períodos.
  */

  const [
    oldIntensivoLabel,
    setOldIntensivoLabel,
  ] = useState("INTENSIVO A");

  const [
    newIntensivoLabel,
    setNewIntensivoLabel,
  ] = useState("INTENSIVO B");

  /* =======================================================
     SISTEMA
     ======================================================= */

  const [loading, setLoading] =
    useState(false);

  const [errorMsg, setErrorMsg] =
    useState("");

  const [
    qualityData,
    setQualityData,
  ] = useState(null);

  const [
    analysisStorageKey,
    setAnalysisStorageKey,
  ] = useState("");

  /* =======================================================
     DATOS DERIVADOS DEL MOTOR DE CONTINUIDAD
     ======================================================= */

  const [
    dropouts,
    setDropouts,
  ] = useState([]);

  const [
    newStudentsList,
    setNewStudentsList,
  ] = useState([]);

  const [
    freqChangersList,
    setFreqChangersList,
  ] = useState([]);

  const [
    graduadosList,
    setGraduadosList,
  ] = useState([]);

  const [
    transNinosJovenesList,
    setTransNinosJovenesList,
  ] = useState([]);

  const [
    transJovenesAdultosList,
    setTransJovenesAdultosList,
  ] = useState([]);

  /* =======================================================
     CRM
     ======================================================= */

  const [
    crmData,
    setCrmData,
  ] = useState({});

  const [
    crmModal,
    setCrmModal,
  ] = useState({
    isOpen: false,
    student: null,
  });

  /* =======================================================
     TABLAS
     ======================================================= */

  const [
    tableView,
    setTableView,
  ] = useState("desercion");

  const [
    filterFugaType,
    setFilterFugaType,
  ] = useState("All");

  /* =======================================================
     ESTADÍSTICAS
     ======================================================= */

  const [
    stats,
    setStats,
  ] = useState(
    createEmptyStats()
  );

  /* =======================================================
     FILTROS
     ======================================================= */

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("All");

  const [
    selectedFrecuencia,
    setSelectedFrecuencia,
  ] = useState("All");

  const [
    selectedLevel,
    setSelectedLevel,
  ] = useState("All");

  const [
    selectedHorario,
    setSelectedHorario,
  ] = useState("All");

  const [
    levelChartCategory,
    setLevelChartCategory,
  ] = useState("All");

  const [
    pieMode,
    setPieMode,
  ] = useState("horario");

  /* =======================================================
     UTILIDADES DE ARCHIVO
     ======================================================= */

  const mergeFiles = (
    previous,
    incoming
  ) => {
    const map = new Map(
      previous.map((file) => [
        fileKey(file),
        file,
      ])
    );

    for (const file of incoming) {
      map.set(
        fileKey(file),
        file
      );
    }

    return Array.from(
      map.values()
    );
  };

  const removeOldAt = (index) => {
    setPdfOldFiles((previous) =>
      previous.filter(
        (_, i) => i !== index
      )
    );
  };

  const removeNewAt = (index) => {
    setPdfNewFiles((previous) =>
      previous.filter(
        (_, i) => i !== index
      )
    );
  };

  /* =======================================================
     RESET
     ======================================================= */

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedFrecuencia("All");
    setSelectedLevel("All");
    setSelectedHorario("All");
    setLevelChartCategory("All");
    setFilterFugaType("All");
  };

  const resetAll = () => {
    setPdfOldFiles([]);
    setPdfNewFiles([]);

    setDropouts([]);
    setNewStudentsList([]);
    setFreqChangersList([]);
    setGraduadosList([]);

    setTransNinosJovenesList([]);
    setTransJovenesAdultosList([]);

    setCrmData({});
    setAnalysisStorageKey("");

    setStats(
      createEmptyStats()
    );

    setQualityData(null);

    setErrorMsg("");

    resetFilters();

    setPieMode("horario");
    setTableView("desercion");

    setActiveTab("upload");
  };

  /* =======================================================
     PROCESAMIENTO PRINCIPAL
     ======================================================= */

  const processPdfs = async () => {
    setErrorMsg("");
    setQualityData(null);

    if (
      !pdfOldFiles.length ||
      !pdfNewFiles.length
    ) {
      setErrorMsg(
        "Selecciona al menos 1 PDF del período ANTERIOR y 1 PDF del período ACTUAL."
      );

      return;
    }

    try {
      setLoading(true);

      /* ---------------------------------------------------
         1. EXTRAER LOS DOS PERÍODOS
         --------------------------------------------------- */

      const [
        oldResult,
        newResult,
      ] = await Promise.all([
        parseMany(pdfOldFiles, {
          intensivoLabel:
            oldIntensivoLabel,
        }),

        parseMany(pdfNewFiles, {
          intensivoLabel:
            newIntensivoLabel,
        }),
      ]);

      const {
        all: oldAll,
        failed: failedOld,
      } = oldResult;

      const {
        all: newAll,
        failed: failedNew,
      } = newResult;

      /* ---------------------------------------------------
         2. CONTROL DEL PARSER
         --------------------------------------------------- */

      const parserQuality =
        evaluateParsedDataQuality({
          oldAll,
          newAll,
          failedOld,
          failedNew,
        });

      setQualityData(
        parserQuality
      );

      if (
        parserQuality.critical.length
      ) {
        throw new Error(
          `VALIDACIÓN BLOQUEADA: ${parserQuality.critical.join(
            " | "
          )}`
        );
      }

      /* ---------------------------------------------------
         3. MOTOR ÚNICO DE CONTINUIDAD

         A partir de aquí App.jsx NO calcula:

         - graduandos
         - elegibles
         - reinscritos
         - fugas
         - nuevos
         - cambios de frecuencia
         - transiciones
         - densidad
         - tasas

         Todo viene de continuidad.js.
         --------------------------------------------------- */

      const analysis =
        analyzeContinuity({
          oldStudents:
            oldAll,

          newStudents:
            newAll,

          strict: true,
        });

      /* ---------------------------------------------------
         4. HORARIOS VÁLIDOS

         Excluimos N/A de los rankings gerenciales.
         --------------------------------------------------- */

      const validScheduleRows =
        (
          analysis.analytics
            ?.dropoutBySchedule ||
          []
        ).filter(
          (row) =>
            row.schedule &&
            row.schedule !== "N/A"
        );

      const topVolume =
        getTopDropoutScheduleByVolume(
          validScheduleRows
        );

      const topRate =
        getTopDropoutScheduleByRate(
          validScheduleRows
        );

      /* ---------------------------------------------------
         5. ADVERTENCIAS COMBINADAS
         --------------------------------------------------- */

      const allWarnings =
        Array.from(
          new Set([
            ...(
              parserQuality.warnings ||
              []
            ),

            ...(
              analysis.quality
                ?.warnings ||
              []
            ),
          ])
        );

      /* ---------------------------------------------------
         6. CRM PERSISTENTE
         --------------------------------------------------- */

      const storageKey =
        buildAnalysisStorageKey({
          oldFiles:
            pdfOldFiles,

          newFiles:
            pdfNewFiles,

          oldIntensivoLabel,

          newIntensivoLabel,
        });

      const savedCrm =
        loadCrmFromStorage(
          storageKey
        );

      setAnalysisStorageKey(
        storageKey
      );

      setCrmData(
        savedCrm
      );

      /* ---------------------------------------------------
         7. LISTAS
         --------------------------------------------------- */

      setDropouts(
        analysis.lists.lost
      );

      setNewStudentsList(
        analysis.lists
          .externalEntrants
      );

      setFreqChangersList(
        analysis.lists
          .frequencyChanges
      );

      setGraduadosList(
        analysis.lists
          .graduates
      );

      setTransNinosJovenesList(
        analysis.lists
          .ninosJovenes
      );

      setTransJovenesAdultosList(
        analysis.lists
          .jovenesAdultos
      );

      /* ---------------------------------------------------
         8. KPIs

         Solo mapeamos los resultados del motor.
         No volvemos a calcularlos aquí.
         --------------------------------------------------- */

      setStats({
        oldTotal:
          analysis.totals.previous,

        newTotal:
          analysis.totals.current,

        eligibleOld:
          analysis.totals.eligible,

        reenrolled:
          analysis.totals.reenrolled,

        reenrolledPct:
          analysis.rates.retention,

        lost:
          analysis.totals.lost,

        lostPct:
          analysis.rates.attrition,

        nuevosEligible:
          analysis.segmentation
            .newStudents.eligible,

        regularesEligible:
          analysis.segmentation
            .regularStudents
            .eligible,

        nuevosLost:
          analysis.segmentation
            .newStudents.lost,

        nuevosLostPct:
          analysis.segmentation
            .newStudents
            .attritionRate,

        regularesLost:
          analysis.segmentation
            .regularStudents.lost,

        regularesLostPct:
          analysis.segmentation
            .regularStudents
            .attritionRate,

        transNinosJovenes:
          analysis.lists
            .ninosJovenes.length,

        transJovenesAdultos:
          analysis.lists
            .jovenesAdultos.length,

        categoryTransitionsAvailable:
          Boolean(
            analysis.analytics
              .categoryTransitionsAvailable
          ),

        avgDensity:
          analysis.analytics
            .density.average,

        activeSections:
          analysis.analytics
            .density.sections,

        topHorarioFugas:
          topVolume.schedule,

        topHorarioFugasCount:
          topVolume.lost,

        topHorarioFugasEligible:
          topVolume.eligible,

        topHorarioFugasRate:
          topVolume.rate,

        topHorarioRate:
          topRate.schedule,

        topHorarioRatePct:
          topRate.rate,

        topHorarioRateLost:
          topRate.lost,

        topHorarioRateEligible:
          topRate.eligible,

        graduados:
          analysis.totals
            .graduates,

        graduadosPresentesNuevamente:
          analysis.totals
            .graduatesPresentAgain,

        nuevosL01:
          analysis.totals
            .newLevel1,

        nuevosNivelacion:
          analysis.totals
            .externalLevel2Plus,

        nuevosExternosTotal:
          analysis.totals
            .externalEntrants,

        cambiosFreq:
          analysis.totals
            .frequencyChanges,

        reconciliationOk:
          Boolean(
            analysis.quality
              ?.reconciliation?.ok
          ),
      });

      /* ---------------------------------------------------
         9. CALIDAD CONSOLIDADA
         --------------------------------------------------- */

      setQualityData({
        critical: [],
        warnings:
          allWarnings,

        details:
          parserQuality.details,

        reconciliationOk:
          Boolean(
            analysis.quality
              ?.reconciliation?.ok
          ),

        rulesVersion:
          analysis.rulesVersion ||
          CONTINUIDAD_RULES_VERSION,
      });

      /* ---------------------------------------------------
         10. ABRIR DASHBOARD
         --------------------------------------------------- */

      resetFilters();

      setTableView(
        "desercion"
      );

      setActiveTab(
        "dashboard"
      );
    } catch (error) {
      console.error(error);

      setErrorMsg(
        error?.message ||
          "Error procesando los PDFs."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =======================================================
     CRM
     ======================================================= */

  const contactedCount =
    dropouts.filter(
      (student) => {
        const crm =
          crmData[
            student.idNorm
          ];

        return (
          crm?.status &&
          crm.status !==
            "Pendiente"
        );
      }
    ).length;

  const rescuedCount =
    dropouts.filter(
      (student) =>
        crmData[
          student.idNorm
        ]?.status ===
        "Rescatado"
    ).length;

  /*
    0 / 0 NO es 0%.

    Cuando nadie ha sido contactado,
    no existe una tasa calculable.
  */

  const winBackRate =
    contactedCount > 0
      ? Math.round(
          (rescuedCount /
            contactedCount) *
            100
        )
      : null;

  const saveCrmData = (
    event
  ) => {
    event.preventDefault();

    if (!crmModal.student) {
      return;
    }

    const formData =
      new FormData(
        event.target
      );

    const studentKey =
      crmModal.student.idNorm ||
      normalizeStudentId(
        crmModal.student.id
      );

    setCrmData(
      (previous) => {
        const next = {
          ...previous,

          [studentKey]: {
            status:
              formData.get(
                "status"
              ),

            motive:
              formData.get(
                "motive"
              ),

            notes:
              formData.get(
                "notes"
              ),

            updatedAt:
              new Date().toISOString(),
          },
        };

        saveCrmToStorage(
          analysisStorageKey,
          next
        );

        return next;
      }
    );

    setCrmModal({
      isOpen: false,
      student: null,
    });
  };

  const getCrmStatusColor = (
    status
  ) => {
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

  /* =======================================================
     INTERACCIÓN CON GRÁFICO CIRCULAR
     ======================================================= */

  const onClickPie = (
    data
  ) => {
    const name =
      data?.name ||
      data?.payload?.name;

    if (!name) {
      return;
    }

    setTableView(
      "desercion"
    );

    if (
      pieMode === "horario"
    ) {
      setSelectedHorario(
        name
      );
    } else {
      setSelectedFrecuencia(
        name
      );
    }
  };

  /* =======================================================
     FUENTE DE TABLA
     ======================================================= */

  const sourceData =
    useMemo(() => {
      switch (tableView) {
        case "desercion":
          return dropouts;

        case "nuevosL01":
          return newStudentsList.filter(
            (student) =>
              student.levelNorm ===
              "L01"
          );

        case "nivelacion":
          return newStudentsList.filter(
            (student) =>
              student.levelNorm !==
              "L01"
          );

        case "cambios":
          return freqChangersList;

        case "graduados":
          return graduadosList;

        case "transNinosJovenes":
          return transNinosJovenesList;

        case "transJovenesAdultos":
          return transJovenesAdultosList;

        default:
          return dropouts;
      }
    }, [
      tableView,
      dropouts,
      newStudentsList,
      freqChangersList,
      graduadosList,
      transNinosJovenesList,
      transJovenesAdultosList,
    ]);

  /* =======================================================
     OPCIONES DE FILTROS
     ======================================================= */

  const filterOptions =
    useMemo(() => {
      const categories =
        Array.from(
          new Set(
            sourceData
              .map(
                (student) =>
                  student.category
              )
              .filter(Boolean)
          )
        ).sort();

      const levels =
        Array.from(
          new Set(
            sourceData
              .map(
                (student) =>
                  student.levelNorm
              )
              .filter(Boolean)
          )
        ).sort((a, b) => {
          const aLevel =
            parseInt(
              String(a).replace(
                /\D/g,
                ""
              ),
              10
            ) || 0;

          const bLevel =
            parseInt(
              String(b).replace(
                /\D/g,
                ""
              ),
              10
            ) || 0;

          return (
            aLevel -
            bLevel
          );
        });

      const horarios =
        Array.from(
          new Set(
            sourceData
              .map(
                (student) =>
                  student.scheduleBlock
              )
              .filter(Boolean)
          )
        );

      const frecuencias =
        Array.from(
          new Set(
            sourceData
              .map(
                (student) =>
                  student.frequencyNorm
              )
              .filter(Boolean)
          )
        );

      const knownHorarios =
        __HORARIO_BLOQUES__ ||
        [];

      const knownHorarioSet =
        new Set(
          knownHorarios
        );

      return {
        categories: [
          "All",
          ...categories,
        ],

        levels: [
          "All",
          ...levels,
        ],

        horarios: [
          "All",

          ...knownHorarios.filter(
            (horario) =>
              horarios.includes(
                horario
              )
          ),

          ...horarios
            .filter(
              (horario) =>
                !knownHorarioSet.has(
                  horario
                )
            )
            .sort(),
        ],

        frecuencias: [
          "All",

          ...FRECUENCIA_ORDER.filter(
            (frecuencia) =>
              frecuencias.includes(
                frecuencia
              )
          ),

          ...frecuencias
            .filter(
              (frecuencia) =>
                !FRECUENCIA_ORDER.includes(
                  frecuencia
                )
            )
            .sort(),
        ],
      };
    }, [sourceData]);

  /* =======================================================
     DATOS FILTRADOS
     ======================================================= */

  const filteredData =
    useMemo(() => {
      const query =
        searchTerm
          .trim()
          .toLowerCase();

      return sourceData.filter(
        (student) => {
          const matchesSearch =
            !query ||
            String(
              student.name ||
                ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              student.id || ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              student.idNorm || ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              student.email ||
                ""
            )
              .toLowerCase()
              .includes(query) ||
            String(
              student.phone ||
                ""
            ).includes(query);

          const matchesCategory =
            selectedCategory ===
              "All" ||
            student.category ===
              selectedCategory;

          const matchesFrecuencia =
            selectedFrecuencia ===
              "All" ||
            student.frequencyNorm ===
              selectedFrecuencia;

          const matchesLevel =
            selectedLevel ===
              "All" ||
            student.levelNorm ===
              selectedLevel;

          const matchesHorario =
            selectedHorario ===
              "All" ||
            student.scheduleBlock ===
              selectedHorario;

          let matchesFugaType =
            true;

          if (
            tableView ===
            "desercion"
          ) {
            if (
              filterFugaType ===
                "Nuevos" &&
              student.levelNorm !==
                "L01"
            ) {
              matchesFugaType =
                false;
            }

            if (
              filterFugaType ===
                "Regulares" &&
              student.levelNorm ===
                "L01"
            ) {
              matchesFugaType =
                false;
            }
          }

          return (
            matchesSearch &&
            matchesCategory &&
            matchesFrecuencia &&
            matchesLevel &&
            matchesHorario &&
            matchesFugaType
          );
        }
      );
    }, [
      sourceData,
      tableView,
      searchTerm,
      selectedCategory,
      selectedFrecuencia,
      selectedLevel,
      selectedHorario,
      filterFugaType,
    ]);

  /* =======================================================
     GRÁFICO POR NIVEL
     ======================================================= */

  const chartCategories =
    useMemo(() => {
      return [
        "All",

        ...Array.from(
          new Set(
            dropouts
              .map(
                (student) =>
                  student.category
              )
              .filter(Boolean)
          )
        ).sort(),
      ];
    }, [dropouts]);

  const barSource =
    useMemo(() => {
      if (
        levelChartCategory ===
        "All"
      ) {
        return dropouts;
      }

      return dropouts.filter(
        (student) =>
          student.category ===
          levelChartCategory
      );
    }, [
      dropouts,
      levelChartCategory,
    ]);

  const chartDataLevel =
    useMemo(() => {
      const countByLevel =
        barSource.reduce(
          (
            accumulator,
            student
          ) => {
            const level =
              student.levelNorm ||
              "N/A";

            accumulator[level] =
              (
                accumulator[level] ||
                0
              ) + 1;

            return accumulator;
          },
          {}
        );

      return Object.keys(
        countByLevel
      )
        .map((level) => ({
          name: level,

          count:
            countByLevel[level],
        }))
        .sort((a, b) => {
          const aLevel =
            parseInt(
              a.name.replace(
                /\D/g,
                ""
              ),
              10
            ) || 0;

          const bLevel =
            parseInt(
              b.name.replace(
                /\D/g,
                ""
              ),
              10
            ) || 0;

          return (
            aLevel -
            bLevel
          );
        });
    }, [barSource]);

  /* =======================================================
     PIE DE FUGAS
     ======================================================= */

  const chartDataPie =
    useMemo(() => {
      const countByKey =
        dropouts.reduce(
          (
            accumulator,
            student
          ) => {
            const key =
              pieMode ===
              "horario"
                ? student.scheduleBlock ||
                  "N/A"
                : student.frequencyNorm ||
                  "N/A";

            accumulator[key] =
              (
                accumulator[key] ||
                0
              ) + 1;

            return accumulator;
          },
          {}
        );

      return Object.keys(
        countByKey
      )
        .map((key) => ({
          name: key,

          value:
            countByKey[key],
        }))
        .sort(
          (a, b) =>
            b.value -
            a.value
        );
    }, [
      dropouts,
      pieMode,
    ]);

  /* =======================================================
     EXPORTAR EXCEL
     ======================================================= */

  const exportExcel = () => {
    if (
      !filteredData.length
    ) {
      return;
    }

    const rows =
      filteredData.map(
        (student) => {
          const crm =
            crmData[
              student.idNorm
            ] || {};

          const baseRow = {
            Cedula:
              student.id,

            Estudiante:
              student.name,

            Categoria:
              student.category,

            Nivel:
              student.levelNorm,

            Frecuencia:
              student.frequencyNorm ||
              "N/A",

            Horario:
              student.scheduleBlock ||
              "N/A",

            Email:
              student.email || "",

            Telefono:
              student.phone || "",
          };

          if (
            tableView ===
            "desercion"
          ) {
            return {
              ...baseRow,

              "Estatus CRM":
                crm.status ||
                "Pendiente",

              Motivo:
                crm.motive ||
                "",

              Notas:
                crm.notes ||
                "",
            };
          }

          if (
            tableView ===
            "cambios"
          ) {
            return {
              ...baseRow,

              "Frecuencia Anterior":
                student.oldFrequency ||
                "N/A",

              "Familia Anterior":
                student.oldFrequencyBase ||
                "N/A",

              "Familia Nueva":
                student.newFrequencyBase ||
                "N/A",
            };
          }

          if (
            tableView ===
              "transNinosJovenes" ||
            tableView ===
              "transJovenesAdultos"
          ) {
            return {
              ...baseRow,

              "Categoría Anterior":
                student.oldCategory ||
                "N/A",
            };
          }

          return baseRow;
        }
      );

    const worksheet =
      XLSX.utils.json_to_sheet(
        rows
      );

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Datos Continuidad"
    );

    XLSX.writeFile(
      workbook,
      `BD_Continuidad_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
  };

  /* =======================================================
     IMPORTAR CRM DESDE EXCEL
     ======================================================= */

  const importExcel = (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader =
      new FileReader();

    reader.onload = (
      readerEvent
    ) => {
      try {
        const binary =
          readerEvent.target.result;

        const workbook =
          XLSX.read(binary, {
            type: "binary",
          });

        const firstSheetName =
          workbook.SheetNames[0];

        if (!firstSheetName) {
          throw new Error(
            "El archivo Excel no contiene hojas."
          );
        }

        const worksheet =
          workbook.Sheets[
            firstSheetName
          ];

        const data =
          XLSX.utils.sheet_to_json(
            worksheet
          );

        const nextCrm = {
          ...crmData,
        };

        data.forEach((row) => {
          if (
            !row.Cedula ||
            !row["Estatus CRM"]
          ) {
            return;
          }

          const key =
            normalizeStudentId(
              row.Cedula
            );

          if (!key) {
            return;
          }

          nextCrm[key] = {
            status:
              row["Estatus CRM"] ||
              "Pendiente",

            motive:
              row.Motivo ||
              "",

            notes:
              row.Notas ||
              "",

            updatedAt:
              new Date().toISOString(),
          };
        });

        setCrmData(
          nextCrm
        );

        saveCrmToStorage(
          analysisStorageKey,
          nextCrm
        );

        event.target.value =
          "";
      } catch (error) {
        console.error(error);

        setErrorMsg(
          "No se pudo importar la base de datos CRM."
        );
      }
    };

    reader.readAsBinaryString(
      file
    );
  };

  /* =======================================================
     REPORTE PDF
     ======================================================= */

  const generatePDFReport = () => {
    const winBackText =
      winBackRate === null
        ? "Sin contactos registrados"
        : `${winBackRate}%`;

    const transitionText =
      stats.categoryTransitionsAvailable
        ? `${
            stats.transNinosJovenes +
            stats.transJovenesAdultos
          } transiciones`
        : "N/A para las categorías cargadas";

    const dropoutCategories =
      Array.from(
        new Set(
          dropouts.map(
            (student) =>
              student.category
          )
        )
      );

    const docDefinition = {
      pageSize: "A4",

      pageMargins: [
        40,
        60,
        40,
        60,
      ],

      header: {
        text: "REPORTE CORPORATIVO DE CONTINUIDAD",

        margin: [
          40,
          20,
          40,
          0,
        ],

        fontSize: 10,

        color: "#64748b",

        alignment: "right",
      },

      content: [
        {
          text: "DASHBOARD DE CONTINUIDAD",
          style: "title",
        },

        {
          text: "Informe Ejecutivo de Retención Académica",
          style: "subtitle",
        },

        {
          text: `Fecha de emisión: ${new Date().toLocaleDateString()}`,
          style: "date",
        },

        {
          text: `Motor de reglas: ${CONTINUIDAD_RULES_VERSION}`,
          style: "version",
        },

        "\n",

        {
          text: "1. Resumen de Desempeño General",
          style: "sectionHeader",
        },

        {
          text:
            `El período anterior contiene ${stats.oldTotal} estudiantes. ` +
            `De ellos, ${stats.graduados} corresponden a graduandos y ${stats.eligibleOld} son elegibles para continuidad. ` +
            `Se identificaron ${stats.reenrolled} reinscritos, equivalentes a una tasa de retención de ${stats.reenrolledPct}%. ` +
            `La pérdida es de ${stats.lost} estudiantes, equivalente a ${stats.lostPct}%. ` +
            `El período actual contiene ${stats.newTotal} estudiantes.`,

          alignment:
            "justify",

          margin: [
            0,
            0,
            0,
            10,
          ],

          lineHeight: 1.5,
        },

        {
          text: "2. Indicadores Clave de Gestión",
          style: "sectionHeader",
        },

        {
          style: "kpiTable",

          table: {
            widths: [
              "*",
              "*",
              "*",
            ],

            body: [
              [
                {
                  text: "Densidad Promedio",
                  style: "kpiLabel",
                },

                {
                  text: "Transición de Categorías",
                  style: "kpiLabel",
                },

                {
                  text: "Tasa de Rescate",
                  style: "kpiLabel",
                },
              ],

              [
                {
                  text: `${stats.avgDensity} / Sección`,
                  style: "kpiValue",
                },

                {
                  text: transitionText,
                  style: "kpiValue",
                },

                {
                  text: winBackText,
                  style: "kpiValue",
                },
              ],
            ],
          },

          layout:
            "lightHorizontalLines",
        },

        "\n",

        {
          ul: [
            {
              text:
                `Fuga L01: ${stats.nuevosLost} de ${stats.nuevosEligible} estudiantes (${stats.nuevosLostPct}%).`,

              margin: [
                0,
                0,
                0,
                5,
              ],
            },

            {
              text:
                `Fuga de estudiantes regulares: ${stats.regularesLost} de ${stats.regularesEligible} (${stats.regularesLostPct}%).`,

              margin: [
                0,
                0,
                0,
                5,
              ],
            },

            {
              text:
                `Mayor volumen de fuga: "${stats.topHorarioFugas}", con ${stats.topHorarioFugasCount} pérdida(s), equivalente a ${stats.topHorarioFugasRate}% de ${stats.topHorarioFugasEligible} elegibles en ese horario.`,

              margin: [
                0,
                0,
                0,
                5,
              ],
            },

            {
              text:
                `Mayor tasa de fuga por horario: "${stats.topHorarioRate}", con ${stats.topHorarioRatePct}% (${stats.topHorarioRateLost} de ${stats.topHorarioRateEligible}).`,

              margin: [
                0,
                0,
                0,
                5,
              ],
            },

            {
              text:
                `Movimientos: ${stats.graduados} graduandos, ${stats.nuevosL01} ingresos L01, ${stats.nuevosNivelacion} ingresos L02+ no presentes en el período anterior y ${stats.cambiosFreq} cambios reales de frecuencia.`,

              margin: [
                0,
                0,
                0,
                5,
              ],
            },

            {
              text:
                winBackRate === null
                  ? `Gestión CRM: todavía no se han registrado contactos sobre las ${stats.lost} fugas.`
                  : `Gestión CRM: de ${stats.lost} fugas, se han contactado ${contactedCount} y se han rescatado ${rescuedCount}, para una efectividad de ${winBackRate}%.`,
            },
          ],

          margin: [
            0,
            0,
            0,
            20,
          ],
        },

        {
          text: "3. Matriz de Fuga por Categoría",
          style: "sectionHeader",
        },

        {
          table: {
            headerRows: 1,

            widths: [
              "*",
              "auto",
              "auto",
            ],

            body: [
              [
                {
                  text: "Categoría",
                  style: "tableHeader",
                },

                {
                  text: "Alumnos Perdidos",
                  style: "tableHeader",
                  alignment: "center",
                },

                {
                  text: "% del Total",
                  style: "tableHeader",
                  alignment: "center",
                },
              ],

              ...dropoutCategories.map(
                (category) => {
                  const count =
                    dropouts.filter(
                      (student) =>
                        student.category ===
                        category
                    ).length;

                  const percentage =
                    stats.lost > 0
                      ? Math.round(
                          (count /
                            stats.lost) *
                            100
                        )
                      : 0;

                  return [
                    category ||
                      "N/A",

                    {
                      text:
                        count.toString(),

                      alignment:
                        "center",
                    },

                    {
                      text: `${percentage}%`,

                      alignment:
                        "center",
                    },
                  ];
                }
              ),
            ],
          },

          layout: "borders",
        },

        "\n",

        {
          text: "4. Control de Conciliación",
          style: "sectionHeader",
        },

        {
          text:
            `Anterior: ${stats.oldTotal} = ${stats.eligibleOld} elegibles + ${stats.graduados} graduandos.\n` +
            `Elegibles: ${stats.eligibleOld} = ${stats.reenrolled} reinscritos + ${stats.lost} fugas.\n` +
            `Actual: ${stats.newTotal} estudiantes.\n` +
            `Conciliación interna: ${
              stats.reconciliationOk
                ? "CORRECTA"
                : "REVISAR"
            }.`,

          margin: [
            0,
            0,
            0,
            10,
          ],
        },

        {
          text: "5. Nota metodológica",
          style: "sectionHeader",
        },

        {
          text:
            "Los estudiantes clasificados como ingresos L02+ son personas presentes en el período actual que no aparecen en el período inmediatamente anterior y están ubicadas en L02 o superior. Esta condición no demuestra por sí sola que hayan ingresado mediante prueba de nivelación; pueden existir reingresos de períodos más antiguos y debe verificarse el récord en el SGA.",

          alignment:
            "justify",
        },
      ],

      styles: {
        title: {
          fontSize: 22,
          bold: true,
          color: "#0f172a",
          alignment: "center",
        },

        subtitle: {
          fontSize: 14,
          color: "#475569",
          alignment: "center",

          margin: [
            0,
            5,
            0,
            5,
          ],
        },

        date: {
          fontSize: 10,
          color: "#94a3b8",
          alignment: "center",
        },

        version: {
          fontSize: 8,
          color: "#94a3b8",
          alignment: "center",

          margin: [
            0,
            3,
            0,
            20,
          ],
        },

        sectionHeader: {
          fontSize: 14,
          bold: true,
          color: "#1e293b",

          margin: [
            0,
            15,
            0,
            8,
          ],

          decoration:
            "underline",
        },

        kpiTable: {
          margin: [
            0,
            10,
            0,
            15,
          ],
        },

        kpiLabel: {
          fontSize: 10,
          color: "#64748b",
          bold: true,
          alignment: "center",
        },

        kpiValue: {
          fontSize: 14,
          color: "#0f172a",
          bold: true,
          alignment: "center",

          margin: [
            0,
            5,
            0,
            5,
          ],
        },

        tableHeader: {
          bold: true,
          fontSize: 11,
          color: "white",
          fillColor: "#334155",
        },
      },
    };

    pdfMake
      .createPdf(
        docDefinition
      )
      .download(
        `Dashboard_Continuidad_${new Date()
          .toISOString()
          .slice(0, 10)}.pdf`
      );
  };

  /* =======================================================
     REPORTE WORD
     ======================================================= */

  const generateWordReport =
    async () => {
      const categoryRows = [
        new Docx.TableRow({
          children: [
            new Docx.TableCell({
              children: [
                new Docx.Paragraph({
                  text: "Categoría",
                  bold: true,
                }),
              ],
            }),

            new Docx.TableCell({
              children: [
                new Docx.Paragraph({
                  text: "Total Deserción",
                  bold: true,
                }),
              ],
            }),
          ],
        }),

        ...Array.from(
          new Set(
            dropouts.map(
              (student) =>
                student.category
            )
          )
        ).map((category) => {
          const count =
            dropouts.filter(
              (student) =>
                student.category ===
                category
            ).length;

          return new Docx.TableRow({
            children: [
              new Docx.TableCell({
                children: [
                  new Docx.Paragraph({
                    text:
                      category ||
                      "N/A",
                  }),
                ],
              }),

              new Docx.TableCell({
                children: [
                  new Docx.Paragraph({
                    text:
                      count.toString(),
                  }),
                ],
              }),
            ],
          });
        }),
      ];

      const rescueText =
        winBackRate === null
          ? "No existen contactos registrados; la tasa de rescate todavía no es calculable."
          : `Se contactó a ${contactedCount} alumnos, logrando recuperar a ${rescuedCount} (${winBackRate}% de efectividad).`;

      const transitionText =
        stats.categoryTransitionsAvailable
          ? `${
              stats.transNinosJovenes +
              stats.transJovenesAdultos
            } transiciones detectadas.`
          : "No evaluable con las categorías incluidas en los archivos cargados.";

      const document =
        new Docx.Document({
          sections: [
            {
              properties: {},

              children: [
                new Docx.Paragraph({
                  text: "DASHBOARD DE CONTINUIDAD",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_1,

                  alignment:
                    Docx.AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: "Informe Ejecutivo de Retención Académica",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_2,

                  alignment:
                    Docx.AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: `Fecha de emisión: ${new Date().toLocaleDateString()}`,

                  alignment:
                    Docx.AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: `Motor de reglas: ${CONTINUIDAD_RULES_VERSION}`,

                  alignment:
                    Docx.AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "1. Resumen General Académico",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Paragraph({
                  text:
                    `El período anterior contiene ${stats.oldTotal} estudiantes. ` +
                    `${stats.graduados} corresponden a graduandos y ${stats.eligibleOld} son elegibles para continuidad. ` +
                    `Se reinscribieron ${stats.reenrolled} estudiantes (${stats.reenrolledPct}%) y se identificaron ${stats.lost} pérdidas (${stats.lostPct}%). ` +
                    `El período actual contiene ${stats.newTotal} estudiantes.`,
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "2. Indicadores Clave de Gestión",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Paragraph({
                  text: `• Fuga L01: ${stats.nuevosLost} de ${stats.nuevosEligible} (${stats.nuevosLostPct}%).`,
                }),

                new Docx.Paragraph({
                  text: `• Fuga Regulares: ${stats.regularesLost} de ${stats.regularesEligible} (${stats.regularesLostPct}%).`,
                }),

                new Docx.Paragraph({
                  text: `• Graduandos: ${stats.graduados}.`,
                }),

                new Docx.Paragraph({
                  text: `• Ingresos L01: ${stats.nuevosL01}.`,
                }),

                new Docx.Paragraph({
                  text: `• Ingresos L02+ no presentes en el período anterior: ${stats.nuevosNivelacion}.`,
                }),

                new Docx.Paragraph({
                  text: `• Densidad Promedio: ${stats.avgDensity} alumnos por sección activa (${stats.activeSections} secciones).`,
                }),

                new Docx.Paragraph({
                  text: `• Mayor volumen de fuga: "${stats.topHorarioFugas}", con ${stats.topHorarioFugasCount} estudiantes.`,
                }),

                new Docx.Paragraph({
                  text: `• Mayor tasa de fuga: "${stats.topHorarioRate}", con ${stats.topHorarioRatePct}% (${stats.topHorarioRateLost} de ${stats.topHorarioRateEligible}).`,
                }),

                new Docx.Paragraph({
                  text: `• Cambios reales de frecuencia: ${stats.cambiosFreq}.`,
                }),

                new Docx.Paragraph({
                  text: `• Transiciones de categoría: ${transitionText}`,
                }),

                new Docx.Paragraph({
                  text: `• Tasa de Rescate: ${rescueText}`,
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "3. Control de Conciliación",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Paragraph({
                  text: `Anterior: ${stats.oldTotal} = ${stats.eligibleOld} elegibles + ${stats.graduados} graduandos.`,
                }),

                new Docx.Paragraph({
                  text: `Elegibles: ${stats.eligibleOld} = ${stats.reenrolled} reinscritos + ${stats.lost} fugas.`,
                }),

                new Docx.Paragraph({
                  text: `Actual: ${stats.newTotal} estudiantes.`,
                }),

                new Docx.Paragraph({
                  text: `Conciliación interna: ${
                    stats.reconciliationOk
                      ? "CORRECTA"
                      : "REVISAR"
                  }.`,
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "4. Matriz de Fuga por Categoría",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Table({
                  rows:
                    categoryRows,

                  width: {
                    size: 100,

                    type:
                      Docx.WidthType
                        .PERCENTAGE,
                  },
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "5. Nota metodológica",

                  heading:
                    Docx.HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Paragraph({
                  text:
                    "Los estudiantes identificados como ingresos L02+ son personas presentes en el período actual que no aparecen en el período inmediatamente anterior y están inscritas en L02 o superior. Esta condición no demuestra por sí sola que hayan ingresado mediante nivelación; el estatus debe validarse en el SGA.",
                }),
              ],
            },
          ],
        });

      const blob =
        await Docx.Packer.toBlob(
          document
        );

      saveAs(
        blob,
        `Dashboard_Continuidad_${new Date()
          .toISOString()
          .slice(0, 10)}.docx`
      );
    };

  /* =======================================================
     PANTALLA DE CARGA
     ======================================================= */

  if (
    activeTab === "upload"
  ) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />

            Dashboard de Continuidad - Carga de Datos
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Carga los listados del período anterior y del período actual.
          </p>
        </header>

        {errorMsg && (
          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            <strong>
              Error de validación:
            </strong>{" "}
            {errorMsg}
          </div>
        )}

        {qualityData?.critical?.length >
          0 && (
          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            <p className="font-bold mb-2">
              Problemas críticos detectados
            </p>

            <ul className="list-disc pl-5 space-y-1">
              {qualityData.critical.map(
                (
                  message,
                  index
                ) => (
                  <li key={index}>
                    {message}
                  </li>
                )
              )}
            </ul>
          </div>
        )}

        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <div className="font-bold flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4" />

            Validación estricta activada
          </div>

          <p>
            Si falta un archivo, una identificación, un nivel o existe una inconsistencia crítica, el sistema detendrá el análisis antes de mostrar KPIs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PERÍODO ANTERIOR */}

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">
                Período ANTERIOR
              </span>

              <button
                type="button"
                onClick={() =>
                  setPdfOldFiles([])
                }
                className="text-slate-500 hover:text-red-600 text-sm inline-flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />

                Eliminar Todos
              </button>
            </div>

            <label className="block text-xs font-bold text-slate-600 mb-1">
              Identificación del Intensivo
            </label>

            <select
              value={
                oldIntensivoLabel
              }
              onChange={(event) =>
                setOldIntensivoLabel(
                  event.target.value
                )
              }
              className="w-full mb-4 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="INTENSIVO A">
                INTENSIVO A
              </option>

              <option value="INTENSIVO B">
                INTENSIVO B
              </option>

              <option value="INTENSIVO">
                INTENSIVO
              </option>
            </select>

            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(event) => {
                const files =
                  Array.from(
                    event.target.files ||
                      []
                  );

                setPdfOldFiles(
                  (previous) =>
                    mergeFiles(
                      previous,
                      files
                    )
                );

                event.target.value =
                  "";
              }}
              className="block w-full text-sm"
            />

            <div className="text-xs text-slate-500 mt-2">
              {pdfOldFiles.length
                ? `Seleccionados: ${pdfOldFiles.length}`
                : "No hay PDFs seleccionados."}
            </div>

            {pdfOldFiles.length >
              0 && (
              <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-2">
                {pdfOldFiles.map(
                  (
                    file,
                    index
                  ) => (
                    <li
                      key={fileKey(
                        file
                      )}
                      className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded"
                    >
                      <span className="text-slate-700 truncate">
                        {file.name}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeOldAt(
                            index
                          )
                        }
                        className="text-slate-500 hover:text-red-600 inline-flex items-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>

          {/* PERÍODO ACTUAL */}

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                Período ACTUAL
              </span>

              <button
                type="button"
                onClick={() =>
                  setPdfNewFiles([])
                }
                className="text-slate-500 hover:text-red-600 text-sm inline-flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />

                Eliminar Todos
              </button>
            </div>

            <label className="block text-xs font-bold text-slate-600 mb-1">
              Identificación del Intensivo
            </label>

            <select
              value={
                newIntensivoLabel
              }
              onChange={(event) =>
                setNewIntensivoLabel(
                  event.target.value
                )
              }
              className="w-full mb-4 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="INTENSIVO A">
                INTENSIVO A
              </option>

              <option value="INTENSIVO B">
                INTENSIVO B
              </option>

              <option value="INTENSIVO">
                INTENSIVO
              </option>
            </select>

            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(event) => {
                const files =
                  Array.from(
                    event.target.files ||
                      []
                  );

                setPdfNewFiles(
                  (previous) =>
                    mergeFiles(
                      previous,
                      files
                    )
                );

                event.target.value =
                  "";
              }}
              className="block w-full text-sm"
            />

            <div className="text-xs text-slate-500 mt-2">
              {pdfNewFiles.length
                ? `Seleccionados: ${pdfNewFiles.length}`
                : "No hay PDFs seleccionados."}
            </div>

            {pdfNewFiles.length >
              0 && (
              <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-2">
                {pdfNewFiles.map(
                  (
                    file,
                    index
                  ) => (
                    <li
                      key={fileKey(
                        file
                      )}
                      className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded"
                    >
                      <span className="text-slate-700 truncate">
                        {file.name}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeNewAt(
                            index
                          )
                        }
                        className="text-slate-500 hover:text-red-600 inline-flex items-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={
              processPdfs
            }
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-bold shadow flex items-center gap-2"
          >
            <RefreshCw
              className={`h-5 w-5 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />

            {loading
              ? "Procesando y validando..."
              : "Procesar y Comparar"}
          </button>

          <button
            type="button"
            onClick={resetAll}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold"
          >
            Reiniciar
          </button>
        </div>
      </div>
    );
  }

  /* =======================================================
     DASHBOARD
     ======================================================= */

  return (
    <div
      className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800 relative print:bg-white print:p-0"
      id="dashboard-content"
    >
      {/* HEADER */}

      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />

            Dashboard de Continuidad
          </h1>

          <p className="text-xs text-slate-500 mt-1">
            Período anterior:{" "}
            <strong>
              {oldIntensivoLabel}
            </strong>{" "}
            · Período actual:{" "}
            <strong>
              {newIntensivoLabel}
            </strong>
          </p>

          <p className="text-[10px] text-slate-400 mt-1">
            Motor de reglas:{" "}
            {CONTINUIDAD_RULES_VERSION}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              setActiveTab(
                "upload"
              )
            }
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg shadow-sm text-xs font-medium"
          >
            <Upload className="h-4 w-4" />

            PDFs
          </button>

          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            className="hidden"
            onChange={
              importExcel
            }
          />

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg shadow-sm text-xs font-medium"
          >
            <FileUp className="h-4 w-4" />

            Importar BD
          </button>

          <button
            type="button"
            onClick={
              exportExcel
            }
            disabled={
              !filteredData.length
            }
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg shadow text-xs font-medium"
          >
            <Save className="h-4 w-4" />

            Excel
          </button>

          <button
            type="button"
            onClick={
              generateWordReport
            }
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium"
          >
            <File className="h-4 w-4" />

            Word
          </button>

          <button
            type="button"
            onClick={
              generatePDFReport
            }
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium"
          >
            <FileText className="h-4 w-4" />

            PDF
          </button>

          <button
            type="button"
            onClick={() =>
              window.print()
            }
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg shadow text-xs font-medium"
          >
            <Printer className="h-4 w-4" />

            Imprimir
          </button>
        </div>
      </header>

      {/* CONCILIACIÓN */}

      {stats.reconciliationOk && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 print:hidden">
          <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />

          <div className="text-sm">
            <p className="font-bold text-emerald-800">
              Conciliación interna correcta
            </p>

            <p className="text-emerald-700 mt-1">
              Anterior:{" "}
              <strong>
                {stats.oldTotal}
              </strong>{" "}
              ={" "}
              <strong>
                {stats.eligibleOld}
              </strong>{" "}
              elegibles +{" "}
              <strong>
                {stats.graduados}
              </strong>{" "}
              graduandos. Elegibles:{" "}
              <strong>
                {stats.eligibleOld}
              </strong>{" "}
              ={" "}
              <strong>
                {stats.reenrolled}
              </strong>{" "}
              reinscritos +{" "}
              <strong>
                {stats.lost}
              </strong>{" "}
              fugas. Actual:{" "}
              <strong>
                {stats.newTotal}
              </strong>{" "}
              estudiantes.
            </p>
          </div>
        </div>
      )}

      {/* ADVERTENCIAS */}

      {qualityData?.warnings?.length >
        0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 print:hidden">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />

          <div className="text-sm text-amber-900">
            <p className="font-bold mb-1">
              Advertencias de calidad de datos
            </p>

            <ul className="list-disc pl-5 space-y-1">
              {qualityData.warnings.map(
                (
                  warning,
                  index
                ) => (
                  <li key={index}>
                    {warning}
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ===================================================
          INDICADORES
          =================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* REINSCRITOS */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Total Reinscritos
            </p>

            <CheckCircle className="h-5 w-5 text-emerald-500 print:hidden" />
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-4xl font-black text-emerald-600">
              {stats.reenrolledPct}%
            </h3>

            <p className="text-lg font-bold text-slate-700">
              ({stats.reenrolled})
            </p>
          </div>

          <p className="text-xs text-slate-400 font-medium">
            De{" "}
            {stats.eligibleOld}{" "}
            elegibles para continuidad
          </p>
        </div>

        {/* PÉRDIDA */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-rose-500 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Total Pérdida
            </p>

            <XCircle className="h-5 w-5 text-rose-500 print:hidden" />
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-4xl font-black text-rose-600">
              {stats.lostPct}%
            </h3>

            <p className="text-lg font-bold text-slate-700">
              ({stats.lost})
            </p>
          </div>

          <p className="text-xs text-slate-400 font-medium">
            De{" "}
            {stats.eligibleOld}{" "}
            elegibles para continuidad
          </p>
        </div>

        {/* NUEVOS VS REGULARES */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Fuga: Nuevos vs Regulares
            </p>

            <AlertTriangle className="h-5 w-5 text-amber-400 print:hidden" />
          </div>

          <div className="mt-2 flex items-end gap-4">
            <div
              className={`cursor-pointer px-2 py-1 rounded transition-colors ${
                filterFugaType ===
                "Nuevos"
                  ? "bg-rose-100 ring-2 ring-rose-400"
                  : "hover:bg-slate-100"
              }`}
              onClick={() => {
                setTableView(
                  "desercion"
                );

                setFilterFugaType(
                  (previous) =>
                    previous ===
                    "Nuevos"
                      ? "All"
                      : "Nuevos"
                );
              }}
            >
              <div>
                <span className="text-2xl font-black text-rose-600">
                  {stats.nuevosLost}
                </span>

                <span className="text-xs font-bold text-slate-500 ml-1">
                  L01
                </span>
              </div>

              <p className="text-xs text-rose-500 font-semibold">
                {stats.nuevosLostPct}% de{" "}
                {stats.nuevosEligible}
              </p>
            </div>

            <div className="text-slate-300 pb-4">
              |
            </div>

            <div
              className={`cursor-pointer px-2 py-1 rounded transition-colors ${
                filterFugaType ===
                "Regulares"
                  ? "bg-slate-200 ring-2 ring-slate-400"
                  : "hover:bg-slate-100"
              }`}
              onClick={() => {
                setTableView(
                  "desercion"
                );

                setFilterFugaType(
                  (previous) =>
                    previous ===
                    "Regulares"
                      ? "All"
                      : "Regulares"
                );
              }}
            >
              <div>
                <span className="text-2xl font-black text-slate-700">
                  {stats.regularesLost}
                </span>

                <span className="text-xs font-bold text-slate-500 ml-1">
                  Regulares
                </span>
              </div>

              <p className="text-xs text-slate-500 font-semibold">
                {stats.regularesLostPct}% de{" "}
                {stats.regularesEligible}
              </p>
            </div>
          </div>

          {filterFugaType !==
            "All" && (
            <p className="text-xs text-blue-500 font-semibold mt-1">
              Filtro activo. Clic para quitar.
            </p>
          )}
        </div>

        {/* RESCATE */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-b-4 border-b-blue-500 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Tasa Éxito Rescate
            </p>

            <Phone className="h-5 w-5 text-blue-500 print:hidden" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-blue-600">
              {winBackRate ===
              null
                ? "—"
                : `${winBackRate}%`}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {contactedCount ===
              0
                ? "Sin contactos registrados"
                : `${rescuedCount} de ${contactedCount} contactados`}
            </p>
          </div>
        </div>

        {/* MAYOR VOLUMEN */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Mayor Volumen de Fugas
            </p>

            <Clock className="h-5 w-5 text-amber-500 print:hidden" />
          </div>

          <div className="mt-2">
            <h3
              className="text-lg font-black text-slate-800"
              title={
                stats.topHorarioFugas
              }
            >
              {stats.topHorarioFugas}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {stats.topHorarioFugasCount} pérdida(s) ·{" "}
              {stats.topHorarioFugasRate}%
            </p>
          </div>
        </div>

        {/* MAYOR TASA */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Mayor Tasa de Fuga
            </p>

            <AlertTriangle className="h-5 w-5 text-orange-500 print:hidden" />
          </div>

          <div className="mt-2">
            <h3 className="text-lg font-black text-slate-800">
              {stats.topHorarioRate}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {stats.topHorarioRatePct}% ·{" "}
              {stats.topHorarioRateLost} de{" "}
              {stats.topHorarioRateEligible}
            </p>
          </div>
        </div>

        {/* DENSIDAD */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Densidad Promedio
            </p>

            <Users className="h-5 w-5 text-indigo-400 print:hidden" />
          </div>

          <div className="mt-2">
            <h3 className="text-3xl font-black text-slate-800">
              {stats.avgDensity}
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              Alumnos por sección ·{" "}
              {stats.activeSections} secciones
            </p>
          </div>
        </div>

        {/* TRANSICIÓN */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Transición Categorías
            </p>

            <TrendingUp className="h-5 w-5 text-emerald-400 print:hidden" />
          </div>

          {!stats.categoryTransitionsAvailable ? (
            <div className="mt-3">
              <h3 className="text-xl font-black text-slate-500">
                N/A
              </h3>

              <p className="text-xs text-slate-400">
                Las categorías cargadas no permiten evaluar transiciones.
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <div
                className="flex justify-between items-center bg-emerald-50 px-2 py-1 rounded mb-1 cursor-pointer hover:ring-2 ring-emerald-400 transition-all"
                onClick={() => {
                  setTableView(
                    "transNinosJovenes"
                  );

                  resetFilters();
                }}
              >
                <span className="text-xs font-bold text-emerald-700">
                  Niños ➔ Jóvenes
                </span>

                <span className="text-lg font-black text-emerald-600">
                  {stats.transNinosJovenes}
                </span>
              </div>

              <div
                className="flex justify-between items-center bg-blue-50 px-2 py-1 rounded cursor-pointer hover:ring-2 ring-blue-400 transition-all"
                onClick={() => {
                  setTableView(
                    "transJovenesAdultos"
                  );

                  resetFilters();
                }}
              >
                <span className="text-xs font-bold text-blue-700">
                  Jóvenes ➔ Adultos
                </span>

                <span className="text-lg font-black text-blue-600">
                  {stats.transJovenesAdultos}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* MOVIMIENTOS */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none md:col-span-2 lg:col-span-4">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Movimientos Externos
            </p>

            <GraduationCap className="h-5 w-5 text-indigo-400 print:hidden" />
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              className="text-left bg-indigo-50 rounded-lg px-3 py-2 hover:ring-2 ring-indigo-300"
              onClick={() => {
                setTableView(
                  "graduados"
                );

                resetFilters();
              }}
            >
              <p className="text-xs font-bold text-indigo-700">
                Graduandos
              </p>

              <p className="text-2xl font-black text-indigo-600">
                {stats.graduados}
              </p>

              <p className="text-xs text-indigo-500">
                Nivel terminal del período anterior
              </p>
            </button>

            <button
              type="button"
              className="text-left bg-emerald-50 rounded-lg px-3 py-2 hover:ring-2 ring-emerald-300"
              onClick={() => {
                setTableView(
                  "nuevosL01"
                );

                resetFilters();
              }}
            >
              <p className="text-xs font-bold text-emerald-700">
                Ingresos Nivel 1
              </p>

              <p className="text-2xl font-black text-emerald-600">
                {stats.nuevosL01}
              </p>

              <p className="text-xs text-emerald-500">
                Nuevos ingresos según regla L01
              </p>
            </button>

            <button
              type="button"
              className="text-left bg-sky-50 rounded-lg px-3 py-2 hover:ring-2 ring-sky-300"
              onClick={() => {
                setTableView(
                  "nivelacion"
                );

                resetFilters();
              }}
            >
              <p className="text-xs font-bold text-sky-700">
                Ingresos L02+
              </p>

              <p className="text-2xl font-black text-sky-600">
                {stats.nuevosNivelacion}
              </p>

              <p className="text-xs text-sky-500">
                No presentes en período anterior
              </p>
            </button>

            <button
              type="button"
              className="text-left bg-amber-50 rounded-lg px-3 py-2 hover:ring-2 ring-amber-300"
              onClick={() => {
                setTableView(
                  "cambios"
                );

                resetFilters();
              }}
            >
              <p className="text-xs font-bold text-amber-700">
                Cambios Frecuencia
              </p>

              <p className="text-2xl font-black text-amber-600">
                {stats.cambiosFreq}
              </p>

              <p className="text-xs text-amber-500">
                Cambios reales de familia
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================
          GRÁFICOS
          =================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 print:break-inside-avoid">
        {/* DESERCIÓN POR NIVEL */}

        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 print:border print:shadow-none">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-lg font-bold text-slate-800">
              Volumen de Deserción por Nivel
            </h3>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg print:hidden flex-wrap">
              {chartCategories.map(
                (category) => (
                  <button
                    type="button"
                    key={category}
                    onClick={() =>
                      setLevelChartCategory(
                        category
                      )
                    }
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      levelChartCategory ===
                      category
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {category ===
                    "All"
                      ? "Todos"
                      : category}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={
                  chartDataLevel
                }
                onClick={(event) => {
                  if (
                    event?.activeLabel
                  ) {
                    setSelectedLevel(
                      event.activeLabel
                    );
                  }
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize: 10,
                  }}
                  interval={0}
                />

                <YAxis
                  allowDecimals={
                    false
                  }
                />

                <RechartsTooltip
                  cursor={{
                    fill: "#f1f5f9",
                  }}
                />

                <Bar
                  dataKey="count"
                  fill="#3b82f6"
                  radius={[
                    4,
                    4,
                    0,
                    0,
                  ]}
                  name="Estudiantes"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PIE */}

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 print:border print:shadow-none">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">
              Fuga por{" "}
              {pieMode ===
              "horario"
                ? "Horario"
                : "Frecuencia"}
            </h3>

            <button
              type="button"
              onClick={() =>
                setPieMode(
                  (previous) =>
                    previous ===
                    "horario"
                      ? "frecuencia"
                      : "horario"
                )
              }
              className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded print:hidden"
            >
              {pieMode ===
              "horario"
                ? "Ver por Frecuencia"
                : "Ver por Horario"}
            </button>
          </div>

          <div className="h-64 w-full cursor-pointer">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <PieChart>
                <Pie
                  data={
                    chartDataPie
                  }
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  onClick={
                    onClickPie
                  }
                >
                  {chartDataPie.map(
                    (
                      entry,
                      index
                    ) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          pieMode ===
                          "frecuencia"
                            ? FRECUENCIA_COLORS[
                                entry.name
                              ] ||
                              "#94a3b8"
                            : HORARIO_COLORS[
                                index %
                                  HORARIO_COLORS.length
                              ]
                        }
                      />
                    )
                  )}
                </Pie>

                <RechartsTooltip />

                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* NOTA L02+ */}

      {tableView ===
        "nivelacion" && (
        <div className="bg-amber-50 border border-amber-200 p-4 mb-4 rounded-lg flex gap-3 text-amber-800 text-sm print:hidden shadow-sm">
          <Info className="h-5 w-5 flex-shrink-0" />

          <p>
            <strong>
              Nota Institucional:
            </strong>{" "}
            estos estudiantes no aparecen en el período anterior y están inscritos en L02 o superior. El sistema{" "}
            <strong>
              no puede demostrar por sí solo que hayan ingresado mediante prueba de nivelación
            </strong>
            . También pueden existir reingresos de períodos más antiguos. Valida su récord en el SGA antes de clasificarlos definitivamente como nivelación.
          </p>
        </div>
      )}

      {/* ===================================================
          TABLA DINÁMICA
          =================================================== */}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden print:border print:shadow-none print:break-before-page">
        <div className="p-5 border-b border-slate-100 flex flex-col xl:flex-row gap-4 items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-400" />

            <select
              value={
                tableView
              }
              onChange={(event) => {
                setTableView(
                  event.target.value
                );

                resetFilters();
              }}
              className="bg-transparent text-lg font-bold text-slate-800 outline-none cursor-pointer border-b-2 border-slate-200 hover:border-blue-500 pb-1"
            >
              <option value="desercion">
                Deserciones (CRM de Fugas)
              </option>

              <option value="nuevosL01">
                Ingresos Nivel 1 (L01)
              </option>

              <option value="nivelacion">
                Ingresos L02+ no presentes anteriormente
              </option>

              <option value="cambios">
                Cambios de Frecuencia
              </option>

              <option value="graduados">
                Graduandos
              </option>

              <option value="transNinosJovenes">
                Transición: Niños ➔ Jóvenes
              </option>

              <option value="transJovenesAdultos">
                Transición: Jóvenes ➔ Adultos
              </option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <select
              value={
                selectedCategory
              }
              onChange={(event) =>
                setSelectedCategory(
                  event.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
            >
              {filterOptions.categories.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value ===
                    "All"
                      ? "Todas las categorías"
                      : value}
                  </option>
                )
              )}
            </select>

            <select
              value={
                selectedLevel
              }
              onChange={(event) =>
                setSelectedLevel(
                  event.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
            >
              {filterOptions.levels.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value ===
                    "All"
                      ? "Todos los niveles"
                      : value}
                  </option>
                )
              )}
            </select>

            <select
              value={
                selectedFrecuencia
              }
              onChange={(event) =>
                setSelectedFrecuencia(
                  event.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
            >
              {filterOptions.frecuencias.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value ===
                    "All"
                      ? "Todas las frecuencias"
                      : value}
                  </option>
                )
              )}
            </select>

            <select
              value={
                selectedHorario
              }
              onChange={(event) =>
                setSelectedHorario(
                  event.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
            >
              {filterOptions.horarios.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value ===
                    "All"
                      ? "Todos los horarios"
                      : value}
                  </option>
                )
              )}
            </select>

            <div className="relative flex-1 xl:w-64 min-w-52">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input
                type="text"
                placeholder="Buscar alumno..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={
                  searchTerm
                }
                onChange={(event) =>
                  setSearchTerm(
                    event.target.value
                  )
                }
              />
            </div>

            <button
              type="button"
              onClick={
                resetFilters
              }
              className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-200"
            >
              <Filter className="h-4 w-4" />

              Limpiar
            </button>
          </div>
        </div>

        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 print:hidden flex items-center gap-2">
          <Database className="h-3.5 w-3.5" />

          Mostrando{" "}
          <strong>
            {filteredData.length}
          </strong>{" "}
          registro(s)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap print:text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold print:bg-gray-100 print:text-gray-800">
                {tableView ===
                  "desercion" && (
                  <th className="p-4 border-b border-slate-100">
                    Estatus CRM
                  </th>
                )}

                <th className="p-4 border-b border-slate-100">
                  Estudiante
                </th>

                <th className="p-4 border-b border-slate-100">
                  Cédula
                </th>

                <th className="p-4 border-b border-slate-100">
                  Categoría
                </th>

                {(tableView ===
                  "transNinosJovenes" ||
                  tableView ===
                    "transJovenesAdultos") && (
                  <th className="p-4 border-b border-slate-100">
                    Cat. Anterior
                  </th>
                )}

                <th className="p-4 border-b border-slate-100">
                  Nivel
                </th>

                <th className="p-4 border-b border-slate-100">
                  Frecuencia{" "}
                  {tableView ===
                  "cambios"
                    ? "Nueva"
                    : ""}
                </th>

                {tableView ===
                  "cambios" && (
                  <th className="p-4 border-b border-slate-100">
                    Frec. Anterior
                  </th>
                )}

                <th className="p-4 border-b border-slate-100">
                  Horario
                </th>

                <th className="p-4 border-b border-slate-100">
                  Email
                </th>

                <th className="p-4 border-b border-slate-100 print:hidden">
                  Contacto Directo
                </th>

                <th className="p-4 border-b border-slate-100">
                  Teléfono
                </th>

                {tableView ===
                  "desercion" && (
                  <th className="p-4 border-b border-slate-100 text-center print:hidden">
                    Acción CRM
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="text-sm divide-y divide-slate-100">
              {filteredData.map(
                (student) => {
                  const crm =
                    crmData[
                      student.idNorm
                    ] || {
                      status:
                        "Pendiente",
                    };

                  const isManaged =
                    tableView ===
                      "desercion" &&
                    crm.status !==
                      "Pendiente";

                  const whatsappPhone =
                    normalizeWhatsAppPhone(
                      student.phone
                    );

                  return (
                    <tr
                      key={`${student.idNorm}-${tableView}`}
                      className={`hover:bg-slate-50 ${
                        isManaged
                          ? "bg-slate-50/50"
                          : ""
                      } print:border-b`}
                    >
                      {tableView ===
                        "desercion" && (
                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border print:border-none print:px-0 ${getCrmStatusColor(
                              crm.status
                            )}`}
                          >
                            {crm.status}
                          </span>
                        </td>
                      )}

                      <td className="p-4 font-bold text-slate-800">
                        {student.name}
                      </td>

                      <td className="p-4 text-slate-500 font-mono text-xs">
                        {student.id}
                      </td>

                      <td className="p-4 text-slate-600">
                        {student.category}
                      </td>

                      {(tableView ===
                        "transNinosJovenes" ||
                        tableView ===
                          "transJovenesAdultos") && (
                        <td className="p-4 text-emerald-600 font-medium">
                          {student.oldCategory}
                        </td>
                      )}

                      <td className="p-4">
                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600 print:bg-transparent print:px-0">
                          {student.levelNorm}
                        </span>
                      </td>

                      <td className="p-4 text-slate-600">
                        {student.frequencyNorm}
                      </td>

                      {tableView ===
                        "cambios" && (
                        <td className="p-4 text-amber-600 font-medium">
                          {student.oldFrequency}
                        </td>
                      )}

                      <td className="p-4 text-slate-600">
                        {student.scheduleBlock}
                      </td>

                      <td className="p-4 text-slate-500">
                        {student.email ||
                          "N/A"}
                      </td>

                      <td className="p-4 print:hidden">
                        <div className="flex items-center gap-2">
                          {student.phone ? (
                            <>
                              {whatsappPhone && (
                                <a
                                  href={`https://wa.me/${whatsappPhone}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                                  title="Escribir por WhatsApp"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              )}

                              <a
                                href={`tel:${student.phone}`}
                                className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Llamada Telefónica"
                              >
                                <Phone className="h-4 w-4" />
                              </a>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">
                              N/A
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-slate-600">
                        {student.phone ||
                          "N/A"}
                      </td>

                      {tableView ===
                        "desercion" && (
                        <td className="p-4 text-center print:hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setCrmModal(
                                {
                                  isOpen:
                                    true,

                                  student,
                                }
                              )
                            }
                            className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 mx-auto transition-colors"
                          >
                            <Edit3 className="h-3 w-3" />

                            Gestionar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                }
              )}

              {!filteredData.length && (
                <tr>
                  <td
                    colSpan={14}
                    className="p-8 text-center text-slate-400"
                  >
                    No existen registros que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================
          CRM MODAL
          =================================================== */}

      {crmModal.isOpen &&
        crmModal.student && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 print:hidden">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-800">
                    Gestionar Alumno
                  </h3>

                  <p className="text-xs text-slate-500">
                    {crmModal.student.name}{" "}
                    ({crmModal.student.id})
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCrmModal({
                      isOpen:
                        false,

                      student:
                        null,
                    })
                  }
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <form
                onSubmit={
                  saveCrmData
                }
                className="p-5 flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Estatus del Rescate
                  </label>

                  <select
                    name="status"
                    defaultValue={
                      crmData[
                        crmModal
                          .student
                          .idNorm
                      ]?.status ||
                      "Pendiente"
                    }
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="Pendiente">
                      Pendiente (No contactado)
                    </option>

                    <option value="En Gestión">
                      En Gestión (Esperando respuesta)
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
                    Motivo Principal de Fuga
                  </label>

                  <select
                    name="motive"
                    defaultValue={
                      crmData[
                        crmModal
                          .student
                          .idNorm
                      ]?.motive ||
                      ""
                    }
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">
                      Seleccione un motivo...
                    </option>

                    <option value="Económico">
                      Económico / Presupuesto
                    </option>

                    <option value="Horario Incompatible">
                      Horario Incompatible
                    </option>

                    <option value="Viaje / Mudanza">
                      Viaje / Mudanza
                    </option>

                    <option value="Calidad Académica">
                      Descontento Académico
                    </option>

                    <option value="Salud">
                      Salud / Motivos Personales
                    </option>

                    <option value="Otro">
                      Otro
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Notas del Operador
                  </label>

                  <textarea
                    name="notes"
                    defaultValue={
                      crmData[
                        crmModal
                          .student
                          .idNorm
                      ]?.notes ||
                      ""
                    }
                    placeholder="Detalles de la llamada, respuesta del estudiante, seguimiento..."
                    rows={4}
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCrmModal({
                        isOpen:
                          false,

                        student:
                          null,
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
