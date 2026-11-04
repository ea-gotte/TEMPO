import { useMemo, useSyncExternalStore } from "react";
import type { PageKey } from "./components/Shell";

/** Mapa PageKey → slug de URL */
export const PAGE_SLUGS: Record<PageKey, string> = {
  tracker: "registro",
  calendar: "calendario",
  dashboard: "dashboard",
  reports: "reportes",
  profile: "perfil",
  feedback: "ideas",
  summary: "resumen",
  projects: "proyectos",
  team: "equipo",
  control: "control-horas",
  absences: "gestion",
  corp: "calendario-corporativo",
  admin: "administracion",
  integrations: "integraciones",
};

/** Mapa inverso: slug → PageKey. Un Map, porque en un objeto "constructor" también sería una "página". */
const SLUG_TO_PAGE = new Map(Object.entries(PAGE_SLUGS).map(([k, v]) => [v, k as PageKey]));

/**
 * URL absoluta de la raíz de la app, con barra final.
 * Ej: "https://ea-gotte.github.io/TEMPO/" en producción,
 * "http://localhost:5173/" en desarrollo.
 */
export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/**
 * Parsea `pathname` relativo a `base` y devuelve la PageKey correspondiente
 * más los segmentos adicionales (rest).
 *
 * @param pathname  window.location.pathname (o valor de prueba)
 * @param base      BASE_URL de Vite, ej. "/TEMPO/" o "/"
 * @returns  { page: PageKey | null, rest: string[] }
 *   - page null si la ruta es la raíz o el slug no existe
 *   - rest: segmentos decodificados después del slug de página
 */
export function parseRoute(
  pathname: string,
  base: string,
): { page: PageKey | null; rest: string[] } {
  // Normalizar base: siempre con / al inicio y al final
  const normalBase = ("/" + base + "/").replace(/\/+/g, "/");

  // Quitar el prefijo de base del pathname (case-sensitive, rutas reales)
  let relative = pathname;
  if (relative.startsWith(normalBase)) {
    relative = relative.slice(normalBase.length);
  } else if (relative === normalBase.slice(0, -1)) {
    // pathname es exactamente la base sin barra final
    relative = "";
  } else if (normalBase === "/" && relative.startsWith("/")) {
    relative = relative.slice(1);
  } else {
    // El pathname no pertenece a nuestra base
    return { page: null, rest: [] };
  }

  // Quitar barra final
  relative = relative.replace(/\/$/, "");

  if (!relative) return { page: null, rest: [] };

  // Separar segmentos y decodificar
  const segments = relative.split("/").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });

  const slug = segments[0];
  const page = SLUG_TO_PAGE.get(slug) ?? null;
  const rest = page ? segments.slice(1) : [];

  return { page, rest };
}

/**
 * Construye el pathname absoluto para una página y segmentos rest opcionales.
 *
 * @param page  PageKey
 * @param rest  segmentos adicionales (sin encodear; esta función los encodea)
 * @param base  BASE_URL de Vite, ej. "/TEMPO/" o "/"
 */
export function buildPath(page: PageKey, rest: string[], base: string): string {
  const normalBase = ("/" + base + "/").replace(/\/+/g, "/");
  const slug = PAGE_SLUGS[page];
  const extra = rest.map(encodeURIComponent).join("/");
  const path = normalBase + slug + (extra ? "/" + extra : "");
  return path;
}

// ---------------------------------------------------------------------------
// Router interno sin dependencias externas
// ---------------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL;

const listeners = new Set<() => void>();

/** Navega a `path` con pushState o replaceState. No conserva query string ni hash. */
export function navigate(path: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  listeners.forEach((fn) => fn());
}

/** Va a una página (y sus subsegmentos); no apila otra entrada si ya estás ahí. */
export function goToPage(page: PageKey, rest: string[] = [], opts: { replace?: boolean } = {}) {
  const path = buildPath(page, rest, BASE);
  if (path !== window.location.pathname) navigate(path, opts);
}

function getSnapshot(): string {
  return window.location.pathname;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

/** Ruta actual; se actualiza con navigate() y con los botones atrás y adelante. */
export function useRoute(): { page: PageKey | null; rest: string[]; isRoot: boolean } {
  const pathname = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    const isRoot = pathname.replace(/\/$/, "") === BASE.replace(/\/$/, "");
    return { ...parseRoute(pathname, BASE), isRoot };
  }, [pathname]);
}

/** Subrutas de la página actual (las subpestañas de Proyectos, por ejemplo). */
export function useSubRoute(): { rest: string[]; setRest: (rest: string[], opts?: { replace?: boolean }) => void } {
  const { page, rest } = useRoute();
  return {
    rest,
    setRest: (next, opts) => {
      if (page) goToPage(page, next, opts);
    },
  };
}
