import type { AppState, TimeEntry } from "./types";
import { weekStart } from "./utils";

/**
 * Horas de vuelo: experiencia profesional acumulada a partir de la actividad
 * real en proyectos. Todo se calcula acá, en el momento — nunca se guarda un
 * total en ningún lado (principio "evitar datos duplicados" del diseño).
 *
 * Validación de horas extra: si en una semana el usuario cargó más minutos de
 * los que le corresponden por su jornada, el excedente solo cuenta como horas
 * de vuelo si está cubierto por horas extra ya aprobadas para esa semana (no
 * existe un paso de "validación" adicional del admin: esa función se sacó de
 * la app, así que "aprobado" es hoy el único estado que hace falta chequear).
 * El excedente no cubierto se descuenta de los registros más recientes de esa
 * semana primero.
 */

export interface FlightProjectDetail {
  projectId: string;
  projectName: string;
  minutes: number;
}

export interface FlightActivityResult {
  activityId: string;
  name: string;
  active: boolean;
  minutes: number;
  projects: FlightProjectDetail[];
}

export interface FlightCategoryResult {
  categoryId: string;
  name: string;
  active: boolean;
  minutes: number;
  activities: FlightActivityResult[];
}

export interface FlightHoursResult {
  totalMinutes: number;
  categories: FlightCategoryResult[];
}

/** Minutos de cada entrada que efectivamente cuentan como horas de vuelo, ya
 * descontado el excedente semanal de horas extra no aprobadas. */
function eligibleMinutesByEntry(state: AppState, userId: string, entries: TimeEntry[]): Map<string, number> {
  const user = state.users.find((u) => u.id === userId);
  const expectedWeekly = (user?.weeklyHours ?? 40) * 60;

  const byWeek = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const ws = weekStart(e.date);
    if (!byWeek.has(ws)) byWeek.set(ws, []);
    byWeek.get(ws)!.push(e);
  }

  const eligible = new Map<string, number>();
  for (const [ws, weekEntries] of byWeek) {
    const weekTotal = weekEntries.reduce((a, e) => a + (e.end - e.start), 0);
    const approvedOvertime = state.overtime
      .filter((o) => o.userId === userId && o.weekStart === ws && o.status === "Aprobado")
      .reduce((a, o) => a + o.minutes, 0);
    let excess = Math.max(0, weekTotal - (expectedWeekly + approvedOvertime));

    // Descontar el excedente no aprobado de las entradas más recientes primero.
    const sorted = [...weekEntries].sort((a, b) => (a.date === b.date ? b.start - a.start : b.date.localeCompare(a.date)));
    for (const e of sorted) {
      const mins = e.end - e.start;
      if (excess <= 0) {
        eligible.set(e.id, mins);
        continue;
      }
      const cut = Math.min(mins, excess);
      eligible.set(e.id, mins - cut);
      excess -= cut;
    }
  }
  return eligible;
}

export function computeFlightHours(state: AppState, userId: string): FlightHoursResult {
  const entries = state.entries.filter((e) => e.userId === userId);
  const eligible = eligibleMinutesByEntry(state, userId, entries);

  const activityMinutes = new Map<string, number>();
  const activityProjectMinutes = new Map<string, Map<string, number>>();

  for (const e of entries) {
    const mins = eligible.get(e.id) ?? 0;
    if (mins <= 0 || !e.projectId) continue;
    const project = state.projects.find((p) => p.id === e.projectId);
    if (!project?.flightActivityId) continue;
    const actId = project.flightActivityId;
    activityMinutes.set(actId, (activityMinutes.get(actId) ?? 0) + mins);
    if (!activityProjectMinutes.has(actId)) activityProjectMinutes.set(actId, new Map());
    const pm = activityProjectMinutes.get(actId)!;
    pm.set(project.id, (pm.get(project.id) ?? 0) + mins);
  }

  const categories: FlightCategoryResult[] = state.flightCategories
    .map((cat) => {
      const activities: FlightActivityResult[] = state.flightActivities
        .filter((act) => act.categoryId === cat.id && (activityMinutes.get(act.id) ?? 0) > 0)
        .map((act) => {
          const pm = activityProjectMinutes.get(act.id) ?? new Map<string, number>();
          const projects: FlightProjectDetail[] = [...pm.entries()]
            .map(([projectId, minutes]) => ({
              projectId,
              projectName: state.projects.find((p) => p.id === projectId)?.name ?? "(proyecto eliminado)",
              minutes,
            }))
            .sort((a, b) => b.minutes - a.minutes);
          return { activityId: act.id, name: act.name, active: act.active, minutes: activityMinutes.get(act.id) ?? 0, projects };
        })
        .sort((a, b) => b.minutes - a.minutes);
      const minutes = activities.reduce((a, x) => a + x.minutes, 0);
      return { categoryId: cat.id, name: cat.name, active: cat.active, minutes, activities };
    })
    .filter((c) => c.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const totalMinutes = categories.reduce((a, c) => a + c.minutes, 0);
  return { totalMinutes, categories };
}
