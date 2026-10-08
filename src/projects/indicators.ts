import type { Project, User } from "../types";
import { addDays, parseISO, today } from "../utils";
import { EMPTY_CTX, activeSprint, burndown, methodCritical, scopeStats, uncertainty, velocity, type MethodContext, type ScopeStats, type Uncertainty } from "./agile";
import { isPlanOverdue, isProjectLate, isTaskOverdue, projectPerms } from "./logic";
import type { Milestone, ProjectMeta, ProjectMode, Task, WorkData, WorkEnv } from "./types";

/**
 * Indicadores de gestión, calculados siempre desde los datos vivos (tareas,
 * hitos, horas cargadas): nada se carga a mano. Un solo motor alimenta tanto
 * la ficha de cada proyecto como el panel general.
 */

export type Health = "ok" | "warn" | "bad";

export interface CriticalItem {
  projectId: string;
  severity: "alta" | "media";
  text: string;
}

export interface ProjectIndicators {
  project: Project;
  meta?: ProjectMeta;
  tasks: {
    total: number; done: number; open: number; overdue: number; pct: number;
    /** % de tareas cerradas dentro de su fecha límite */
    onTimePct: number | null;
    /** Atraso promedio (días) de las tareas que se cerraron tarde */
    avgDelayDays: number | null;
    unassigned: number; noDates: number; urgentOverdue: number;
  };
  schedule: {
    plannedStart: string | null; plannedEnd: string | null;
    /** Fecha real de cierre, si todas las tareas están hechas */
    actualEnd: string | null;
    /** Pronóstico de fin si todavía hay trabajo abierto */
    forecastEnd: string | null;
    /** Días de desvío del fin (real o pronosticado) contra el planificado; + = tarde */
    varianceDays: number | null;
    expectedPct: number | null; realPct: number; gapPct: number | null;
  };
  hours: {
    budget: number | null; logged: number;
    consumedPct: number | null;
    /** Horas reales menos proyectadas (+ = sobreconsumo) */
    variance: number | null;
    /** Horas finales estimadas según el ritmo de consumo contra avance */
    eac: number | null;
    eacVariancePct: number | null;
  };
  milestones: { total: number; met: number; overdue: number; avgSlipDays: number | null };
  mode: ProjectMode;
  /** Rango de horas finales, reserva y madurez del plan */
  uncertainty: Uncertainty;
  /** Estabilidad del alcance: línea base, cambios del cliente y horas absorbidas */
  scope: ScopeStats;
  agile: {
    sprintsClosed: number;
    velocityAvg: number | null;
    sprintsLeft: number | null;
    backlogHours: number;
    active: { name: string; endDate: string; committed: number; remaining: number; ideal: number } | null;
  };
  health: Health;
  critical: CriticalItem[];
}

export const diffDays = (a: string, b: string) => Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
const max = (xs: string[]) => xs.reduce((a, b) => (a > b ? a : b));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function projectIndicators(
  project: Project, meta: ProjectMeta | undefined, tasks: Task[], milestones: Milestone[], minutes: number, now = today(), ctx: MethodContext = EMPTY_CTX,
): ProjectIndicators {
  const done = tasks.filter((t) => t.status === "hecha");
  const open = tasks.filter((t) => t.status !== "hecha");
  const overdue = tasks.filter((t) => isTaskOverdue(t, now));
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  const closed = done.filter((t) => t.dueDate && t.completedAt);
  const late = closed.filter((t) => t.completedAt! > t.dueDate!);
  const onTimePct = closed.length ? Math.round(((closed.length - late.length) / closed.length) * 100) : null;
  const avgDelay = avg(late.map((t) => diffDays(t.completedAt!, t.dueDate!)));
  const urgentOverdue = overdue.filter((t) => t.priority === "urgente" || t.priority === "alta").length;

  /* ---- Plazo: planificado vs real / pronosticado ---- */
  const plannedStart = meta?.startDate ?? null;
  const plannedEnd = meta?.endDate ?? null;
  let actualEnd: string | null = null;
  let forecastEnd: string | null = null;
  if (tasks.length > 0 && open.length === 0) {
    const ends = done.map((t) => t.completedAt).filter(Boolean) as string[];
    actualEnd = ends.length ? max(ends) : null;
  } else if (open.length > 0) {
    const dues = open.map((t) => t.dueDate).filter(Boolean) as string[];
    let base: string | null = dues.length ? max(dues) : null;
    if (overdue.length) base = max([base ?? now, now]);
    // Si el equipo viene cerrando tarde, el pronóstico arrastra ese atraso típico
    if (base && avgDelay && avgDelay > 0) base = addDays(base, Math.round(avgDelay));
    forecastEnd = base;
  }
  const endRef = actualEnd ?? forecastEnd;
  const varianceDays = plannedEnd && endRef ? diffDays(endRef, plannedEnd) : null;

  let expectedPct: number | null = null;
  if (plannedStart && plannedEnd) {
    const total = Math.max(1, diffDays(plannedEnd, plannedStart));
    expectedPct = project.status === "completado" ? 100 : Math.max(0, Math.min(100, Math.round((diffDays(now, plannedStart) / total) * 100)));
  }
  const gapPct = expectedPct === null ? null : pct - expectedPct;

  /* ---- Horas: proyectadas vs reales ---- */
  const logged = Math.round((minutes / 60) * 10) / 10;
  const budget = project.budgetHours;
  const consumedPct = budget ? Math.round((logged / budget) * 100) : null;
  const variance = budget ? Math.round((logged - budget) * 10) / 10 : null;
  let eac: number | null = null;
  if (budget) eac = project.status === "completado" || pct >= 100 ? logged : pct > 5 ? Math.round(logged / (pct / 100)) : null;
  const eacVariancePct = budget && eac !== null ? Math.round(((eac - budget) / budget) * 100) : null;

  /* ---- Hitos ---- */
  const ms = milestones;
  const slips: number[] = [];
  for (const m of ms) {
    if (m.status !== "cumplido" || !m.dueDate) continue;
    const ends = tasks.filter((t) => t.milestoneId === m.id && t.completedAt).map((t) => t.completedAt!);
    if (ends.length) slips.push(diffDays(max(ends), m.dueDate));
  }

  const ind: ProjectIndicators = {
    project, meta,
    tasks: {
      total: tasks.length, done: done.length, open: open.length, overdue: overdue.length, pct, onTimePct, avgDelayDays: avgDelay === null ? null : Math.round(avgDelay * 10) / 10,
      unassigned: open.filter((t) => !t.assigneeId).length,
      noDates: open.filter((t) => !t.milestoneId).length, // abiertas sin hito (no tienen plazo)
      urgentOverdue,
    },
    schedule: { plannedStart, plannedEnd, actualEnd, forecastEnd, varianceDays, expectedPct, realPct: pct, gapPct },
    hours: { budget, logged, consumedPct, variance, eac, eacVariancePct },
    milestones: {
      total: ms.length, met: ms.filter((m) => m.status === "cumplido").length, overdue: ms.filter((m) => isPlanOverdue(m, now)).length,
      avgSlipDays: avg(slips) === null ? null : Math.round(avg(slips)! * 10) / 10,
    },
    mode: meta?.mode ?? "planificado",
    uncertainty: uncertainty(project, meta, tasks, ctx.risks, logged),
    scope: scopeStats(ctx.baselines, ctx.changes, now),
    agile: { sprintsClosed: 0, velocityAvg: null, sprintsLeft: null, backlogHours: 0, active: null },
    health: "ok",
    critical: [],
  };
  const vel = velocity(ctx.sprints, tasks);
  const act = activeSprint(ctx.sprints);
  const bd = act ? burndown(act, tasks, now) : null;
  ind.agile = {
    sprintsClosed: vel.closed.length, velocityAvg: vel.avg, sprintsLeft: vel.sprintsLeft, backlogHours: vel.backlogHours,
    active: act && bd ? { name: act.name, endDate: act.endDate, committed: bd.startScope + bd.addedHours, remaining: bd.remainingNow, ideal: bd.idealNow } : null,
  };
  ind.critical = [
    ...criticalItems(ind, ms, now),
    ...methodCritical(project, meta, tasks, ms, ctx, ind.uncertainty, ind.scope, now).map((c) => ({ projectId: project.id, ...c })),
  ];
  ind.health = ind.critical.some((c) => c.severity === "alta") ? "bad" : ind.critical.length ? "warn" : "ok";
  return ind;
}

function criticalItems(i: ProjectIndicators, milestones: Milestone[], now: string): CriticalItem[] {
  const out: CriticalItem[] = [];
  const pid = i.project.id;
  const add = (severity: CriticalItem["severity"], text: string) => out.push({ projectId: pid, severity, text });
  const finished = i.project.status === "completado";
  const paused = i.project.status === "pausado";

  if (paused && i.tasks.open > 0) add("media", `Proyecto pausado con ${i.tasks.open} tareas abiertas`);

  if (!finished && !paused) {
    for (const m of milestones.filter((x) => isPlanOverdue(x, now)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 2)) {
      add("alta", `Hito “${m.name}” vencido hace ${diffDays(now, m.dueDate!)} d`);
    }
    if (i.schedule.plannedEnd && i.schedule.plannedEnd < now && i.tasks.open > 0 && i.project.status === "activo") {
      add("alta", `Fin previsto vencido hace ${diffDays(now, i.schedule.plannedEnd)} d con ${i.tasks.open} tareas abiertas`);
    }
    if (i.tasks.urgentOverdue > 0) add("alta", `${i.tasks.urgentOverdue} tarea${i.tasks.urgentOverdue > 1 ? "s" : ""} urgente${i.tasks.urgentOverdue > 1 ? "s" : ""} o de prioridad alta fuera de plazo (su hito o entregable ya venció)`);
  }

  const h = i.hours;
  if (h.budget && h.consumedPct !== null) {
    if (finished) {
      if (h.variance !== null && h.variance > 0) add("media", `Cerró con ${h.variance} h de sobreconsumo (${h.consumedPct}% de lo proyectado)`);
    } else if (h.consumedPct >= 100 && i.tasks.pct < 100) {
      add("alta", `Horas consumidas ${h.consumedPct}% con solo ${i.tasks.pct}% de avance`);
    } else if (h.eacVariancePct !== null && h.eacVariancePct > 15) {
      add("alta", `Al ritmo actual terminaría con ${h.eac} h (+${h.eacVariancePct}% sobre las ${h.budget} h proyectadas)`);
    } else if (h.consumedPct >= 90 && i.tasks.pct < 85) {
      add("media", `Horas consumidas ${h.consumedPct}% con ${i.tasks.pct}% de avance`);
    }
  }

  if (!finished && !paused) {
    if (i.schedule.gapPct !== null && i.schedule.gapPct <= -15) add("media", `Avance ${i.tasks.pct}% contra ${i.schedule.expectedPct}% esperado a la fecha`);
    const plainOverdue = i.tasks.overdue - i.tasks.urgentOverdue;
    if (plainOverdue > 0) add("media", `${plainOverdue} tarea${plainOverdue > 1 ? "s" : ""} fuera de plazo (su hito o entregable ya venció)`);
    if (i.tasks.unassigned > 0) add("media", `${i.tasks.unassigned} tarea${i.tasks.unassigned > 1 ? "s" : ""} abierta${i.tasks.unassigned > 1 ? "s" : ""} sin responsable`);
    if (i.tasks.noDates > 0) add("media", `${i.tasks.noDates} tarea${i.tasks.noDates > 1 ? "s" : ""} abierta${i.tasks.noDates > 1 ? "s" : ""} sin hito asignado`);
  }
  return out;
}

/* ====================================================================
 * Sobrecarga de personas
 * ==================================================================== */
export interface PersonLoad {
  user: User;
  openTasks: number;
  overdue: number;
  /** Horas estimadas de lo que vence dentro de la ventana (más lo ya vencido) */
  hours: number;
  capacity: number;
  pct: number;
  unestimated: number;
}

export function peopleLoad(users: User[], tasks: Task[], now = today(), windowDays = 14): PersonLoad[] {
  const horizon = addDays(now, windowDays);
  const out: PersonLoad[] = [];
  for (const u of users.filter((x) => x.active)) {
    const mine = tasks.filter((t) => t.assigneeId === u.id && t.status !== "hecha");
    if (mine.length === 0) continue;
    const inWindow = mine.filter((t) => t.dueDate && t.dueDate <= horizon);
    const hours = inWindow.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
    const capacity = Math.max(1, Math.round((u.weeklyHours || 40) * (windowDays / 7)));
    out.push({
      user: u, openTasks: mine.length, overdue: mine.filter((t) => isTaskOverdue(t, now)).length, hours, capacity,
      pct: Math.round((hours / capacity) * 100), unestimated: inWindow.filter((t) => t.estimateHours == null).length,
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/* ====================================================================
 * Cartera: todos los proyectos visibles, con filtros
 * ==================================================================== */
export interface PortfolioFilters {
  clientId: string;
  status: "" | "activo" | "pausado" | "completado";
  /** Filtro de tareas (p. ej. por campo personalizado); afecta solo a las métricas de tareas */
  taskFilter?: (t: Task) => boolean;
}

export interface Portfolio {
  rows: ProjectIndicators[];
  totals: {
    projects: number; active: number; late: number;
    tasks: number; done: number; overdue: number; pct: number; onTimePct: number | null; avgDelayDays: number | null;
    budget: number; logged: number; variance: number; eac: number; overBudget: number;
    avgVarianceDays: number | null; behindSchedule: number;
    overloaded: number;
    pendingChanges: number; absorbedHours: number; avgScopeGrowth: number | null; highRisks: number; lowMaturity: number;
  };
  people: PersonLoad[];
  critical: CriticalItem[];
  tasks: Task[];
}

export function portfolio(env: WorkEnv, work: WorkData, f: PortfolioFilters, now = today()): Portfolio {
  const projects = env.projects.filter((p) => {
    if (p.status === "archivado") return false;
    if (!projectPerms(env, work, p.id).canView) return false;
    if (f.clientId && p.clientId !== f.clientId) return false;
    if (f.status && p.status !== f.status) return false;
    return !!work.seeded[p.id];
  });

  const rows = projects.map((p) => {
    const ts = work.tasks.filter((t) => t.projectId === p.id && (!f.taskFilter || f.taskFilter(t)));
    const ctx: MethodContext = {
      sprints: work.sprints.filter((s) => s.projectId === p.id), changes: work.changes.filter((c) => c.projectId === p.id),
      risks: work.risks.filter((r) => r.projectId === p.id), baselines: work.baselines.filter((b) => b.projectId === p.id),
    };
    return projectIndicators(p, work.meta[p.id], ts, work.milestones.filter((m) => m.projectId === p.id), env.minutesByProject[p.id] ?? 0, now, ctx);
  });
  const tasks = rows.flatMap((r) => work.tasks.filter((t) => t.projectId === r.project.id && (!f.taskFilter || f.taskFilter(t))));

  const closed = tasks.filter((t) => t.status === "hecha" && t.dueDate && t.completedAt);
  const lateClosed = closed.filter((t) => t.completedAt! > t.dueDate!);
  const withBudget = rows.filter((r) => r.hours.budget);
  const variances = rows.map((r) => r.schedule.varianceDays).filter((v): v is number => v !== null);
  const people = peopleLoad(env.users, tasks, now);

  return {
    rows,
    totals: {
      projects: rows.length,
      active: rows.filter((r) => r.project.status === "activo").length,
      late: rows.filter((r) => isProjectLate(r.project, r.meta, work.milestones.filter((m) => m.projectId === r.project.id), now)).length,
      tasks: tasks.length,
      done: tasks.filter((t) => t.status === "hecha").length,
      overdue: tasks.filter((t) => isTaskOverdue(t, now)).length,
      pct: tasks.length ? Math.round((tasks.filter((t) => t.status === "hecha").length / tasks.length) * 100) : 0,
      onTimePct: closed.length ? Math.round(((closed.length - lateClosed.length) / closed.length) * 100) : null,
      avgDelayDays: lateClosed.length ? Math.round((lateClosed.reduce((s, t) => s + diffDays(t.completedAt!, t.dueDate!), 0) / lateClosed.length) * 10) / 10 : null,
      budget: withBudget.reduce((s, r) => s + r.hours.budget!, 0),
      logged: Math.round(withBudget.reduce((s, r) => s + r.hours.logged, 0)),
      variance: Math.round(withBudget.reduce((s, r) => s + (r.hours.variance ?? 0), 0)),
      eac: Math.round(withBudget.reduce((s, r) => s + (r.hours.eac ?? r.hours.budget!), 0)),
      overBudget: withBudget.filter((r) => (r.hours.consumedPct ?? 0) > 100 || (r.hours.eacVariancePct ?? 0) > 10).length,
      avgVarianceDays: variances.length ? Math.round((variances.reduce((a, b) => a + b, 0) / variances.length) * 10) / 10 : null,
      behindSchedule: variances.filter((v) => v > 0).length,
      overloaded: people.filter((p) => p.pct > 100).length,
      pendingChanges: rows.reduce((s, r) => s + r.scope.pending, 0),
      absorbedHours: Math.round(rows.reduce((s, r) => s + r.scope.absorbedHours, 0)),
      avgScopeGrowth: (() => {
        const g = rows.map((r) => r.scope.growthPct).filter((v): v is number => v !== null);
        return g.length ? Math.round(g.reduce((a, b) => a + b, 0) / g.length) : null;
      })(),
      highRisks: rows.reduce((s, r) => s + r.uncertainty.highRisksOpen, 0),
      lowMaturity: rows.filter((r) => r.mode === "hibrido" && r.uncertainty.maturityPct !== null && r.uncertainty.maturityPct < 40).length,
    },
    people,
    critical: rows.flatMap((r) => r.critical).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alta" ? -1 : 1)),
    tasks,
  };
}

/* ====================================================================
 * Distribución de tareas por una dimensión (estado, prioridad, campo…)
 * ==================================================================== */
export interface Bucket {
  key: string;
  label: string;
  color: string;
  total: number;
  done: number;
  overdue: number;
}

export function bucketize(tasks: Task[], groups: { key: string; label: string; color: string; has: (t: Task) => boolean }[], now = today()): Bucket[] {
  return groups.map((g) => {
    const ts = tasks.filter(g.has);
    return { key: g.key, label: g.label, color: g.color, total: ts.length, done: ts.filter((t) => t.status === "hecha").length, overdue: ts.filter((t) => isTaskOverdue(t, now)).length };
  });
}

/* ---------- Exportación ---------- */
export function indicatorsCsv(rows: ProjectIndicators[], clientName: (id: string | null) => string): string {
  const head = ["Proyecto", "Cliente", "Estado", "Fin planificado", "Fin real / pronosticado", "Desvío (días)", "Horas proyectadas", "Horas reales", "Desvío de horas", "Horas finales estimadas", "Avance real %", "Avance esperado %", "Tareas", "Hechas", "Atrasadas", "A tiempo %", "Hitos cumplidos", "Hitos totales", "Modo", "Alcance original (h)", "Alcance actual (h)", "Crecimiento %", "Cambios aprobados", "Cambios pendientes", "Horas absorbidas", "Riesgos altos", "Madurez %", "Salud"];
  const lines = rows.map((r) => [
    r.project.name, clientName(r.project.clientId), r.project.status, r.schedule.plannedEnd ?? "", r.schedule.actualEnd ?? r.schedule.forecastEnd ?? "",
    r.schedule.varianceDays ?? "", r.hours.budget ?? "", r.hours.logged, r.hours.variance ?? "", r.hours.eac ?? "", r.schedule.realPct, r.schedule.expectedPct ?? "",
    r.tasks.total, r.tasks.done, r.tasks.overdue, r.tasks.onTimePct ?? "", r.milestones.met, r.milestones.total,
    r.mode, r.scope.baselineHours ?? "", r.scope.currentHours ?? "", r.scope.growthPct ?? "", r.scope.approved, r.scope.pending, r.scope.absorbedHours, r.uncertainty.highRisksOpen, r.uncertainty.maturityPct ?? "", r.health === "ok" ? "Bien" : r.health === "warn" ? "Atención" : "Crítico",
  ]);
  return [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
