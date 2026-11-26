import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas para que el build funcione en GitHub Pages (subcarpeta /repo/)
  base: "./",
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Librerías aparte del código propio: una publicación nueva no obliga a volver a bajarlas
        manualChunks: {
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
