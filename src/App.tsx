import React, { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { ToastProvider } from "./components/ui";
import { Shell, EMPLOYEE_PAGES, type PageKey } from "./components/Shell";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Tracker } from "./pages/Tracker";
import { CalendarPage } from "./pages/Calendar";
import { Reports } from "./pages/Reports";
import { Projects } from "./pages/Projects";
import { Team } from "./pages/Team";
import { HoursControl } from "./pages/HoursControl";
import { Absences } from "./pages/Absences";
import { CorpCalendar } from "./pages/CorpCalendar";
import { Admin } from "./pages/Admin";
import { Integrations } from "./pages/Integrations";
import { ForceChangePassword } from "./pages/ForceChangePassword";
import { ResetPassword } from "./pages/ResetPassword";

const PAGES: Record<PageKey, React.ComponentType> = {
  dashboard: Dashboard,
  tracker: Tracker,
  calendar: CalendarPage,
  reports: Reports,
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
  const [page, setPage] = useState<PageKey>("tracker");
  if (state.passwordRecovery) return <ResetPassword />;
  if (!state.authenticated) return <Login />;
  const me = state.users.find((u) => u.id === state.currentUserId);
  if (!me) return null;
  if (me.mustChangePassword) return <ForceChangePassword />;
  // Vista básica para empleados: si la página actual no está permitida, volver al tracker
  const allowed = me?.role === "usuario" ? EMPLOYEE_PAGES : (Object.keys(PAGES) as PageKey[]);
  const effective = allowed.includes(page) ? page : "tracker";
  const Page = PAGES[effective];
  return (
    <Shell page={effective} setPage={setPage}>
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
