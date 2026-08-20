// src/utils/pdfText.js

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/* =========================================================
   CONFIGURACIÓN PDF.JS
   ========================================================= */

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/* =========================================================
   CONFIGURACIÓN DEL EXTRACTOR
   ========================================================= */

/*
  Tolerancia vertical.

  Dos fragmentos de texto cuya coordenada Y difiera
  menos que este valor se consideran parte de la misma fila.

  Esto es mucho más seguro que Math.round(y), porque
  algunos PDFs colocan cada columna con pequeñas diferencias
  verticales aunque visualmente pertenezcan a la misma línea.
*/
const DEFAULT_Y_TOLERANCE = 2.5;

/*
  Evita introducir espacios exagerados por pequeñas
  diferencias geométricas entre fragmentos.
*/
const MIN_GEOMETRIC_GAP = 1.5;

/*
  Si una página tiene extremadamente pocos caracteres,
  se registra como página con poco texto para diagnóstico,
  pero no se detiene automáticamente el PDF completo.
*/
const MIN_TEXT_CHARS_WARNING = 10;

/* =========================================================
   UTILIDADES DE TEXTO
   ========================================================= */

const cleanItemText = (value = "") => {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .trim();
};

const cleanFinalLine = (value = "") => {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

/* =========================================================
   VALIDACIÓN DEL ARCHIVO
   ========================================================= */

const validatePdfFile = (file) => {
  if (!file) {
    throw new Error(
      "No se recibió ningún archivo PDF."
    );
  }

  if (
    typeof file.arrayBuffer !== "function"
  ) {
    throw new Error(
      "El archivo recibido no puede ser leído por el navegador."
    );
  }

  /*
    No usamos MIME como validación absoluta porque algunos
    navegadores o sistemas entregan File.type vacío.
  */
  const name = String(
    file.name || ""
  ).toLowerCase();

  if (
    name &&
    !name.endsWith(".pdf")
  ) {
    throw new Error(
      `El archivo "${file.name}" no parece ser un PDF.`
    );
  }

  if (
    typeof file.size === "number" &&
    file.size <= 0
  ) {
    throw new Error(
      `El archivo "${file.name || "PDF"}" está vacío.`
    );
  }
};

/* =========================================================
   GEOMETRÍA DEL TEXTO
   ========================================================= */

const getItemX = (item) => {
  return Number(
    item?.transform?.[4] ?? 0
  );
};

const getItemY = (item) => {
  return Number(
    item?.transform?.[5] ?? 0
  );
};

const getItemWidth = (item) => {
  const width = Number(
    item?.width ?? 0
  );

  return Number.isFinite(width)
    ? Math.max(width, 0)
    : 0;
};

const getApproxFontSize = (item) => {
  const transform =
    item?.transform || [];

  /*
    En PDF.js:

    transform[0] y transform[3]
    suelen contener información útil de escala.

    Tomamos el mayor valor absoluto disponible.
  */
  const sx = Math.abs(
    Number(transform[0] || 0)
  );

  const sy = Math.abs(
    Number(transform[3] || 0)
  );

  const size = Math.max(
    sx,
    sy
  );

  return Number.isFinite(size) &&
    size > 0
    ? size
    : 10;
};

/* =========================================================
   CONVERSIÓN DE ITEMS DE PDF.JS
   ========================================================= */

const normalizePdfItems = (
  content
) => {
  const result = [];

  for (
    let index = 0;
    index <
    (content?.items || []).length;
    index++
  ) {
    const item =
      content.items[index];

    const str =
      cleanItemText(
        item?.str
      );

    if (!str) {
      continue;
    }

    const x =
      getItemX(item);

    const y =
      getItemY(item);

    const width =
      getItemWidth(item);

    const fontSize =
      getApproxFontSize(
        item
      );

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      continue;
    }

    result.push({
      str,

      x,

      y,

      width,

      fontSize,

      hasEOL:
        Boolean(
          item?.hasEOL
        ),

      originalIndex:
        index,
    });
  }

  return result;
};

/* =========================================================
   AGRUPACIÓN ROBUSTA POR FILAS
   ========================================================= */

const groupItemsIntoRows = (
  items,
  yTolerance =
    DEFAULT_Y_TOLERANCE
) => {
  if (!items.length) {
    return [];
  }

  /*
    Primero ordenamos aproximadamente como se lee
    una página:

    arriba -> abajo
    izquierda -> derecha
  */
  const sorted = [
    ...items,
  ].sort((a, b) => {
    const yDiff =
      b.y - a.y;

    if (
      Math.abs(yDiff) >
      yTolerance
    ) {
      return yDiff;
    }

    if (a.x !== b.x) {
      return a.x - b.x;
    }

    return (
      a.originalIndex -
      b.originalIndex
    );
  });

  const rows = [];

  for (const item of sorted) {
    /*
      Buscamos la fila existente cuya coordenada Y
      sea suficientemente cercana.
    */
    let bestRow = null;

    let bestDistance =
      Number.POSITIVE_INFINITY;

    for (const row of rows) {
      const distance =
        Math.abs(
          row.y - item.y
        );

      if (
        distance <=
          yTolerance &&
        distance <
          bestDistance
      ) {
        bestRow = row;

        bestDistance =
          distance;
      }
    }

    if (!bestRow) {
      rows.push({
        y: item.y,

        items: [item],
      });

      continue;
    }

    bestRow.items.push(
      item
    );

    /*
      Actualizamos el Y promedio de la fila.

      Así pequeñas variaciones sucesivas no crean
      filas artificialmente separadas.
    */
    const total =
      bestRow.items.length;

    bestRow.y =
      ((bestRow.y *
        (total - 1)) +
        item.y) /
      total;
  }

  /*
    Orden definitivo:
    página de arriba hacia abajo.
  */
  rows.sort(
    (a, b) =>
      b.y - a.y
  );

  for (const row of rows) {
    row.items.sort(
      (a, b) => {
        if (a.x !== b.x) {
          return (
            a.x - b.x
          );
        }

        return (
          a.originalIndex -
          b.originalIndex
        );
      }
    );
  }

  return rows;
};

/* =========================================================
   DECISIÓN DE ESPACIO ENTRE FRAGMENTOS
   ========================================================= */

const shouldInsertSpace = (
  previous,
  current,
  currentLine
) => {
  if (!currentLine) {
    return false;
  }

  if (!previous) {
    return false;
  }

  const prevEnd =
    previous.x +
    previous.width;

  const gap =
    current.x -
    prevEnd;

  /*
    Si los elementos están claramente separados
    geométricamente, agregamos espacio.
  */
  if (
    Number.isFinite(gap) &&
    gap >
      MIN_GEOMETRIC_GAP
  ) {
    return true;
  }

  /*
    Algunos PDFs entregan width=0 o una anchura
    incorrecta.

    En ese caso utilizamos una aproximación basada
    en tamaño de fuente.
  */
  if (
    previous.width <= 0
  ) {
    const approxCharWidth =
      Math.max(
        previous.fontSize *
          0.35,
        2
      );

    const estimatedEnd =
      previous.x +
      previous.str.length *
        approxCharWidth;

    const estimatedGap =
      current.x -
      estimatedEnd;

    if (
      estimatedGap >
      MIN_GEOMETRIC_GAP
    ) {
      return true;
    }
  }

  /*
    Evita concatenar dos palabras cuando PDF.js
    las entrega como objetos separados pero las
    coordenadas son prácticamente contiguas.

    Ejemplo:

    "MALDONADO"
    "LINARES"

    No queremos:
    MALDONADOLINARES
  */
  const previousLast =
    previous.str.slice(-1);

  const currentFirst =
    current.str.charAt(0);

  const previousLooksWord =
    /[A-Za-zÀ-ÿ0-9)]/.test(
      previousLast
    );

  const currentLooksWord =
    /[A-Za-zÀ-ÿ0-9(+]/.test(
      currentFirst
    );

  if (
    previousLooksWord &&
    currentLooksWord
  ) {
    return true;
  }

  return false;
};

/* =========================================================
   CONVERSIÓN DE UNA FILA A TEXTO
   ========================================================= */

const buildLineFromRow = (
  row
) => {
  if (
    !row?.items?.length
  ) {
    return "";
  }

  let line = "";

  let previous = null;

  for (
    const item
    of row.items
  ) {
    if (
      shouldInsertSpace(
        previous,
        item,
        line
      )
    ) {
      line += " ";
    }

    line += item.str;

    previous = item;
  }

  return cleanFinalLine(
    line
  );
};

/* =========================================================
   EXTRACCIÓN DE UNA PÁGINA
   ========================================================= */

const extractPageLines = async (
  page,
  pageNumber,
  {
    yTolerance =
      DEFAULT_Y_TOLERANCE,
  } = {}
) => {
  if (!page) {
    return {
      pageNumber,

      lines: [],

      characterCount: 0,

      itemCount: 0,
    };
  }

  const content =
    await page.getTextContent({
      normalizeWhitespace:
        false,

      disableCombineTextItems:
        false,
    });

  const items =
    normalizePdfItems(
      content
    );

  const rows =
    groupItemsIntoRows(
      items,
      yTolerance
    );

  const lines = rows
    .map(
      buildLineFromRow
    )
    .map(
      cleanFinalLine
    )
    .filter(Boolean);

  const characterCount =
    lines.reduce(
      (sum, line) =>
        sum +
        line.length,
      0
    );

  return {
    pageNumber,

    lines,

    characterCount,

    itemCount:
      items.length,
  };
};

/* =========================================================
   EXTRACCIÓN PRINCIPAL
   ========================================================= */

export async function extractTextFromPdf(
  file
) {
  validatePdfFile(file);

  let pdf = null;

  try {
    const arrayBuffer =
      await file.arrayBuffer();

    if (
      !arrayBuffer ||
      !arrayBuffer.byteLength
    ) {
      throw new Error(
        `El archivo "${file.name || "PDF"}" no contiene datos.`
      );
    }

    const loadingTask =
      pdfjsLib.getDocument({
        data: arrayBuffer,

        /*
          No necesitamos anotaciones ni fuentes externas
          para extraer texto.
        */
        useSystemFonts:
          true,

        isEvalSupported:
          false,
      });

    pdf =
      await loadingTask.promise;

    if (
      !pdf ||
      !Number.isFinite(
        pdf.numPages
      ) ||
      pdf.numPages <= 0
    ) {
      throw new Error(
        `El archivo "${file.name || "PDF"}" no contiene páginas válidas.`
      );
    }

    const allLines = [];

    const pageDiagnostics =
      [];

    let totalCharacters = 0;

    let pagesWithText = 0;

    for (
      let pageNum = 1;
      pageNum <=
      pdf.numPages;
      pageNum++
    ) {
      const page =
        await pdf.getPage(
          pageNum
        );

      try {
        const result =
          await extractPageLines(
            page,
            pageNum
          );

        pageDiagnostics.push({
          pageNumber:
            pageNum,

          lineCount:
            result.lines
              .length,

          characterCount:
            result.characterCount,

          itemCount:
            result.itemCount,
        });

        if (
          result.characterCount >
          0
        ) {
          pagesWithText++;
        }

        totalCharacters +=
          result.characterCount;

        /*
          Se conservan las líneas exactamente
          en orden de página.

          parseCevazPdf.js utiliza los encabezados
          de cada página para reiniciar metadatos.
        */
        for (
          const line
          of result.lines
        ) {
          allLines.push(
            line
          );
        }

        /*
          Separador de página.

          El parser ignora líneas vacías, pero
          resulta útil para depuración manual.
        */
        allLines.push("");
      } finally {
        /*
          cleanup() libera recursos internos
          asociados a la página.
        */
        try {
          page.cleanup();
        } catch {
          // No interrumpir extracción por cleanup.
        }
      }
    }

    /* =====================================================
       VALIDACIONES GLOBALES
       ===================================================== */

    if (
      pagesWithText === 0 ||
      totalCharacters === 0
    ) {
      throw new Error(
        [
          `El PDF "${file.name || "sin nombre"}" no contiene texto extraíble.`,
          "Es posible que sea un documento escaneado como imagen.",
        ].join(" ")
      );
    }

    /*
      Detecta documentos donde algunas páginas podrían
      haberse extraído mal.

      No los bloqueamos aquí porque ciertas páginas
      legítimamente pueden estar casi vacías.

      El parser superior decidirá si faltan estudiantes.
    */
    const lowTextPages =
      pageDiagnostics.filter(
        (pageInfo) =>
          pageInfo.characterCount >
            0 &&
          pageInfo.characterCount <
            MIN_TEXT_CHARS_WARNING
      );

    if (
      lowTextPages.length
    ) {
      console.warn(
        `PDF "${file.name || "sin nombre"}": páginas con muy poco texto extraído:`,
        lowTextPages.map(
          (pageInfo) =>
            pageInfo.pageNumber
        )
      );
    }

    const finalText =
      allLines.join(
        "\n"
      );

    if (
      !finalText.trim()
    ) {
      throw new Error(
        `No se pudo construir texto utilizable a partir del PDF "${file.name || "sin nombre"}".`
      );
    }

    return finalText;
  } catch (error) {
    console.error(
      `Error extrayendo texto de "${file?.name || "PDF"}":`,
      error
    );

    if (
      error instanceof Error
    ) {
      throw error;
    }

    throw new Error(
      `No se pudo leer el PDF "${file?.name || "sin nombre"}".`
    );
  } finally {
    /*
      Libera memoria del documento completo.

      Esto es especialmente importante si se cargan
      varios PDFs grandes consecutivamente.
    */
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {
        // No interrumpir la aplicación por destroy().
      }
    }
  }
}

/* =========================================================
   FUNCIÓN OPCIONAL DE DIAGNÓSTICO

   No la usa App.jsx actualmente.

   Puede utilizarse más adelante para crear una pantalla
   de auditoría donde veamos exactamente qué líneas
   produjo cada página del PDF.
   ========================================================= */

export async function extractPdfDiagnostics(
  file
) {
  validatePdfFile(file);

  let pdf = null;

  try {
    const arrayBuffer =
      await file.arrayBuffer();

    const loadingTask =
      pdfjsLib.getDocument({
        data: arrayBuffer,
        useSystemFonts: true,
        isEvalSupported: false,
      });

    pdf =
      await loadingTask.promise;

    const pages = [];

    for (
      let pageNum = 1;
      pageNum <=
      pdf.numPages;
      pageNum++
    ) {
      const page =
        await pdf.getPage(
          pageNum
        );

      try {
        const result =
          await extractPageLines(
            page,
            pageNum
          );

        pages.push({
          pageNumber:
            result.pageNumber,

          lineCount:
            result.lines
              .length,

          itemCount:
            result.itemCount,

          characterCount:
            result.characterCount,

          lines:
            result.lines,
        });
      } finally {
        try {
          page.cleanup();
        } catch {
          // Ignorar error de limpieza.
        }
      }
    }

    return {
      fileName:
        file.name || "",

      fileSize:
        file.size || 0,

      pageCount:
        pdf.numPages,

      pages,
    };
  } finally {
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {
        // Ignorar.
      }
    }
  }
}
