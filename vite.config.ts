import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

/** Plugin inline: al terminar el build copia dist/index.html a dist/404.html
 *  para que GitHub Pages sirva la SPA en cualquier ruta profunda. */
function copy404Plugin(): Plugin {
  return {
    name: "copy-index-to-404",
    apply: "build",
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      const src = path.join(dist, "index.html");
      const dest = path.join(dist, "404.html");
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log("✓ dist/404.html generado a partir de dist/index.html");
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), copy404Plugin()],
  // En build: base absoluta para GitHub Pages (/TEMPO/).
  // En serve (dev): base "/" para que las rutas locales funcionen normalmente.
  base: command === "build" ? "/TEMPO/" : "/",
  server: { port: 5173 },
}));
