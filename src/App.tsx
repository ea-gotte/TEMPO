import React, { Suspense, lazy, useEffect } from "react";
import { StoreProvider, useStore } from "./store";
import { ToastProvider } from "./components/ui";
import { Shell, canSeePage, type PageKey } from "./components/Shell";
import { Login } from "./pages/Login";
import { ForceChangePassword } from "./pages/ForceChangePassword";
import { ResetPassword } from "./pages/ResetPassword";
import { goToPage, useRoute } from "./routes";
import { useProjectRolesSync } from "./projects/projectRolesSync";
import type { Role } from "./types";

/**
 * Cada pantalla se descarga aparte, la primera vez que hace falta: entrar a la app ya no
 * espera el código de todas. Los importadores quedan a mano para adelantar la descarga.
 */
const LOADERS: Record<PageKey, () => Promise<{ default: React.ComponentType }>> = {
  dashboard: () => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
  tracker: () => import("./pages/Tracker").then((m) => ({ default: m.Tracker })),
  calendar: () => import("./pages/Calendar").then((m) => ({ default: m.CalendarPage })),
  reports: () => import("./pages/Reports").then((m) => ({ default: m.Reports })),
  profile: () => import("./pages/ProfessionalProfile").then((m) => ({ default: m.ProfessionalProfile })),
  summary: () => import("./pages/TeamSummary").then((m) => ({ default: m.TeamSummary })),
  feedback: () => import("./pages/Feedback").then((m) => ({ default: m.Feedback })),
  projects: () => import("./pages/Projects").then((m) => ({ default: m.Projects })),
  team: () => import("./pages/Team").then((m) => ({ default: m.Team })),
  control: () => import("./pages/HoursControl").then((m) => ({ default: m.HoursControl })),
  absences: () => import("./pages/Absences").then((m) => ({ default: m.Absences })),
  corp: () => import("./pages/CorpCalendar").then((m) => ({ default: m.CorpCalendar })),
  admin: () => import("./pages/Admin").then((m) => ({ default: m.Admin })),
  integrations: () => import("./pages/Integrations").then((m) => ({ default: m.Integrations })),
};

const RELOAD_KEY = "tempo-recarga-por-version";

/**
 * Si una pantalla no se puede descargar con conexión, lo más probable es que se haya publicado
 * una versión nueva con esta pestaña abierta y el archivo viejo ya no exista: se recarga la app
 * una sola vez. Sin conexión (o si ya se recargó hace poco) el error llega al aviso de abajo.
 */
function reloadOnNewVersion(err: unknown): Promise<never> {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* sin sessionStorage */ }
  if (navigator.onLine && Date.now() - last > 60_000) {
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* idem */ }
    window.location.reload();
    return new Promise<never>(() => {});
  }
  return Promise.reject(err);
}

const PAGES = Object.fromEntries(
  (Object.keys(LOADERS) as PageKey[]).map((k) => [k, lazy(() => LOADERS[k]().catch(reloadOnNewVersion))]),
) as Record<PageKey, React.LazyExoticComponent<React.ComponentType>>;

// Con una sesión guardada lo primero que se ve es el Calendario: se pide ya, en paralelo con el arranque
try {
  if (Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))) void LOADERS.calendar().catch(() => {});
} catch {
  /* sin localStorage */
}

/** Aviso cuando una pantalla no se pudo descargar; cambia de pantalla y se vuelve a intentar */
class PageBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("No se pudo mostrar la pantalla:", err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card card-pad" role="alert" style={{ maxWidth: 520 }}>
        <div className="card-title">No se pudo abrir esta pantalla</div>
        <p style={{ color: "var(--text-2)", fontSize: 13, margin: "6px 0 14px" }}>
          Revisá la conexión a internet y recargá la página. Lo que ya guardaste no se pierde.
        </p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar</button>
      </div>
    );
  }
}

/**
 * Con la app ya en pantalla, baja de fondo el resto de las pantallas que el rol puede ver:
 * cambiar de sección es inmediato y una publicación nueva no deja la pestaña sin archivos.
 */
function PrefetchPages({ role }: { role: Parameters<typeof canSeePage>[0] }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const k of Object.keys(LOADERS) as PageKey[]) {
        if (canSeePage(role, k)) void LOADERS[k]().catch(() => {});
      }
    }, 2500);
    return () => window.clearTimeout(id);
  }, [role]);
  return null;
}

function Root() {
  const { state } = useStore();
  if (state.passwordRecovery) return <ResetPassword />;
  if (!state.authenticated) return <Login />;
  const me = state.users.find((u) => u.id === state.currentUserId);
  if (!me) return null;
  if (me.mustChangePassword) return <ForceChangePassword />;
  return <Pages role={me.role} />;
}

/** Con sesión lista: la página sale de la URL, así recargar no saca de la pestaña. */
function Pages({ role }: { role: Role }) {
  useProjectRolesSync();
  const { page, isRoot } = useRoute();
  const requested = page ?? "calendar";
  // Si la página actual no está permitida para el rol, volver al calendario
  // — o, si tampoco puede verlo, a su perfil profesional, que siempre está disponible.
  const effective = canSeePage(role, requested)
    ? requested
    : canSeePage(role, "calendar")
      ? "calendar"
      : "profile";

  // Corrige la URL si pide una página inexistente o no permitida. La raíz queda
  // tal cual, y mientras haya un enlace de Supabase en el hash no se toca nada:
  // src/supabase.ts y el cliente de Supabase lo leen al iniciar.
  const wrongUrl = !isRoot && page !== effective;
  useEffect(() => {
    if (wrongUrl && !/access_token|type=recovery|error_code/.test(window.location.hash)) {
      goToPage(effective, [], { replace: true });
    }
  }, [wrongUrl, effective]);

  const Page = PAGES[effective];
  return (
    <Shell page={effective} setPage={goToPage}>
      <PrefetchPages role={role} />
      <PageBoundary key={effective}>
        <Suspense fallback={<div className="page-loading" role="status">Cargando…</div>}>
          <Page />
        </Suspense>
      </PageBoundary>
    </Shell>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </StoreProvider>
  );
}
