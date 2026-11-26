import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

/**
 * Política de seguridad de contenido (CSP) del build publicado: la página solo ejecuta su propio
 * código y solo se conecta con Supabase, Microsoft (calendario de Teams) y EmailJS. GitHub Pages no
 * deja mandar cabeceras, así que va como <meta>; por eso no puede impedir que otra web la enmarque
 * (frame-ancestors solo funciona como cabecera). En desarrollo no se aplica: Vite necesita scripts
 * en línea para la recarga en caliente.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  return {
    name: "tempo-csp",
    apply: "build",
    transformIndexHtml(html) {
      let supabase = "https://*.supabase.co wss://*.supabase.co";
      try {
        const u = new URL(env.VITE_SUPABASE_URL);
        supabase = `${u.origin} wss://${u.host}`;
      } catch {
        /* sin URL configurada: cualquier proyecto de Supabase */
      }
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        // React escribe estilos en línea (style={{…}})
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src 'self' ${supabase} https://login.microsoftonline.com https://graph.microsoft.com https://api.emailjs.com`,
        // Renovación silenciosa de la sesión de Microsoft
        "frame-src https://login.microsoftonline.com blob: data:",
        // Adjuntos (PDF) que se abren en una pestaña nueva desde un blob
        "object-src 'self' blob: data:",
        "worker-src 'self' blob:",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      return html.replace("<head>", `<head>
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

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

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), contentSecurityPolicy(loadEnv(mode, process.cwd(), "VITE_")), copy404Plugin()],
  // En build: base absoluta para GitHub Pages (/TEMPO/).
  // En serve (dev): base "/" para que las rutas locales funcionen normalmente.
  base: command === "build" ? "/TEMPO/" : "/",
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
}));
