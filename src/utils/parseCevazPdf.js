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

const inferStartMeridiem = (startHour, endMer) => {
  if (endMer === "AM") return "AM";
  if (startHour >= 8 && startHour <= 11) return "AM";
  return "PM";
};

const normalizeHorario = (raw) => {
  if (!raw) return "N/A";
  const afterSlash = raw.includes("/") ? raw.split("/").pop().trim() : raw.trim();
  
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

  if (!startMer) startMer = inferStartMeridiem(sh, endMer);

  const candidate = `${sh}:${sm} ${startMer} - ${eh}:${em} ${endMer}`;
  const cKey = normKey(candidate);
  const mapped = HORARIO_BLOQUES.find((b) => normKey(b) === cKey);

  return mapped || candidate;
};

const extractMetaFromLine = (line, meta) => {
  const up = line.toUpperCase();

  if (up.includes("NIVEL:")) {
    const parts = up.split("NIVEL:");
    meta.levelRaw = parts[1].trim();
    meta.levelNorm = normalizeLevel(meta.levelRaw);
  }

  if (up.includes("HORARIO:")) {
    const parts = up.split("HORARIO:");
    meta.scheduleRaw = parts[1].trim();
    meta.scheduleBlock = normalizeHorario(meta.scheduleRaw);
  }

  if (up.includes("SALÓN:") || up.includes("SALON:")) {
    meta.salonRaw = up;
    const m = up.match(/SAL[ÓO]N:\s*([A-Z0-9]+).*CURSO\s*ID:\s*(\d+)/i);
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
  if (up.includes("APELLIDOS") && up.includes("EMAIL")) return true;
  return false;
};

const parseStudentLine = (line, meta) => {
  const m = line.match(/^(\d+)\s+(\d{6,12})\s+(.+)$/);
  if (!m) return null;

  const id = m[2];
  const rest = m[3].trim();
  const tokens = rest.split(/\s+/);

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
    afterTokens = [];
  }

  const name = nameTokens.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!name) return null;

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
    salon: meta.salon || "",
    courseId: meta.courseId || "",
  };
};

export async function parseCevazPdf(file) {
  const text = await extractTextFromPdf(file);
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const meta = {
    categoryRaw: "",
    category: "", 
    levelRaw: "",
    levelNorm: "",
    scheduleRaw: "",
    scheduleBlock: "",
    salonRaw: "",
    salon: "",
    courseId: "",
  };

  const fullTextUp = (text || "").toUpperCase();
  
  // FILTRO ESTRICTO: Absorbe el error de lectura del caracter "Ñ"
  if (fullTextUp.includes("PRESENCIAL ADULTOS")) {
     meta.category = "Adultos";
  } else if (fullTextUp.includes("PRESENCIAL JOVENES") || fullTextUp.includes("PRESENCIAL JÓVENES")) {
     meta.category = "Jóvenes";
  } else if (fullTextUp.includes("PRESENCIAL NIÑOS") || fullTextUp.includes("PRESENCIAL NINOS") || fullTextUp.includes("PRESENCIAL NI?OS")) {
     meta.category = "Niños";
  } else {
     meta.category = "Otra";
  }

  const students = [];

  for (const line of lines) {
    if (shouldSkipLine(line)) continue;
    extractMetaFromLine(line, meta);
    const s = parseStudentLine(line, meta);
    if (s && s.id) students.push(s);
  }

  return students;
}

export const __HORARIO_BLOQUES__ = HORARIO_BLOQUES;
