import React, { useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, Plus, Save, Trash2 } from "lucide-react";
import { createEmptyActionPlan } from "../utils/actionPlans";
import { FREQUENCY_ORDER } from "../utils/frecuencia";

const statuses = ["Pendiente", "En proceso", "Completada", "En seguimiento", "Cancelada"];

export default function ActionPlansPanel({ plans, onChange, onBack, availableFrequencies = [] }) {
  const frequencies = useMemo(() => Array.from(new Set([...FREQUENCY_ORDER, ...availableFrequencies])).filter((value) => value && value !== "N/A"), [availableFrequencies]);
  const [draft, setDraft] = useState(createEmptyActionPlan(availableFrequencies[0] || ""));
  const [filter, setFilter] = useState("TODAS");

  const filteredPlans = filter === "TODAS" ? plans : plans.filter((plan) => plan.frequency === filter);

  const setField = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));

  const addPlan = (event) => {
    event.preventDefault();
    if (!draft.finding.trim() && !draft.action.trim()) return;
    onChange([draft, ...plans]);
    setDraft(createEmptyActionPlan(draft.frequency || availableFrequencies[0] || ""));
  };

  const updatePlan = (id, field, value) => {
    onChange(plans.map((plan) => plan.id === id ? { ...plan, [field]: value } : plan));
  };

  const removePlan = (id) => onChange(plans.filter((plan) => plan.id !== id));

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <header className="max-w-7xl mx-auto mb-7 border-b border-slate-200 pb-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700 mb-3"><ArrowLeft className="h-4 w-4" /> Volver al dashboard</button>
        <div className="flex items-center gap-3"><ClipboardList className="h-8 w-8 text-[#09458A]" /><div><h1 className="text-3xl font-black text-slate-900">Planes de Acción · Supervisión Docente</h1><p className="text-sm text-slate-500">Registra acciones, responsables y seguimiento vinculados a cada frecuencia.</p></div></div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        <form onSubmit={addPlan} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4"><h2 className="font-black text-lg">Nueva acción</h2><span className="text-xs text-slate-400">Se guarda en este navegador</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="text-xs font-bold text-slate-600">Fecha<input type="date" value={draft.date} onChange={(e) => setField("date", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Frecuencia<select value={draft.frequency} onChange={(e) => setField("frequency", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal"><option value="">General</option>{frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Responsable<input value={draft.owner} onChange={(e) => setField("owner", e.target.value)} placeholder="Ej. Ernesto / Teacher" className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Fecha de seguimiento<input type="date" value={draft.followUpDate} onChange={(e) => setField("followUpDate", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="md:col-span-2 text-xs font-bold text-slate-600">Hallazgo / prioridad<textarea value={draft.finding} onChange={(e) => setField("finding", e.target.value)} rows={3} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="md:col-span-2 text-xs font-bold text-slate-600">Acción<textarea value={draft.action} onChange={(e) => setField("action", e.target.value)} rows={3} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="md:col-span-3 text-xs font-bold text-slate-600">Notas<textarea value={draft.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Estado<select value={draft.status} onChange={(e) => setField("status", e.target.value)} className="mt-1 w-full border rounded-lg p-2.5 text-sm font-normal">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          </div>
          <button type="submit" className="mt-4 inline-flex items-center gap-2 bg-[#09458A] hover:bg-[#07396f] text-white px-4 py-2.5 rounded-lg text-sm font-bold"><Plus className="h-4 w-4" /> Agregar acción</button>
        </form>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-black text-lg">Acciones registradas</h2><p className="text-xs text-slate-500">{filteredPlans.length} registro(s)</p></div><select value={filter} onChange={(e) => setFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm"><option value="TODAS">Todas las frecuencias</option>{frequencies.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Frecuencia</th><th className="p-3 text-left min-w-56">Hallazgo</th><th className="p-3 text-left min-w-56">Acción</th><th className="p-3 text-left">Responsable</th><th className="p-3 text-left">Seguimiento</th><th className="p-3 text-left">Estado</th><th className="p-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map((plan) => <tr key={plan.id} className="align-top">
                  <td className="p-3"><input type="date" value={plan.date || ""} onChange={(e) => updatePlan(plan.id, "date", e.target.value)} className="border rounded p-1.5" /></td>
                  <td className="p-3"><select value={plan.frequency || ""} onChange={(e) => updatePlan(plan.id, "frequency", e.target.value)} className="border rounded p-1.5"><option value="">General</option>{frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></td>
                  <td className="p-3"><textarea value={plan.finding || ""} onChange={(e) => updatePlan(plan.id, "finding", e.target.value)} rows={3} className="w-full border rounded p-2" /></td>
                  <td className="p-3"><textarea value={plan.action || ""} onChange={(e) => updatePlan(plan.id, "action", e.target.value)} rows={3} className="w-full border rounded p-2" /></td>
                  <td className="p-3"><input value={plan.owner || ""} onChange={(e) => updatePlan(plan.id, "owner", e.target.value)} className="border rounded p-1.5 w-36" /></td>
                  <td className="p-3"><input type="date" value={plan.followUpDate || ""} onChange={(e) => updatePlan(plan.id, "followUpDate", e.target.value)} className="border rounded p-1.5" /></td>
                  <td className="p-3"><select value={plan.status || "Pendiente"} onChange={(e) => updatePlan(plan.id, "status", e.target.value)} className="border rounded p-1.5">{statuses.map((status) => <option key={status}>{status}</option>)}</select></td>
                  <td className="p-3"><button type="button" onClick={() => removePlan(plan.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 className="h-4 w-4" /></button></td>
                </tr>)}
                {!filteredPlans.length && <tr><td colSpan={8} className="p-8 text-center text-slate-400">No hay acciones registradas para este filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t bg-slate-50 text-xs text-slate-500 flex items-center gap-2"><Save className="h-4 w-4" /> Los cambios se guardan automáticamente en localStorage.</div>
        </section>
      </main>
    </div>
  );
}
