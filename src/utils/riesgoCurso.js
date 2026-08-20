// src/utils/riesgoCurso.js

/* =========================================================
   UMBRALES INSTITUCIONALES
   ========================================================= */

/*
  Interpretación actual:

  0 - 4 alumnos  -> ALERTA
  5 - 7 alumnos  -> EN RIESGO
  8+ alumnos     -> OK

  Si CEVAZ cambia posteriormente estos criterios,
  solo será necesario modificar estas constantes.
*/

export const UMBRAL_ALERTA = 5;
export const UMBRAL_RIESGO = 8;

/* =========================================================
   ESTADOS
   ========================================================= */

export const ESTADOS_RIESGO_CURSO = Object.freeze({
  ALERTA: "ALERTA",
  EN_RIESGO: "EN RIESGO",
  OK: "OK",
  SIN_DATOS: "SIN DATOS",
});

/* =========================================================
   VALIDACIÓN DE CONFIGURACIÓN
   ========================================================= */

/*
  Los umbrales deben conservar esta relación:

  UMBRAL_ALERTA < UMBRAL_RIESGO

  Si alguien modifica accidentalmente las constantes
  de forma incoherente, preferimos detectarlo de inmediato
  en lugar de generar clasificaciones incorrectas.
*/

if (
  !Number.isFinite(UMBRAL_ALERTA) ||
  !Number.isFinite(UMBRAL_RIESGO) ||
  UMBRAL_ALERTA < 0 ||
  UMBRAL_RIESGO <= 0 ||
  UMBRAL_ALERTA >= UMBRAL_RIESGO
) {
  throw new Error(
    "Configuración inválida de riesgo de curso: " +
      "UMBRAL_ALERTA debe ser menor que UMBRAL_RIESGO."
  );
}

/* =========================================================
   NORMALIZACIÓN DE BASE
   ========================================================= */

export function normalizarBaseCurso(base) {
  /*
    No convertimos null, undefined o vacío en cero.

    Un curso sin información no es automáticamente
    un curso con cero alumnos.
  */

  if (
    base === null ||
    base === undefined ||
    base === ""
  ) {
    return null;
  }

  const value = Number(base);

  if (!Number.isFinite(value)) {
    return null;
  }

  /*
    Una cantidad de alumnos no puede ser negativa.
  */

  if (value < 0) {
    return null;
  }

  return value;
}

/* =========================================================
   CLASIFICACIÓN PRINCIPAL
   ========================================================= */

export function estadoRiesgoCurso(base) {
  const n = normalizarBaseCurso(base);

  if (n === null) {
    return ESTADOS_RIESGO_CURSO.SIN_DATOS;
  }

  if (n < UMBRAL_ALERTA) {
    return ESTADOS_RIESGO_CURSO.ALERTA;
  }

  if (n < UMBRAL_RIESGO) {
    return ESTADOS_RIESGO_CURSO.EN_RIESGO;
  }

  return ESTADOS_RIESGO_CURSO.OK;
}

/* =========================================================
   DETALLE DEL RIESGO
   ========================================================= */

/*
  Esta función es más útil para dashboards que solamente
  devolver el nombre del estado.

  Ejemplo:

  detalleRiesgoCurso(4)

  devuelve información como:

  {
    base: 4,
    estado: "ALERTA",
    faltanParaOk: 4,
    faltanParaSalirAlerta: 1,
    ...
  }
*/

export function detalleRiesgoCurso(base) {
  const n = normalizarBaseCurso(base);

  if (n === null) {
    return {
      base: null,

      estado:
        ESTADOS_RIESGO_CURSO.SIN_DATOS,

      esValido: false,

      faltanParaOk: null,

      faltanParaSalirAlerta: null,

      umbralAlerta:
        UMBRAL_ALERTA,

      umbralRiesgo:
        UMBRAL_RIESGO,

      mensaje:
        "No hay una base válida para clasificar el curso.",
    };
  }

  const estado =
    estadoRiesgoCurso(n);

  const faltanParaOk =
    Math.max(
      0,
      UMBRAL_RIESGO - n
    );

  const faltanParaSalirAlerta =
    Math.max(
      0,
      UMBRAL_ALERTA - n
    );

  let mensaje = "";

  if (
    estado ===
    ESTADOS_RIESGO_CURSO.ALERTA
  ) {
    mensaje =
      `Curso en alerta: ${n} alumno(s). ` +
      `Necesita al menos ${UMBRAL_ALERTA} para salir del nivel de alerta ` +
      `y ${UMBRAL_RIESGO} para alcanzar estado OK.`;
  } else if (
    estado ===
    ESTADOS_RIESGO_CURSO.EN_RIESGO
  ) {
    mensaje =
      `Curso en riesgo: ${n} alumno(s). ` +
      `Necesita ${faltanParaOk} alumno(s) adicional(es) para alcanzar estado OK.`;
  } else {
    mensaje =
      `Curso con base adecuada: ${n} alumno(s).`;
  }

  return {
    base: n,

    estado,

    esValido: true,

    faltanParaOk,

    faltanParaSalirAlerta,

    umbralAlerta:
      UMBRAL_ALERTA,

    umbralRiesgo:
      UMBRAL_RIESGO,

    mensaje,
  };
}

/* =========================================================
   UTILIDADES BOOLEANAS
   ========================================================= */

export function cursoEstaEnAlerta(base) {
  return (
    estadoRiesgoCurso(base) ===
    ESTADOS_RIESGO_CURSO.ALERTA
  );
}

export function cursoEstaEnRiesgo(base) {
  return (
    estadoRiesgoCurso(base) ===
    ESTADOS_RIESGO_CURSO.EN_RIESGO
  );
}

export function cursoEstaOk(base) {
  return (
    estadoRiesgoCurso(base) ===
    ESTADOS_RIESGO_CURSO.OK
  );
}

export function cursoTieneDatosValidos(base) {
  return (
    normalizarBaseCurso(base) !== null
  );
}

/* =========================================================
   ORDEN DE SEVERIDAD
   ========================================================= */

/*
  Útil si posteriormente quieres ordenar los cursos
  poniendo primero los de mayor prioridad.

  Mayor número = mayor atención requerida.
*/

export const PRIORIDAD_RIESGO_CURSO = Object.freeze({
  [ESTADOS_RIESGO_CURSO.ALERTA]: 3,

  [ESTADOS_RIESGO_CURSO.EN_RIESGO]: 2,

  [ESTADOS_RIESGO_CURSO.OK]: 1,

  [ESTADOS_RIESGO_CURSO.SIN_DATOS]: 0,
});

export function prioridadRiesgoCurso(base) {
  const estado =
    estadoRiesgoCurso(base);

  return (
    PRIORIDAD_RIESGO_CURSO[
      estado
    ] ?? 0
  );
}
