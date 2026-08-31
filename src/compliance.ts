import type { AppState, ID, User } from "./types";
import { addDays, dayLabel, parseISO, weekStart } from "./utils";

/**
 * Cadena de mando: control de cumplimiento de carga de horas.
 *
 * Cada usuario reporta a su supervisor (User.supervisorId); esa cadena ya es
 * ramificable de por sí (un supervisor puede depender de otro supervisor o
 * gerente). Una "incidencia" es una semana ya cerrada donde alguien no
 * cargó sus horas correctamente (mismo umbral que "incompleto"/"sin-carga"
 * en Control de horas). Se resuelve sola apenas la persona carga esas horas
 * — no hay un botón para "cerrarla" a mano.
 *
 * Si nadie actúa, la incidencia escala sola: al detectarse avisa al
 * supervisor directo; si pasan ESCALATION_DAYS días sin resolverse, avisa
 * también al responsable de ese supervisor, y así sucesivamente hasta la
 * cabeza de la cadena. Si la cadena se agota (o la persona no tiene
 * supervisor asignado) sin llegar a un admin, además avisa a todos los admins.
 */

const ESCALATION_DAYS = 2;
/** No se buscan incidencias más viejas que esto: quedan como historial, no como alerta activa. */
const LOOKBACK_WEEKS = 8;
/** Mismo umbral que separa "incompleto" de "ok" en Control de horas. */
const MIN_LOAD_RATIO = 0.95;

export type IncidentSeverity = "sin-carga" | "incompleto";

export interface HoursIncident {
  userId: ID;
  weekStart: string; // lunes de la semana con la incidencia
  severity: IncidentSeverity;
  loadedMinutes: number;
  expectedMinutes: number;
  ageDays: number; // días desde que la semana quedó cerrada
  /** Supervisores por encima del usuario, el más cercano primero. */
  chain: ID[];
  /** Índice en `chain` del destinatario actual del aviso (-1 si no hay cadena). */
  escalationLevel: number;
  notifyTargetId: ID | null;
  /** Además de (o en lugar de) notifyTargetId, hay que avisar a todos los admins. */
  fallbackToAdmins: boolean;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO).getTime() - parseISO(fromISO).getTime()) / 86400000);
}

/** Cadena de supervisores por encima de `userId`, el más cercano primero. */
function supervisorChain(userId: ID, users: User[]): ID[] {
  const chain: ID[] = [];
  const seen = new Set<ID>([userId]);
  let current = users.find((u) => u.id === userId);
  while (current?.supervisorId) {
    if (seen.has(current.supervisorId)) break; // por si hay un ciclo mal cargado
    const sup = users.find((u) => u.id === current!.supervisorId);
    if (!sup) break;
    chain.push(sup.id);
    seen.add(sup.id);
    current = sup;
  }
  return chain;
}

/** Todos los que dependen de `userId`, directa o indirectamente. */
export function getDownlineIds(userId: ID, users: User[]): Set<ID> {
  const result = new Set<ID>();
  for (const u of users) {
    if (u.id !== userId && supervisorChain(u.id, users).includes(userId)) result.add(u.id);
  }
  return result;
}

export function computeHoursIncidents(state: AppState, todayISO: string): HoursIncident[] {
  const incidents: HoursIncident[] = [];
  const thisWeek = weekStart(todayISO);
  for (const u of state.users) {
    // Equipo España no usa TEMPO para cargar horas (ver canSeePage en Shell.tsx):
    // no tiene sentido pedirles que "carguen" nada, así que nunca generan incidencia.
    if (!u.active || u.weeklyHours <= 0 || u.team === "espana") continue;
    for (let i = 1; i <= LOOKBACK_WEEKS; i++) {
      const ws = addDays(thisWeek, -7 * i);
      const weekEnd = addDays(ws, 6);
      const loaded = state.entries
        .filter((e) => e.userId === u.id && e.date >= ws && e.date <= weekEnd)
        .reduce((a, e) => a + (e.end - e.start), 0);
      const expected = u.weeklyHours * 60;
      if (loaded >= expected * MIN_LOAD_RATIO) continue; // esa semana está OK, no es incidencia

      const detectedAt = addDays(ws, 7); // primer día en que la semana ya se puede juzgar cerrada
      const ageDays = Math.max(0, daysBetween(detectedAt, todayISO));
      const chain = supervisorChain(u.id, state.users);
      const rawLevel = Math.floor(ageDays / ESCALATION_DAYS);
      const escalationLevel = chain.length > 0 ? Math.min(rawLevel, chain.length - 1) : -1;
      const notifyTargetId = escalationLevel >= 0 ? chain[escalationLevel] : null;
      const targetIsAdmin = notifyTargetId ? state.users.find((x) => x.id === notifyTargetId)?.role === "admin" : false;
      const fallbackToAdmins = chain.length === 0 || (rawLevel > chain.length - 1 && !targetIsAdmin);

      incidents.push({
        userId: u.id,
        weekStart: ws,
        severity: loaded === 0 ? "sin-carga" : "incompleto",
        loadedMinutes: loaded,
        expectedMinutes: expected,
        ageDays,
        chain,
        escalationLevel,
        notifyTargetId,
        fallbackToAdmins,
      });
    }
  }
  return incidents.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Incidencias visibles para `viewer` según su lugar en la cadena de mando:
 * admin y gerente tienen visión global (igual que hoy en Control de horas);
 * un supervisor solo ve a quienes tiene por debajo, directa o indirectamente.
 */
export function visibleIncidents(incidents: HoursIncident[], viewer: User, users: User[]): HoursIncident[] {
  if (viewer.role === "admin" || viewer.role === "gerente") return incidents;
  const downline = getDownlineIds(viewer.id, users);
  return incidents.filter((i) => downline.has(i.userId));
}

/**
 * Avisos automáticos para el usuario logueado: se generan cuando él es el
 * destinatario actual de una incidencia (directo o por escalamiento), o
 * cuando la cadena se agotó sin llegar a un admin y él lo es (aviso de
 * respaldo). Se manda como máximo un recordatorio por día por incidencia
 * (la fecha del día queda en el texto, que es lo que se usa para
 * deduplicar contra el historial de notificaciones — mismo patrón que el
 * resto de los avisos automáticos de la app): si sigue sin resolverse,
 * al otro día se vuelve a avisar.
 */
export function myComplianceAlerts(state: AppState, meId: ID, todayISO: string): { title: string; body: string }[] {
  const me = state.users.find((u) => u.id === meId);
  if (!me) return [];
  const incidents = computeHoursIncidents(state, todayISO);
  const alerts: { title: string; body: string }[] = [];
  for (const inc of incidents) {
    const isDirectTarget = inc.notifyTargetId === meId;
    const isAdminFallback = inc.fallbackToAdmins && me.role === "admin" && inc.notifyTargetId !== meId;
    if (!isDirectTarget && !isAdminFallback) continue;
    const user = state.users.find((u) => u.id === inc.userId);
    if (!user) continue;
    const severityLabel = inc.severity === "sin-carga" ? "no cargó ninguna hora" : "no completó la carga de horas";
    const levelTag = isAdminFallback ? "sin-responsable" : String(inc.escalationLevel);
    const escalated = inc.escalationLevel > 0 || isAdminFallback;
    alerts.push({
      title: escalated ? "Incidencia de carga escalada" : "Aviso de carga de horas",
      body: `Hoy ${dayLabel(todayISO)}: ${user.name} ${severityLabel} de la semana del ${dayLabel(inc.weekStart)} (nivel ${levelTag}).`,
    });
  }
  return alerts;
}
