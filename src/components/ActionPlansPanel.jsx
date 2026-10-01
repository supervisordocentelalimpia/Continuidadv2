import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bold,
  ClipboardList,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Plus,
  Save,
  Trash2,
  Underline,
} from "lucide-react";
import { createEmptyActionPlan } from "../utils/actionPlans";
import { FREQUENCY_ORDER } from "../utils/frecuencia";

const statuses = ["Pendiente", "En proceso", "Completada", "En seguimiento", "Cancelada"];

const plainText = (value = "") =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

function RichTextEditor({ value = "", onChange, placeholder, minHeight = 112 }) {
  const editorRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== (value || "")) editor.innerHTML = value || "";
  }, [value]);

  const runCommand = (command, commandValue = null) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, commandValue);
    onChange(editor.innerHTML);
  };

  const buttonClass = "p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-[#09458A]";

  return (
    <div className="mt-1 rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <button type="button" title="Negrita" className={buttonClass} onMouseDown={(e) => { e.preventDefault(); runCommand("bold"); }}><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" title="Cursiva" className={buttonClass} onMouseDown={(e) => { e.preventDefault(); runCommand("italic"); }}><Italic className="h-3.5 w-3.5" /></button>
        <button type="button" title="Subrayado" className={buttonClass} onMouseDown={(e) => { e.preventDefault(); runCommand("underline"); }}><Underline className="h-3.5 w-3.5" /></button>
        <button type="button" title="Resaltar" className={buttonClass} onMouseDown={(e) => { e.preventDefault(); runCommand("hiliteColor", "#FFF2A8"); }}><Highlighter className="h-3.5 w-3.5" /></button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" title="Viñetas" className={buttonClass} onMouseDown={(e) => { e.preventDefault(); runCommand("insertUnorderedList"); }}><List className="h-3.5 w-3.5" /></button>
        <button type="button" title="Numeración" className={buttonClass} onMouseDown={(e) => { e.preventDefault(); runCommand("insertOrderedList"); }}><ListOrdered className="h-3.5 w-3.5" /></button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        className="rich-action-editor px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none"
        style={{ minHeight }}
      />
      <style>{`.rich-action-editor:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}.rich-action-editor ul{list-style:disc;padding-left:1.35rem}.rich-action-editor ol{list-style:decimal;padding-left:1.35rem}.rich-action-editor li{margin:.15rem 0}`}</style>
    </div>
  );
}

export default function ActionPlansPanel({ plans, onChange, onBack, availableFrequencies = [] }) {
  const frequencies = useMemo(
    () => Array.from(new Set([...FREQUENCY_ORDER, ...availableFrequencies])).filter((value) => value && value !== "N/A"),
    [availableFrequencies]
  );
  const [draft, setDraft] = useState(createEmptyActionPlan(availableFrequencies[0] || ""));
  const [filter, setFilter] = useState("TODAS");

  const filteredPlans = filter === "TODAS" ? plans : plans.filter((plan) => plan.frequency === filter);
  const setField = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));

  const addPlan = (event) => {
    event.preventDefault();
    if (!plainText(draft.finding) && !plainText(draft.action)) return;
    onChange([draft, ...plans]);
    setDraft(createEmptyActionPlan(draft.frequency || availableFrequencies[0] || ""));
  };

  const updatePlan = (id, field, value) => {
    onChange(plans.map((plan) => (plan.id === id ? { ...plan, [field]: value } : plan)));
  };

  const removePlan = (id) => onChange(plans.filter((plan) => plan.id !== id));

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <header className="max-w-7xl mx-auto mb-7 border-b border-slate-200 pb-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700 mb-3"><ArrowLeft className="h-4 w-4" /> Volver al dashboard</button>
        <div className="flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-[#09458A]" />
          <div>
            <h1 className="text-3xl font-black text-slate-900">Planes de Acción · Supervisión Docente</h1>
            <p className="text-sm text-slate-500">Redacta acciones con formato y vincúlalas a cada frecuencia.</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        <form onSubmit={addPlan} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4"><h2 className="font-black text-lg">Nueva acción</h2><span className="text-xs text-slate-400">Se guarda en este navegador</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="text-xs font-bold text-slate-600">Fecha<input type="date" value={draft.date} onChange={(e) => setField("date", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Frecuencia<select value={draft.frequency} onChange={(e) => setField("frequency", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal"><option value="">General</option>{frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Responsable<input value={draft.owner} onChange={(e) => setField("owner", e.target.value)} placeholder="Ej. Ernesto / Teacher" className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Fecha de seguimiento<input type="date" value={draft.followUpDate} onChange={(e) => setField("followUpDate", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <label className="text-xs font-bold text-slate-600">Hallazgo / prioridad
              <RichTextEditor value={draft.finding} onChange={(value) => setField("finding", value)} placeholder="Describe el hallazgo, prioridad o situación observada..." />
            </label>
            <label className="text-xs font-bold text-slate-600">Acción
              <RichTextEditor value={draft.action} onChange={(value) => setField("action", value)} placeholder="Redacta la acción, pasos, responsables o acuerdos..." />
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4 items-end">
            <label className="lg:col-span-3 text-xs font-bold text-slate-600">Notas
              <RichTextEditor value={draft.notes} onChange={(value) => setField("notes", value)} placeholder="Notas adicionales..." minHeight={84} />
            </label>
            <label className="text-xs font-bold text-slate-600">Estado<select value={draft.status} onChange={(e) => setField("status", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          </div>

          <button type="submit" className="mt-4 inline-flex items-center gap-2 bg-[#09458A] hover:bg-[#07396f] text-white px-4 py-2.5 rounded-lg text-sm font-bold"><Plus className="h-4 w-4" /> Agregar acción</button>
        </form>

        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><h2 className="font-black text-lg">Acciones registradas</h2><p className="text-xs text-slate-500">{filteredPlans.length} registro(s)</p></div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm"><option value="TODAS">Todas las frecuencias</option>{frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select>
          </div>

          {filteredPlans.map((plan) => (
            <article key={plan.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <label className="text-xs font-bold text-slate-600">Fecha<input type="date" value={plan.date || ""} onChange={(e) => updatePlan(plan.id, "date", e.target.value)} className="mt-1 w-full border rounded-lg p-2 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-600">Frecuencia<select value={plan.frequency || ""} onChange={(e) => updatePlan(plan.id, "frequency", e.target.value)} className="mt-1 w-full border rounded-lg p-2 text-sm font-normal"><option value="">General</option>{frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label>
                <label className="text-xs font-bold text-slate-600">Responsable<input value={plan.owner || ""} onChange={(e) => updatePlan(plan.id, "owner", e.target.value)} className="mt-1 w-full border rounded-lg p-2 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-slate-600">Seguimiento<input type="date" value={plan.followUpDate || ""} onChange={(e) => updatePlan(plan.id, "followUpDate", e.target.value)} className="mt-1 w-full border rounded-lg p-2 text-sm font-normal" /></label>
                <div className="flex items-end gap-2"><label className="flex-1 text-xs font-bold text-slate-600">Estado<select value={plan.status || "Pendiente"} onChange={(e) => updatePlan(plan.id, "status", e.target.value)} className="mt-1 w-full border rounded-lg p-2 text-sm font-normal">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><button type="button" onClick={() => removePlan(plan.id)} className="mb-0.5 p-2.5 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 className="h-4 w-4" /></button></div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <label className="text-xs font-bold text-slate-600">Hallazgo / prioridad<RichTextEditor value={plan.finding || ""} onChange={(value) => updatePlan(plan.id, "finding", value)} placeholder="Hallazgo..." /></label>
                <label className="text-xs font-bold text-slate-600">Acción<RichTextEditor value={plan.action || ""} onChange={(value) => updatePlan(plan.id, "action", value)} placeholder="Acción..." /></label>
              </div>
              <label className="block mt-4 text-xs font-bold text-slate-600">Notas<RichTextEditor value={plan.notes || ""} onChange={(value) => updatePlan(plan.id, "notes", value)} placeholder="Notas..." minHeight={76} /></label>
            </article>
          ))}

          {!filteredPlans.length && <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">No hay acciones registradas para este filtro.</div>}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center gap-2"><Save className="h-4 w-4" /> Los cambios se guardan automáticamente en localStorage y el formato se conserva en el reporte HTML/PDF.</div>
        </section>
      </main>
    </div>
  );
}
