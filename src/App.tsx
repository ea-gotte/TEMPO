import React, { useEffect } from "react";
import { StoreProvider, useStore } from "./store";
import { ToastProvider } from "./components/ui";
import { Shell, canSeePage, type PageKey } from "./components/Shell";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Tracker } from "./pages/Tracker";
import { CalendarPage } from "./pages/Calendar";
import { Reports } from "./pages/Reports";
import { ProfessionalProfile } from "./pages/ProfessionalProfile";
import { TeamSummary } from "./pages/TeamSummary";
import { Feedback } from "./pages/Feedback";
import { Projects } from "./pages/Projects";
import { Team } from "./pages/Team";
import { HoursControl } from "./pages/HoursControl";
import { Absences } from "./pages/Absences";
import { CorpCalendar } from "./pages/CorpCalendar";
import { Admin } from "./pages/Admin";
import { Integrations } from "./pages/Integrations";
import { ForceChangePassword } from "./pages/ForceChangePassword";
import { ResetPassword } from "./pages/ResetPassword";
import { goToPage, useRoute } from "./routes";
import { useProjectRolesSync } from "./projects/projectRolesSync";
import type { Role } from "./types";

const PAGES: Record<PageKey, React.ComponentType> = {
  dashboard: Dashboard,
  tracker: Tracker,
  calendar: CalendarPage,
  reports: Reports,
  profile: ProfessionalProfile,
  summary: TeamSummary,
  feedback: Feedback,
  projects: Projects,
  team: Team,
  control: HoursControl,
  absences: Absences,
  corp: CorpCalendar,
  admin: Admin,
  integrations: Integrations,
};

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
      <Page />
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
