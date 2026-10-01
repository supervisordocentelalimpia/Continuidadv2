import {
  calculateAverageDensity,
  calculateDropoutByLevel,
  calculateScheduleAttrition,
  dedupeStudentsById,
  detectCategoryTransitions,
  detectFrequencyChanges,
  getTopDropoutScheduleByVolume,
  isGraduated,
  normalizeFrequencyFamily,
} from "./continuidad.js";

import {
  FREQUENCY_ORDER,
} from "./frecuencia.js";

export const REPORT_CATEGORY_COLORS = Object.freeze({
  Adultos: "#2563EB",
  Niños: "#38BDF8",
  Jóvenes: "#0F766E",
});

const pct = (num, den) => {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round((n / d) * 100);
};

const byLevelNumber = (student) => {
  const raw = String(student?.levelNorm || student?.level || "");
  const value = parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(value) ? value : 0;
};

const sourceFrequency = (student) =>
  normalizeFrequencyFamily(
    student?.frequencyBase ||
      student?.frequencyNorm ||
      student?.frequency ||
      student?.schedule ||
      ""
  );

const uniqueSorted = (items = []) =>
  Array.from(new Set(items.filter(Boolean)));

const inferEndDateFromPeriods = (periods = []) => {
  for (const rawValue of periods) {
    const raw = String(rawValue || "").toUpperCase();
    const yearMatch = raw.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    const matches = Array.from(raw.matchAll(/\b(\d{1,2})[\/\-_](\d{1,2})(?:[\/\-_](\d{2,4}))?\b/g));
    if (!matches.length) continue;
    const match = matches[matches.length - 1];
    const day = Number(match[1]);
    const month = Number(match[2]);
    let resolvedYear = match[3] ? Number(match[3]) : year;
    if (resolvedYear && resolvedYear < 100) resolvedYear += 2000;
    if (!resolvedYear || month < 1 || month > 12 || day < 1 || day > 31) continue;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${resolvedYear}-${mm}-${dd}`;
  }
  return "";
};

const sectionKey = (student) =>
  student?.courseId ||
  [
    student?.category,
    student?.levelNorm,
    student?.scheduleBlock,
    student?.salon,
  ]
    .filter(Boolean)
    .join("|");

const buildSectionRows = (students = []) => {
  const map = new Map();

  students.forEach((student) => {
    const key = sectionKey(student);
    if (!key) return;

    const current = map.get(key) || {
      courseId: student?.courseId || "N/A",
      category: student?.category || "N/A",
      level: student?.levelNorm || student?.level || "N/A",
      schedule: student?.scheduleBlock || student?.schedule || "N/A",
      teacher: student?.teacher || "STAFF",
      room: student?.salon || "N/A",
      students: 0,
    };

    current.students += 1;
    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => {
    const categoryCompare = String(a.category).localeCompare(String(b.category), "es");
    if (categoryCompare) return categoryCompare;
    const levelCompare = parseInt(String(a.level).replace(/\D/g, ""), 10) - parseInt(String(b.level).replace(/\D/g, ""), 10);
    if (levelCompare) return levelCompare;
    return String(a.schedule).localeCompare(String(b.schedule), "es");
  });
};

const buildDropoutCategoryLevel = (lost = []) => {
  const categories = ["Adultos", "Niños", "Jóvenes"];
  const rows = [];

  for (let level = 1; level <= 20; level += 1) {
    const row = {
      level,
      label: `L${String(level).padStart(2, "0")}`,
      Adultos: 0,
      Niños: 0,
      Jóvenes: 0,
      total: 0,
    };

    lost.forEach((student) => {
      if (byLevelNumber(student) !== level) return;
      if (!categories.includes(student?.category)) return;
      row[student.category] += 1;
      row.total += 1;
    });

    rows.push(row);
  }

  return rows;
};

export const getAvailableReportFrequencies = (analysisData) => {
  const allStudents = [
    ...(analysisData?.oldStudents || []),
    ...(analysisData?.newStudents || []),
  ];

  const present = uniqueSorted(
    allStudents.map(sourceFrequency).filter((frequency) => frequency && frequency !== "N/A")
  );

  return [
    ...FREQUENCY_ORDER.filter((frequency) => present.includes(frequency)),
    ...present.filter((frequency) => !FREQUENCY_ORDER.includes(frequency)).sort(),
  ];
};

export function buildFrequencyReportData(analysisData, frequency) {
  if (!analysisData) {
    throw new Error("No hay análisis de continuidad disponible.");
  }

  const targetFrequency = normalizeFrequencyFamily(frequency);
  const oldGlobal = dedupeStudentsById(analysisData.oldStudents || []);
  const newGlobal = dedupeStudentsById(analysisData.newStudents || []);

  const oldById = new Map(oldGlobal.map((student) => [student.idNorm, student]));
  const newById = new Map(newGlobal.map((student) => [student.idNorm, student]));
  const oldIds = new Set(oldById.keys());
  const newIds = new Set(newById.keys());

  const oldScoped = oldGlobal.filter((student) => sourceFrequency(student) === targetFrequency);
  const newScoped = newGlobal.filter((student) => sourceFrequency(student) === targetFrequency);

  const graduates = oldScoped.filter((student) => isGraduated(student));
  const eligible = oldScoped.filter((student) => !isGraduated(student));

  const reenrolledPairs = eligible
    .map((oldS) => ({ oldS, newS: newById.get(oldS.idNorm) }))
    .filter((pair) => Boolean(pair.newS));

  const reenrolled = reenrolledPairs.map((pair) => pair.newS);
  const lost = eligible.filter((student) => !newIds.has(student.idNorm));

  const previousLevel1 = eligible.filter((student) => student.levelNorm === "L01");
  const previousRegular = eligible.filter((student) => student.levelNorm !== "L01");
  const level1Lost = lost.filter((student) => student.levelNorm === "L01");
  const regularLost = lost.filter((student) => student.levelNorm !== "L01");

  const externalEntrants = newScoped.filter((student) => !oldIds.has(student.idNorm));
  const newLevel1 = externalEntrants.filter((student) => student.levelNorm === "L01");
  const externalLevel2Plus = externalEntrants.filter((student) => student.levelNorm !== "L01");

  const globalMatchedPairs = oldGlobal
    .map((oldS) => ({ oldS, newS: newById.get(oldS.idNorm) }))
    .filter((pair) => Boolean(pair.newS));

  // Para un reporte de frecuencia importan tanto los cambios que salen
  // de la frecuencia como los que entran a ella.
  const frequencyChanges = detectFrequencyChanges(globalMatchedPairs)
    .filter((student) =>
      normalizeFrequencyFamily(student.oldFrequencyBase || student.oldFrequency) === targetFrequency ||
      normalizeFrequencyFamily(student.newFrequencyBase || student.newFrequency || student.frequencyNorm) === targetFrequency
    );

  const reportMatchedPairs = globalMatchedPairs.filter(({ oldS, newS }) =>
    sourceFrequency(oldS) === targetFrequency ||
    sourceFrequency(newS) === targetFrequency
  );

  const transitions = detectCategoryTransitions(reportMatchedPairs);
  const density = calculateAverageDensity(newScoped);
  const sections = buildSectionRows(newScoped);
  const dropoutByLevel = calculateDropoutByLevel(lost);
  const dropoutBySchedule = calculateScheduleAttrition(eligible, lost);
  const topScheduleByVolume = getTopDropoutScheduleByVolume(dropoutBySchedule);
  const dropoutByCategoryLevel = buildDropoutCategoryLevel(lost);

  const previousPeriods = uniqueSorted(oldScoped.map((student) => student.periodRaw));
  const currentPeriods = uniqueSorted(newScoped.map((student) => student.periodRaw));

  return {
    frequency: targetFrequency,
    rulesVersion: analysisData.rulesVersion,
    metadata: {
      previousPeriods,
      currentPeriods,
      detectedEndDate: inferEndDateFromPeriods(currentPeriods),
      registrationStart: "",
      registrationEnd: inferEndDateFromPeriods(currentPeriods),
      generatedAt: new Date().toISOString(),
    },
    totals: {
      previous: oldScoped.length,
      current: newScoped.length,
      graduates: graduates.length,
      regularForContinuity: eligible.length,
      reenrolled: reenrolledPairs.length,
      lost: lost.length,
      newLevel1: newLevel1.length,
      externalLevel2Plus: externalLevel2Plus.length,
      frequencyChanges: frequencyChanges.length,
      activeSections: density.sections || sections.length,
      avgDensityRounded: Math.round(density.average || 0),
    },
    rates: {
      continuity: pct(reenrolledPairs.length, eligible.length),
      attrition: pct(lost.length, eligible.length),
      newStudentAttrition: pct(level1Lost.length, previousLevel1.length),
      regularAttrition: pct(regularLost.length, previousRegular.length),
    },
    segmentation: {
      previousLevel1: previousLevel1.length,
      previousRegular: previousRegular.length,
      level1Lost: level1Lost.length,
      regularLost: regularLost.length,
    },
    transitions: {
      ninosJovenes: transitions.ninosJovenes.length,
      ninosAdultos: transitions.ninosAdultos.length,
      jovenesAdultos: transitions.jovenesAdultos.length,
    },
    analytics: {
      density,
      dropoutByLevel,
      dropoutBySchedule,
      dropoutByCategoryLevel,
      topScheduleByVolume,
      sectionRows: sections,
    },
    lists: {
      graduates,
      eligible,
      reenrolled,
      reenrolledPairs,
      lost,
      level1Lost,
      regularLost,
      newLevel1,
      externalLevel2Plus,
      frequencyChanges,
      ninosJovenes: transitions.ninosJovenes,
      ninosAdultos: transitions.ninosAdultos,
      jovenesAdultos: transitions.jovenesAdultos,
    },
  };
}
