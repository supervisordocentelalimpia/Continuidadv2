// src/App.jsx

import React, {
  useMemo,
  useRef,
  useState,
} from "react";

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
  ArrowRight,
  Download,
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
  CONTINUIDAD_RULES_VERSION,
} from "./utils/continuidad";

import {
  FREQUENCIES,
  FREQUENCY_ORDER,
} from "./utils/frecuencia";


/* =========================================================
   PDFMAKE
   ========================================================= */

if (
  pdfFonts?.pdfMake?.vfs
) {
  pdfMake.vfs =
    pdfFonts.pdfMake.vfs;
} else if (
  pdfFonts?.vfs
) {
  pdfMake.vfs =
    pdfFonts.vfs;
}


/* =========================================================
   CONSTANTES VISUALES
   ========================================================= */

const EMPTY_ARRAY = [];

const FRECUENCIA_COLORS = {
  [FREQUENCIES.MARTES_JUEVES]:
    "#7c3aed",

  [FREQUENCIES.MIERCOLES_VIERNES]:
    "#f97316",

  [FREQUENCIES.LUNES]:
    "#16a34a",

  [FREQUENCIES.SABATINO]:
    "#2563eb",

  [FREQUENCIES.INTENSIVO]:
    "#a855f7",

  [FREQUENCIES.SEMI_INTENSIVO]:
    "#0891b2",

  [FREQUENCIES.NA]:
    "#94a3b8",
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


const TABLE_VIEW_LABELS = {
  desercion:
    "Deserciones / Fugas",

  nuevosL01:
    "Ingresos Nivel 01",

  noPresentesL02:
    "Estudiantes no presentes en el período anterior L02+",

  cambios:
    "Cambios de Frecuencia",

  graduados:
    "Graduandos",

  transNinosJovenes:
    "Transición: Niños → Jóvenes",

  transNinosAdultos:
    "Transición: Niños → Adultos",

  transJovenesAdultos:
    "Transición: Jóvenes → Adultos",
};


const EXPORT_SCOPE_LABELS = {
  combined:
    "Indicadores + lista actual",

  indicators:
    "Solo indicadores",

  list:
    "Solo lista actual",
};


/* =========================================================
   ESTADÍSTICAS VACÍAS
   ========================================================= */

const createEmptyStats = () => ({
  oldTotal: 0,
  newTotal: 0,

  shouldContinue: 0,

  reenrolled: 0,
  reenrolledPct: 0,

  lost: 0,
  lostPct: 0,

  previousLevel1: 0,
  regularPrevious: 0,

  level1Lost: 0,
  level1LostPct: 0,

  regularLost: 0,
  regularLostPct: 0,

  transNinosJovenes: 0,
  transNinosAdultos: 0,
  transJovenesAdultos: 0,

  categoryTransitionsAvailable:
    false,

  avgDensity: 0,
  activeSections: 0,

  topHorarioFugas:
    "N/A",

  topHorarioFugasCount: 0,
  topHorarioFugasPrevious: 0,
  topHorarioFugasRate: 0,

  topHorarioRate:
    "N/A",

  topHorarioRatePct: 0,
  topHorarioRateLost: 0,
  topHorarioRatePrevious: 0,

  graduados: 0,

  terminalPrevious: 0,

  terminalReappeared: 0,

  currentLevel1: 0,

  notPresentPrevious:
    0,

  notPresentPreviousL02Plus:
    0,

  cambiosFreq: 0,

  reconciliationOk:
    false,
});


/* =========================================================
   UTILIDADES DE ARCHIVOS
   ========================================================= */

const fileKey = (
  file
) =>
  `${file.name}__${file.size}__${file.lastModified}`;


const extractDateKeyFromName = (
  name = ""
) => {
  const upper =
    String(
      name || ""
    ).toUpperCase();

  /*
    2026-08-11
    2026_08_11
    2026/08/11
  */

  let match =
    upper.match(
      /(20\d{2})[\/_\-](\d{1,2})[\/_\-](\d{1,2})/
    );

  if (match) {
    const year =
      parseInt(
        match[1],
        10
      );

    const month =
      parseInt(
        match[2],
        10
      );

    const day =
      parseInt(
        match[3],
        10
      );

    return (
      year * 10000 +
      month * 100 +
      day
    );
  }

  /*
    09_07
    11_08

    Se interpreta como DD_MM.
  */

  match =
    upper.match(
      /(^|[^0-9])(\d{1,2})[\/_\-](\d{1,2})([^0-9]|$)/
    );

  if (match) {
    const day =
      parseInt(
        match[2],
        10
      );

    const month =
      parseInt(
        match[3],
        10
      );

    if (
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      return (
        month * 100 +
        day
      );
    }
  }

  return null;
};


const sortFilesSmart = (
  files = []
) => {
  const metadata =
    files.map(
      (
        file,
        index
      ) => {
        const dateKey =
          extractDateKeyFromName(
            file.name
          );

        return {
          file,

          index,

          hasDate:
            dateKey !== null,

          dateKey:
            dateKey ??
            Number.POSITIVE_INFINITY,

          name:
            String(
              file.name || ""
            ).toUpperCase(),
        };
      }
    );

  metadata.sort(
    (a, b) => {
      if (
        a.hasDate &&
        b.hasDate
      ) {
        if (
          a.dateKey !==
          b.dateKey
        ) {
          return (
            a.dateKey -
            b.dateKey
          );
        }

        if (
          a.name !==
          b.name
        ) {
          return a.name.localeCompare(
            b.name
          );
        }

        return (
          a.index -
          b.index
        );
      }

      if (
        a.hasDate !==
        b.hasDate
      ) {
        return a.hasDate
          ? -1
          : 1;
      }

      if (
        a.name !==
        b.name
      ) {
        return a.name.localeCompare(
          b.name
        );
      }

      return (
        a.index -
        b.index
      );
    }
  );

  return metadata.map(
    (item) =>
      item.file
  );
};


/* =========================================================
   PARSEO DE VARIOS PDFs
   ========================================================= */

const parseMany = async (
  files
) => {
  const orderedFiles =
    sortFilesSmart(
      files
    );

  const all = [];

  const failed = [];

  for (
    let rank = 0;
    rank <
    orderedFiles.length;
    rank++
  ) {
    const file =
      orderedFiles[rank];

    let list = [];

    try {
      list =
        await parseCevazPdf(
          file
        );

      if (
        !list?.length
      ) {
        failed.push(
          file.name
        );
      }
    } catch (error) {
      console.error(
        `Error procesando ${file.name}:`,
        error
      );

      failed.push(
        file.name
      );

      continue;
    }

    for (
      const original
      of list || []
    ) {
      const rawId =
        original?.id !==
          undefined &&
        original?.id !==
          null
          ? String(
              original.id
            ).trim()
          : "";

      all.push({
        ...original,

        id:
          rawId,

        idOriginal:
          rawId,

        idNorm:
          normalizeStudentId(
            rawId
          ),

        category:
          normalizeCategory(
            original.category ||
              ""
          ),

        levelNorm:
          normalizeLevel(
            original.levelNorm ||
              original.level ||
              ""
          ),

        frequencyNorm:
          original.frequencyNorm ||
          FREQUENCIES.NA,

        scheduleBlock:
          normalizeScheduleBlock(
            original.scheduleBlock
          ),

        __fileRank:
          rank,

        __fileName:
          file.name,
      });
    }
  }

  if (!all.length) {
    throw new Error(
      "No se pudo extraer ningún estudiante de los PDFs seleccionados."
    );
  }

  return {
    all,
    failed,
  };
};


/* =========================================================
   VALIDACIÓN DE DATOS DEL PARSER
   ========================================================= */

const phoneDigits = (
  phone = ""
) =>
  String(
    phone ?? ""
  ).replace(
    /\D/g,
    ""
  );


const isLikelyValidEmail = (
  email = ""
) => {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(
    String(
      email
    ).trim()
  );
};


const isLikelyValidPhone = (
  phone = ""
) => {
  if (!phone) {
    return true;
  }

  const digits =
    phoneDigits(
      phone
    );

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

  if (
    failedOld?.length
  ) {
    critical.push(
      `Período anterior: no se pudieron procesar ${failedOld.length} archivo(s): ${failedOld.join(
        ", "
      )}`
    );
  }

  if (
    failedNew?.length
  ) {
    critical.push(
      `Período nuevo: no se pudieron procesar ${failedNew.length} archivo(s): ${failedNew.join(
        ", "
      )}`
    );
  }


  const missingIdOld =
    oldAll.filter(
      (student) =>
        !student.idNorm
    );

  const missingIdNew =
    newAll.filter(
      (student) =>
        !student.idNorm
    );


  if (
    missingIdOld.length
  ) {
    critical.push(
      `Período anterior: ${missingIdOld.length} registro(s) sin identificación utilizable.`
    );
  }

  if (
    missingIdNew.length
  ) {
    critical.push(
      `Período nuevo: ${missingIdNew.length} registro(s) sin identificación utilizable.`
    );
  }


  const missingLevelOld =
    oldAll.filter(
      (student) =>
        !student.levelNorm ||
        student.levelNorm ===
          "N/A"
    );

  const missingLevelNew =
    newAll.filter(
      (student) =>
        !student.levelNorm ||
        student.levelNorm ===
          "N/A"
    );


  if (
    missingLevelOld.length
  ) {
    critical.push(
      `Período anterior: ${missingLevelOld.length} estudiante(s) sin nivel reconocido.`
    );
  }

  if (
    missingLevelNew.length
  ) {
    critical.push(
      `Período nuevo: ${missingLevelNew.length} estudiante(s) sin nivel reconocido.`
    );
  }


  const missingCategoryOld =
    oldAll.filter(
      (student) =>
        !student.category ||
        student.category ===
          "N/A"
    );

  const missingCategoryNew =
    newAll.filter(
      (student) =>
        !student.category ||
        student.category ===
          "N/A"
    );


  if (
    missingCategoryOld.length
  ) {
    critical.push(
      `Período anterior: ${missingCategoryOld.length} estudiante(s) sin categoría reconocida.`
    );
  }

  if (
    missingCategoryNew.length
  ) {
    critical.push(
      `Período nuevo: ${missingCategoryNew.length} estudiante(s) sin categoría reconocida.`
    );
  }


  const unknownFreqOld =
    oldAll.filter(
      (student) =>
        !student.frequencyNorm ||
        student.frequencyNorm ===
          FREQUENCIES.NA
    );

  const unknownFreqNew =
    newAll.filter(
      (student) =>
        !student.frequencyNorm ||
        student.frequencyNorm ===
          FREQUENCIES.NA
    );


  if (
    unknownFreqOld.length
  ) {
    warnings.push(
      `Período anterior: ${unknownFreqOld.length} registro(s) con frecuencia no reconocida.`
    );
  }

  if (
    unknownFreqNew.length
  ) {
    warnings.push(
      `Período nuevo: ${unknownFreqNew.length} registro(s) con frecuencia no reconocida.`
    );
  }


  const scheduleReviewOld =
    oldAll.filter(
      (student) =>
        student.scheduleNeedsReview
    );

  const scheduleReviewNew =
    newAll.filter(
      (student) =>
        student.scheduleNeedsReview
    );


  if (
    scheduleReviewOld.length
  ) {
    warnings.push(
      `Período anterior: ${scheduleReviewOld.length} registro(s) tienen horario para revisión.`
    );
  }

  if (
    scheduleReviewNew.length
  ) {
    warnings.push(
      `Período nuevo: ${scheduleReviewNew.length} registro(s) tienen horario para revisión.`
    );
  }


  const inferredScheduleOld =
    oldAll.filter(
      (student) =>
        student.scheduleStartMeridiemInferred
    );

  const inferredScheduleNew =
    newAll.filter(
      (student) =>
        student.scheduleStartMeridiemInferred
    );


  if (
    inferredScheduleOld.length
  ) {
    warnings.push(
      `Período anterior: en ${inferredScheduleOld.length} registro(s) fue necesario inferir AM/PM en la hora inicial.`
    );
  }

  if (
    inferredScheduleNew.length
  ) {
    warnings.push(
      `Período nuevo: en ${inferredScheduleNew.length} registro(s) fue necesario inferir AM/PM en la hora inicial.`
    );
  }


  const correctionsOld =
    oldAll.reduce(
      (
        total,
        student
      ) =>
        total +
        (
          student
            .frequencyCorrections
            ?.length || 0
        ),
      0
    );

  const correctionsNew =
    newAll.reduce(
      (
        total,
        student
      ) =>
        total +
        (
          student
            .frequencyCorrections
            ?.length || 0
        ),
      0
    );


  if (
    correctionsOld +
      correctionsNew >
    0
  ) {
    warnings.push(
      `Se corrigieron automáticamente ${correctionsOld + correctionsNew} variante(s) o error(es) de escritura en frecuencias.`
    );
  }


  const badEmailOld =
    oldAll.filter(
      (student) =>
        student.email &&
        !isLikelyValidEmail(
          student.email
        )
    );

  const badEmailNew =
    newAll.filter(
      (student) =>
        student.email &&
        !isLikelyValidEmail(
          student.email
        )
    );


  if (
    badEmailOld.length
  ) {
    warnings.push(
      `Período anterior: ${badEmailOld.length} correo(s) con formato posiblemente inválido.`
    );
  }

  if (
    badEmailNew.length
  ) {
    warnings.push(
      `Período nuevo: ${badEmailNew.length} correo(s) con formato posiblemente inválido.`
    );
  }


  const badPhoneOld =
    oldAll.filter(
      (student) =>
        student.phone &&
        !isLikelyValidPhone(
          student.phone
        )
    );

  const badPhoneNew =
    newAll.filter(
      (student) =>
        student.phone &&
        !isLikelyValidPhone(
          student.phone
        )
    );


  if (
    badPhoneOld.length
  ) {
    warnings.push(
      `Período anterior: ${badPhoneOld.length} teléfono(s) con formato posiblemente inválido.`
    );
  }

  if (
    badPhoneNew.length
  ) {
    warnings.push(
      `Período nuevo: ${badPhoneNew.length} teléfono(s) con formato posiblemente inválido.`
    );
  }


  return {
    critical,

    warnings,

    details: {
      missingIdOld:
        missingIdOld.length,

      missingIdNew:
        missingIdNew.length,

      missingLevelOld:
        missingLevelOld.length,

      missingLevelNew:
        missingLevelNew.length,

      missingCategoryOld:
        missingCategoryOld.length,

      missingCategoryNew:
        missingCategoryNew.length,

      unknownFreqOld:
        unknownFreqOld.length,

      unknownFreqNew:
        unknownFreqNew.length,

      scheduleReviewOld:
        scheduleReviewOld.length,

      scheduleReviewNew:
        scheduleReviewNew.length,

      frequencyCorrections:
        correctionsOld +
        correctionsNew,

      badEmailOld:
        badEmailOld.length,

      badEmailNew:
        badEmailNew.length,

      badPhoneOld:
        badPhoneOld.length,

      badPhoneNew:
        badPhoneNew.length,
    },
  };
};


/* =========================================================
   TELÉFONO / WHATSAPP
   ========================================================= */

const normalizeWhatsAppPhone = (
  phone = ""
) => {
  let digits =
    phoneDigits(
      phone
    );

  if (!digits) {
    return "";
  }

  /*
    +58 0414...
    580414...
  */

  if (
    /^5804\d{9}$/.test(
      digits
    )
  ) {
    digits =
      `58${digits.slice(
        3
      )}`;
  }

  /*
    0414...
  */

  if (
    /^0(4\d{9})$/.test(
      digits
    )
  ) {
    digits =
      `58${digits.slice(
        1
      )}`;
  }

  return digits;
};


/* =========================================================
   CRM PERSISTENTE
   ========================================================= */

const simpleHash = (
  value = ""
) => {
  let hash = 5381;

  for (
    let index = 0;
    index < value.length;
    index++
  ) {
    hash =
      (
        hash * 33
      ) ^
      value.charCodeAt(
        index
      );
  }

  return (
    hash >>> 0
  ).toString(36);
};


const buildAnalysisStorageKey = ({
  oldFiles,
  newFiles,
}) => {
  const oldSignature =
    sortFilesSmart(
      oldFiles
    )
      .map(
        (file) =>
          `${file.name}:${file.size}`
      )
      .join("||");

  const newSignature =
    sortFilesSmart(
      newFiles
    )
      .map(
        (file) =>
          `${file.name}:${file.size}`
      )
      .join("||");

  return `continuidad_crm_${simpleHash(
    `${oldSignature}###${newSignature}`
  )}`;
};


const loadCrmFromStorage = (
  storageKey
) => {
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

    const parsed =
      JSON.parse(
        raw
      );

    return (
      parsed &&
      typeof parsed ===
        "object"
    )
      ? parsed
      : {};
  } catch (error) {
    console.warn(
      "No se pudo cargar CRM:",
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
      JSON.stringify(
        data
      )
    );
  } catch (error) {
    console.warn(
      "No se pudo guardar CRM:",
      error
    );
  }
};


/* =========================================================
   EXPORTACIONES
   ========================================================= */

const stringifyExportValue = (
  value
) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.join(
      ", "
    );
  }

  return String(
    value
  );
};


/*
  Reduce riesgo de fórmulas accidentales al abrir Excel.
*/

const excelSafe = (
  value
) => {
  const text =
    stringifyExportValue(
      value
    );

  if (
    /^[=+\-@]/.test(
      text
    )
  ) {
    return `'${text}`;
  }

  return text;
};


const escapeHtml = (
  value
) =>
  stringifyExportValue(
    value
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );


/* =========================================================
   COMPONENTE PRINCIPAL
   ========================================================= */

const DashboardContinuidad = () => {
  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "upload"
  );

  const fileInputRef =
    useRef(null);


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


  /* =======================================================
     SISTEMA
     ======================================================= */

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    errorMsg,
    setErrorMsg,
  ] = useState("");

  const [
    qualityData,
    setQualityData,
  ] = useState(null);

  const [
    analysisStorageKey,
    setAnalysisStorageKey,
  ] = useState("");

  const [
    analysisData,
    setAnalysisData,
  ] = useState(null);


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
    isOpen:
      false,

    student:
      null,
  });


  /* =======================================================
     TABLAS
     ======================================================= */

  const [
    tableView,
    setTableView,
  ] = useState(
    "desercion"
  );

  const [
    filterFugaType,
    setFilterFugaType,
  ] = useState(
    "All"
  );


  /* =======================================================
     EXPORTACIÓN
     ======================================================= */

  const [
    exportScope,
    setExportScope,
  ] = useState(
    "combined"
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
  ] = useState(
    "All"
  );

  const [
    selectedFrecuencia,
    setSelectedFrecuencia,
  ] = useState(
    "All"
  );

  const [
    selectedLevel,
    setSelectedLevel,
  ] = useState(
    "All"
  );

  const [
    selectedHorario,
    setSelectedHorario,
  ] = useState(
    "All"
  );

  const [
    levelChartCategory,
    setLevelChartCategory,
  ] = useState(
    "All"
  );

  const [
    pieMode,
    setPieMode,
  ] = useState(
    "horario"
  );


  /* =======================================================
     DATOS DERIVADOS
     ======================================================= */

  const dropouts =
    analysisData?.lists?.lost ??
    EMPTY_ARRAY;

  const currentLevel1List =
    analysisData?.lists
      ?.currentLevel1 ??
    EMPTY_ARRAY;

  const notPresentL02List =
    analysisData?.lists
      ?.notPresentPreviousLevel2Plus ??
    EMPTY_ARRAY;

  const freqChangersList =
    analysisData?.lists
      ?.frequencyChanges ??
    EMPTY_ARRAY;

  const graduadosList =
    analysisData?.lists
      ?.graduates ??
    EMPTY_ARRAY;

  const transNinosJovenesList =
    analysisData?.lists
      ?.ninosJovenes ??
    EMPTY_ARRAY;

  const transNinosAdultosList =
    analysisData?.lists
      ?.ninosAdultos ??
    EMPTY_ARRAY;

  const transJovenesAdultosList =
    analysisData?.lists
      ?.jovenesAdultos ??
    EMPTY_ARRAY;


  /* =======================================================
     KPIs DERIVADOS DEL MOTOR
     ======================================================= */

  const stats =
    useMemo(() => {
      if (
        !analysisData
      ) {
        return createEmptyStats();
      }

      const topVolume =
        analysisData
          .analytics
          ?.topScheduleByVolume ||
        {};

      const topRate =
        analysisData
          .analytics
          ?.topScheduleByRate ||
        {};

      return {
        oldTotal:
          analysisData
            .totals
            .previous,

        newTotal:
          analysisData
            .totals
            .current,

        shouldContinue:
          analysisData
            .totals
            .shouldContinue,

        reenrolled:
          analysisData
            .totals
            .reenrolled,

        reenrolledPct:
          analysisData
            .rates
            .retention,

        lost:
          analysisData
            .totals
            .lost,

        lostPct:
          analysisData
            .rates
            .attrition,

        previousLevel1:
          analysisData
            .segmentation
            .level1
            .previous,

        regularPrevious:
          analysisData
            .segmentation
            .regularStudents
            .previous,

        level1Lost:
          analysisData
            .segmentation
            .level1
            .lost,

        level1LostPct:
          analysisData
            .segmentation
            .level1
            .attritionRate,

        regularLost:
          analysisData
            .segmentation
            .regularStudents
            .lost,

        regularLostPct:
          analysisData
            .segmentation
            .regularStudents
            .attritionRate,

        transNinosJovenes:
          analysisData
            .analytics
            .categoryTransitions
            ?.ninosJovenes ||
          0,

        transNinosAdultos:
          analysisData
            .analytics
            .categoryTransitions
            ?.ninosAdultos ||
          0,

        transJovenesAdultos:
          analysisData
            .analytics
            .categoryTransitions
            ?.jovenesAdultos ||
          0,

        categoryTransitionsAvailable:
          Boolean(
            analysisData
              .analytics
              .categoryTransitionsAvailable
          ),

        avgDensity:
          analysisData
            .analytics
            .density
            .average,

        activeSections:
          analysisData
            .analytics
            .density
            .sections,

        topHorarioFugas:
          topVolume.schedule ||
          "N/A",

        topHorarioFugasCount:
          topVolume.lost ||
          0,

        topHorarioFugasPrevious:
          topVolume.previous ??
          topVolume.eligible ??
          0,

        topHorarioFugasRate:
          topVolume.rate ||
          0,

        topHorarioRate:
          topRate.schedule ||
          "N/A",

        topHorarioRatePct:
          topRate.rate ||
          0,

        topHorarioRateLost:
          topRate.lost ||
          0,

        topHorarioRatePrevious:
          topRate.previous ??
          topRate.eligible ??
          0,

        graduados:
          analysisData
            .totals
            .graduates,

        terminalPrevious:
          analysisData
            .totals
            .terminalPrevious,

        terminalReappeared:
          analysisData
            .totals
            .terminalReappeared,

        currentLevel1:
          analysisData
            .totals
            .currentLevel1,

        notPresentPrevious:
          analysisData
            .totals
            .notPresentPrevious,

        notPresentPreviousL02Plus:
          analysisData
            .totals
            .notPresentPreviousLevel2Plus,

        cambiosFreq:
          analysisData
            .totals
            .frequencyChanges,

        reconciliationOk:
          Boolean(
            analysisData
              .quality
              ?.reconciliation
              ?.ok
          ),
      };
    }, [
      analysisData,
    ]);


  /* =======================================================
     ARCHIVOS
     ======================================================= */

  const mergeFiles = (
    previous,
    incoming
  ) => {
    const map =
      new Map(
        previous.map(
          (file) => [
            fileKey(
              file
            ),

            file,
          ]
        )
      );

    for (
      const file
      of incoming
    ) {
      map.set(
        fileKey(
          file
        ),

        file
      );
    }

    return Array.from(
      map.values()
    );
  };


  const removeOldAt = (
    index
  ) => {
    setPdfOldFiles(
      (previous) =>
        previous.filter(
          (
            _,
            currentIndex
          ) =>
            currentIndex !==
            index
        )
    );
  };


  const removeNewAt = (
    index
  ) => {
    setPdfNewFiles(
      (previous) =>
        previous.filter(
          (
            _,
            currentIndex
          ) =>
            currentIndex !==
            index
        )
    );
  };


  /* =======================================================
     RESET
     ======================================================= */

  const resetFilters = () => {
    setSearchTerm("");

    setSelectedCategory(
      "All"
    );

    setSelectedFrecuencia(
      "All"
    );

    setSelectedLevel(
      "All"
    );

    setSelectedHorario(
      "All"
    );

    setLevelChartCategory(
      "All"
    );

    setFilterFugaType(
      "All"
    );
  };


  const resetAll = () => {
    setPdfOldFiles([]);

    setPdfNewFiles([]);

    setAnalysisData(
      null
    );

    setQualityData(
      null
    );

    setCrmData({});

    setAnalysisStorageKey(
      ""
    );

    setErrorMsg("");

    resetFilters();

    setPieMode(
      "horario"
    );

    setTableView(
      "desercion"
    );

    setExportScope(
      "combined"
    );

    setActiveTab(
      "upload"
    );
  };


  /* =======================================================
     PROCESAMIENTO PRINCIPAL
     ======================================================= */

  const processPdfs = async () => {
    setErrorMsg("");

    setQualityData(
      null
    );

    if (
      !pdfOldFiles.length ||
      !pdfNewFiles.length
    ) {
      setErrorMsg(
        "Selecciona al menos un PDF del período anterior y uno del período nuevo."
      );

      return;
    }

    try {
      setLoading(
        true
      );

      const [
        oldResult,
        newResult,
      ] =
        await Promise.all([
          parseMany(
            pdfOldFiles
          ),

          parseMany(
            pdfNewFiles
          ),
        ]);


      const parserQuality =
        evaluateParsedDataQuality({
          oldAll:
            oldResult.all,

          newAll:
            newResult.all,

          failedOld:
            oldResult.failed,

          failedNew:
            newResult.failed,
        });


      if (
        parserQuality
          .critical
          .length
      ) {
        setQualityData(
          parserQuality
        );

        throw new Error(
          parserQuality
            .critical
            .join(" | ")
        );
      }


      /*
        UNA SOLA FUENTE DE VERDAD:
        continuidad.js
      */

      const analysis =
        analyzeContinuity({
          oldStudents:
            oldResult.all,

          newStudents:
            newResult.all,

          strict:
            true,
        });


      const allWarnings =
        Array.from(
          new Set([
            ...(
              parserQuality
                .warnings ||
              []
            ),

            ...(
              analysis
                .quality
                ?.warnings ||
              []
            ),
          ])
        );


      const storageKey =
        buildAnalysisStorageKey({
          oldFiles:
            pdfOldFiles,

          newFiles:
            pdfNewFiles,
        });


      setAnalysisStorageKey(
        storageKey
      );

      setCrmData(
        loadCrmFromStorage(
          storageKey
        )
      );


      setAnalysisData(
        analysis
      );


      setQualityData({
        critical: [],

        warnings:
          allWarnings,

        details:
          parserQuality
            .details,

        analysisQuality:
          analysis
            .quality,

        rulesVersion:
          analysis
            .rulesVersion ||
          CONTINUIDAD_RULES_VERSION,
      });


      resetFilters();

      setTableView(
        "desercion"
      );

      setActiveTab(
        "dashboard"
      );
    } catch (error) {
      console.error(
        error
      );

      setErrorMsg(
        error?.message ||
          "Error procesando los PDFs."
      );
    } finally {
      setLoading(
        false
      );
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


  const winBackRate =
    contactedCount > 0
      ? Math.round(
          (
            rescuedCount /
            contactedCount
          ) *
            100
        )
      : null;


  const saveCrmData = (
    event
  ) => {
    event.preventDefault();

    if (
      !crmModal.student
    ) {
      return;
    }

    const formData =
      new FormData(
        event.target
      );

    const studentKey =
      crmModal
        .student
        .idNorm ||
      normalizeStudentId(
        crmModal
          .student
          .id
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
              new Date()
                .toISOString(),
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
      isOpen:
        false,

      student:
        null,
    });
  };


  const getCrmStatusColor = (
    status
  ) => {
    switch (
      status
    ) {
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
     FUENTE DE TABLA
     ======================================================= */

  const sourceData =
    useMemo(() => {
      switch (
        tableView
      ) {
        case "desercion":
          return dropouts;

        case "nuevosL01":
          return currentLevel1List;

        case "noPresentesL02":
          return notPresentL02List;

        case "cambios":
          return freqChangersList;

        case "graduados":
          return graduadosList;

        case "transNinosJovenes":
          return transNinosJovenesList;

        case "transNinosAdultos":
          return transNinosAdultosList;

        case "transJovenesAdultos":
          return transJovenesAdultosList;

        default:
          return dropouts;
      }
    }, [
      tableView,
      dropouts,
      currentLevel1List,
      notPresentL02List,
      freqChangersList,
      graduadosList,
      transNinosJovenesList,
      transNinosAdultosList,
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
              .filter(
                Boolean
              )
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
              .filter(
                Boolean
              )
          )
        ).sort(
          (a, b) => {
            const aLevel =
              parseInt(
                String(
                  a
                ).replace(
                  /\D/g,
                  ""
                ),
                10
              ) || 0;

            const bLevel =
              parseInt(
                String(
                  b
                ).replace(
                  /\D/g,
                  ""
                ),
                10
              ) || 0;

            return (
              aLevel -
              bLevel
            );
          }
        );


      const horarios =
        Array.from(
          new Set(
            sourceData
              .map(
                (student) =>
                  student.scheduleBlock
              )
              .filter(
                Boolean
              )
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
              .filter(
                Boolean
              )
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

          ...FREQUENCY_ORDER.filter(
            (frequency) =>
              frecuencias.includes(
                frequency
              )
          ),

          ...frecuencias
            .filter(
              (frequency) =>
                !FREQUENCY_ORDER.includes(
                  frequency
                )
            )
            .sort(),
        ],
      };
    }, [
      sourceData,
    ]);


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
              .includes(
                query
              ) ||
            String(
              student.id ||
                ""
            )
              .toLowerCase()
              .includes(
                query
              ) ||
            String(
              student.idNorm ||
                ""
            )
              .toLowerCase()
              .includes(
                query
              ) ||
            String(
              student.email ||
                ""
            )
              .toLowerCase()
              .includes(
                query
              ) ||
            String(
              student.phone ||
                ""
            ).includes(
              query
            );


          const matchesCategory =
            selectedCategory ===
              "All" ||
            student.category ===
              selectedCategory;


          const matchesFrequency =
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
            matchesFrequency &&
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
    useMemo(() => [
      "All",

      ...Array.from(
        new Set(
          dropouts
            .map(
              (student) =>
                student.category
            )
            .filter(
              Boolean
            )
        )
      ).sort(),
    ], [
      dropouts,
    ]);


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
        .map(
          (level) => ({
            name:
              level,

            count:
              countByLevel[
                level
              ],
          })
        )
        .sort(
          (a, b) =>
            (
              parseInt(
                a.name.replace(
                  /\D/g,
                  ""
                ),
                10
              ) || 0
            ) -
            (
              parseInt(
                b.name.replace(
                  /\D/g,
                  ""
                ),
                10
              ) || 0
            )
        );
    }, [
      barSource,
    ]);


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
                ? (
                    student
                      .scheduleBlock ||
                    "N/A"
                  )
                : (
                    student
                      .frequencyNorm ||
                    FREQUENCIES.NA
                  );

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
        .map(
          (key) => ({
            name:
              key,

            value:
              countByKey[
                key
              ],
          })
        )
        .sort(
          (a, b) =>
            b.value -
            a.value
        );
    }, [
      dropouts,
      pieMode,
    ]);


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
      pieMode ===
      "horario"
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
     EXPORTACIÓN - LISTA ACTUAL
     ======================================================= */

  const currentListTitle =
    TABLE_VIEW_LABELS[
      tableView
    ] ||
    "Lista actual";


  const getFilterDescription = () => {
    const active = [];

    if (
      selectedCategory !==
      "All"
    ) {
      active.push(
        `Categoría: ${selectedCategory}`
      );
    }

    if (
      selectedLevel !==
      "All"
    ) {
      active.push(
        `Nivel: ${selectedLevel}`
      );
    }

    if (
      selectedFrecuencia !==
      "All"
    ) {
      active.push(
        `Frecuencia: ${selectedFrecuencia}`
      );
    }

    if (
      selectedHorario !==
      "All"
    ) {
      active.push(
        `Horario: ${selectedHorario}`
      );
    }

    if (
      filterFugaType !==
        "All" &&
      tableView ===
        "desercion"
    ) {
      active.push(
        `Tipo: ${filterFugaType}`
      );
    }

    if (
      searchTerm.trim()
    ) {
      active.push(
        `Búsqueda: ${searchTerm.trim()}`
      );
    }

    return active.length
      ? active.join(
          " | "
        )
      : "Sin filtros adicionales";
  };


  const getListExportColumns = () => {
    const common = [
      {
        label:
          "Estudiante",

        value:
          (student) =>
            student.name,
      },

      {
        label:
          "Cédula",

        value:
          (student) =>
            student.id,
      },

      {
        label:
          "Categoría",

        value:
          (student) =>
            student.category,
      },

      {
        label:
          "Nivel",

        value:
          (student) =>
            student.levelNorm,
      },
    ];


    if (
      tableView ===
      "desercion"
    ) {
      return [
        {
          label:
            "Estatus CRM",

          value:
            (student) =>
              crmData[
                student.idNorm
              ]?.status ||
              "Pendiente",
        },

        ...common,

        {
          label:
            "Frecuencia",

          value:
            (student) =>
              student.frequencyNorm,
        },

        {
          label:
            "Horario",

          value:
            (student) =>
              student.scheduleBlock,
        },

        {
          label:
            "Email",

          value:
            (student) =>
              student.email ||
              "",
        },

        {
          label:
            "Teléfono",

          value:
            (student) =>
              student.phone ||
              "",
        },

        {
          label:
            "Motivo CRM",

          value:
            (student) =>
              crmData[
                student.idNorm
              ]?.motive ||
              "",
        },

        {
          label:
            "Notas CRM",

          value:
            (student) =>
              crmData[
                student.idNorm
              ]?.notes ||
              "",
        },
      ];
    }


    if (
      tableView ===
      "cambios"
    ) {
      return [
        ...common,

        {
          label:
            "Frecuencia Anterior",

          value:
            (student) =>
              student.oldFrequency ||
              "N/A",
        },

        {
          label:
            "Frecuencia Nueva",

          value:
            (student) =>
              student.newFrequency ||
              student.frequencyNorm ||
              "N/A",
        },

        {
          label:
            "Cambio",

          value:
            (student) =>
              `${student.oldFrequency || "N/A"} → ${
                student.newFrequency ||
                student.frequencyNorm ||
                "N/A"
              }`,
        },

        {
          label:
            "Horario Nuevo",

          value:
            (student) =>
              student.scheduleBlock ||
              "N/A",
        },

        {
          label:
            "Email",

          value:
            (student) =>
              student.email ||
              "",
        },

        {
          label:
            "Teléfono",

          value:
            (student) =>
              student.phone ||
              "",
        },
      ];
    }


    if (
      tableView ===
        "transNinosJovenes" ||
      tableView ===
        "transNinosAdultos" ||
      tableView ===
        "transJovenesAdultos"
    ) {
      return [
        {
          label:
            "Estudiante",

          value:
            (student) =>
              student.name,
        },

        {
          label:
            "Cédula",

          value:
            (student) =>
              student.id,
        },

        {
          label:
            "Categoría Anterior",

          value:
            (student) =>
              student.oldCategory ||
              "N/A",
        },

        {
          label:
            "Categoría Nueva",

          value:
            (student) =>
              student.newCategory ||
              student.category ||
              "N/A",
        },

        {
          label:
            "Nivel Nuevo",

          value:
            (student) =>
              student.levelNorm,
        },

        {
          label:
            "Frecuencia Nueva",

          value:
            (student) =>
              student.frequencyNorm,
        },

        {
          label:
            "Horario Nuevo",

          value:
            (student) =>
              student.scheduleBlock,
        },

        {
          label:
            "Email",

          value:
            (student) =>
              student.email ||
              "",
        },

        {
          label:
            "Teléfono",

          value:
            (student) =>
              student.phone ||
              "",
        },
      ];
    }


    return [
      ...common,

      {
        label:
          "Frecuencia",

        value:
          (student) =>
            student.frequencyNorm,
      },

      {
        label:
          "Horario",

        value:
          (student) =>
            student.scheduleBlock,
      },

      {
        label:
          "Email",

        value:
          (student) =>
            student.email ||
            "",
      },

      {
        label:
          "Teléfono",

        value:
          (student) =>
            student.phone ||
            "",
      },
    ];
  };


  const getListExportTable = () => {
    const columns =
      getListExportColumns();

    return {
      headers:
        columns.map(
          (column) =>
            column.label
        ),

      rows:
        filteredData.map(
          (student) =>
            columns.map(
              (column) =>
                stringifyExportValue(
                  column.value(
                    student
                  )
                )
            )
        ),
    };
  };


  /* =======================================================
     EXPORTACIÓN - INDICADORES
     ======================================================= */

  const getIndicatorRows = () => [
    [
      "Total período anterior",
      stats.oldTotal,
      "",
    ],

    [
      "Total período nuevo",
      stats.newTotal,
      "",
    ],

    [
      "Estudiantes del período anterior que debían continuar",
      stats.shouldContinue,
      "",
    ],

    [
      "Total reinscritos",
      stats.reenrolled,
      `${stats.reenrolledPct}%`,
    ],

    [
      "Total pérdida",
      stats.lost,
      `${stats.lostPct}%`,
    ],

    [
      "L01 del período anterior",
      stats.previousLevel1,
      "",
    ],

    [
      "Fuga L01",
      stats.level1Lost,
      `${stats.level1LostPct}%`,
    ],

    [
      "Regulares L02+ del período anterior",
      stats.regularPrevious,
      "",
    ],

    [
      "Fuga regulares",
      stats.regularLost,
      `${stats.regularLostPct}%`,
    ],

    [
      "Graduandos",
      stats.graduados,
      "Adultos L20 anterior que no aparecen en el período nuevo",
    ],

    [
      "Adultos L20 anterior que reaparecen",
      stats.terminalReappeared,
      "Requieren revisión académica",
    ],

    [
      "Ingresos Nivel 01",
      stats.currentLevel1,
      "Todos los L01 del período nuevo",
    ],

    [
      "Estudiantes no presentes en el período anterior L02+",
      stats.notPresentPreviousL02Plus,
      "",
    ],

    [
      "Cambios de Frecuencia",
      stats.cambiosFreq,
      "",
    ],

    [
      "Niños → Jóvenes",
      stats.transNinosJovenes,
      "",
    ],

    [
      "Niños → Adultos",
      stats.transNinosAdultos,
      "",
    ],

    [
      "Jóvenes → Adultos",
      stats.transJovenesAdultos,
      "",
    ],

    [
      "Densidad promedio",
      stats.avgDensity,
      `${stats.activeSections} secciones activas`,
    ],

    [
      "Horario con mayor volumen de fuga",
      stats.topHorarioFugas,
      `${stats.topHorarioFugasCount} de ${stats.topHorarioFugasPrevious} (${stats.topHorarioFugasRate}%)`,
    ],

    [
      "Horario con mayor tasa de fuga",
      stats.topHorarioRate,
      `${stats.topHorarioRateLost} de ${stats.topHorarioRatePrevious} (${stats.topHorarioRatePct}%)`,
    ],

    [
      "Conciliación interna",
      stats.reconciliationOk
        ? "CORRECTA"
        : "REVISAR",
      CONTINUIDAD_RULES_VERSION,
    ],
  ];


  const getDropoutLevelRows = () =>
    (
      analysisData
        ?.analytics
        ?.dropoutByLevel ||
      []
    ).map(
      (row) => [
        row.level,
        row.count,
      ]
    );


  const getDropoutScheduleRows = () =>
    (
      analysisData
        ?.analytics
        ?.dropoutBySchedule ||
      []
    ).map(
      (row) => [
        row.schedule,

        row.previous ??
          row.eligible ??
          0,

        row.lost,

        row.retained,

        `${row.rate}%`,
      ]
    );


  const getDropoutFrequencyRows = () =>
    (
      analysisData
        ?.analytics
        ?.dropoutByFrequency ||
      []
    ).map(
      (row) => [
        row.frequency,

        row.previous,

        row.lost,

        row.retained,

        `${row.rate}%`,
      ]
    );


  const getQualityRows = () => {
    const warnings =
      qualityData
        ?.warnings ||
      [];

    if (
      !warnings.length
    ) {
      return [
        [
          "Sin advertencias",
          "La validación no reportó advertencias.",
        ],
      ];
    }

    return warnings.map(
      (
        warning,
        index
      ) => [
        index + 1,

        warning,
      ]
    );
  };


  /* =======================================================
     EXCEL
     ======================================================= */

  const exportExcel = () => {
    if (
      !analysisData
    ) {
      return;
    }

    const workbook =
      XLSX.utils.book_new();


    if (
      exportScope ===
        "combined" ||
      exportScope ===
        "indicators"
    ) {
      const indicatorsAoA = [
        [
          "Indicador",
          "Valor",
          "Detalle",
        ],

        ...getIndicatorRows().map(
          (row) =>
            row.map(
              excelSafe
            )
        ),
      ];


      const indicatorsSheet =
        XLSX.utils
          .aoa_to_sheet(
            indicatorsAoA
          );

      indicatorsSheet[
        "!cols"
      ] = [
        {
          wch: 50,
        },

        {
          wch: 18,
        },

        {
          wch: 55,
        },
      ];


      XLSX.utils
        .book_append_sheet(
          workbook,

          indicatorsSheet,

          "Indicadores"
        );


      const levelSheet =
        XLSX.utils
          .aoa_to_sheet([
            [
              "Nivel",
              "Pérdidas",
            ],

            ...getDropoutLevelRows(),
          ]);

      levelSheet[
        "!cols"
      ] = [
        {
          wch: 16,
        },

        {
          wch: 16,
        },
      ];


      XLSX.utils
        .book_append_sheet(
          workbook,

          levelSheet,

          "Fuga por nivel"
        );


      const scheduleSheet =
        XLSX.utils
          .aoa_to_sheet([
            [
              "Horario",
              "Debían continuar",
              "Pérdidas",
              "Reinscritos",
              "Tasa de fuga",
            ],

            ...getDropoutScheduleRows(),
          ]);

      scheduleSheet[
        "!cols"
      ] = [
        {
          wch: 28,
        },

        {
          wch: 20,
        },

        {
          wch: 14,
        },

        {
          wch: 14,
        },

        {
          wch: 16,
        },
      ];


      XLSX.utils
        .book_append_sheet(
          workbook,

          scheduleSheet,

          "Fuga por horario"
        );


      const frequencySheet =
        XLSX.utils
          .aoa_to_sheet([
            [
              "Frecuencia",
              "Debían continuar",
              "Pérdidas",
              "Reinscritos",
              "Tasa de fuga",
            ],

            ...getDropoutFrequencyRows(),
          ]);

      frequencySheet[
        "!cols"
      ] = [
        {
          wch: 28,
        },

        {
          wch: 20,
        },

        {
          wch: 14,
        },

        {
          wch: 14,
        },

        {
          wch: 16,
        },
      ];


      XLSX.utils
        .book_append_sheet(
          workbook,

          frequencySheet,

          "Fuga por frecuencia"
        );


      const qualitySheet =
        XLSX.utils
          .aoa_to_sheet([
            [
              "Nº",
              "Control de calidad",
            ],

            ...getQualityRows(),
          ]);

      qualitySheet[
        "!cols"
      ] = [
        {
          wch: 8,
        },

        {
          wch: 100,
        },
      ];


      XLSX.utils
        .book_append_sheet(
          workbook,

          qualitySheet,

          "Calidad de datos"
        );
    }


    if (
      exportScope ===
        "combined" ||
      exportScope ===
        "list"
    ) {
      const {
        headers,
        rows,
      } =
        getListExportTable();


      const listSheet =
        XLSX.utils
          .aoa_to_sheet([
            [
              "Lista",
              currentListTitle,
            ],

            [
              "Filtros",
              getFilterDescription(),
            ],

            [
              "Registros",
              filteredData.length,
            ],

            [],

            headers,

            ...rows.map(
              (row) =>
                row.map(
                  excelSafe
                )
            ),
          ]);


      listSheet[
        "!cols"
      ] =
        headers.map(
          (header) => ({
            wch:
              Math.max(
                15,

                Math.min(
                  45,

                  String(
                    header
                  ).length +
                    8
                )
              ),
          })
        );


      XLSX.utils
        .book_append_sheet(
          workbook,

          listSheet,

          "Lista actual"
        );
    }


    XLSX.writeFile(
      workbook,

      `Continuidad_${new Date()
        .toISOString()
        .slice(
          0,
          10
        )}.xlsx`
    );
  };


  /* =======================================================
     IMPORTAR CRM DESDE EXCEL
     ======================================================= */

  const importExcel = (
    event
  ) => {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    const reader =
      new FileReader();


    reader.onload = (
      readerEvent
    ) => {
      try {
        const workbook =
          XLSX.read(
            readerEvent
              .target
              .result,
            {
              type:
                "binary",
            }
          );


        const firstSheet =
          workbook
            .SheetNames[0];


        if (!firstSheet) {
          throw new Error(
            "El archivo no contiene hojas."
          );
        }


        const worksheet =
          workbook
            .Sheets[
              firstSheet
            ];


        const data =
          XLSX.utils
            .sheet_to_json(
              worksheet
            );


        const nextCrm = {
          ...crmData,
        };


        data.forEach(
          (row) => {
            if (
              !row.Cedula ||
              !row[
                "Estatus CRM"
              ]
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
                row[
                  "Estatus CRM"
                ] ||
                "Pendiente",

              motive:
                row.Motivo ||
                "",

              notes:
                row.Notas ||
                "",

              updatedAt:
                new Date()
                  .toISOString(),
            };
          }
        );


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
        console.error(
          error
        );

        setErrorMsg(
          "No se pudo importar la base CRM."
        );
      }
    };


    reader.readAsBinaryString(
      file
    );
  };


  /* =======================================================
     WORD
     ======================================================= */

  const docxCell = (
    value,
    bold = false
  ) =>
    new Docx.TableCell({
      children: [
        new Docx.Paragraph({
          children: [
            new Docx.TextRun({
              text:
                stringifyExportValue(
                  value
                ),

              bold,

              size:
                16,
            }),
          ],
        }),
      ],
    });


  const buildDocxTable = (
    headers,
    rows
  ) =>
    new Docx.Table({
      rows: [
        new Docx.TableRow({
          children:
            headers.map(
              (header) =>
                docxCell(
                  header,
                  true
                )
            ),
        }),

        ...rows.map(
          (row) =>
            new Docx.TableRow({
              children:
                row.map(
                  (value) =>
                    docxCell(
                      value
                    )
                ),
            })
        ),
      ],

      width: {
        size: 100,

        type:
          Docx.WidthType
            .PERCENTAGE,
      },
    });


  const generateWordReport =
    async () => {
      if (
        !analysisData
      ) {
        return;
      }

      const children = [
        new Docx.Paragraph({
          children: [
            new Docx.TextRun({
              text:
                "DASHBOARD DE CONTINUIDAD",

              bold:
                true,

              size:
                34,
            }),
          ],

          alignment:
            Docx
              .AlignmentType
              .CENTER,
        }),

        new Docx.Paragraph({
          children: [
            new Docx.TextRun({
              text:
                `Fecha: ${new Date().toLocaleDateString()}`,
            }),
          ],

          alignment:
            Docx
              .AlignmentType
              .CENTER,
        }),

        new Docx.Paragraph({
          children: [
            new Docx.TextRun({
              text:
                `Reglas: ${CONTINUIDAD_RULES_VERSION}`,
            }),
          ],

          alignment:
            Docx
              .AlignmentType
              .CENTER,
        }),

        new Docx.Paragraph({
          text: "",
        }),
      ];


      if (
        exportScope ===
          "combined" ||
        exportScope ===
          "indicators"
      ) {
        children.push(
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({
                text:
                  "Indicadores de Gestión",

                bold:
                  true,

                size:
                  26,
              }),
            ],
          })
        );


        children.push(
          buildDocxTable(
            [
              "Indicador",
              "Valor",
              "Detalle",
            ],

            getIndicatorRows()
          )
        );


        children.push(
          new Docx.Paragraph({
            text: "",
          })
        );


        children.push(
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({
                text:
                  "Fuga por Horario",

                bold:
                  true,

                size:
                  24,
              }),
            ],
          })
        );


        children.push(
          buildDocxTable(
            [
              "Horario",
              "Debían continuar",
              "Pérdidas",
              "Reinscritos",
              "Tasa",
            ],

            getDropoutScheduleRows()
          )
        );


        children.push(
          new Docx.Paragraph({
            text: "",
          })
        );


        children.push(
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({
                text:
                  "Fuga por Frecuencia",

                bold:
                  true,

                size:
                  24,
              }),
            ],
          })
        );


        children.push(
          buildDocxTable(
            [
              "Frecuencia",
              "Debían continuar",
              "Pérdidas",
              "Reinscritos",
              "Tasa",
            ],

            getDropoutFrequencyRows()
          )
        );
      }


      if (
        exportScope ===
          "combined" ||
        exportScope ===
          "list"
      ) {
        const {
          headers,
          rows,
        } =
          getListExportTable();


        children.push(
          new Docx.Paragraph({
            text: "",
          })
        );


        children.push(
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({
                text:
                  currentListTitle,

                bold:
                  true,

                size:
                  26,
              }),
            ],

            pageBreakBefore:
              exportScope ===
              "combined",
          })
        );


        children.push(
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({
                text:
                  `Filtros: ${getFilterDescription()}`,
              }),
            ],
          })
        );


        children.push(
          new Docx.Paragraph({
            children: [
              new Docx.TextRun({
                text:
                  `Registros: ${filteredData.length}`,
              }),
            ],
          })
        );


        children.push(
          buildDocxTable(
            headers,
            rows
          )
        );
      }


      const document =
        new Docx.Document({
          sections: [
            {
              properties: {
                page: {
                  size: {
                    orientation:
                      Docx
                        .PageOrientation
                        .LANDSCAPE,
                  },
                },
              },

              children,
            },
          ],
        });


      const blob =
        await Docx
          .Packer
          .toBlob(
            document
          );


      saveAs(
        blob,

        `Continuidad_${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.docx`
      );
    };


  /* =======================================================
     PDF
     ======================================================= */

  const pdfTable = (
    headers,
    rows,
    fontSize = 7
  ) => ({
    table: {
      headerRows: 1,

      widths:
        headers.map(
          () => "*"
        ),

      body: [
        headers.map(
          (header) => ({
            text:
              stringifyExportValue(
                header
              ),

            bold:
              true,

            fillColor:
              "#e2e8f0",
          })
        ),

        ...rows.map(
          (row) =>
            row.map(
              (value) => ({
                text:
                  stringifyExportValue(
                    value
                  ),
              })
            )
        ),
      ],
    },

    fontSize,

    layout:
      "lightHorizontalLines",

    margin: [
      0,
      5,
      0,
      15,
    ],
  });


  const generatePDFReport = () => {
    if (
      !analysisData
    ) {
      return;
    }


    const content = [
      {
        text:
          "DASHBOARD DE CONTINUIDAD",

        fontSize:
          20,

        bold:
          true,

        alignment:
          "center",
      },

      {
        text:
          `Fecha: ${new Date().toLocaleDateString()} · Reglas: ${CONTINUIDAD_RULES_VERSION}`,

        fontSize:
          8,

        color:
          "#64748b",

        alignment:
          "center",

        margin: [
          0,
          5,
          0,
          15,
        ],
      },
    ];


    if (
      exportScope ===
        "combined" ||
      exportScope ===
        "indicators"
    ) {
      content.push({
        text:
          "Indicadores de Gestión",

        fontSize:
          14,

        bold:
          true,

        margin: [
          0,
          5,
          0,
          5,
        ],
      });


      content.push(
        pdfTable(
          [
            "Indicador",
            "Valor",
            "Detalle",
          ],

          getIndicatorRows(),

          8
        )
      );


      content.push({
        text:
          "Fuga por Nivel",

        fontSize:
          13,

        bold:
          true,

        margin: [
          0,
          10,
          0,
          5,
        ],
      });


      content.push(
        pdfTable(
          [
            "Nivel",
            "Pérdidas",
          ],

          getDropoutLevelRows(),

          8
        )
      );


      content.push({
        text:
          "Fuga por Horario",

        fontSize:
          13,

        bold:
          true,

        margin: [
          0,
          10,
          0,
          5,
        ],
      });


      content.push(
        pdfTable(
          [
            "Horario",
            "Debían continuar",
            "Pérdidas",
            "Reinscritos",
            "Tasa",
          ],

          getDropoutScheduleRows(),

          7
        )
      );


      content.push({
        text:
          "Fuga por Frecuencia",

        fontSize:
          13,

        bold:
          true,

        margin: [
          0,
          10,
          0,
          5,
        ],
      });


      content.push(
        pdfTable(
          [
            "Frecuencia",
            "Debían continuar",
            "Pérdidas",
            "Reinscritos",
            "Tasa",
          ],

          getDropoutFrequencyRows(),

          7
        )
      );
    }


    if (
      exportScope ===
        "combined" ||
      exportScope ===
        "list"
    ) {
      const {
        headers,
        rows,
      } =
        getListExportTable();


      content.push({
        text:
          currentListTitle,

        fontSize:
          14,

        bold:
          true,

        pageBreak:
          exportScope ===
          "combined"
            ? "before"
            : undefined,

        margin: [
          0,
          5,
          0,
          5,
        ],
      });


      content.push({
        text:
          `Filtros: ${getFilterDescription()} · Registros: ${filteredData.length}`,

        fontSize:
          8,

        color:
          "#64748b",

        margin: [
          0,
          0,
          0,
          8,
        ],
      });


      content.push(
        pdfTable(
          headers,
          rows,
          headers.length >
          8
            ? 5.5
            : 6.5
        )
      );
    }


    pdfMake
      .createPdf({
        pageSize:
          "A4",

        pageOrientation:
          "landscape",

        pageMargins: [
          25,
          35,
          25,
          35,
        ],

        content,

        defaultStyle: {
          fontSize:
            8,
        },
      })
      .download(
        `Continuidad_${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.pdf`
      );
  };


  /* =======================================================
     IMPRIMIR
     ======================================================= */

  const buildHtmlTable = (
    headers,
    rows
  ) => `
    <table>
      <thead>
        <tr>
          ${headers
            .map(
              (header) =>
                `<th>${escapeHtml(
                  header
                )}</th>`
            )
            .join("")}
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${row
                  .map(
                    (value) =>
                      `<td>${escapeHtml(
                        value
                      )}</td>`
                  )
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;


  const printReport = () => {
    if (
      !analysisData
    ) {
      return;
    }


    const printWindow =
      window.open(
        "",
        "_blank"
      );


    if (
      !printWindow
    ) {
      setErrorMsg(
        "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio."
      );

      return;
    }


    let body = `
      <h1>
        Dashboard de Continuidad
      </h1>

      <p class="meta">
        Fecha:
        ${escapeHtml(
          new Date().toLocaleDateString()
        )}
        · Reglas:
        ${escapeHtml(
          CONTINUIDAD_RULES_VERSION
        )}
      </p>
    `;


    if (
      exportScope ===
        "combined" ||
      exportScope ===
        "indicators"
    ) {
      body += `
        <h2>
          Indicadores de Gestión
        </h2>

        ${buildHtmlTable(
          [
            "Indicador",
            "Valor",
            "Detalle",
          ],

          getIndicatorRows()
        )}

        <h2>
          Fuga por Nivel
        </h2>

        ${buildHtmlTable(
          [
            "Nivel",
            "Pérdidas",
          ],

          getDropoutLevelRows()
        )}

        <h2>
          Fuga por Horario
        </h2>

        ${buildHtmlTable(
          [
            "Horario",
            "Debían continuar",
            "Pérdidas",
            "Reinscritos",
            "Tasa",
          ],

          getDropoutScheduleRows()
        )}

        <h2>
          Fuga por Frecuencia
        </h2>

        ${buildHtmlTable(
          [
            "Frecuencia",
            "Debían continuar",
            "Pérdidas",
            "Reinscritos",
            "Tasa",
          ],

          getDropoutFrequencyRows()
        )}
      `;
    }


    if (
      exportScope ===
        "combined" ||
      exportScope ===
        "list"
    ) {
      const {
        headers,
        rows,
      } =
        getListExportTable();


      body += `
        <section class="${
          exportScope ===
          "combined"
            ? "page-break"
            : ""
        }">

          <h2>
            ${escapeHtml(
              currentListTitle
            )}
          </h2>

          <p class="meta">
            Filtros:
            ${escapeHtml(
              getFilterDescription()
            )}
          </p>

          <p class="meta">
            Registros:
            ${filteredData.length}
          </p>

          ${buildHtmlTable(
            headers,
            rows
          )}

        </section>
      `;
    }


    printWindow.document.write(`
      <!DOCTYPE html>

      <html lang="es">
        <head>
          <meta charset="UTF-8" />

          <title>
            Dashboard de Continuidad
          </title>

          <style>
            @page {
              size: landscape;
              margin: 10mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              font-family:
                Arial,
                Helvetica,
                sans-serif;

              color: #0f172a;

              margin: 0;

              font-size: 10px;
            }

            h1 {
              text-align: center;
              font-size: 22px;
              margin-bottom: 4px;
            }

            h2 {
              font-size: 15px;
              margin-top: 20px;
              margin-bottom: 8px;
            }

            .meta {
              color: #64748b;
              margin: 3px 0 8px 0;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }

            th,
            td {
              border: 1px solid #cbd5e1;
              padding: 5px;
              text-align: left;
              vertical-align: top;
              word-break: break-word;
            }

            th {
              background: #e2e8f0;
              font-weight: 700;
            }

            .page-break {
              break-before: page;
              page-break-before: always;
            }
          </style>
        </head>

        <body>
          ${body}
        </body>
      </html>
    `);


    printWindow.document.close();


    window.setTimeout(
      () => {
        printWindow.focus();

        printWindow.print();
      },
      250
    );
  };


  /* =======================================================
     PANTALLA DE CARGA
     ======================================================= */

  if (
    activeTab ===
    "upload"
  ) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">

        <header className="mb-6 pb-4 border-b border-slate-200">

          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">

            <Upload className="h-6 w-6 text-blue-600" />

            Dashboard de Continuidad

          </h1>

          <p className="text-slate-500 text-sm mt-1">

            Carga las listas del período anterior y del período nuevo.

          </p>

          <p className="text-slate-400 text-xs mt-1">

            Puedes cargar una sola frecuencia, varias frecuencias o todas las listas de Niños, Jóvenes y Adultos al mismo tiempo.

          </p>

        </header>


        {errorMsg && (

          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">

            <strong>
              Error:
            </strong>{" "}

            {errorMsg}

          </div>

        )}


        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">

          <div className="font-bold flex items-center gap-2 mb-1">

            <ShieldCheck className="h-4 w-4" />

            Validación de datos activada

          </div>

          <p>

            El sistema identifica automáticamente Martes y Jueves, Miércoles y Viernes, Lunes, Sabatino, Intensivo y Semi Intensivo, incluyendo variantes de escritura reconocibles.

          </p>

        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* PERÍODO ANTERIOR */}

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">

            <div className="flex items-center justify-between mb-3">

              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">

                PERÍODO ANTERIOR

              </span>


              <button
                type="button"
                onClick={() =>
                  setPdfOldFiles(
                    []
                  )
                }
                className="text-slate-500 hover:text-red-600 text-sm inline-flex items-center gap-2"
              >

                <Trash2 className="h-4 w-4" />

                Eliminar todos

              </button>

            </div>


            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(event) => {

                const files =
                  Array.from(
                    event
                      .target
                      .files ||
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


            <p className="text-xs text-slate-500 mt-2">

              {pdfOldFiles.length
                ? `${pdfOldFiles.length} PDF(s) seleccionado(s)`
                : "No hay PDFs seleccionados."}

            </p>


            {pdfOldFiles.length >
              0 && (

              <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-2">

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
                        className="text-slate-500 hover:text-red-600"
                      >

                        <Trash2 className="h-4 w-4" />

                      </button>

                    </li>

                  )
                )}

              </ul>

            )}

          </div>


          {/* PERÍODO NUEVO */}

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">

            <div className="flex items-center justify-between mb-3">

              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">

                PERÍODO NUEVO

              </span>


              <button
                type="button"
                onClick={() =>
                  setPdfNewFiles(
                    []
                  )
                }
                className="text-slate-500 hover:text-red-600 text-sm inline-flex items-center gap-2"
              >

                <Trash2 className="h-4 w-4" />

                Eliminar todos

              </button>

            </div>


            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(event) => {

                const files =
                  Array.from(
                    event
                      .target
                      .files ||
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


            <p className="text-xs text-slate-500 mt-2">

              {pdfNewFiles.length
                ? `${pdfNewFiles.length} PDF(s) seleccionado(s)`
                : "No hay PDFs seleccionados."}

            </p>


            {pdfNewFiles.length >
              0 && (

              <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-2">

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
                        className="text-slate-500 hover:text-red-600"
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
            disabled={
              loading
            }
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
              : "Procesar y comparar"}

          </button>


          <button
            type="button"
            onClick={
              resetAll
            }
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
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">


      {/* ===================================================
          HEADER
          =================================================== */}

      <header className="mb-6 border-b border-slate-200 pb-4">

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">

          <div>

            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">

              <Users className="h-8 w-8 text-blue-600" />

              Dashboard de Continuidad

            </h1>

            <p className="text-xs text-slate-500 mt-1">

              Motor de reglas:{" "}
              {CONTINUIDAD_RULES_VERSION}

            </p>

          </div>


          <div className="flex flex-wrap gap-2 items-center">


            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  "upload"
                )
              }
              className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium"
            >

              <Upload className="h-4 w-4" />

              PDFs

            </button>


            <input
              type="file"
              accept=".xlsx,.xls"
              ref={
                fileInputRef
              }
              className="hidden"
              onChange={
                importExcel
              }
            />


            <button
              type="button"
              onClick={() =>
                fileInputRef
                  .current
                  ?.click()
              }
              className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-medium"
            >

              <FileUp className="h-4 w-4" />

              Importar CRM

            </button>


            <div className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-2">

              <Download className="h-4 w-4 text-slate-400" />

              <select
                value={
                  exportScope
                }
                onChange={(event) =>
                  setExportScope(
                    event
                      .target
                      .value
                  )
                }
                className="py-2 text-xs bg-transparent outline-none text-slate-700"
              >

                <option value="combined">

                  Indicadores + lista actual

                </option>

                <option value="indicators">

                  Solo indicadores

                </option>

                <option value="list">

                  Solo lista actual

                </option>

              </select>

            </div>


            <button
              type="button"
              onClick={
                exportExcel
              }
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-medium"
            >

              <Save className="h-4 w-4" />

              Excel

            </button>


            <button
              type="button"
              onClick={
                generateWordReport
              }
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium"
            >

              <File className="h-4 w-4" />

              Word

            </button>


            <button
              type="button"
              onClick={
                generatePDFReport
              }
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-medium"
            >

              <FileText className="h-4 w-4" />

              PDF

            </button>


            <button
              type="button"
              onClick={
                printReport
              }
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-medium"
            >

              <Printer className="h-4 w-4" />

              Imprimir

            </button>

          </div>

        </div>


        <p className="text-xs text-slate-400 mt-3">

          Exportación seleccionada:{" "}

          <strong className="text-slate-600">

            {EXPORT_SCOPE_LABELS[
              exportScope
            ]}

          </strong>

          {" · "}

          Lista actual:{" "}

          <strong className="text-slate-600">

            {currentListTitle}

          </strong>

        </p>

      </header>


      {errorMsg && (

        <div className="mb-5 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">

          {errorMsg}

        </div>

      )}


      {/* ===================================================
          CONCILIACIÓN
          =================================================== */}

      {stats.reconciliationOk && (

        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">

          <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />

          <div className="text-sm">

            <p className="font-bold text-emerald-800">

              Conciliación interna correcta

            </p>

            <p className="text-emerald-700 mt-1">

              Período anterior:{" "}

              <strong>
                {stats.oldTotal}
              </strong>

              {" · "}

              Debían continuar:{" "}

              <strong>
                {stats.shouldContinue}
              </strong>

              {" · "}

              Reinscritos:{" "}

              <strong>
                {stats.reenrolled}
              </strong>

              {" · "}

              Pérdidas:{" "}

              <strong>
                {stats.lost}
              </strong>

              {" · "}

              Graduandos:{" "}

              <strong>
                {stats.graduados}
              </strong>

              {" · "}

              Período nuevo:{" "}

              <strong>
                {stats.newTotal}
              </strong>

            </p>

          </div>

        </div>

      )}


      {/* ===================================================
          ADVERTENCIAS
          =================================================== */}

      {qualityData
        ?.warnings
        ?.length >
        0 && (

        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">

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


        {/* TOTAL REINSCRITOS */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">

          <div className="flex justify-between items-start">

            <p className="text-sm font-semibold text-slate-500">

              Total Reinscritos

            </p>

            <CheckCircle className="h-5 w-5 text-emerald-500" />

          </div>

          <div className="mt-2 flex items-baseline gap-2">

            <h3 className="text-4xl font-black text-emerald-600">

              {stats.reenrolledPct}%

            </h3>

            <span className="text-lg font-bold text-slate-700">

              ({stats.reenrolled})

            </span>

          </div>

          <p className="text-xs text-slate-400">

            De{" "}
            {stats.shouldContinue}{" "}
            estudiantes del período anterior que debían continuar

          </p>

        </div>


        {/* PÉRDIDA */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-rose-500">

          <div className="flex justify-between items-start">

            <p className="text-sm font-semibold text-slate-500">

              Total Pérdida

            </p>

            <XCircle className="h-5 w-5 text-rose-500" />

          </div>

          <div className="mt-2 flex items-baseline gap-2">

            <h3 className="text-4xl font-black text-rose-600">

              {stats.lostPct}%

            </h3>

            <span className="text-lg font-bold text-slate-700">

              ({stats.lost})

            </span>

          </div>

          <p className="text-xs text-slate-400">

            De{" "}
            {stats.shouldContinue}{" "}
            estudiantes del período anterior que debían continuar

          </p>

        </div>


        {/* L01 VS REGULARES */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">

          <p className="text-sm font-semibold text-slate-500">

            Fuga: Nuevos vs Regulares

          </p>


          <div className="mt-3 flex gap-4 items-end">

            <button
              type="button"
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
              className={`text-left px-2 py-1 rounded ${
                filterFugaType ===
                "Nuevos"
                  ? "bg-rose-100 ring-2 ring-rose-300"
                  : ""
              }`}
            >

              <div>

                <span className="text-2xl font-black text-rose-600">

                  {stats.level1Lost}

                </span>

                <span className="ml-1 text-xs font-bold text-slate-500">

                  L01

                </span>

              </div>

              <p className="text-xs text-rose-500">

                {stats.level1LostPct}% de{" "}
                {stats.previousLevel1}

              </p>

            </button>


            <span className="text-slate-300 pb-4">

              |

            </span>


            <button
              type="button"
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
              className={`text-left px-2 py-1 rounded ${
                filterFugaType ===
                "Regulares"
                  ? "bg-slate-200 ring-2 ring-slate-300"
                  : ""
              }`}
            >

              <div>

                <span className="text-2xl font-black text-slate-700">

                  {stats.regularLost}

                </span>

                <span className="ml-1 text-xs font-bold text-slate-500">

                  Regulares

                </span>

              </div>

              <p className="text-xs text-slate-500">

                {stats.regularLostPct}% de{" "}
                {stats.regularPrevious}

              </p>

            </button>

          </div>

        </div>


        {/* RESCATE */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 border-b-4 border-b-blue-500">

          <div className="flex justify-between items-start">

            <p className="text-sm font-semibold text-slate-500">

              Tasa Éxito Rescate

            </p>

            <Phone className="h-5 w-5 text-blue-500" />

          </div>

          <div className="mt-2">

            <h3 className="text-3xl font-black text-blue-600">

              {winBackRate ===
              null
                ? "—"
                : `${winBackRate}%`}

            </h3>

            <p className="text-xs text-slate-400">

              {contactedCount ===
              0
                ? "Sin contactos registrados"
                : `${rescuedCount} de ${contactedCount} contactados`}

            </p>

          </div>

        </div>


        {/* HORARIO VOLUMEN */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">

          <div className="flex justify-between">

            <p className="text-sm font-semibold text-slate-500">

              Horario Crítico por Volumen

            </p>

            <Clock className="h-5 w-5 text-amber-500" />

          </div>

          <h3 className="mt-3 text-lg font-black text-slate-800">

            {stats.topHorarioFugas}

          </h3>

          <p className="text-xs text-slate-400">

            {stats.topHorarioFugasCount} pérdida(s) ·{" "}
            {stats.topHorarioFugasRate}%

          </p>

        </div>


        {/* HORARIO TASA */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">

          <div className="flex justify-between">

            <p className="text-sm font-semibold text-slate-500">

              Horario Crítico por Tasa

            </p>

            <AlertTriangle className="h-5 w-5 text-orange-500" />

          </div>

          <h3 className="mt-3 text-lg font-black text-slate-800">

            {stats.topHorarioRate}

          </h3>

          <p className="text-xs text-slate-400">

            {stats.topHorarioRatePct}% ·{" "}

            {stats.topHorarioRateLost} de{" "}

            {stats.topHorarioRatePrevious}

          </p>

        </div>


        {/* DENSIDAD */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">

          <div className="flex justify-between">

            <p className="text-sm font-semibold text-slate-500">

              Densidad Promedio

            </p>

            <Users className="h-5 w-5 text-indigo-400" />

          </div>

          <h3 className="mt-3 text-3xl font-black text-slate-800">

            {stats.avgDensity}

          </h3>

          <p className="text-xs text-slate-400">

            Alumnos por sección ·{" "}

            {stats.activeSections} secciones

          </p>

        </div>


        {/* TRANSICIONES */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">

          <div className="flex justify-between">

            <p className="text-sm font-semibold text-slate-500">

              Transición de Categorías

            </p>

            <TrendingUp className="h-5 w-5 text-emerald-500" />

          </div>


          <div className="mt-3 space-y-2">


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "transNinosJovenes"
                );

                resetFilters();

              }}
              className="w-full flex justify-between bg-emerald-50 px-2 py-1.5 rounded"
            >

              <span className="text-xs font-bold text-emerald-700">

                Niños → Jóvenes

              </span>

              <strong className="text-emerald-600">

                {stats.transNinosJovenes}

              </strong>

            </button>


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "transNinosAdultos"
                );

                resetFilters();

              }}
              className="w-full flex justify-between bg-cyan-50 px-2 py-1.5 rounded"
            >

              <span className="text-xs font-bold text-cyan-700">

                Niños → Adultos

              </span>

              <strong className="text-cyan-600">

                {stats.transNinosAdultos}

              </strong>

            </button>


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "transJovenesAdultos"
                );

                resetFilters();

              }}
              className="w-full flex justify-between bg-blue-50 px-2 py-1.5 rounded"
            >

              <span className="text-xs font-bold text-blue-700">

                Jóvenes → Adultos

              </span>

              <strong className="text-blue-600">

                {stats.transJovenesAdultos}

              </strong>

            </button>

          </div>

        </div>


        {/* MOVIMIENTOS */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 md:col-span-2 lg:col-span-4">

          <div className="flex justify-between">

            <p className="text-sm font-semibold text-slate-500">

              Movimientos del Período

            </p>

            <GraduationCap className="h-5 w-5 text-indigo-400" />

          </div>


          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "graduados"
                );

                resetFilters();

              }}
              className="text-left bg-indigo-50 rounded-lg px-3 py-3 hover:ring-2 ring-indigo-300"
            >

              <p className="text-xs font-bold text-indigo-700">

                Graduandos

              </p>

              <p className="text-2xl font-black text-indigo-600">

                {stats.graduados}

              </p>

              <p className="text-xs text-indigo-500">

                Adultos L20 anterior que no aparecen en el nuevo período

              </p>

            </button>


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "nuevosL01"
                );

                resetFilters();

              }}
              className="text-left bg-emerald-50 rounded-lg px-3 py-3 hover:ring-2 ring-emerald-300"
            >

              <p className="text-xs font-bold text-emerald-700">

                Ingresos Nivel 01

              </p>

              <p className="text-2xl font-black text-emerald-600">

                {stats.currentLevel1}

              </p>

              <p className="text-xs text-emerald-500">

                Todos los L01 de las listas nuevas

              </p>

            </button>


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "noPresentesL02"
                );

                resetFilters();

              }}
              className="text-left bg-sky-50 rounded-lg px-3 py-3 hover:ring-2 ring-sky-300"
            >

              <p className="text-xs font-bold text-sky-700">

                Estudiantes no presentes en el período anterior L02+

              </p>

              <p className="text-2xl font-black text-sky-600">

                {stats.notPresentPreviousL02Plus}

              </p>

              <p className="text-xs text-sky-500">

                No implica automáticamente nivelación

              </p>

            </button>


            <button
              type="button"
              onClick={() => {

                setTableView(
                  "cambios"
                );

                resetFilters();

              }}
              className="text-left bg-amber-50 rounded-lg px-3 py-3 hover:ring-2 ring-amber-300"
            >

              <p className="text-xs font-bold text-amber-700">

                Cambios de Frecuencia

              </p>

              <p className="text-2xl font-black text-amber-600">

                {stats.cambiosFreq}

              </p>

              <p className="text-xs text-amber-500">

                Ej. Sabatino → Martes y Jueves

              </p>

            </button>

          </div>

        </div>

      </div>


      {/* L20 REAPARECIDOS */}

      {stats.terminalReappeared >
        0 && (

        <div className="mb-6 p-4 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 flex gap-3">

          <AlertTriangle className="h-5 w-5 flex-shrink-0" />

          <div className="text-sm">

            <strong>

              Revisión académica:

            </strong>{" "}

            {stats.terminalReappeared} estudiante(s) de Adultos L20 del período anterior aparecen nuevamente en el período nuevo. No fueron contados como graduandos.

          </div>

        </div>

      )}


      {/* ===================================================
          GRÁFICOS
          =================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">


        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">

          <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">

            <h3 className="text-lg font-bold text-slate-800">

              Volumen de Deserción por Nivel

            </h3>


            <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-lg">

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
                    className={`px-3 py-1 text-xs rounded ${
                      levelChartCategory ===
                      category
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-500"
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


          <div className="h-64">

            <ResponsiveContainer
              width="100%"
              height="100%"
            >

              <BarChart
                data={
                  chartDataLevel
                }
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={
                    false
                  }
                />

                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize:
                      10,
                  }}
                />

                <YAxis
                  allowDecimals={
                    false
                  }
                />

                <RechartsTooltip />

                <Bar
                  dataKey="count"
                  fill="#3b82f6"
                  name="Estudiantes"
                  radius={[
                    4,
                    4,
                    0,
                    0,
                  ]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>


        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">

          <div className="flex justify-between items-center mb-4">

            <h3 className="text-lg font-bold">

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
              className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded"
            >

              {pieMode ===
              "horario"
                ? "Ver por Frecuencia"
                : "Ver por Horario"}

            </button>

          </div>


          <div className="h-64">

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
                  innerRadius={
                    60
                  }
                  outerRadius={
                    85
                  }
                  paddingAngle={
                    4
                  }
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
                        key={index}
                        fill={
                          pieMode ===
                          "frecuencia"
                            ? (
                                FRECUENCIA_COLORS[
                                  entry
                                    .name
                                ] ||
                                "#94a3b8"
                              )
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
        "noPresentesL02" && (

        <div className="bg-amber-50 border border-amber-200 p-4 mb-4 rounded-lg flex gap-3 text-amber-800 text-sm">

          <Info className="h-5 w-5 flex-shrink-0" />

          <p>

            <strong>

              Nota:

            </strong>{" "}

            esta lista contiene estudiantes del período nuevo en L02 o superior cuya identificación no aparece en el período anterior cargado. El sistema no los clasifica automáticamente como nivelación porque también pueden existir reingresos de períodos más antiguos.

          </p>

        </div>

      )}


      {/* ===================================================
          TABLA
          =================================================== */}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">


        <div className="p-5 border-b border-slate-100 flex flex-col xl:flex-row gap-4 justify-between">


          <div className="flex items-center gap-2">

            <UserPlus className="h-5 w-5 text-slate-400" />


            <select
              value={
                tableView
              }
              onChange={(event) => {

                setTableView(
                  event
                    .target
                    .value
                );

                resetFilters();

              }}
              className="bg-transparent text-lg font-bold text-slate-800 outline-none border-b-2 border-slate-200"
            >

              {Object.entries(
                TABLE_VIEW_LABELS
              ).map(
                (
                  [
                    value,
                    label,
                  ]
                ) => (

                  <option
                    key={
                      value
                    }
                    value={
                      value
                    }
                  >

                    {label}

                  </option>

                )
              )}

            </select>

          </div>


          <div className="flex flex-wrap gap-2 items-center">


            <select
              value={
                selectedCategory
              }
              onChange={(event) =>
                setSelectedCategory(
                  event
                    .target
                    .value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs"
            >

              {filterOptions.categories.map(
                (value) => (

                  <option
                    key={
                      value
                    }
                    value={
                      value
                    }
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
                  event
                    .target
                    .value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs"
            >

              {filterOptions.levels.map(
                (value) => (

                  <option
                    key={
                      value
                    }
                    value={
                      value
                    }
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
                  event
                    .target
                    .value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs"
            >

              {filterOptions.frecuencias.map(
                (value) => (

                  <option
                    key={
                      value
                    }
                    value={
                      value
                    }
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
                  event
                    .target
                    .value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs"
            >

              {filterOptions.horarios.map(
                (value) => (

                  <option
                    key={
                      value
                    }
                    value={
                      value
                    }
                  >

                    {value ===
                    "All"
                      ? "Todos los horarios"
                      : value}

                  </option>

                )
              )}

            </select>


            <div className="relative min-w-52">

              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input
                type="text"
                value={
                  searchTerm
                }
                onChange={(event) =>
                  setSearchTerm(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Buscar alumno..."
                className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
              />

            </div>


            <button
              type="button"
              onClick={
                resetFilters
              }
              className="bg-slate-100 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
            >

              <Filter className="h-4 w-4" />

              Limpiar

            </button>

          </div>

        </div>


        <div className="px-5 py-2 bg-slate-50 text-xs text-slate-500 flex items-center gap-2">

          <Database className="h-4 w-4" />

          Mostrando{" "}

          <strong>

            {filteredData.length}

          </strong>{" "}

          registro(s)

          {" · "}

          Estos son los registros que se exportarán cuando selecciones{" "}

          <strong>

            “Lista actual”

          </strong>

        </div>


        <div className="overflow-x-auto">

          <table className="w-full text-left whitespace-nowrap">

            <thead>

              <tr className="bg-slate-50 text-xs uppercase text-slate-500">


                {tableView ===
                  "desercion" && (

                  <th className="p-4">

                    Estatus CRM

                  </th>

                )}


                <th className="p-4">

                  Estudiante

                </th>

                <th className="p-4">

                  Cédula

                </th>


                {(tableView ===
                  "transNinosJovenes" ||
                  tableView ===
                    "transNinosAdultos" ||
                  tableView ===
                    "transJovenesAdultos") ? (

                  <>

                    <th className="p-4">

                      Categoría Anterior

                    </th>

                    <th className="p-4">

                      Categoría Nueva

                    </th>

                  </>

                ) : (

                  <th className="p-4">

                    Categoría

                  </th>

                )}


                <th className="p-4">

                  Nivel

                </th>


                {tableView ===
                  "cambios" ? (

                  <>

                    <th className="p-4">

                      Frecuencia Anterior

                    </th>

                    <th className="p-4">

                      Cambio

                    </th>

                    <th className="p-4">

                      Frecuencia Nueva

                    </th>

                  </>

                ) : (

                  <th className="p-4">

                    Frecuencia

                  </th>

                )}


                <th className="p-4">

                  Horario

                </th>

                <th className="p-4">

                  Email

                </th>

                <th className="p-4">

                  Teléfono

                </th>


                <th className="p-4">

                  Contacto

                </th>


                {tableView ===
                  "desercion" && (

                  <th className="p-4">

                    Acción CRM

                  </th>

                )}

              </tr>

            </thead>


            <tbody className="divide-y divide-slate-100 text-sm">

              {filteredData.map(
                (student) => {

                  const crm =
                    crmData[
                      student.idNorm
                    ] || {
                      status:
                        "Pendiente",
                    };


                  const whatsapp =
                    normalizeWhatsAppPhone(
                      student.phone
                    );


                  return (

                    <tr
                      key={`${student.idNorm}-${tableView}`}
                      className="hover:bg-slate-50"
                    >


                      {tableView ===
                        "desercion" && (

                        <td className="p-4">

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${getCrmStatusColor(
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


                      <td className="p-4 font-mono text-xs text-slate-500">

                        {student.id}

                      </td>


                      {(tableView ===
                        "transNinosJovenes" ||
                        tableView ===
                          "transNinosAdultos" ||
                        tableView ===
                          "transJovenesAdultos") ? (

                        <>

                          <td className="p-4">

                            {student.oldCategory}

                          </td>

                          <td className="p-4 font-semibold text-blue-600">

                            {student.newCategory ||
                              student.category}

                          </td>

                        </>

                      ) : (

                        <td className="p-4">

                          {student.category}

                        </td>

                      )}


                      <td className="p-4">

                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">

                          {student.levelNorm}

                        </span>

                      </td>


                      {tableView ===
                        "cambios" ? (

                        <>

                          <td className="p-4 text-slate-600">

                            {student.oldFrequency ||
                              "N/A"}

                          </td>


                          <td className="p-4">

                            <span className="inline-flex items-center gap-2 font-semibold text-amber-700">

                              {student.oldFrequency ||
                                "N/A"}

                              <ArrowRight className="h-4 w-4" />

                              {student.newFrequency ||
                                student.frequencyNorm}

                            </span>

                          </td>


                          <td className="p-4 text-blue-600 font-semibold">

                            {student.newFrequency ||
                              student.frequencyNorm}

                          </td>

                        </>

                      ) : (

                        <td className="p-4">

                          {student.frequencyNorm}

                        </td>

                      )}


                      <td className="p-4">

                        {student.scheduleBlock}

                      </td>


                      <td className="p-4 text-slate-500">

                        {student.email ||
                          "N/A"}

                      </td>


                      <td className="p-4">

                        {student.phone ||
                          "N/A"}

                      </td>


                      <td className="p-4">

                        {student.phone ? (

                          <div className="flex gap-2">

                            {whatsapp && (

                              <a
                                href={`https://wa.me/${whatsapp}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 bg-green-100 text-green-600 rounded-lg"
                                title="WhatsApp"
                              >

                                <MessageCircle className="h-4 w-4" />

                              </a>

                            )}


                            <a
                              href={`tel:${student.phone}`}
                              className="p-2 bg-blue-100 text-blue-600 rounded-lg"
                              title="Llamar"
                            >

                              <Phone className="h-4 w-4" />

                            </a>

                          </div>

                        ) : (

                          <span className="text-slate-400">

                            N/A

                          </span>

                        )}

                      </td>


                      {tableView ===
                        "desercion" && (

                        <td className="p-4">

                          <button
                            type="button"
                            onClick={() =>
                              setCrmModal({
                                isOpen:
                                  true,

                                student,
                              })
                            }
                            className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
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
                    colSpan={
                      14
                    }
                    className="p-8 text-center text-slate-400"
                  >

                    No hay registros que coincidan con los filtros seleccionados.

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

        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">

          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">


            <div className="p-5 border-b bg-slate-50 flex justify-between">

              <div>

                <h3 className="font-bold">

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
              >

                <XCircle className="h-6 w-6 text-slate-400" />

              </button>

            </div>


            <form
              onSubmit={
                saveCrmData
              }
              className="p-5 space-y-4"
            >


              <div>

                <label className="block text-xs font-bold mb-1">

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
                  className="w-full border rounded-lg p-2.5 text-sm"
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

                <label className="block text-xs font-bold mb-1">

                  Motivo Principal

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
                  className="w-full border rounded-lg p-2.5 text-sm"
                >

                  <option value="">

                    Seleccione...

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

                <label className="block text-xs font-bold mb-1">

                  Notas

                </label>

                <textarea
                  name="notes"
                  rows={
                    4
                  }
                  defaultValue={
                    crmData[
                      crmModal
                        .student
                        .idNorm
                    ]?.notes ||
                    ""
                  }
                  className="w-full border rounded-lg p-2 text-sm"
                />

              </div>


              <div className="flex justify-end gap-3">

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
                  className="px-4 py-2 text-sm"
                >

                  Cancelar

                </button>


                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg"
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
