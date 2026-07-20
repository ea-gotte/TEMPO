import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas para que el build funcione en GitHub Pages (subcarpeta /repo/)
  base: "./",
  server: { port: 5173 },
});
