import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Download, Eye, FileText, MapPin, Printer } from "lucide-react";
import { saveAs } from "file-saver";

import {
  buildFrequencyReportData,
  getAvailableReportFrequencies,
} from "../utils/reportData";
import {
  buildFrequencyReportHtml,
  getFrequencyReportFilename,
} from "../utils/reportGenerator";
import {
  REPORT_SITE_OPTIONS,
  getReportSite,
} from "../utils/reportAssets";

const REPORT_CONTEXT_KEY = "continuidad_report_context_v2";

const accentForFrequency = (frequency) => ({
  "MARTES Y JUEVES": "#7C3AED",
  "MIERCOLES Y VIERNES": "#F59E0B",
  LUNES: "#16A34A",
  SABATINO: "#2563EB",
  INTENSIVO: "#8B5CF6",
  "SEMI INTENSIVO": "#0891B2",
}[frequency] || "#09458A");

const openHtmlReport = (html) => {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    throw new Error("El navegador bloqueó la ventana del reporte. Permite ventanas emergentes para este sitio.");
  }
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
};

const readStoredContext = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REPORT_CONTEXT_KEY) || "{}");
    return {
      evaluatedPeriod: String(parsed?.evaluatedPeriod || ""),
      siteId: getReportSite(parsed?.siteId || "LL").id,
    };
  } catch {
    return { evaluatedPeriod: "", siteId: "LL" };
  }
};

export default function ReportsPanel({ analysisData, actionPlans, onBack, onDownloadPdf }) {
  const frequencies = useMemo(() => getAvailableReportFrequencies(analysisData), [analysisData]);
  const [busyFrequency, setBusyFrequency] = useState("");
  const [error, setError] = useState("");
  const [dateRanges, setDateRanges] = useState({});
  const [reportContext, setReportContext] = useState(readStoredContext);

  useEffect(() => {
    try {
      window.localStorage.setItem(REPORT_CONTEXT_KEY, JSON.stringify(reportContext));
    } catch {
      // Si el navegador bloquea localStorage, el reporte sigue funcionando en memoria.
    }
  }, [reportContext]);

  const selectedSite = getReportSite(reportContext.siteId);

  const setRangeField = (frequency, field, value) => {
    setDateRanges((previous) => ({
      ...previous,
      [frequency]: {
        ...(previous[frequency] || {}),
        [field]: value,
      },
    }));
  };

  const reportFor = (frequency) => {
    const base = buildFrequencyReportData(analysisData, frequency);
    const custom = dateRanges[frequency] || {};
    const hasStart = Object.prototype.hasOwnProperty.call(custom, "start");
    const hasEnd = Object.prototype.hasOwnProperty.call(custom, "end");

    return {
      ...base,
      metadata: {
        ...base.metadata,
        registrationStart: hasStart ? custom.start : (base.metadata?.registrationStart || ""),
        registrationEnd: hasEnd ? custom.end : (base.metadata?.registrationEnd || base.metadata?.detectedEndDate || ""),
        evaluatedPeriod: reportContext.evaluatedPeriod.trim(),
        siteId: selectedSite.id,
        siteName: selectedSite.name,
        siteLabel: selectedSite.label,
        siteAddress: selectedSite.address,
      },
    };
  };

  const handleView = (frequency) => {
    setError("");
    try {
      const report = reportFor(frequency);
      const html = buildFrequencyReportHtml(report, actionPlans);
      openHtmlReport(html);
    } catch (err) {
      setError(err?.message || "No se pudo abrir el reporte.");
    }
  };

  const handleHtml = (frequency) => {
    setError("");
    try {
      const report = reportFor(frequency);
      const html = buildFrequencyReportHtml(report, actionPlans);
      saveAs(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        getFrequencyReportFilename(frequency, "html")
      );
    } catch (err) {
      setError(err?.message || "No se pudo descargar el HTML.");
    }
  };

  const handlePdf = async (frequency) => {
    setError("");
    setBusyFrequency(frequency);
    try {
      const report = reportFor(frequency);
      await onDownloadPdf(report, actionPlans);
    } catch (err) {
      setError(err?.message || "No se pudo descargar el PDF.");
    } finally {
      setBusyFrequency("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <header className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700 mb-3">
            <ArrowLeft className="h-4 w-4" /> Volver al dashboard
          </button>
          <h1 className="text-3xl font-black text-slate-900">Interim / Status Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Un reporte independiente por frecuencia, generado directamente con el análisis actual.</p>
        </div>
        <div className="text-xs bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl max-w-md">
          Las listas SGA se usan como fuente dinámica. El reporte no contiene estudiantes grabados en el código.
        </div>
      </header>

      {error && <div className="max-w-6xl mx-auto mb-5 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}

      <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
        {frequencies.map((frequency) => {
          const report = reportFor(frequency);
          const accent = accentForFrequency(frequency);
          const range = dateRanges[frequency] || {};
          const endValue = Object.prototype.hasOwnProperty.call(range, "end")
            ? range.end
            : (report.metadata?.detectedEndDate || "");
          const startValue = Object.prototype.hasOwnProperty.call(range, "start")
            ? range.start
            : "";

          return (
            <article key={frequency} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-2" style={{ background: accent }} />
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-widest text-slate-400">FRECUENCIA</p>
                    <h2 className="text-xl font-black text-slate-900 mt-1">{frequency}</h2>
                    <p className="text-xs text-slate-500 mt-1">{selectedSite.label}{reportContext.evaluatedPeriod ? ` · Período ${reportContext.evaluatedPeriod}` : ""}</p>
                  </div>
                  <FileText className="h-7 w-7" style={{ color: accent }} />
                </div>

                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black text-slate-900">{report.rates.continuity}%</div><div className="text-xs text-slate-500">Continuidad</div></div>
                  <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black text-slate-900">{report.totals.lost}</div><div className="text-xs text-slate-500">Pérdidas</div></div>
                  <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black text-slate-900">{report.totals.graduates}</div><div className="text-xs text-slate-500">Graduandos</div></div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase tracking-wide mb-3">
                    <CalendarDays className="h-4 w-4 text-[#09458A]" /> Datos para el reporte
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-600">Período a evaluar
                      <input
                        type="text"
                        value={reportContext.evaluatedPeriod}
                        onChange={(e) => setReportContext((previous) => ({ ...previous, evaluatedPeriod: e.target.value }))}
                        placeholder="Ej. 5, 6, 5A, 5B"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Sede
                      <select
                        value={reportContext.siteId}
                        onChange={(e) => setReportContext((previous) => ({ ...previous, siteId: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
                      >
                        {REPORT_SITE_OPTIONS.map((site) => (
                          <option key={site.id} value={site.id}>{site.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Inicio de inscripción
                      <input type="date" value={startValue} onChange={(e) => setRangeField(frequency, "start", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Fin de inscripción
                      <input type="date" value={endValue} onChange={(e) => setRangeField(frequency, "end", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal" />
                    </label>
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#09458A]" />
                    <span><strong className="text-slate-700">{selectedSite.name}</strong> · {selectedSite.address}. Período y sede se aplican a todos los reportes de este análisis; las fechas se configuran por frecuencia.</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-5">
                  <button type="button" onClick={() => handleView(frequency)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"><Eye className="h-4 w-4" /> Ver reporte</button>
                  <button type="button" onClick={() => handleHtml(frequency)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold"><Download className="h-4 w-4" /> HTML</button>
                  <button type="button" onClick={() => handlePdf(frequency)} disabled={busyFrequency === frequency} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#09458A] hover:bg-[#07396f] disabled:opacity-50 text-white text-xs font-semibold"><Printer className="h-4 w-4" /> {busyFrequency === frequency ? "Generando..." : "PDF"}</button>
                </div>
              </div>
            </article>
          );
        })}

        {!frequencies.length && (
          <div className="md:col-span-2 p-8 bg-white rounded-2xl border border-slate-200 text-center text-slate-500">
            No se detectaron frecuencias válidas en el análisis actual.
          </div>
        )}
      </main>
    </div>
  );
}
