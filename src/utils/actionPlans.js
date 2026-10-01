export const ACTION_PLANS_STORAGE_KEY = "continuidad_supervision_action_plans_v1";

export const createEmptyActionPlan = (frequency = "") => ({
  id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  date: new Date().toISOString().slice(0, 10),
  frequency,
  finding: "",
  action: "",
  owner: "",
  followUpDate: "",
  status: "Pendiente",
  notes: "",
});

export const loadActionPlans = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTION_PLANS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveActionPlans = (plans = []) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTION_PLANS_STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // El dashboard debe seguir funcionando aunque localStorage no esté disponible.
  }
};
