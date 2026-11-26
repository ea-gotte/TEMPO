import type { AppState, ID, User } from "./types";
import { addDays, dayLabel, parseISO, weekStart } from "./utils";
import { expectedMinutesInRange } from "./store";

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
  // Registros de cada persona, armados una vez: antes se recorrían TODOS los registros
  // por cada persona y cada semana (y esto se recalcula con cada cambio de un registro).
  const entriesOf = new Map<ID, AppState["entries"]>();
  for (const e of state.entries) {
    const list = entriesOf.get(e.userId);
    if (list) list.push(e);
    else entriesOf.set(e.userId, [e]);
  }
  for (const u of state.users) {
    // Equipo España no usa TEMPO para cargar horas (ver canSeePage en Shell.tsx):
    // no tiene sentido pedirles que "carguen" nada, así que nunca generan incidencia.
    if (!u.active || u.weeklyHours <= 0 || u.team === "espana") continue;
    for (let i = 1; i <= LOOKBACK_WEEKS; i++) {
      const ws = addDays(thisWeek, -7 * i);
      const weekEnd = addDays(ws, 6);
      const loaded = (entriesOf.get(u.id) ?? [])
        .filter((e) => e.date >= ws && e.date <= weekEnd)
        .reduce((a, e) => a + (e.end - e.start), 0);
      // Descuenta feriados y ausencias de día completo ya aprobadas de esa
      // semana (mismo cálculo que Reportes y Control de horas).
      const expected = expectedMinutesInRange(state, u, ws, weekEnd);
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

/** Título del aviso diario: es lo que permite reconocer si el de hoy ya se mandó */
export const COMPLIANCE_SUMMARY_TITLE = "Carga de horas sin completar";

/**
 * Aviso automático para el usuario logueado: UNO por día, con el resumen de las incidencias
 * de las que hoy es destinatario (directo o por escalamiento) o, si es admin, de las que
 * agotaron la cadena sin llegar a un admin. Antes salía un aviso por persona y por semana
 * (cerca de cien por día para un admin); el detalle sigue estando en Control de horas.
 */
export function myComplianceSummary(state: AppState, meId: ID, todayISO: string): { title: string; body: string } | null {
  const me = state.users.find((u) => u.id === meId);
  if (!me) return null;
  const weeksByUser = new Map<ID, number>();
  let weeks = 0;
  let escalated = 0;
  for (const inc of computeHoursIncidents(state, todayISO)) {
    const isDirectTarget = inc.notifyTargetId === meId;
    const isAdminFallback = inc.fallbackToAdmins && me.role === "admin" && inc.notifyTargetId !== meId;
    if (!isDirectTarget && !isAdminFallback) continue;
    weeksByUser.set(inc.userId, (weeksByUser.get(inc.userId) ?? 0) + 1);
    weeks++;
    if (inc.escalationLevel > 0 || isAdminFallback) escalated++;
  }
  const people = weeksByUser.size;
  if (people === 0) return null;
  // Primero quienes más semanas deben
  const names = [...weeksByUser]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => state.users.find((u) => u.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const shown = names.slice(0, 3);
  const rest = people - shown.length;
  const who = shown.join(", ") + (rest > 0 ? ` y ${rest} más` : "");
  // Si todas están escaladas (lo habitual para un admin), decirlo no agrega nada
  const esc = escalated > 0 && escalated < weeks ? ` (${escalated} escalada${escalated !== 1 ? "s" : ""})` : "";
  return {
    title: COMPLIANCE_SUMMARY_TITLE,
    body: `Hoy ${dayLabel(todayISO)}: ${people} persona${people !== 1 ? "s" : ""} con ${weeks} semana${weeks !== 1 ? "s" : ""} sin completar${esc}: ${who}. El detalle está en Control de horas.`,
  };
}
