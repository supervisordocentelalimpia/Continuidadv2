export const UMBRAL_RIESGO = 8;
export const UMBRAL_ALERTA = 5;

export function estadoRiesgoCurso(base) {
  const n = Number(base || 0);
  if (n < UMBRAL_ALERTA) return "ALERTA";
  if (n < UMBRAL_RIESGO) return "EN RIESGO";
  return "OK";
}
