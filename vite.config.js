import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Si se está construyendo para GitHub Pages usa la ruta del repo, si es local usa la raíz
  base: command === "build" ? "/Continuidadv2/" : "/",
}));
