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
} from "lucide-react";

import {
  parseCevazPdf,
  __HORARIO_BLOQUES__,
} from "./utils/parseCevazPdf";

/* =========================================================
   PDFMAKE
   ========================================================= */

if (pdfFonts && pdfFonts.pdfMake) {
  pdfMake.vfs = pdfFonts.pdfMake.vfs;
}

/* =========================================================
   CONSTANTES
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

/*
  IMPORTANTE:
  Para Adultos, un graduando es quien estaba en L20
  en el período ANTERIOR.

  NO se debe considerar L19 como graduado.
*/
const GRADUATION_LEVEL_BY_CATEGORY = {
  Adultos: 20,

  /*
    Se mantienen estas reglas para que la aplicación
    pueda trabajar con otras categorías.

    Si CEVAZ maneja otro nivel terminal para estas
    categorías, lo cambiaremos cuando revisemos el parser
    y las reglas institucionales.
  */
  Niños: 18,
  Jóvenes: 18,
};

const STRICT_VALIDATION = true;

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

  topHorarioFugas: "N/A",
  topHorarioFugasCount: 0,

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
   NORMALIZACIONES
   ========================================================= */

/*
  Cédulas / identificaciones

  Ejemplos:

  17.738.636-1  -> 177386361
  17738636-1    -> 177386361
  V-12345678    -> 12345678
  E-12345678    -> 12345678

  Las letras distintas de V/E se conservan para
  identificaciones extranjeras alfanuméricas.
*/
const normalizeStudentId = (value = "") => {
  let raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "";

  let compact = raw.replace(/[^A-Z0-9]/g, "");

  /*
    Elimina prefijo venezolano V/E solamente
    cuando lo demás es numérico.
  */
  if (/^[VE]\d+$/.test(compact)) {
    compact = compact.slice(1);
  }

  return compact;
};

const normalizeCategoryValue = (value = "") => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (!raw) return "N/A";

  const up = raw.toUpperCase();

  if (up.includes("ADULTO")) return "Adultos";
  if (up.includes("NIÑO") || up.includes("NINO")) return "Niños";

  if (
    up.includes("JÓVEN") ||
    up.includes("JOVEN") ||
    up.includes("JÓVENES") ||
    up.includes("JOVENES")
  ) {
    return "Jóvenes";
  }

  return raw;
};

const normalizeLevelValue = (value = "") => {
  const raw = String(value ?? "").trim();

  if (!raw) return "N/A";

  const numeric = parseInt(raw.replace(/\D/g, ""), 10);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "N/A";
  }

  return `L${String(numeric).padStart(2, "0")}`;
};

const levelNumber = (student) => {
  if (!student?.levelNorm) return 0;

  return (
    parseInt(
      String(student.levelNorm)
        .replace(/\D/g, ""),
      10
    ) || 0
  );
};

const normalizeNameKey = (value = "") => {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const normalizeScheduleBlock = (value = "") => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  return raw || "N/A";
};

/* =========================================================
   GRADUACIÓN
   ========================================================= */

const isGraduated = (student) => {
  if (!student) return false;

  const category = normalizeCategoryValue(student.category);
  const lvl = levelNumber(student);

  if (!lvl) return false;

  const terminalLevel = GRADUATION_LEVEL_BY_CATEGORY[category];

  if (!terminalLevel) {
    return false;
  }

  /*
    IGUALDAD ESTRICTA.

    Adultos:
    L20 = graduando.
    L19 = NO graduando.
  */
  return lvl === terminalLevel;
};

/* =========================================================
   TELÉFONOS
   ========================================================= */

const phoneDigits = (phone = "") =>
  String(phone ?? "").replace(/\D/g, "");

const normalizeWhatsAppPhone = (phone = "") => {
  let digits = phoneDigits(phone);

  if (!digits) return "";

  /*
    Corrige formatos como:
    +58 0414...
    580414...
  */
  if (/^5804\d{9}$/.test(digits)) {
    digits = `58${digits.slice(3)}`;
  }

  /*
    Venezuela local:
    0414xxxxxxx -> 58414xxxxxxx
    0424xxxxxxx -> 58424xxxxxxx
  */
  if (/^0(4\d{9})$/.test(digits)) {
    digits = `58${digits.slice(1)}`;
  }

  return digits;
};

/* =========================================================
   VALIDACIÓN BÁSICA DE DATOS
   ========================================================= */

const isLikelyValidEmail = (email = "") => {
  if (!email) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(email).trim());
};

const isLikelyValidPhone = (phone = "") => {
  if (!phone) return true;

  const digits = phoneDigits(phone);

  return digits.length >= 7 && digits.length <= 15;
};

const isLikelyValidId = (idNorm = "") => {
  if (!idNorm) return false;

  return /^[A-Z0-9]{5,25}$/.test(idNorm);
};

/* =========================================================
   ARCHIVOS
   ========================================================= */

const fileKey = (f) =>
  `${f.name}__${f.size}__${f.lastModified}`;

const extractDateKeyFromName = (name = "") => {
  const up = String(name || "").toUpperCase();

  /*
    2026-08-11
    2026_08_11
    2026/08/11
  */
  let m = up.match(
    /(20\d{2})[\/_\-](\d{1,2})[\/_\-](\d{1,2})/
  );

  if (m) {
    return (
      parseInt(m[1], 10) * 10000 +
      parseInt(m[2], 10) * 100 +
      parseInt(m[3], 10)
    );
  }

  /*
    09_07 -> 09 de julio
    11_08 -> 11 de agosto

    Convierte DD/MM a MMDD para ordenar.
  */
  m = up.match(
    /(^|[^0-9])(\d{1,2})[\/_\-](\d{1,2})([^0-9]|$)/
  );

  if (m) {
    const day = parseInt(m[2], 10);
    const month = parseInt(m[3], 10);

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
  const meta = files.map((f, idx) => {
    const dk = extractDateKeyFromName(f.name);

    return {
      f,
      idx,
      hasDate: dk !== null,
      dk: dk ?? Number.POSITIVE_INFINITY,
      name: String(f.name || "").toUpperCase(),
    };
  });

  meta.sort((a, b) => {
    if (a.hasDate && b.hasDate) {
      if (a.dk !== b.dk) return a.dk - b.dk;

      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }

      return a.idx - b.idx;
    }

    if (a.hasDate !== b.hasDate) {
      return a.hasDate ? -1 : 1;
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }

    return a.idx - b.idx;
  });

  return meta.map((x) => x.f);
};

/* =========================================================
   FRECUENCIAS
   ========================================================= */

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

  if (
    up.includes("MARTES") &&
    up.includes("JUEVES")
  ) {
    return "MARTES Y JUEVES";
  }

  if (
    (up.includes("MIERCOLES") ||
      up.includes("MIÉRCOLES")) &&
    up.includes("VIERNES")
  ) {
    return "MIERCOLES Y VIERNES";
  }

  if (
    up.includes("SABADO") ||
    up.includes("SÁBADO") ||
    up.includes("SABAT")
  ) {
    return "SABATINO";
  }

  if (up.includes("LUNES")) {
    return "LUNES";
  }

  if (
    up.includes("TUESDAY") &&
    up.includes("THURSDAY")
  ) {
    return "MARTES Y JUEVES";
  }

  if (
    up.includes("WEDNESDAY") &&
    up.includes("FRIDAY")
  ) {
    return "MIERCOLES Y VIERNES";
  }

  if (up.includes("SATURDAY")) {
    return "SABATINO";
  }

  if (
    up.includes("MONDAY") &&
    !up.includes("TO")
  ) {
    return "LUNES";
  }

  /*
    TUESDAY TO FRIDAY
    MARTES A VIERNES
  */
  if (
    up.includes(" TO ") ||
    /\sA\s/.test(up)
  ) {
    return "INTENSIVO";
  }

  return left || "N/A";
};

/* =========================================================
   PARSEO DE VARIOS PDFs
   ========================================================= */

const parseMany = async (
  files,
  {
    intensivoLabel = "INTENSIVO",
  } = {}
) => {
  const filesOrdered = sortFilesSmart(files);

  const failed = [];
  const all = [];

  for (
    let rank = 0;
    rank < filesOrdered.length;
    rank++
  ) {
    const f = filesOrdered[rank];

    let list = [];

    try {
      list = await parseCevazPdf(f);

      if (!list?.length) {
        failed.push(f.name);
      }
    } catch (error) {
      console.error(
        `Error procesando ${f.name}:`,
        error
      );

      failed.push(f.name);
      list = [];
    }

    for (const original of list || []) {
      const rawId =
        original?.id !== undefined &&
        original?.id !== null
          ? String(original.id).trim()
          : "";

      const idNorm = normalizeStudentId(rawId);

      const category =
        normalizeCategoryValue(
          original.category
        );

      const levelNorm =
        normalizeLevelValue(
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
        __fileName: f.name,
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
   DEDUPLICACIÓN POR CÉDULA NORMALIZADA
   ========================================================= */

const uniqByIdPreferLatest = (arr = []) => {
  const map = new Map();

  for (const student of arr) {
    if (!student?.idNorm) continue;

    const prev = map.get(student.idNorm);

    if (!prev) {
      map.set(student.idNorm, student);
      continue;
    }

    const rPrev = Number.isFinite(
      prev.__fileRank
    )
      ? prev.__fileRank
      : -1;

    const rNow = Number.isFinite(
      student.__fileRank
    )
      ? student.__fileRank
      : -1;

    if (rNow >= rPrev) {
      map.set(
        student.idNorm,
        student
      );
    }
  }

  return Array.from(map.values());
};

/* =========================================================
   DETECCIÓN DE CONFLICTOS DE IDENTIDAD
   ========================================================= */

const findIdentityConflicts = (
  students = [],
  label = ""
) => {
  const grouped = new Map();

  for (const s of students) {
    if (!s.idNorm) continue;

    if (!grouped.has(s.idNorm)) {
      grouped.set(s.idNorm, []);
    }

    grouped.get(s.idNorm).push(s);
  }

  const duplicates = [];
  const conflicts = [];

  for (const [idNorm, group] of grouped) {
    if (group.length <= 1) continue;

    const uniqueNames = new Set(
      group.map((s) =>
        normalizeNameKey(s.name)
      )
    );

    duplicates.push({
      idNorm,
      count: group.length,
      names: group.map((s) => s.name),
    });

    /*
      Misma cédula pero nombres sustancialmente
      diferentes = conflicto crítico.
    */
    if (uniqueNames.size > 1) {
      conflicts.push({
        period: label,
        idNorm,
        students: group,
      });
    }
  }

  return {
    duplicates,
    conflicts,
  };
};

/* =========================================================
   CALIDAD DE DATOS
   ========================================================= */

const evaluateDataQuality = ({
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

  const missingIdOld =
    oldAll.filter((s) => !s.idNorm);

  const missingIdNew =
    newAll.filter((s) => !s.idNorm);

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

  const invalidIdOld =
    oldAll.filter(
      (s) =>
        s.idNorm &&
        !isLikelyValidId(s.idNorm)
    );

  const invalidIdNew =
    newAll.filter(
      (s) =>
        s.idNorm &&
        !isLikelyValidId(s.idNorm)
    );

  if (invalidIdOld.length) {
    warnings.push(
      `Período anterior: ${invalidIdOld.length} identificación(es) con formato inusual.`
    );
  }

  if (invalidIdNew.length) {
    warnings.push(
      `Período actual: ${invalidIdNew.length} identificación(es) con formato inusual.`
    );
  }

  const missingLevelOld =
    oldAll.filter(
      (s) => s.levelNorm === "N/A"
    );

  const missingLevelNew =
    newAll.filter(
      (s) => s.levelNorm === "N/A"
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

  const missingCategoryOld =
    oldAll.filter(
      (s) =>
        !s.category ||
        s.category === "N/A"
    );

  const missingCategoryNew =
    newAll.filter(
      (s) =>
        !s.category ||
        s.category === "N/A"
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

  const missingScheduleOld =
    oldAll.filter(
      (s) =>
        !s.scheduleBlock ||
        s.scheduleBlock === "N/A"
    );

  const missingScheduleNew =
    newAll.filter(
      (s) =>
        !s.scheduleBlock ||
        s.scheduleBlock === "N/A"
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

  const badEmailOld =
    oldAll.filter(
      (s) =>
        s.email &&
        !isLikelyValidEmail(s.email)
    );

  const badEmailNew =
    newAll.filter(
      (s) =>
        s.email &&
        !isLikelyValidEmail(s.email)
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

  const badPhoneOld =
    oldAll.filter(
      (s) =>
        s.phone &&
        !isLikelyValidPhone(s.phone)
    );

  const badPhoneNew =
    newAll.filter(
      (s) =>
        s.phone &&
        !isLikelyValidPhone(s.phone)
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

  const identityOld =
    findIdentityConflicts(
      oldAll,
      "Anterior"
    );

  const identityNew =
    findIdentityConflicts(
      newAll,
      "Actual"
    );

  if (identityOld.conflicts.length) {
    critical.push(
      `Período anterior: ${identityOld.conflicts.length} cédula(s) están asociadas a nombres diferentes.`
    );
  }

  if (identityNew.conflicts.length) {
    critical.push(
      `Período actual: ${identityNew.conflicts.length} cédula(s) están asociadas a nombres diferentes.`
    );
  }

  if (identityOld.duplicates.length) {
    warnings.push(
      `Período anterior: ${identityOld.duplicates.length} cédula(s) repetida(s); se conservará el registro del archivo más reciente.`
    );
  }

  if (identityNew.duplicates.length) {
    warnings.push(
      `Período actual: ${identityNew.duplicates.length} cédula(s) repetida(s); se conservará el registro del archivo más reciente.`
    );
  }

  return {
    critical,
    warnings,

    details: {
      missingIdOld: missingIdOld.length,
      missingIdNew: missingIdNew.length,

      missingLevelOld:
        missingLevelOld.length,

      missingLevelNew:
        missingLevelNew.length,

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

      duplicateIdsOld:
        identityOld.duplicates.length,

      duplicateIdsNew:
        identityNew.duplicates.length,
    },
  };
};

/* =========================================================
   SECCIONES / DENSIDAD
   ========================================================= */

const getSectionKey = (student) => {
  if (student?.courseId) {
    return `COURSE:${student.courseId}`;
  }

  /*
    Fallback si el parser no logró extraer courseId.
  */
  return [
    student?.category || "N/A",
    student?.levelNorm || "N/A",
    student?.scheduleBlock || "N/A",
    student?.frequencyNorm || "N/A",
  ].join("|");
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

  return (
    hash >>> 0
  ).toString(36);
};

const buildAnalysisStorageKey = ({
  oldFiles,
  newFiles,
  oldIntensivoLabel,
  newIntensivoLabel,
}) => {
  const oldNames = sortFilesSmart(
    oldFiles
  )
    .map((f) => f.name)
    .join("||");

  const newNames = sortFilesSmart(
    newFiles
  )
    .map((f) => f.name)
    .join("||");

  const fingerprint = [
    oldNames,
    oldIntensivoLabel,
    newNames,
    newIntensivoLabel,
  ].join("###");

  return `continuidad_crm_${simpleHash(
    fingerprint
  )}`;
};

const loadCrmFromStorage = (
  storageKey
) => {
  if (!storageKey) return {};

  try {
    const raw =
      window.localStorage.getItem(
        storageKey
      );

    if (!raw) return {};

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
  if (!storageKey) return;

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

  /* -------------------------
     ARCHIVOS
     ------------------------- */

  const [
    pdfOldFiles,
    setPdfOldFiles,
  ] = useState([]);

  const [
    pdfNewFiles,
    setPdfNewFiles,
  ] = useState([]);

  /*
    Para este caso:

    Julio 2026 = Intensivo A
    Agosto 2026 = Intensivo B

    Se deja seleccionable para futuros períodos.
  */
  const [
    oldIntensivoLabel,
    setOldIntensivoLabel,
  ] = useState("INTENSIVO A");

  const [
    newIntensivoLabel,
    setNewIntensivoLabel,
  ] = useState("INTENSIVO B");

  /* -------------------------
     SISTEMA
     ------------------------- */

  const [loading, setLoading] =
    useState(false);

  const [errorMsg, setErrorMsg] =
    useState("");

  const [warnMsg, setWarnMsg] =
    useState("");

  const [
    qualityData,
    setQualityData,
  ] = useState(null);

  const [
    analysisStorageKey,
    setAnalysisStorageKey,
  ] = useState("");

  /* -------------------------
     DATOS ACADÉMICOS
     ------------------------- */

  const [
    oldStudents,
    setOldStudents,
  ] = useState([]);

  const [
    newStudents,
    setNewStudents,
  ] = useState([]);

  const [
    dropouts,
    setDropouts,
  ] = useState([]);

  /* -------------------------
     LISTAS ESPECÍFICAS
     ------------------------- */

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

  /* -------------------------
     CRM
     ------------------------- */

  const [crmData, setCrmData] =
    useState({});

  const [
    crmModal,
    setCrmModal,
  ] = useState({
    isOpen: false,
    student: null,
  });

  /* -------------------------
     TABLAS
     ------------------------- */

  const [
    tableView,
    setTableView,
  ] = useState("desercion");

  const [
    filterFugaType,
    setFilterFugaType,
  ] = useState("All");

  /* -------------------------
     ESTADÍSTICAS
     ------------------------- */

  const [stats, setStats] =
    useState(createEmptyStats());

  /* -------------------------
     FILTROS
     ------------------------- */

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

  /* =========================================================
     ARCHIVOS
     ========================================================= */

  const mergeFiles = (
    prev,
    incoming
  ) => {
    const map = new Map(
      prev.map((f) => [
        fileKey(f),
        f,
      ])
    );

    for (const f of incoming) {
      map.set(fileKey(f), f);
    }

    return Array.from(map.values());
  };

  const removeOldAt = (idx) => {
    setPdfOldFiles((prev) =>
      prev.filter(
        (_, i) => i !== idx
      )
    );
  };

  const removeNewAt = (idx) => {
    setPdfNewFiles((prev) =>
      prev.filter(
        (_, i) => i !== idx
      )
    );
  };

  /* =========================================================
     RESET
     ========================================================= */

  const resetAll = () => {
    setPdfOldFiles([]);
    setPdfNewFiles([]);

    setOldStudents([]);
    setNewStudents([]);
    setDropouts([]);

    setNewStudentsList([]);
    setFreqChangersList([]);
    setGraduadosList([]);

    setTransNinosJovenesList([]);
    setTransJovenesAdultosList([]);

    setCrmData({});

    setAnalysisStorageKey("");

    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedFrecuencia("All");
    setSelectedLevel("All");
    setSelectedHorario("All");

    setLevelChartCategory("All");
    setPieMode("horario");

    setTableView("desercion");
    setFilterFugaType("All");

    setStats(createEmptyStats());

    setQualityData(null);

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
    setFilterFugaType("All");
  };

  /* =========================================================
     PROCESAMIENTO PRINCIPAL
     ========================================================= */

  const processPdfs = async () => {
    setErrorMsg("");
    setWarnMsg("");
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

      /*
        Cada grupo recibe su etiqueta de Intensivo.

        Julio:
        Intensivo A

        Agosto:
        Intensivo B

        Ya NO se decide A/B según el orden
        interno de los archivos.
      */
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

      /* -------------------------
         VALIDACIÓN DE ENTRADA
         ------------------------- */

      const quality =
        evaluateDataQuality({
          oldAll,
          newAll,
          failedOld,
          failedNew,
        });

      setQualityData(quality);

      if (
        STRICT_VALIDATION &&
        quality.critical.length
      ) {
        throw new Error(
          `VALIDACIÓN BLOQUEADA: ${quality.critical.join(
            " | "
          )}`
        );
      }

      /* -------------------------
         DEDUPLICACIÓN
         ------------------------- */

      const oldU =
        uniqByIdPreferLatest(
          oldAll
        );

      const newU =
        uniqByIdPreferLatest(
          newAll
        );

      /* -------------------------
         MAPAS POR IDENTIDAD
         ------------------------- */

      const oldById = new Map(
        oldU.map((s) => [
          s.idNorm,
          s,
        ])
      );

      const newById = new Map(
        newU.map((s) => [
          s.idNorm,
          s,
        ])
      );

      const oldIds = new Set(
        oldU.map((s) => s.idNorm)
      );

      const newIds = new Set(
        newU.map((s) => s.idNorm)
      );

      /* =====================================================
         GRADUANDOS

         Se calculan exclusivamente desde
         el PERÍODO ANTERIOR.
         ===================================================== */

      const grads =
        oldU.filter(isGraduated);

      const eligibleOld =
        oldU.filter(
          (s) => !isGraduated(s)
        );

      /* =====================================================
         REINSCRITOS

         Un alumno elegible del período anterior
         aparece también en el período actual.
         ===================================================== */

      const reenrolledPairs =
        eligibleOld
          .filter((oldS) =>
            newIds.has(oldS.idNorm)
          )
          .map((oldS) => ({
            oldS,
            newS:
              newById.get(oldS.idNorm),
          }));

      const reenrolledCurrent =
        reenrolledPairs.map(
          ({ newS }) => newS
        );

      /* =====================================================
         FUGAS

         Elegibles del período anterior
         que NO aparecen en el actual.
         ===================================================== */

      const lost =
        eligibleOld.filter(
          (oldS) =>
            !newIds.has(
              oldS.idNorm
            )
        );

      /* =====================================================
         PORCENTAJES GENERALES
         ===================================================== */

      const reenrolledPct =
        eligibleOld.length
          ? Math.round(
              (reenrolledPairs.length /
                eligibleOld.length) *
                1000
            ) / 10
          : 0;

      const lostPct =
        eligibleOld.length
          ? Math.round(
              (lost.length /
                eligibleOld.length) *
                1000
            ) / 10
          : 0;

      /* =====================================================
         NUEVOS VS REGULARES EN LA FUGA

         Nuevo ingreso = L01 del período anterior.
         Regular = L02 a nivel terminal - 1.
         ===================================================== */

      const nuevosEligibleArr =
        eligibleOld.filter(
          (s) =>
            s.levelNorm === "L01"
        );

      const regularesEligibleArr =
        eligibleOld.filter(
          (s) =>
            s.levelNorm !== "L01"
        );

      const nuevosLostArr =
        lost.filter(
          (s) =>
            s.levelNorm === "L01"
        );

      const regularesLostArr =
        lost.filter(
          (s) =>
            s.levelNorm !== "L01"
        );

      const nuevosLostPct =
        nuevosEligibleArr.length
          ? Math.round(
              (nuevosLostArr.length /
                nuevosEligibleArr.length) *
                1000
            ) / 10
          : 0;

      const regularesLostPct =
        regularesEligibleArr.length
          ? Math.round(
              (regularesLostArr.length /
                regularesEligibleArr.length) *
                1000
            ) / 10
          : 0;

      /* =====================================================
         TRANSICIÓN DE CATEGORÍAS
         ===================================================== */

      const transNJArr = [];
      const transJAArr = [];

      const categoriesInScope =
        new Set(
          [...oldU, ...newU].map(
            (s) => s.category
          )
        );

      const categoryTransitionsAvailable =
        categoriesInScope.has(
          "Niños"
        ) ||
        categoriesInScope.has(
          "Jóvenes"
        );

      /* =====================================================
         CAMBIOS DE FRECUENCIA

         MUY IMPORTANTE:

         Se compara frequencyBase,
         no frequencyNorm.

         Por eso:
         Intensivo A -> Intensivo B
         NO cuenta como cambio de frecuencia.

         Ambos pertenecen a la familia INTENSIVO.
         ===================================================== */

      const freqChangersArr = [];

      reenrolledPairs.forEach(
        ({ oldS, newS }) => {
          if (!oldS || !newS) return;

          if (
            oldS.category ===
              "Niños" &&
            newS.category ===
              "Jóvenes"
          ) {
            transNJArr.push({
              ...newS,
              oldCategory:
                oldS.category,
            });
          }

          if (
            oldS.category ===
              "Jóvenes" &&
            newS.category ===
              "Adultos"
          ) {
            transJAArr.push({
              ...newS,
              oldCategory:
                oldS.category,
            });
          }

          if (
            oldS.frequencyBase &&
            newS.frequencyBase &&
            oldS.frequencyBase !==
              "N/A" &&
            newS.frequencyBase !==
              "N/A" &&
            oldS.frequencyBase !==
              newS.frequencyBase
          ) {
            freqChangersArr.push({
              ...newS,

              oldFrequency:
                oldS.frequencyNorm,

              oldFrequencyBase:
                oldS.frequencyBase,

              newFrequency:
                newS.frequencyNorm,

              newFrequencyBase:
                newS.frequencyBase,
            });
          }
        }
      );

      /* =====================================================
         NUEVOS EN EL PERÍODO ACTUAL

         No aparecen en ningún registro
         del período anterior.
         ===================================================== */

      const nuevosArr =
        newU.filter(
          (s) =>
            !oldIds.has(s.idNorm)
        );

      const nuevosL01 =
        nuevosArr.filter(
          (s) =>
            s.levelNorm === "L01"
        );

      /*
        Técnicamente estos no son automáticamente
        "nivelación".

        Son:
        - nuevos en el período actual
        - no estaban en el anterior
        - están en L02+

        Se mantiene la variable por compatibilidad
        con la interfaz, pero la etiqueta visible
        es más rigurosa.
      */
      const nuevosNivelacion =
        nuevosArr.filter(
          (s) =>
            s.levelNorm !== "L01"
        );

      /* =====================================================
         GRADUADOS QUE EXTRAÑAMENTE APARECEN OTRA VEZ

         Esto no rompe la conciliación.

         Se registra aparte.
         ===================================================== */

      const graduadosPresentesNuevamente =
        grads.filter((g) =>
          newIds.has(g.idNorm)
        );

      /* =====================================================
         DENSIDAD PROMEDIO

         Estudiantes por SECCIÓN ACTIVA,
         no por salón físico.
         ===================================================== */

      const activeSections =
        new Set(
          newU.map(getSectionKey)
        );

      const avgDensity =
        activeSections.size > 0
          ? (
              newU.length /
              activeSections.size
            ).toFixed(1)
          : "0.0";

      /* =====================================================
         FUGA POR HORARIO - VOLUMEN
         ===================================================== */

      const lostByHorario =
        lost.reduce(
          (acc, s) => {
            const block =
              s.scheduleBlock ||
              "N/A";

            if (block !== "N/A") {
              acc[block] =
                (acc[block] ||
                  0) + 1;
            }

            return acc;
          },
          {}
        );

      const topHorarioVolumeEntry =
        Object.entries(
          lostByHorario
        ).sort(
          (a, b) =>
            b[1] - a[1]
        )[0];

      const topHorarioFugas =
        topHorarioVolumeEntry?.[0] ||
        "N/A";

      const topHorarioFugasCount =
        topHorarioVolumeEntry?.[1] ||
        0;

      /* =====================================================
         FUGA POR HORARIO - TASA
         ===================================================== */

      const eligibleByHorario =
        eligibleOld.reduce(
          (acc, s) => {
            const block =
              s.scheduleBlock ||
              "N/A";

            if (block !== "N/A") {
              acc[block] =
                (acc[block] ||
                  0) + 1;
            }

            return acc;
          },
          {}
        );

      const horarioRates =
        Object.keys(
          eligibleByHorario
        )
          .map((schedule) => {
            const eligible =
              eligibleByHorario[
                schedule
              ] || 0;

            const lostCount =
              lostByHorario[
                schedule
              ] || 0;

            const rate =
              eligible > 0
                ? (lostCount /
                    eligible) *
                  100
                : 0;

            return {
              schedule,
              eligible,
              lost: lostCount,
              rate,
            };
          })
          .sort((a, b) => {
            if (b.rate !== a.rate) {
              return (
                b.rate - a.rate
              );
            }

            return (
              b.lost - a.lost
            );
          });

      const topRate =
        horarioRates[0];

      const topHorarioRate =
        topRate?.schedule ||
        "N/A";

      const topHorarioRatePct =
        topRate
          ? Math.round(
              topRate.rate * 10
            ) / 10
          : 0;

      const topHorarioRateLost =
        topRate?.lost || 0;

      const topHorarioRateEligible =
        topRate?.eligible || 0;

      /* =====================================================
         CONCILIACIONES INTERNAS
         ===================================================== */

      const reconciliationOld =
        oldU.length ===
        eligibleOld.length +
          grads.length;

      const reconciliationEligible =
        eligibleOld.length ===
        reenrolledPairs.length +
          lost.length;

      /*
        El período actual está compuesto por:

        - reinscritos elegibles
        - ingresos externos
        - graduados anteriores que aparezcan otra vez
      */
      const reconciliationNew =
        newU.length ===
        reenrolledCurrent.length +
          nuevosArr.length +
          graduadosPresentesNuevamente.length;

      const reconciliationOk =
        reconciliationOld &&
        reconciliationEligible &&
        reconciliationNew;

      if (!reconciliationOk) {
        throw new Error(
          [
            "La conciliación interna de alumnos no cerró correctamente.",
            `Anterior=${oldU.length}`,
            `Elegibles=${eligibleOld.length}`,
            `Graduados=${grads.length}`,
            `Reinscritos=${reenrolledPairs.length}`,
            `Fugas=${lost.length}`,
            `Actual=${newU.length}`,
            `Ingresos externos=${nuevosArr.length}`,
            `Graduados nuevamente presentes=${graduadosPresentesNuevamente.length}`,
          ].join(" | ")
        );
      }

      /* =====================================================
         ADVERTENCIAS ADICIONALES
         ===================================================== */

      const extraWarnings = [
        ...(quality.warnings || []),
      ];

      if (
        graduadosPresentesNuevamente.length
      ) {
        extraWarnings.push(
          `${graduadosPresentesNuevamente.length} estudiante(s) clasificado(s) como graduados del período anterior aparecen nuevamente en el período actual. Revise su situación académica.`
        );
      }

      /* =====================================================
         CRM PERSISTENTE
         ===================================================== */

      const storageKey =
        buildAnalysisStorageKey({
          oldFiles: pdfOldFiles,
          newFiles: pdfNewFiles,

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

      setCrmData(savedCrm);

      /* =====================================================
         ESTADOS
         ===================================================== */

      setOldStudents(oldU);
      setNewStudents(newU);

      setDropouts(lost);

      setNewStudentsList(
        nuevosArr
      );

      setFreqChangersList(
        freqChangersArr
      );

      setGraduadosList(grads);

      setTransNinosJovenesList(
        transNJArr
      );

      setTransJovenesAdultosList(
        transJAArr
      );

      setStats({
        oldTotal: oldU.length,
        newTotal: newU.length,

        eligibleOld:
          eligibleOld.length,

        reenrolled:
          reenrolledPairs.length,

        reenrolledPct,

        lost: lost.length,
        lostPct,

        nuevosEligible:
          nuevosEligibleArr.length,

        regularesEligible:
          regularesEligibleArr.length,

        nuevosLost:
          nuevosLostArr.length,

        nuevosLostPct,

        regularesLost:
          regularesLostArr.length,

        regularesLostPct,

        transNinosJovenes:
          transNJArr.length,

        transJovenesAdultos:
          transJAArr.length,

        categoryTransitionsAvailable,

        avgDensity,

        topHorarioFugas,
        topHorarioFugasCount,

        topHorarioRate,
        topHorarioRatePct,

        topHorarioRateLost,
        topHorarioRateEligible,

        graduados: grads.length,

        graduadosPresentesNuevamente:
          graduadosPresentesNuevamente.length,

        nuevosL01:
          nuevosL01.length,

        nuevosNivelacion:
          nuevosNivelacion.length,

        nuevosExternosTotal:
          nuevosArr.length,

        cambiosFreq:
          freqChangersArr.length,

        reconciliationOk,
      });

      setQualityData({
        ...quality,
        warnings:
          extraWarnings,
        reconciliationOk,
      });

      setWarnMsg(
        extraWarnings.length
          ? extraWarnings.join(" | ")
          : ""
      );

      resetFilters();

      setTableView(
        "desercion"
      );

      setActiveTab(
        "dashboard"
      );
    } catch (e) {
      console.error(e);

      setErrorMsg(
        e?.message ||
          "Error procesando los PDFs."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     CRM
     ========================================================= */

  const contactedCount =
    dropouts.filter((s) => {
      const crm =
        crmData[s.idNorm];

      return (
        crm?.status &&
        crm.status !==
          "Pendiente"
      );
    }).length;

  const rescuedCount =
    dropouts.filter((s) => {
      const crm =
        crmData[s.idNorm];

      return (
        crm?.status ===
        "Rescatado"
      );
    }).length;

  /*
    null = todavía no existe una tasa calculable.
  */
  const winBackRate =
    contactedCount > 0
      ? Math.round(
          (rescuedCount /
            contactedCount) *
            100
        )
      : null;

  const saveCrmData = (e) => {
    e.preventDefault();

    if (!crmModal.student) {
      return;
    }

    const formData =
      new FormData(e.target);

    const studentKey =
      crmModal.student.idNorm ||
      normalizeStudentId(
        crmModal.student.id
      );

    setCrmData((prev) => {
      const next = {
        ...prev,

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
    });

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

  /* =========================================================
     PIE INTERACTIVO
     ========================================================= */

  const onClickPie = (data) => {
    const name =
      data?.name ||
      data?.payload?.name;

    if (!name) return;

    setTableView("desercion");

    if (
      pieMode === "horario"
    ) {
      setSelectedHorario(name);
    } else {
      setSelectedFrecuencia(
        name
      );
    }
  };

  /* =========================================================
     FUENTE DE TABLA
     ========================================================= */

  const sourceData =
    useMemo(() => {
      if (
        tableView ===
        "desercion"
      ) {
        return dropouts;
      }

      if (
        tableView ===
        "nuevosL01"
      ) {
        return newStudentsList.filter(
          (s) =>
            s.levelNorm ===
            "L01"
        );
      }

      if (
        tableView ===
        "nivelacion"
      ) {
        return newStudentsList.filter(
          (s) =>
            s.levelNorm !==
            "L01"
        );
      }

      if (
        tableView ===
        "cambios"
      ) {
        return freqChangersList;
      }

      if (
        tableView ===
        "graduados"
      ) {
        return graduadosList;
      }

      if (
        tableView ===
        "transNinosJovenes"
      ) {
        return transNinosJovenesList;
      }

      if (
        tableView ===
        "transJovenesAdultos"
      ) {
        return transJovenesAdultosList;
      }

      return dropouts;
    }, [
      tableView,
      dropouts,
      newStudentsList,
      freqChangersList,
      graduadosList,
      transNinosJovenesList,
      transJovenesAdultosList,
    ]);

  /* =========================================================
     OPCIONES DE FILTROS
     ========================================================= */

  const filterOptions =
    useMemo(() => {
      const cats =
        Array.from(
          new Set(
            sourceData
              .map(
                (s) =>
                  s.category
              )
              .filter(Boolean)
          )
        ).sort();

      const lvls =
        Array.from(
          new Set(
            sourceData
              .map(
                (s) =>
                  s.levelNorm
              )
              .filter(Boolean)
          )
        ).sort(
          (a, b) =>
            (parseInt(
              a.replace(
                /\D/g,
                ""
              ),
              10
            ) || 0) -
            (parseInt(
              b.replace(
                /\D/g,
                ""
              ),
              10
            ) || 0)
        );

      const hrs =
        Array.from(
          new Set(
            sourceData
              .map(
                (s) =>
                  s.scheduleBlock
              )
              .filter(Boolean)
          )
        );

      const freqs =
        Array.from(
          new Set(
            sourceData
              .map(
                (s) =>
                  s.frequencyNorm
              )
              .filter(Boolean)
          )
        );

      const known =
        __HORARIO_BLOQUES__ ||
        [];

      const knownSet =
        new Set(known);

      return {
        categories: [
          "All",
          ...cats,
        ],

        levels: [
          "All",
          ...lvls,
        ],

        horarios: [
          "All",

          ...known.filter(
            (h) =>
              hrs.includes(h)
          ),

          ...hrs
            .filter(
              (h) =>
                !knownSet.has(h)
            )
            .sort(),
        ],

        frecuencias: [
          "All",

          ...FRECUENCIA_ORDER.filter(
            (f) =>
              freqs.includes(f)
          ),

          ...freqs
            .filter(
              (f) =>
                !FRECUENCIA_ORDER.includes(
                  f
                )
            )
            .sort(),
        ],
      };
    }, [sourceData]);

  /* =========================================================
     DATOS FILTRADOS
     ========================================================= */

  const filteredData =
    useMemo(() => {
      const q =
        searchTerm
          .trim()
          .toLowerCase();

      return sourceData.filter(
        (s) => {
          const matchesSearch =
            !q ||
            String(
              s.name || ""
            )
              .toLowerCase()
              .includes(q) ||
            String(
              s.id || ""
            )
              .toLowerCase()
              .includes(q) ||
            String(
              s.idNorm || ""
            )
              .toLowerCase()
              .includes(q) ||
            String(
              s.email || ""
            )
              .toLowerCase()
              .includes(q) ||
            String(
              s.phone || ""
            ).includes(q);

          const matchesCategory =
            selectedCategory ===
              "All" ||
            s.category ===
              selectedCategory;

          const matchesFrecuencia =
            selectedFrecuencia ===
              "All" ||
            s.frequencyNorm ===
              selectedFrecuencia;

          const matchesLevel =
            selectedLevel ===
              "All" ||
            s.levelNorm ===
              selectedLevel;

          const matchesHorario =
            selectedHorario ===
              "All" ||
            s.scheduleBlock ===
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
              s.levelNorm !==
                "L01"
            ) {
              matchesFugaType =
                false;
            }

            if (
              filterFugaType ===
                "Regulares" &&
              s.levelNorm ===
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

  /* =========================================================
     GRÁFICO POR NIVEL
     ========================================================= */

  const chartCategories =
    useMemo(() => {
      return [
        "All",
        ...Array.from(
          new Set(
            dropouts
              .map(
                (s) =>
                  s.category
              )
              .filter(Boolean)
          )
        ).sort(),
      ];
    }, [dropouts]);

  const barSource =
    useMemo(() => {
      return levelChartCategory ===
        "All"
        ? dropouts
        : dropouts.filter(
            (s) =>
              s.category ===
              levelChartCategory
          );
    }, [
      dropouts,
      levelChartCategory,
    ]);

  const chartDataLevel =
    useMemo(() => {
      const byLevel =
        barSource.reduce(
          (acc, s) => {
            const k =
              s.levelNorm ||
              "N/A";

            acc[k] =
              (acc[k] ||
                0) + 1;

            return acc;
          },
          {}
        );

      return Object.keys(
        byLevel
      )
        .map((k) => ({
          name: k,
          count: byLevel[k],
        }))
        .sort(
          (a, b) =>
            (parseInt(
              a.name.replace(
                /\D/g,
                ""
              ),
              10
            ) || 0) -
            (parseInt(
              b.name.replace(
                /\D/g,
                ""
              ),
              10
            ) || 0)
        );
    }, [barSource]);

  /* =========================================================
     PIE DE FUGAS
     ========================================================= */

  const chartDataPie =
    useMemo(() => {
      const byKey =
        dropouts.reduce(
          (acc, s) => {
            const key =
              pieMode ===
              "horario"
                ? s.scheduleBlock ||
                  "N/A"
                : s.frequencyNorm ||
                  "N/A";

            acc[key] =
              (acc[key] ||
                0) + 1;

            return acc;
          },
          {}
        );

      return Object.keys(byKey)
        .map((k) => ({
          name: k,
          value: byKey[k],
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

  /* =========================================================
     EXPORTAR EXCEL
     ========================================================= */

  const exportExcel = () => {
    if (!filteredData.length) {
      return;
    }

    const rows =
      filteredData.map((s) => {
        const crm =
          crmData[s.idNorm] ||
          {};

        const baseRow = {
          Cedula: s.id,
          Estudiante: s.name,
          Categoria:
            s.category,

          Nivel:
            s.levelNorm,

          Frecuencia:
            s.frequencyNorm ||
            "N/A",

          Horario:
            s.scheduleBlock,

          Email:
            s.email || "",

          Telefono:
            s.phone || "",
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
              s.oldFrequency ||
              "N/A",

            "Familia Anterior":
              s.oldFrequencyBase ||
              "N/A",

            "Familia Nueva":
              s.newFrequencyBase ||
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
              s.oldCategory ||
              "N/A",
          };
        }

        return baseRow;
      });

    const ws =
      XLSX.utils.json_to_sheet(
        rows
      );

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Datos Continuidad"
    );

    XLSX.writeFile(
      wb,
      `BD_Continuidad_${new Date()
        .toISOString()
        .slice(
          0,
          10
        )}.xlsx`
    );
  };

  /* =========================================================
     IMPORTAR CRM DESDE EXCEL
     ========================================================= */

  const importExcel = (e) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr =
          evt.target.result;

        const wb = XLSX.read(
          bstr,
          {
            type: "binary",
          }
        );

        const wsname =
          wb.SheetNames[0];

        const ws =
          wb.Sheets[wsname];

        const data =
          XLSX.utils.sheet_to_json(
            ws
          );

        const newCrmData = {
          ...crmData,
        };

        data.forEach((row) => {
          if (
            row.Cedula &&
            row["Estatus CRM"]
          ) {
            const key =
              normalizeStudentId(
                row.Cedula
              );

            if (!key) return;

            newCrmData[key] = {
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
                new Date().toISOString(),
            };
          }
        });

        setCrmData(
          newCrmData
        );

        saveCrmToStorage(
          analysisStorageKey,
          newCrmData
        );

        e.target.value =
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

  /* =========================================================
     REPORTE PDF
     ========================================================= */

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

          alignment: "justify",

          margin: [
            0,
            0,
            0,
            10,
          ],

          lineHeight: 1.5,
        },

        {
          text: "2. Indicadores Clave de Rendimiento (KPIs)",
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
                  style:
                    "kpiLabel",
                },

                {
                  text: "Transición de Categorías",
                  style:
                    "kpiLabel",
                },

                {
                  text: "Tasa de Rescate",
                  style:
                    "kpiLabel",
                },
              ],

              [
                {
                  text: `${stats.avgDensity} / Sección`,
                  style:
                    "kpiValue",
                },

                {
                  text: transitionText,
                  style:
                    "kpiValue",
                },

                {
                  text: winBackText,
                  style:
                    "kpiValue",
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
                `Fuga de L01: ${stats.nuevosLost} de ${stats.nuevosEligible} estudiantes (${stats.nuevosLostPct}%).`,

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
                `Mayor volumen de fuga: "${stats.topHorarioFugas}", con ${stats.topHorarioFugasCount} pérdida(s).`,

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
                winBackRate ===
                null
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
                  style:
                    "tableHeader",
                },

                {
                  text: "Alumnos Perdidos",
                  style:
                    "tableHeader",
                  alignment:
                    "center",
                },

                {
                  text: "% del Total",
                  style:
                    "tableHeader",
                  alignment:
                    "center",
                },
              ],

              ...Array.from(
                new Set(
                  dropouts.map(
                    (s) =>
                      s.category
                  )
                )
              ).map((cat) => {
                const count =
                  dropouts.filter(
                    (s) =>
                      s.category ===
                      cat
                  ).length;

                const pct =
                  stats.lost > 0
                    ? Math.round(
                        (count /
                          stats.lost) *
                          100
                      )
                    : 0;

                return [
                  cat || "N/A",

                  {
                    text:
                      count.toString(),
                    alignment:
                      "center",
                  },

                  {
                    text: `${pct}%`,
                    alignment:
                      "center",
                  },
                ];
              }),
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
            `Conciliación interna: ${stats.reconciliationOk ? "CORRECTA" : "REVISAR"}.`,

          margin: [
            0,
            0,
            0,
            10,
          ],
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
          margin: [
            0,
            0,
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
          fillColor:
            "#334155",
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
          .slice(
            0,
            10
          )}.pdf`
      );
  };

  /* =========================================================
     REPORTE WORD
     ========================================================= */

  const generateWordReport =
    async () => {
      const tableRows = [
        new Docx.TableRow({
          children: [
            new Docx.TableCell({
              children: [
                new Docx.Paragraph(
                  {
                    text: "Categoría",
                    bold: true,
                  }
                ),
              ],
            }),

            new Docx.TableCell({
              children: [
                new Docx.Paragraph(
                  {
                    text: "Total Deserción",
                    bold: true,
                  }
                ),
              ],
            }),
          ],
        }),

        ...Array.from(
          new Set(
            dropouts.map(
              (s) =>
                s.category
            )
          )
        ).map((cat) => {
          const count =
            dropouts.filter(
              (s) =>
                s.category ===
                cat
            ).length;

          return new Docx.TableRow({
            children: [
              new Docx.TableCell({
                children: [
                  new Docx.Paragraph({
                    text:
                      cat ||
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
          ? `${stats.transNinosJovenes + stats.transJovenesAdultos} transiciones detectadas.`
          : "No evaluable con las categorías incluidas en los archivos cargados.";

      const doc =
        new Docx.Document({
          sections: [
            {
              properties: {},

              children: [
                new Docx.Paragraph({
                  text: "DASHBOARD DE CONTINUIDAD",
                  heading:
                    Docx
                      .HeadingLevel
                      .HEADING_1,
                  alignment:
                    Docx
                      .AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: "Informe Ejecutivo de Retención Académica",
                  heading:
                    Docx
                      .HeadingLevel
                      .HEADING_2,
                  alignment:
                    Docx
                      .AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: `Fecha de emisión: ${new Date().toLocaleDateString()}`,
                  alignment:
                    Docx
                      .AlignmentType
                      .CENTER,
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "1. Resumen General Académico",
                  heading:
                    Docx
                      .HeadingLevel
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
                  text: "2. Indicadores Clave de Rendimiento (KPIs)",
                  heading:
                    Docx
                      .HeadingLevel
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
                  text: `• Densidad Promedio: ${stats.avgDensity} alumnos por sección activa.`,
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
                    Docx
                      .HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Paragraph({
                  text: `Anterior: ${stats.oldTotal} = ${stats.eligibleOld} elegibles + ${stats.graduados} graduandos.`,
                }),

                new Docx.Paragraph({
                  text: `Elegibles: ${stats.eligibleOld} = ${stats.reenrolled} reinscritos + ${stats.lost} fugas.`,
                }),

                new Docx.Paragraph({
                  text: `Conciliación interna: ${stats.reconciliationOk ? "CORRECTA" : "REVISAR"}.`,
                }),

                new Docx.Paragraph({
                  text: " ",
                }),

                new Docx.Paragraph({
                  text: "4. Matriz de Fuga por Categoría",
                  heading:
                    Docx
                      .HeadingLevel
                      .HEADING_3,
                }),

                new Docx.Table({
                  rows: tableRows,

                  width: {
                    size: 100,
                    type:
                      Docx
                        .WidthType
                        .PERCENTAGE,
                  },
                }),
              ],
            },
          ],
        });

      const blob =
        await Docx.Packer.toBlob(
          doc
        );

      saveAs(
        blob,
        `Dashboard_Continuidad_${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.docx`
      );
    };

  /* =========================================================
     PANTALLA DE CARGA
     ========================================================= */

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

        {warnMsg && (
          <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            {warnMsg}
          </div>
        )}

        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <div className="font-bold flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4" />

            Modo de validación estricta activado
          </div>

          <p>
            Si un PDF no se procesa, falta una cédula, falta un nivel o existe un conflicto de identidad, el sistema detendrá el análisis en lugar de mostrar indicadores potencialmente incorrectos.
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
                className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2"
                onClick={() =>
                  setPdfOldFiles([])
                }
                type="button"
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
              onChange={(e) =>
                setOldIntensivoLabel(
                  e.target.value
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
              onChange={(e) => {
                const files =
                  Array.from(
                    e.target.files ||
                      []
                  );

                setPdfOldFiles(
                  (prev) =>
                    mergeFiles(
                      prev,
                      files
                    )
                );

                e.target.value =
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
                  (f, idx) => (
                    <li
                      key={fileKey(
                        f
                      )}
                      className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded"
                    >
                      <span className="text-slate-700 truncate">
                        {f.name}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeOldAt(
                            idx
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
                className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2"
                onClick={() =>
                  setPdfNewFiles([])
                }
                type="button"
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
              onChange={(e) =>
                setNewIntensivoLabel(
                  e.target.value
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
              onChange={(e) => {
                const files =
                  Array.from(
                    e.target.files ||
                      []
                  );

                setPdfNewFiles(
                  (prev) =>
                    mergeFiles(
                      prev,
                      files
                    )
                );

                e.target.value =
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
                  (f, idx) => (
                    <li
                      key={fileKey(
                        f
                      )}
                      className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded"
                    >
                      <span className="text-slate-700 truncate">
                        {f.name}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeNewAt(
                            idx
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
              ? "Procesando y Validando..."
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

  /* =========================================================
     DASHBOARD
     ========================================================= */

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
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
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
            accept=".xlsx, .xls"
            ref={fileInputRef}
            className="hidden"
            onChange={
              importExcel
            }
          />

          <button
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg shadow-sm text-xs font-medium"
          >
            <FileUp className="h-4 w-4" />

            Importar BD
          </button>

          <button
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
            onClick={
              generateWordReport
            }
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium"
          >
            <File className="h-4 w-4" />

            Word
          </button>

          <button
            onClick={
              generatePDFReport
            }
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg shadow text-xs font-medium"
          >
            <FileText className="h-4 w-4" />

            PDF
          </button>

          <button
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

      {/* VALIDACIÓN DE CONCILIACIÓN */}

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
                  <li
                    key={
                      index
                    }
                  >
                    {
                      warning
                    }
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      )}

      {/* =====================================================
          INDICADORES
          ===================================================== */}

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
                  (prev) =>
                    prev ===
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
                  (prev) =>
                    prev ===
                    "Regulares"
                      ? "All"
                      : "Regulares"
                );
              }}
            >
              <div>
                <span className="text-2xl font-black text-slate-700">
                  {
                    stats.regularesLost
                  }
                </span>

                <span className="text-xs font-bold text-slate-500 ml-1">
                  Regulares
                </span>
              </div>

              <p className="text-xs text-slate-500 font-semibold">
                {
                  stats.regularesLostPct
                }
                % de{" "}
                {
                  stats.regularesEligible
                }
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

        {/* HORARIO VOLUMEN */}

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
              {
                stats.topHorarioFugas
              }
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {
                stats.topHorarioFugasCount
              }{" "}
              pérdida(s)
            </p>
          </div>
        </div>

        {/* HORARIO TASA */}

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between print:border print:shadow-none">
          <div className="flex justify-between items-start">
            <p className="text-sm font-semibold text-slate-500">
              Mayor Tasa de Fuga
            </p>

            <AlertTriangle className="h-5 w-5 text-orange-500 print:hidden" />
          </div>

          <div className="mt-2">
            <h3 className="text-lg font-black text-slate-800">
              {
                stats.topHorarioRate
              }
            </h3>

            <p className="text-xs text-slate-400 font-medium">
              {
                stats.topHorarioRatePct
              }
              % ·{" "}
              {
                stats.topHorarioRateLost
              }{" "}
              de{" "}
              {
                stats.topHorarioRateEligible
              }
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
              Alumnos por sección activa
            </p>
          </div>
        </div>

        {/* TRANSICIONES */}

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
                Los archivos cargados no permiten evaluar transiciones Niños/Jóvenes.
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
                title="Haz clic para ver la lista"
              >
                <span className="text-xs font-bold text-emerald-700">
                  Niños ➔ Jóvenes
                </span>

                <span className="text-lg font-black text-emerald-600">
                  {
                    stats.transNinosJovenes
                  }
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
                title="Haz clic para ver la lista"
              >
                <span className="text-xs font-bold text-blue-700">
                  Jóvenes ➔ Adultos
                </span>

                <span className="text-lg font-black text-blue-600">
                  {
                    stats.transJovenesAdultos
                  }
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
                {
                  stats.nuevosNivelacion
                }
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
                Cambio real de familia de frecuencia
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================
          GRÁFICOS
          ===================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 print:break-inside-avoid">
        {/* BAR */}

        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100 print:border print:shadow-none">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h3 className="text-lg font-bold text-slate-800">
              Volumen de Deserción por Nivel
            </h3>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg print:hidden flex-wrap">
              {chartCategories.map(
                (cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setLevelChartCategory(
                        cat
                      )
                    }
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      levelChartCategory ===
                      cat
                        ? "bg-white shadow-sm text-blue-600"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {cat ===
                    "All"
                      ? "Todos"
                      : cat}
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
                onClick={(e) => {
                  if (
                    e?.activeLabel
                  ) {
                    setSelectedLevel(
                      e.activeLabel
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
              onClick={() =>
                setPieMode(
                  (prev) =>
                    prev ===
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
                                entry
                                  .name
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

      {/* =====================================================
          NOTA INGRESOS L02+
          ===================================================== */}

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
            . También podrían existir reingresos de períodos más antiguos. Se recomienda validar su récord en el SGA antes de clasificarlos definitivamente como nivelación.
          </p>
        </div>
      )}

      {/* =====================================================
          TABLA DINÁMICA
          ===================================================== */}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden print:border print:shadow-none print:break-before-page">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row gap-4 items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-400" />

            <select
              value={
                tableView
              }
              onChange={(e) => {
                setTableView(
                  e.target.value
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

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <select
              value={
                selectedCategory
              }
              onChange={(e) =>
                setSelectedCategory(
                  e.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
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
              onChange={(e) =>
                setSelectedLevel(
                  e.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
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
              onChange={(e) =>
                setSelectedFrecuencia(
                  e.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
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
              onChange={(e) =>
                setSelectedHorario(
                  e.target.value
                )
              }
              className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white"
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

            <div className="relative flex-1 lg:w-64 min-w-52">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />

              <input
                type="text"
                placeholder="Buscar alumno..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={
                  searchTerm
                }
                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }
              />
            </div>

            <button
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

        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 print:hidden">
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
                (s) => {
                  const crm =
                    crmData[
                      s.idNorm
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
                      s.phone
                    );

                  return (
                    <tr
                      key={`${s.idNorm}-${tableView}`}
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
                            {
                              crm.status
                            }
                          </span>
                        </td>
                      )}

                      <td className="p-4 font-bold text-slate-800">
                        {
                          s.name
                        }
                      </td>

                      <td className="p-4 text-slate-500 font-mono text-xs">
                        {
                          s.id
                        }
                      </td>

                      <td className="p-4 text-slate-600">
                        {
                          s.category
                        }
                      </td>

                      {(tableView ===
                        "transNinosJovenes" ||
                        tableView ===
                          "transJovenesAdultos") && (
                        <td className="p-4 text-emerald-600 font-medium">
                          {
                            s.oldCategory
                          }
                        </td>
                      )}

                      <td className="p-4">
                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600 print:bg-transparent print:px-0">
                          {
                            s.levelNorm
                          }
                        </span>
                      </td>

                      <td className="p-4 text-slate-600">
                        {
                          s.frequencyNorm
                        }
                      </td>

                      {tableView ===
                        "cambios" && (
                        <td className="p-4 text-amber-600 font-medium">
                          {
                            s.oldFrequency
                          }
                        </td>
                      )}

                      <td className="p-4 text-slate-600">
                        {
                          s.scheduleBlock
                        }
                      </td>

                      <td className="p-4 text-slate-500">
                        {s.email ||
                          "N/A"}
                      </td>

                      <td className="p-4 print:hidden">
                        <div className="flex items-center gap-2">
                          {s.phone ? (
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
                                href={`tel:${s.phone}`}
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
                        {s.phone ||
                          "N/A"}
                      </td>

                      {tableView ===
                        "desercion" && (
                        <td className="p-4 text-center print:hidden">
                          <button
                            onClick={() =>
                              setCrmModal(
                                {
                                  isOpen:
                                    true,
                                  student:
                                    s,
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
                    colSpan="14"
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

      {/* =====================================================
          CRM MODAL
          ===================================================== */}

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
                    {
                      crmModal
                        .student
                        .name
                    }{" "}
                    (
                    {
                      crmModal
                        .student
                        .id
                    }
                    )
                  </p>
                </div>

                <button
                  onClick={() =>
                    setCrmModal(
                      {
                        isOpen:
                          false,
                        student:
                          null,
                      }
                    )
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
                      Rescatado (Se reinscribió)
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
                    rows="4"
                    className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCrmModal(
                        {
                          isOpen:
                            false,
                          student:
                            null,
                        }
                      )
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
