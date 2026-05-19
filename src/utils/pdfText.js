// src/utils/pdfText.js
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Extrae texto del PDF reconstruyendo líneas (crítico para que el parser funcione bien).
 */
export async function extractTextFromPdf(file) {
  if (!file) return "";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Items: { str, transform, width, ... }
    const items = (content.items || [])
      .map((it) => {
        const str = (it.str || "").trimEnd();
        const x = it.transform?.[4] ?? 0;
        const y = it.transform?.[5] ?? 0;
        const w = it.width ?? 0;
        return { str, x, y, w };
      })
      .filter((it) => it.str && it.str.trim().length > 0);

    // Agrupar por "línea" usando Y (redondeado)
    const byY = new Map();
    for (const it of items) {
      const yKey = Math.round(it.y); // suficiente para PDFs como los tuyos
      if (!byY.has(yKey)) byY.set(yKey, []);
      byY.get(yKey).push(it);
    }

    // Orden: de arriba hacia abajo
    const yKeys = Array.from(byY.keys()).sort((a, b) => b - a);

    for (const yKey of yKeys) {
      const lineItems = byY.get(yKey).sort((a, b) => a.x - b.x);

      let line = "";
      let prevX = null;
      let prevW = 0;

      for (const it of lineItems) {
        const gap =
          prevX === null ? 999 : it.x - (prevX + (prevW || 0));

        // Si hay espacio visual, metemos un espacio; si no, pegamos (emails/números)
        if (line && gap > 2) line += " ";

        line += it.str;

        prevX = it.x;
        prevW = it.w;
      }

      line = line.replace(/\s{2,}/g, " ").trim();
      if (line) allLines.push(line);
    }

    allLines.push(""); // separador entre páginas
  }

  return allLines.join("\n");
}

export default extractTextFromPdf;
