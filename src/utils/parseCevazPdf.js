// src/utils/parseCevazPdf.js
import { extractTextFromPdf } from "./pdfText";

const HORARIO_BLOQUES = [
  "8:30 AM - 10:00 AM",
  "10:30 AM - 12:00 PM",
  "1:00 PM - 2:30 PM",
  "2:45 PM - 4:15 PM",
  "4:30 PM - 6:00 PM",
  "6:15 PM - 7:45 PM",
  "8:00 AM - 10:40 AM",
  "10:50 AM - 1:30 PM",
  "2:30 PM - 5:10 PM",
];

const normKey = (s) =>
  (s || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/–/g, "-");

const normalizeLevel = (raw) => {
  const s = (raw || "").toUpperCase();
  const m = s.match(/(\d{1,2})/);
  if (!m) return (raw || "N/A").trim();
  return `L${m[1].padStart(2, "0")}`;
};

const normalizeCategory = (raw, fileName = "") => {
  const src = `${raw || ""} ${fileName || ""}`.toUpperCase();
  if (src.includes("ADULT")) return "Adultos";
  if (src.includes("KIDS") || src.includes("NIÑ") || src.includes("NIN")) return "Niños";
  if (src.includes("YOUNG") || src.includes("JOV") || src.includes("TEEN")) return "Jóvenes";
  return raw ? raw.trim() : "Otra";
};

const inferStartMeridiem = (startHour, endMer) => {
  // Reglas basadas en tus bloques reales:
  // - Si termina AM => empieza AM
  // - Si termina PM:
  //    - 8,9,10,11 => empieza AM (caso 10:30 A 12:00 PM)
  //    - 1..7 => empieza PM
  if (endMer === "AM") return "AM";
  if (startHour >= 8 && startHour <= 11) return "AM";
  return "PM";
};

const normalizeHorario = (raw) => {
  if (!raw) return "N/A";

  const afterSlash = raw.includes("/") ? raw.split("/").pop().trim() : raw.trim();

  // Captura:
  // 8:30 A 10:00 AM
  // 10:30 A 12:00 PM
  // 8:00 AM - 10:40 AM
  const m = afterSlash.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:A|TO|-)\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );

  if (!m) {
    const k = normKey(afterSlash);
    const exact = HORARIO_BLOQUES.find((b) => normKey(b) === k);
    return exact || afterSlash;
  }

  const sh = parseInt(m[1], 10);
  const sm = m[2];
  let startMer = (m[3] || "").toUpperCase();

  const eh = parseInt(m[4], 10);
  const em = m[5];
  const endMer = m[6].toUpperCase();

  if (!startMer) {
    startMer = inferStartMeridiem(sh, endMer);
  }

  const candidate = `${sh}:${sm} ${startMer} - ${eh}:${em} ${endMer}`;
  const cKey = normKey(candidate);
  const mapped = HORARIO_BLOQUES.find((b) => normKey(b) === cKey);

  return mapped || candidate;
};

const extractMetaFromLine = (line, meta, fileName) => {
  if (line.startsWith("Categoría:") || line.startsWith("Categoria:")) {
    const raw = line.split(":").slice(1).join(":").trim();
    meta.categoryRaw = raw;
    meta.category = normalizeCategory(raw, fileName);
    return;
  }

  if (line.startsWith("Nivel:")) {
    const raw = line.split(":").slice(1).join(":").trim();
    meta.levelRaw = raw;
    meta.levelNorm = normalizeLevel(raw);
    return;
  }

  if (line.startsWith("Horario:")) {
    const raw = line.split(":").slice(1).join(":").trim();
    meta.scheduleRaw = raw;
    meta.scheduleBlock = normalizeHorario(raw);
    return;
  }

  // Extra: útil para el futuro (cursos/alertas por curso), no afecta tu UI actual
  if (/^SAL[ÓO]N:/i.test(line)) {
    meta.salonRaw = line;
    const m = line.match(/SAL[ÓO]N:\s*([A-Z0-9]+).*CURSO\s*ID:\s*(\d+)/i);
    if (m) {
      meta.salon = m[1];
      meta.courseId = m[2];
    }
  }
};

const shouldSkipLine = (line) => {
  const up = line.toUpperCase();

  if (up.includes("CENTRO VENEZOLANO")) return true;
  if (up.includes("LISTA DE ALUMNOS")) return true;
  if (up.startsWith("R.I.F")) return true;
  if (up.startsWith("SEDE:")) return true;
  if (up.startsWith("FECHA:")) return true;
  if (up.startsWith("PERIODO:")) return true;
  if (up.startsWith("SALÓN:") || up.startsWith("SALON:")) return true;

  // Cabecera de columnas
  if (up.includes("APELLIDOS") && up.includes("EMAIL")) return true;

  return false;
};

const parseStudentLine = (line, meta) => {
  // ✅ REGLA CLAVE: una fila real de alumno empieza con:
  // [#] [CEDULA] [NOMBRES...]
  // Esto mata los “fantasmas” tipo "Salón: C5 Curso ID: 64161"
  const m = line.match(/^(\d+)\s+(\d{6,12})\s+(.+)$/);
  if (!m) return null;

  const id = m[2];
  const rest = m[3].trim();

  const tokens = rest.split(/\s+/);

  // Email: si existe, es el primer token con "@". No lo validamos estricto (a ti no te importa perfecto).
  let email = "";
  let emailIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].includes("@")) {
      email = tokens[i];
      emailIdx = i;
      break;
    }
  }

  let nameTokens = tokens;
  let afterTokens = [];

  if (emailIdx >= 0) {
    nameTokens = tokens.slice(0, emailIdx);
    afterTokens = tokens.slice(emailIdx + 1);
  } else {
    // Si no hay email, intentamos encontrar teléfono al final
    afterTokens = [];
  }

  const name = nameTokens.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!name) return null;

  // Teléfono: cualquier cadena larga numérica (con + opcional) después del email
  let phone = "";
  const afterStr = afterTokens.join(" ");
  const phoneMatch = afterStr.match(/(\+?\d[\d\s-]{6,}\d)/);
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/[^\d+]/g, "");
  }

  return {
    id,
    name,
    email,
    phone,
    category: meta.category || "Otra",
    categoryRaw: meta.categoryRaw || "",
    level: meta.levelRaw || "N/A",
    levelNorm: meta.levelNorm || "N/A",
    schedule: meta.scheduleRaw || "N/A",
    scheduleBlock: meta.scheduleBlock || "N/A",

    // extra (no rompe nada)
    salon: meta.salon || "",
    courseId: meta.courseId || "",
  };
};

export async function parseCevazPdf(file) {
  const text = await extractTextFromPdf(file);

  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meta = {
    categoryRaw: "",
    category: normalizeCategory("", file?.name),
    levelRaw: "",
    levelNorm: "",
    scheduleRaw: "",
    scheduleBlock: "",
    salonRaw: "",
    salon: "",
    courseId: "",
  };

  const students = [];

  for (const line of lines) {
    if (shouldSkipLine(line)) continue;

    extractMetaFromLine(line, meta, file?.name);

    const s = parseStudentLine(line, meta);
    if (s && s.id) students.push(s);
  }

  return students;
}

export const __HORARIO_BLOQUES__ = HORARIO_BLOQUES;
