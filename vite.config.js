// vite.config.js

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
  ============================================================
  CONFIGURACIÓN DEL PROYECTO
  ============================================================

  Repositorio:
  supervisordocentelalimpia/Continuidadv2

  GitHub Pages publica la aplicación bajo:

  /Continuidadv2/

  En desarrollo local utilizamos:

  /

  De esta manera:

  npm run dev
  -> http://localhost:5173/

  GitHub Pages
  -> https://supervisordocentelalimpia.github.io/Continuidadv2/
*/

export default defineConfig(({ command }) => {
  const isProductionBuild = command === "build";

  return {
    /* ========================================================
       PLUGINS
       ======================================================== */

    plugins: [
      react(),
    ],

    /* ========================================================
       BASE URL
       ======================================================== */

    base: isProductionBuild
      ? "/Continuidadv2/"
      : "/",

    /* ========================================================
       BUILD
       ======================================================== */

    build: {
      /*
        Carpeta utilizada por GitHub Pages.

        pages.yml espera específicamente:

        dist/index.html
      */
      outDir: "dist",

      /*
        Elimina archivos de compilaciones anteriores
        antes de generar una nueva versión.
      */
      emptyOutDir: true,

      /*
        Generar sourcemaps puede exponer código fuente
        innecesariamente en producción.

        Para este dashboard no son necesarios.
      */
      sourcemap: false,
    },

    /* ========================================================
       SERVIDOR DE DESARROLLO
       ======================================================== */

    server: {
      /*
        Si el puerto 5173 está ocupado,
        Vite puede utilizar automáticamente otro.
      */
      port: 5173,

      strictPort: false,
    },

    /* ========================================================
       PREVIEW LOCAL DEL BUILD
       ======================================================== */

    preview: {
      port: 4173,

      strictPort: false,
    },
  };
});
