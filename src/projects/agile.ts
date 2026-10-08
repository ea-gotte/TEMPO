import type { Project, User } from "../types";
import { addDays, parseISO, today } from "../utils";
import type { Baseline, ChangeRequest, Milestone, ProjectMeta, Risk, Sprint, Task, WorkEnv } from "./types";

/**
 * Cálculos de metodología: estimaciones con rango, capacidad y burndown de
 * sprints, velocidad, estabilidad del alcance y madurez del plan. Todo son
 * funciones puras sobre los datos; no guardan nada.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const diffDays = (a: string, b: string) => Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);

export const isDone = (t: Task) => t.status === "hecha";
export const hoursOf = (t: Task) => t.estimateHours ?? 0;
export const sumHours = (ts: Task[]) => r1(ts.reduce((s, t) => s + hoursOf(t), 0));

/* ====================================================================
 * Estimaciones con rango
 * ==================================================================== */
const SPREAD: Record<string, number> = { alta: 1.2, media: 1.5, baja: 2 };
export const CONF_SCORE: Record<string, number> = { alta: 1, media: 0.5, baja: 0.15 };

/** Mínimo / probable / máximo de una tarea; si faltan los extremos se derivan de la confianza. */
export function estimateRange(t: Task): { min: number; prob: number; max: number } | null {
  if (t.estimateHours == null) return null;
  const p = t.estimateHours;
  return { min: t.estimateMin ?? r1(p * 0.8), prob: p, max: t.estimateMax ?? r1(p * SPREAD[t.confidence ?? "media"]) };
}

export interface Uncertainty {
  /** Horas finales estimadas: lo cargado más lo que falta (mín / probable / máx) */
  range: { min: number; prob: number; max: number } | null;
  remainingOpen: number;
  unestimated: number;
  /** Reserva de contingencia (horas) y cuánta se consumiría con el escenario probable */
  reserveHours: number | null;
  reserveUsedPct: number | null;
  /** 0–100: qué tan firme es la estimación de lo que falta (alta 1, media 0,5, baja 0,15, sin estimar 0) */
  maturityPct: number | null;
  highRisksOpen: number;
}

export function uncertainty(project: Project, meta: ProjectMeta | undefined, tasks: Task[], risks: Risk[], loggedHours: number): Uncertainty {
  const open = tasks.filter((t) => !isDone(t));
  const ranges = open.map(estimateRange).filter(Boolean) as { min: number; prob: number; max: number }[];
  const sum = (k: "min" | "prob" | "max") => r1(ranges.reduce((s, x) => s + x[k], 0));
  const range = open.length ? { min: r1(loggedHours + sum("min")), prob: r1(loggedHours + sum("prob")), max: r1(loggedHours + sum("max")) } : null;
  const budget = project.budgetHours;
  const reserveHours = budget && meta ? r1((budget * meta.contingencyPct) / 100) : null;
  const reserveUsedPct = reserveHours && range ? Math.round((Math.max(0, range.prob - budget!) / reserveHours) * 100) : null;
  const maturityPct = open.length ? Math.round((open.reduce((s, t) => s + (t.estimateHours == null ? 0 : CONF_SCORE[t.confidence ?? "media"]), 0) / open.length) * 100) : null;
  return {
    range, remainingOpen: sum("prob"), unestimated: open.length - ranges.length, reserveHours, reserveUsedPct, maturityPct,
    highRisksOpen: risks.filter((r) => r.status === "abierto" && riskScore(r) >= 6).length,
  };
}

export const riskScore = (r: Pick<Risk, "probability" | "impact">) => r.probability * r.impact;
export const riskLevel = (r: Pick<Risk, "probability" | "impact">): "alto" | "medio" | "bajo" => (riskScore(r) >= 6 ? "alto" : riskScore(r) >= 3 ? "medio" : "bajo");

/* ====================================================================
 * Backlog y sprints
 * ==================================================================== */
export const backlogOf = (tasks: Task[]) => tasks.filter((t) => !t.sprintId && !isDone(t)).sort((a, b) => a.rank - b.rank);
export const sprintTasks = (tasks: Task[], sprintId: string) => tasks.filter((t) => t.sprintId === sprintId);
export const activeSprint = (sprints: Sprint[]) => sprints.find((s) => s.status === "activo") ?? null;

/** Fechas de un sprint nuevo: arranca el día siguiente al último o el próximo lunes. */
export function nextSprintDates(sprints: Sprint[], weeks: number, now = today()): { startDate: string; endDate: string } {
  const last = [...sprints].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  let start = last ? addDays(last.endDate, 1) : now;
  if (!last) {
    const dow = (parseISO(start).getDay() + 6) % 7; // 0 = lunes
    if (dow > 0 && dow < 5) start = addDays(start, 7 - dow);
  }
  return { startDate: start, endDate: addDays(start, weeks * 7 - 3) }; // viernes de la última semana
}

export interface PersonCap {
  user: User;
  days: number;
  hours: number;
  assigned: number;
  pct: number;
}

export interface SprintCapacity {
  people: PersonCap[];
  total: number;
  committed: number;
  pct: number;
  unestimated: number;
  unassigned: number;
}

/**
 * Capacidad del sprint: días laborales de cada integrante dentro del sprint
 * (según su jornada) menos las ausencias aprobadas, por su horario diario y el
 * factor de foco. Se compara con las horas estimadas de lo asignado a cada uno.
 */
export function sprintCapacity(env: WorkEnv, project: Project, sprint: Pick<Sprint, "startDate" | "endDate" | "focusPct">, tasks: Task[]): SprintCapacity {
  const ids = new Set<string>(project.memberIds);
  for (const t of tasks) if (t.assigneeId) ids.add(t.assigneeId);
  const people: PersonCap[] = [];
  for (const id of ids) {
    const u = env.users.find((x) => x.id === id && x.active);
    if (!u) continue;
    const away = (env.absences ?? []).filter((a) => a.userId === id);
    let days = 0;
    for (let d = sprint.startDate; d <= sprint.endDate; d = addDays(d, 1)) {
      const dow = ((parseISO(d).getDay() + 6) % 7) + 1;
      if (!u.workDays.includes(dow)) continue;
      if (away.some((a) => d >= a.dateFrom && d <= a.dateTo)) continue;
      days++;
    }
    const daily = (u.weeklyHours || 40) / Math.max(1, u.workDays.length);
    const hours = r1((days * daily * sprint.focusPct) / 100);
    const assigned = sumHours(tasks.filter((t) => t.assigneeId === id));
    people.push({ user: u, days, hours, assigned, pct: hours ? Math.round((assigned / hours) * 100) : assigned ? 999 : 0 });
  }
  const total = r1(people.reduce((s, p) => s + p.hours, 0));
  const committed = sumHours(tasks);
  return {
    people: people.sort((a, b) => b.pct - a.pct), total, committed, pct: total ? Math.round((committed / total) * 100) : 0,
    unestimated: tasks.filter((t) => t.estimateHours == null).length, unassigned: tasks.filter((t) => !t.assigneeId).length,
  };
}

export interface BurnPoint {
  date: string;
  ideal: number;
  actual: number | null;
}

export interface Burndown {
  points: BurnPoint[];
  startScope: number;
  addedHours: number;
  remainingNow: number;
  idealNow: number;
}

/** Trabajo que queda cada día del sprint contra la línea ideal; el alcance que entra tarde sube la curva. */
export function burndown(sprint: Sprint, tasks: Task[], now = today()): Burndown {
  const inSprint = tasks.filter((t) => t.sprintId === sprint.id);
  const addedAt = (t: Task) => t.sprintAddedAt ?? sprint.startDate;
  const startScope = sumHours(inSprint.filter((t) => addedAt(t) <= sprint.startDate));
  const n = Math.max(1, diffDays(sprint.endDate, sprint.startDate));
  const points: BurnPoint[] = [];
  let remainingNow = startScope;
  for (let i = 0; i <= n; i++) {
    const d = addDays(sprint.startDate, i);
    const remaining = r1(inSprint.filter((t) => addedAt(t) <= d && !(t.completedAt && t.completedAt <= d)).reduce((s, t) => s + hoursOf(t), 0));
    const show = d <= now || sprint.status === "cerrado";
    points.push({ date: d, ideal: r1(startScope * (1 - i / n)), actual: show ? remaining : null });
    if (d <= now) remainingNow = remaining;
  }
  const idx = Math.min(n, Math.max(0, diffDays(now, sprint.startDate)));
  return {
    points, startScope, remainingNow,
    addedHours: sumHours(inSprint.filter((t) => addedAt(t) > sprint.startDate)),
    idealNow: points[idx].ideal,
  };
}

export interface VelocityInfo {
  closed: Sprint[];
  avg: number | null;
  /** Sprints que faltan para vaciar el backlog al ritmo promedio (últimos 3) */
  sprintsLeft: number | null;
  backlogHours: number;
}

export function velocity(sprints: Sprint[], tasks: Task[]): VelocityInfo {
  const closed = sprints.filter((s) => s.status === "cerrado").sort((a, b) => a.number - b.number);
  const last = closed.slice(-3).map((s) => s.completedHours ?? 0);
  const avg = last.length ? r1(last.reduce((a, b) => a + b, 0) / last.length) : null;
  const backlogHours = sumHours(tasks.filter((t) => !isDone(t) && (!t.sprintId || sprints.find((s) => s.id === t.sprintId)?.status === "planificado")));
  return { closed, avg, backlogHours, sprintsLeft: avg && avg > 0 ? Math.ceil(backlogHours / avg) : null };
}

/* ====================================================================
 * Cambios del cliente y línea base
 * ==================================================================== */
export interface ScopeStats {
  baselineHours: number | null;
  currentHours: number | null;
  growthPct: number | null;
  /** Horas de cambios aprobados que no se facturan aparte (precio cerrado) */
  absorbedHours: number;
  originalEnd: string | null;
  currentEnd: string | null;
  endShiftDays: number | null;
  total: number;
  approved: number;
  pending: number;
  deferred: number;
  rejected: number;
  /** Aprobados con un sprint ya en marcha */
  late: number;
  oldestPendingDays: number | null;
}

export function scopeStats(baselines: Baseline[], changes: ChangeRequest[], now = today()): ScopeStats {
  const bs = [...baselines].sort((a, b) => a.version - b.version);
  const first = bs[0] ?? null;
  const last = bs[bs.length - 1] ?? null;
  const pend = changes.filter((c) => c.status === "pendiente");
  return {
    baselineHours: first ? first.scopeHours : null,
    currentHours: last ? last.scopeHours : null,
    growthPct: first && last && first.scopeHours > 0 ? Math.round(((last.scopeHours - first.scopeHours) / first.scopeHours) * 100) : null,
    absorbedHours: r1(changes.filter((c) => c.status === "aprobado").reduce((s, c) => s + (c.impactHours ?? 0), 0)),
    originalEnd: first?.endDate ?? null,
    currentEnd: last?.endDate ?? null,
    endShiftDays: first?.endDate && last?.endDate ? diffDays(last.endDate, first.endDate) : null,
    total: changes.length,
    approved: changes.filter((c) => c.status === "aprobado").length,
    pending: pend.length,
    deferred: changes.filter((c) => c.status === "diferido").length,
    rejected: changes.filter((c) => c.status === "rechazado").length,
    late: changes.filter((c) => c.status === "aprobado" && c.duringSprint).length,
    oldestPendingDays: pend.length ? Math.max(...pend.map((c) => diffDays(now, c.createdAt))) : null,
  };
}

/* ====================================================================
 * Señales críticas propias de la metodología
 * ==================================================================== */
export interface MethodContext {
  sprints: Sprint[];
  changes: ChangeRequest[];
  risks: Risk[];
  baselines: Baseline[];
  /** Para medir fechas reales contra planificadas y el efecto de las dependencias */
  deliverables?: import("./types").Deliverable[];
}

export const EMPTY_CTX: MethodContext = { sprints: [], changes: [], risks: [], baselines: [], deliverables: [] };

export function methodCritical(
  project: Project, meta: ProjectMeta | undefined, tasks: Task[], milestones: Milestone[], ctx: MethodContext, unc: Uncertainty, scope: ScopeStats, now: string,
): { severity: "alta" | "media"; text: string }[] {
  const out: { severity: "alta" | "media"; text: string }[] = [];
  const add = (severity: "alta" | "media", text: string) => out.push({ severity, text });
  if (project.status === "completado" || project.status === "archivado") return out;
  const mode = meta?.mode ?? "planificado";

  if (scope.pending > 0) {
    const urgent = ctx.changes.some((c) => c.status === "pendiente" && c.urgent);
    add(urgent || (scope.oldestPendingDays ?? 0) > 5 ? "alta" : "media", `${scope.pending} solicitud${scope.pending > 1 ? "es" : ""} de cambio sin decidir${scope.oldestPendingDays ? ` (la más antigua, hace ${scope.oldestPendingDays} d)` : ""}${urgent ? ", con una urgente" : ""}`);
  }
  if (scope.growthPct !== null && scope.growthPct >= 10) {
    add(scope.growthPct >= 20 ? "alta" : "media", `El alcance creció ${scope.growthPct}% sobre el plan original (${scope.absorbedHours} h absorbidas, sin facturar aparte)`);
  }
  const loggedH = unc.range ? unc.range.prob - unc.remainingOpen : 0;
  const alreadyOver = !!project.budgetHours && loggedH >= project.budgetHours; // ya avisado por horas consumidas
  if (unc.reserveUsedPct !== null && unc.reserveUsedPct >= 80 && !alreadyOver) {
    add("alta", unc.reserveUsedPct >= 100 ? `La reserva de contingencia (${unc.reserveHours} h) no alcanza con el escenario probable` : `La reserva de contingencia se consumiría al ${unc.reserveUsedPct}% con el escenario probable`);
  }
  if (mode === "hibrido" && unc.maturityPct !== null && unc.maturityPct < 40) add("media", `Plan poco maduro: solo ${unc.maturityPct}% de lo que falta está estimado con confianza`);

  for (const r of ctx.risks.filter((x) => x.status === "abierto")) {
    if (riskScore(r) >= 6 && !r.mitigation.trim()) add("alta", `Riesgo alto sin plan de mitigación: “${r.title}”`);
    else if (r.reviewDate && r.reviewDate < now) add("media", `Revisión vencida del riesgo “${r.title}”`);
  }
  for (const g of milestones.filter((m) => m.isGate && (m.gateDecision ?? "pendiente") === "pendiente" && m.dueDate && m.dueDate < now)) {
    add("alta", `Puerta de decisión “${g.name}” vencida hace ${diffDays(now, g.dueDate!)} d sin resolver`);
  }

  const act = activeSprint(ctx.sprints);
  if (act) {
    if (act.endDate < now) add("media", `El ${act.name} terminó el ${act.endDate.split("-").reverse().join("/")} y sigue abierto`);
    else {
      const b = burndown(act, tasks, now);
      if (b.remainingNow - b.idealNow > Math.max(8, b.startScope * 0.2)) add("media", `${act.name} atrasado: quedan ${b.remainingNow} h contra ${b.idealNow} h ideales`);
    }
  }
  return out;
}
