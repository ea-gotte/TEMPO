import { useSyncExternalStore } from "react";
import type { Project } from "../types";
import { addDays, today, uid } from "../utils";
import { DEFAULT_ROLES } from "./constants";
import { defaultMilestone, normalizeTask } from "./logic";
import { backlogOf, nextSprintDates, sumHours } from "./agile";
import { OPTION_COLORS, hasOptions } from "./fields";
import { seedMethod } from "./seedMode";
import { seedMeetings } from "./meetings";
import type { Baseline, ChangeRequest, Deliverable, Meeting, FieldDef, FieldType, Milestone, PlanStatus, ProjectMeta, Risk, Sprint, Task, TaskPriority, TaskStatus, WorkData } from "./types";

/**
 * Almacén de la DEMO de gestión de proyectos: vive en este navegador
 * (localStorage) y NO toca Supabase. Es un store externo mínimo
 * (useSyncExternalStore) para que cualquier vista —la ficha, el panorama— lea
 * la misma fuente. Para pasar a producción se reemplaza este archivo por uno
 * que lea/escriba tablas de Supabase con la misma interfaz.
 */

const KEY = "tempo-gestion-proyectos-demo-v11";

const opt = (id: string, label: string, i: number) => ({ id, label, color: OPTION_COLORS[i % OPTION_COLORS.length] });

/** Campos globales de ejemplo: viven en todos los proyectos y se pueden filtrar desde el panel general. */
const DEFAULT_FIELDS: FieldDef[] = [
  {
    id: "f_fase", projectId: null, name: "Fase", type: "seleccion", sortOrder: 0,
    options: [opt("fase_anteproyecto", "Anteproyecto", 0), opt("fase_diseno", "Diseño", 1), opt("fase_modelado", "Modelado", 2), opt("fase_coordinacion", "Coordinación", 4), opt("fase_documentacion", "Documentación", 5), opt("fase_cierre", "Cierre", 3)],
  },
  {
    id: "f_disciplina", projectId: null, name: "Disciplina", type: "seleccion", sortOrder: 1,
    options: [opt("disc_estructuras", "Estructuras", 0), opt("disc_instalaciones", "Instalaciones", 1), opt("disc_arquitectura", "Arquitectura", 2), opt("disc_gestion", "Gestión BIM", 4)],
  },
  { id: "f_aprobacion", projectId: null, name: "Requiere aprobación del cliente", type: "casilla", sortOrder: 2, options: [] },
];

function empty(): WorkData {
  return { meetings: [], sprints: [], changes: [], risks: [], baselines: [], fields: DEFAULT_FIELDS, roles: DEFAULT_ROLES, assignments: [], meta: {}, milestones: [], deliverables: [], tasks: [], seeded: {} };
}

/** Campos nuevos de una tarea con su valor por defecto. */
const TASK_DEFAULTS = {
  kind: "tarea" as const, estimateHours: null as number | null, estimateMin: null as number | null, estimateMax: null as number | null,
  confidence: null as Task["confidence"], sprintId: null as string | null, sprintAddedAt: null as string | null, rank: 0, changeRequestId: null as string | null,
  archived: false, archivedAt: null as string | null, custom: {} as Task["custom"],
};
type DefaultKeys = keyof typeof TASK_DEFAULTS;
type NewTask = Omit<Task, "id" | "sortOrder" | "createdAt" | "completedAt" | DefaultKeys> & Partial<Pick<Task, DefaultKeys>>;
const nextRank = (projectId: string) => {
  const ranks = data.tasks.filter((t) => t.projectId === projectId).map((t) => t.rank);
  return (ranks.length ? Math.max(...ranks) : 0) + 10;
};

/** Al pasar a “Hecha” se registra la fecha real de cierre; al reabrir, se borra (y se desarchiva). */
function withCompletion(prev: Task | null, next: Task): Task {
  if (next.status === "hecha") return { ...next, completedAt: next.completedAt ?? (prev?.status === "hecha" ? prev.completedAt : null) ?? today() };
  return { ...next, completedAt: null, archived: false, archivedAt: null };
}

function load(): WorkData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<WorkData>) };
  } catch {
    /* se usa el estado vacío */
  }
  return empty();
}

let data: WorkData = load();
const listeners = new Set<() => void>();

function commit(next: WorkData) {
  data = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* cuota llena o modo privado: la demo sigue andando en memoria */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useWork(): WorkData {
  return useSyncExternalStore(subscribe, () => data, () => data);
}

const bySort = (a: Task, b: Task) => a.sortOrder - b.sortOrder;

/**
 * Fechas reales de hitos y entregables: al pasar a En curso se registra el inicio
 * real y al pasar a Cumplido el fin real (hoy), salvo que se hayan cargado a mano;
 * si se reabre, se borra el fin real.
 */
function withActuals<T extends { status: PlanStatus; actualStart?: string | null; actualEnd?: string | null }>(prev: T, patch: Partial<T>): T {
  const next = { ...prev, ...patch };
  if (patch.status === undefined || patch.status === prev.status) return next;
  const now = today();
  if (next.status !== "pendiente" && !("actualStart" in patch) && !next.actualStart) next.actualStart = now;
  if (next.status === "cumplido" && !("actualEnd" in patch) && !next.actualEnd) next.actualEnd = now;
  if (next.status !== "cumplido" && !("actualEnd" in patch)) next.actualEnd = null;
  if (next.status === "pendiente" && !("actualStart" in patch)) next.actualStart = null;
  return next;
}

export const workActions = {
  /* ---------- Tareas ---------- */
  addTask(input: NewTask): Task {
    const col = data.tasks.filter((t) => t.projectId === input.projectId && t.status === input.status);
    // Toda tarea cuelga de un hito: si nadie eligió uno (ni un entregable), va al próximo hito sin cumplir
    const milestoneId = input.milestoneId ?? (input.deliverableId ? null : defaultMilestone(data.milestones, input.projectId)?.id ?? null);
    const task = withCompletion(
      null,
      normalizeTask(
        { ...TASK_DEFAULTS, rank: nextRank(input.projectId), ...input, milestoneId, id: uid(), completedAt: null, sortOrder: col.length ? Math.max(...col.map((t) => t.sortOrder)) + 10 : 0, createdAt: new Date().toISOString() },
        data.deliverables, data.milestones,
      ),
    );
    commit({ ...data, tasks: [...data.tasks, task] });
    return task;
  },
  updateTask(id: string, patch: Partial<Task>) {
    commit({ ...data, tasks: data.tasks.map((t) => (t.id === id ? withCompletion(t, normalizeTask({ ...t, ...patch }, data.deliverables, data.milestones)) : t)) });
  },
  deleteTask(id: string) {
    commit({ ...data, tasks: data.tasks.filter((t) => t.id !== id) });
  },
  /** Archiva (o restaura) tareas. Solo se archivan las ya finalizadas; siguen contando en avance e indicadores. */
  archiveTasks(ids: string[], archived: boolean) {
    const set = new Set(ids);
    const now = today();
    commit({
      ...data,
      tasks: data.tasks.map((t) => (set.has(t.id) && (!archived || t.status === "hecha") ? { ...t, archived, archivedAt: archived ? now : null } : t)),
    });
  },
  /** Mueve una tarea a otra columna del Kanban (o la reordena dentro de la misma), antes de `beforeId`. */
  moveTask(id: string, status: TaskStatus, beforeId: string | null) {
    const t = data.tasks.find((x) => x.id === id);
    if (!t) return;
    const col = data.tasks.filter((x) => x.projectId === t.projectId && x.status === status && x.id !== id).sort(bySort);
    const at = beforeId ? col.findIndex((x) => x.id === beforeId) : -1;
    col.splice(at < 0 ? col.length : at, 0, { ...t, status });
    const order = new Map(col.map((x, i) => [x.id, i * 10]));
    commit({
      ...data,
      tasks: data.tasks.map((x) => (order.has(x.id) ? (x.id === id ? withCompletion(x, { ...x, status, sortOrder: order.get(x.id)! }) : { ...x, sortOrder: order.get(x.id)! }) : x)),
    });
  },

  /* ---------- Hitos ---------- */
  addMilestone(input: Omit<Milestone, "id">): Milestone {
    const m = { ...input, id: uid() };
    commit({ ...data, milestones: [...data.milestones, m] });
    return m;
  },
  updateMilestone(id: string, patch: Partial<Milestone>) {
    const milestones = data.milestones.map((m) => (m.id === id ? withActuals(m, patch) : m));
    // La fecha de las tareas sale de su hito o entregable: si cambia, se recalcula.
    commit({ ...data, milestones, tasks: data.tasks.map((t) => normalizeTask(t, data.deliverables, milestones)) });
  },
  deleteMilestone(id: string) {
    const deliverables = data.deliverables.map((d) => ({ ...d, milestoneId: d.milestoneId === id ? null : d.milestoneId, dependsOn: d.dependsOn?.filter((x) => x !== id) }));
    const milestones = data.milestones.filter((m) => m.id !== id).map((m) => ({ ...m, dependsOn: m.dependsOn?.filter((x) => x !== id) }));
    commit({
      ...data,
      milestones,
      deliverables,
      tasks: data.tasks.map((t) => normalizeTask(t.milestoneId === id ? { ...t, milestoneId: null } : t, deliverables, milestones)),
    });
  },

  /* ---------- Entregables ---------- */
  addDeliverable(input: Omit<Deliverable, "id">): Deliverable {
    const d = { ...input, id: uid() };
    commit({ ...data, deliverables: [...data.deliverables, d] });
    return d;
  },
  updateDeliverable(id: string, patch: Partial<Deliverable>) {
    const deliverables = data.deliverables.map((d) => (d.id === id ? withActuals(d, patch) : d));
    commit({ ...data, deliverables, tasks: data.tasks.map((t) => normalizeTask(t, deliverables, data.milestones)) });
  },
  deleteDeliverable(id: string) {
    const rest = data.deliverables.filter((d) => d.id !== id).map((d) => ({ ...d, dependsOn: d.dependsOn?.filter((x) => x !== id) }));
    commit({
      ...data,
      deliverables: rest,
      milestones: data.milestones.map((m) => ({ ...m, dependsOn: m.dependsOn?.filter((x) => x !== id) })),
      tasks: data.tasks.map((t) => normalizeTask(t.deliverableId === id ? { ...t, deliverableId: null } : t, rest, data.milestones)),
    });
  },

  /* ---------- Ficha y roles ---------- */
  setMeta(projectId: string, patch: Partial<ProjectMeta>) {
    const cur = data.meta[projectId] ?? { projectId, code: "", startDate: null, endDate: null, description: "", notes: "", sharepointUrl: "", accUrl: "", mode: "planificado" as const, sprintWeeks: 2 as const, contingencyPct: 10, discoveryHours: null, discoveryEnd: null };
    commit({ ...data, meta: { ...data.meta, [projectId]: { ...cur, ...patch } } });
  },
  assignRole(projectId: string, userId: string, roleKey: string) {
    if (data.assignments.some((a) => a.projectId === projectId && a.userId === userId && a.roleKey === roleKey)) return;
    commit({ ...data, assignments: [...data.assignments, { id: uid(), projectId, userId, roleKey }] });
  },
  unassignRole(id: string) {
    commit({ ...data, assignments: data.assignments.filter((a) => a.id !== id) });
  },
  addRole(label: string, opts: { manage: boolean; approve: boolean; responsibilities?: string[] } = { manage: false, approve: false }) {
    const key = label.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key || data.roles.some((r) => r.key === key)) return;
    commit({ ...data, roles: [...data.roles, { key, label: label.trim(), active: true, manage: opts.manage, approve: opts.approve || false, required: false, responsibilities: opts.responsibilities ?? [] }] });
  },

  /* ---------- Backlog y sprints ---------- */
  /** Reordena el backlog: mueve `id` antes de `beforeId` (o al final). */
  moveInBacklog(projectId: string, id: string, beforeId: string | null) {
    const list = backlogOf(data.tasks.filter((t) => t.projectId === projectId)).filter((t) => t.id !== id);
    const moved = data.tasks.find((t) => t.id === id);
    if (!moved) return;
    const at = beforeId ? list.findIndex((t) => t.id === beforeId) : -1;
    list.splice(at < 0 ? list.length : at, 0, moved);
    const order = new Map(list.map((t, i) => [t.id, i * 10]));
    commit({ ...data, tasks: data.tasks.map((t) => (order.has(t.id) ? { ...t, rank: order.get(t.id)! } : t)) });
  },
  addSprint(projectId: string, weeks: number, goal = ""): Sprint {
    const mine = data.sprints.filter((s) => s.projectId === projectId);
    const n = mine.length ? Math.max(...mine.map((s) => s.number)) + 1 : 1;
    const dates = nextSprintDates(mine, weeks);
    const sp: Sprint = {
      id: uid(), projectId, number: n, name: `Sprint ${n}`, goal, ...dates, status: "planificado", focusPct: 70,
      committedHours: null, capacityHours: null, completedHours: null, reviewNotes: "", retroNotes: "",
    };
    commit({ ...data, sprints: [...data.sprints, sp] });
    return sp;
  },
  updateSprint(id: string, patch: Partial<Sprint>) {
    commit({ ...data, sprints: data.sprints.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },
  deleteSprint(id: string) {
    commit({
      ...data,
      sprints: data.sprints.filter((s) => s.id !== id),
      tasks: data.tasks.map((t) => (t.sprintId === id ? { ...t, sprintId: null, sprintAddedAt: null } : t)),
    });
  },
  /** Asigna una tarea a un sprint (o la devuelve al backlog con null). Si el sprint ya está en marcha, queda registrada como alcance agregado. */
  assignToSprint(taskId: string, sprintId: string | null) {
    const sp = sprintId ? data.sprints.find((s) => s.id === sprintId) : null;
    commit({
      ...data,
      tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, sprintId, sprintAddedAt: sp && sp.status === "activo" ? today() : null } : t)),
    });
  },
  startSprint(id: string, capacityHours: number) {
    const sp = data.sprints.find((s) => s.id === id);
    if (!sp || data.sprints.some((s) => s.projectId === sp.projectId && s.status === "activo")) return;
    const committed = sumHours(data.tasks.filter((t) => t.sprintId === id));
    commit({ ...data, sprints: data.sprints.map((s) => (s.id === id ? { ...s, status: "activo", committedHours: committed, capacityHours } : s)) });
  },
  /** Cierra el sprint: guarda lo completado (velocidad) y manda lo inconcluso al backlog o al sprint indicado. */
  closeSprint(id: string, opts: { moveTo: string | null; reviewNotes: string; retroNotes: string }) {
    const sp = data.sprints.find((s) => s.id === id);
    if (!sp) return;
    const completed = sumHours(data.tasks.filter((t) => t.sprintId === id && t.status === "hecha"));
    commit({
      ...data,
      sprints: data.sprints.map((s) => (s.id === id ? { ...s, status: "cerrado", completedHours: completed, reviewNotes: opts.reviewNotes, retroNotes: opts.retroNotes } : s)),
      tasks: data.tasks.map((t) => (t.sprintId === id && t.status !== "hecha" ? { ...t, sprintId: opts.moveTo, sprintAddedAt: null } : t)),
    });
  },

  /* ---------- Reuniones ---------- */
  addMeeting(input: Omit<Meeting, "id" | "createdAt">): Meeting {
    const m: Meeting = { ...input, id: uid(), createdAt: new Date().toISOString() };
    commit({ ...data, meetings: [...data.meetings, m] });
    return m;
  },
  updateMeeting(id: string, patch: Partial<Meeting>) {
    commit({ ...data, meetings: data.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  },
  deleteMeeting(id: string) {
    commit({ ...data, meetings: data.meetings.filter((m) => m.id !== id) });
  },

  /* ---------- Cambios del cliente ---------- */
  addChange(input: { projectId: string; title: string; description: string; requestedBy: string; registeredBy: string | null; urgent: boolean; impactHours: number | null; impactDays: number | null }): ChangeRequest {
    const ch: ChangeRequest = { ...input, id: uid(), createdAt: today(), status: "pendiente", decidedBy: null, decidedAt: null, decisionNote: "", taskId: null, duringSprint: false };
    commit({ ...data, changes: [...data.changes, ch] });
    return ch;
  },
  /**
   * Decide una solicitud. Al aprobar (precio cerrado: no se factura aparte):
   * crea el ítem en el backlog o en un sprint, y registra una nueva línea base
   * con el alcance y la fecha de fin actualizados.
   */
  decideChange(id: string, d: { decision: "aprobado" | "diferido" | "rechazado"; note: string; by: string | null; destination?: "backlog" | "proximo" | "activo"; swapOut?: string[]; impactHours?: number | null; impactDays?: number | null }) {
    const ch = data.changes.find((c) => c.id === id);
    if (!ch) return;
    const now = today();
    const impactHours = d.impactHours !== undefined ? d.impactHours : ch.impactHours;
    const impactDays = d.impactDays !== undefined ? d.impactDays : ch.impactDays;
    const upd: ChangeRequest = { ...ch, status: d.decision, decisionNote: d.note, decidedBy: d.by, decidedAt: now, impactHours, impactDays };
    if (d.decision !== "aprobado") {
      commit({ ...data, changes: data.changes.map((c) => (c.id === id ? upd : c)) });
      return;
    }
    const sprints = data.sprints.filter((s) => s.projectId === ch.projectId);
    const act = sprints.find((s) => s.status === "activo");
    const planned = sprints.filter((s) => s.status === "planificado").sort((a, b) => a.number - b.number)[0];
    const target = d.destination === "activo" ? act : d.destination === "proximo" ? planned : undefined;
    upd.duringSprint = !!act;
    const mine = data.tasks.filter((t) => t.projectId === ch.projectId);
    const prevEnd = [...data.baselines.filter((b) => b.projectId === ch.projectId)].sort((a, b) => b.version - a.version)[0]?.endDate ?? data.meta[ch.projectId]?.endDate ?? null;
    const newEnd = prevEnd && impactDays ? addDays(prevEnd, impactDays) : prevEnd;
    const task: Task = normalizeTask({
      ...TASK_DEFAULTS, id: uid(), projectId: ch.projectId, milestoneId: defaultMilestone(data.milestones, ch.projectId)?.id ?? null, deliverableId: null, name: `Cambio: ${ch.title}`, description: ch.description,
      assigneeId: null, status: "pendiente", priority: ch.urgent ? "alta" : "media", startDate: null, dueDate: newEnd, kind: "cambio", estimateHours: impactHours,
      confidence: "media", completedAt: null, custom: {}, sprintId: target?.id ?? null, sprintAddedAt: target && target.status === "activo" ? now : null,
      rank: (mine.length ? Math.min(...mine.map((t) => t.rank)) : 0) - 10, changeRequestId: id, sortOrder: 900, createdBy: d.by, createdAt: new Date().toISOString(),
    }, data.deliverables, data.milestones);
    upd.taskId = task.id;
    const out = new Set(d.swapOut ?? []);
    const bl = data.baselines.filter((b) => b.projectId === ch.projectId).sort((a, b) => a.version - b.version);
    const meta = data.meta[ch.projectId];
    const baselines: Baseline[] = [];
    let last = bl[bl.length - 1];
    if (!last) {
      last = { id: uid(), projectId: ch.projectId, version: 1, date: now, scopeHours: sumHours(mine), endDate: meta?.endDate ?? null, reason: "Plan original", changeRequestId: null };
      baselines.push(last);
    }
    const endDate = last.endDate && impactDays ? addDays(last.endDate, impactDays) : last.endDate;
    baselines.push({
      id: uid(), projectId: ch.projectId, version: last.version + 1, date: now, scopeHours: Math.round((last.scopeHours + (impactHours ?? 0)) * 10) / 10,
      endDate, reason: `Cambio aprobado: ${ch.title}`, changeRequestId: id,
    });
    commit({
      ...data,
      changes: data.changes.map((c) => (c.id === id ? upd : c)),
      tasks: [...data.tasks.map((t) => (out.has(t.id) ? { ...t, sprintId: null, sprintAddedAt: null } : t)), task],
      baselines: [...data.baselines, ...baselines],
      meta: meta && endDate ? { ...data.meta, [ch.projectId]: { ...meta, endDate } } : data.meta,
    });
  },

  /* ---------- Riesgos ---------- */
  addRisk(input: Omit<Risk, "id">): Risk {
    const r = { ...input, id: uid() };
    commit({ ...data, risks: [...data.risks, r] });
    return r;
  },
  updateRisk(id: string, patch: Partial<Risk>) {
    commit({ ...data, risks: data.risks.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  },
  deleteRisk(id: string) {
    commit({ ...data, risks: data.risks.filter((r) => r.id !== id) });
  },

  /* ---------- Campos personalizados ---------- */
  addField(input: { projectId: string | null; name: string; type: FieldType; options?: { label: string }[] }): FieldDef {
    const f: FieldDef = {
      id: "f_" + uid(), projectId: input.projectId, name: input.name.trim(), type: input.type, sortOrder: data.fields.length,
      options: hasOptions(input.type) ? (input.options ?? []).map((o, i) => ({ id: uid(), label: o.label.trim(), color: OPTION_COLORS[i % OPTION_COLORS.length] })) : [],
    };
    commit({ ...data, fields: [...data.fields, f] });
    return f;
  },
  updateField(id: string, patch: Partial<Pick<FieldDef, "name" | "options">>) {
    const cur = data.fields.find((f) => f.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    let tasks = data.tasks;
    if (patch.options) {
      // Si se quitó una opción, se limpia de las tareas que la tenían
      const alive = new Set(patch.options.map((o) => o.id));
      const removed = cur.options.filter((o) => !alive.has(o.id)).map((o) => o.id);
      if (removed.length) {
        tasks = tasks.map((t) => {
          const v = t.custom[id];
          if (cur.type === "seleccion" && typeof v === "string" && removed.includes(v)) return { ...t, custom: { ...t.custom, [id]: null } };
          if (cur.type === "multiple" && Array.isArray(v) && v.some((x) => removed.includes(x))) return { ...t, custom: { ...t.custom, [id]: v.filter((x) => !removed.includes(x)) } };
          return t;
        });
      }
    }
    commit({ ...data, fields: data.fields.map((f) => (f.id === id ? next : f)), tasks });
  },
  deleteField(id: string) {
    commit({
      ...data,
      fields: data.fields.filter((f) => f.id !== id),
      tasks: data.tasks.map((t) => {
        if (!(id in t.custom)) return t;
        const rest = { ...t.custom };
        delete rest[id];
        return { ...t, custom: rest };
      }),
    });
  },

  /* ---------- Demo ---------- */
  resetDemo() {
    commit(empty());
  },

  /** Carga datos de ejemplo para un proyecto (una sola vez por proyecto). */
  ensureSeed(project: Project, index: number) {
    if (data.seeded[project.id]) return;
    commit(seedProject(data, project, index));
  },
};

/* ================================================================
 * Datos de ejemplo: relativos a hoy, así siempre hay atrasos y próximos
 * vencimientos para mostrar. Cada tercer proyecto es el "atrasado".
 * ================================================================ */

interface TaskTpl {
  name: string;
  desc: string;
  /** Campos personalizados de ejemplo y horas estimadas */
  fase: string;
  disc: string;
  h: number;
  appr: boolean;
  ms: 0 | 1 | 2 | null;
  del: 0 | 1 | 2 | 3 | 4 | null;
  start: number;
  due: number;
  prio: TaskPriority;
}

const TASKS: TaskTpl[] = [
  { name: "Relevar documentación existente", fase: "fase_anteproyecto", disc: "disc_gestion", h: 12, appr: false, desc: "Reunir planos, memorias y antecedentes del cliente.", ms: 0, del: 0, start: -50, due: -42, prio: "media" },
  { name: "Reunión de arranque con el cliente", fase: "fase_anteproyecto", disc: "disc_gestion", h: 3, appr: true, desc: "Alcance, contactos, canales y calendario de entregas.", ms: 0, del: null, start: -48, due: -47, prio: "alta" },
  { name: "Redactar informe de relevamiento", fase: "fase_anteproyecto", disc: "disc_gestion", h: 8, appr: true, desc: "Conclusiones del relevamiento y puntos a validar.", ms: 0, del: 0, start: -44, due: -35, prio: "media" },
  { name: "Modelar estructura principal", fase: "fase_modelado", disc: "disc_estructuras", h: 36, appr: false, desc: "Modelo base de estructura con nivel de detalle acordado.", ms: 1, del: 1, start: -34, due: -12, prio: "alta" },
  { name: "Modelar instalaciones", fase: "fase_modelado", disc: "disc_instalaciones", h: 28, appr: false, desc: "Instalaciones sanitarias, eléctricas y climatización.", ms: 1, del: 1, start: -28, due: -5, prio: "media" },
  { name: "Detección de interferencias", fase: "fase_coordinacion", disc: "disc_gestion", h: 12, appr: false, desc: "Corrida de clash detection y lista de conflictos.", ms: 1, del: 1, start: -8, due: 4, prio: "urgente" },
  { name: "Emitir planos para revisión", fase: "fase_documentacion", disc: "disc_arquitectura", h: 14, appr: true, desc: "Planos de coordinación en PDF y DWG.", ms: 1, del: 2, start: -4, due: 6, prio: "alta" },
  { name: "Revisar comentarios del cliente", fase: "fase_coordinacion", disc: "disc_arquitectura", h: 8, appr: false, desc: "Consolidar observaciones y responder una por una.", ms: 1, del: 2, start: 4, due: 12, prio: "media" },
  { name: "Control de calidad del modelo", fase: "fase_coordinacion", disc: "disc_gestion", h: 5, appr: false, desc: "Checklist de calidad antes de cada emisión.", ms: 1, del: null, start: -3, due: 2, prio: "media" },
  { name: "Redactar memoria técnica", fase: "fase_documentacion", disc: "disc_estructuras", h: 20, appr: true, desc: "Memoria descriptiva y de cálculo.", ms: 2, del: 3, start: 8, due: 24, prio: "alta" },
  { name: "Actualizar cronograma y riesgos", fase: "fase_diseno", disc: "disc_gestion", h: 3, appr: false, desc: "Revisión semanal del cronograma y matriz de riesgos.", ms: 1, del: null, start: -10, due: 3, prio: "baja" },
  { name: "Preparar presentación de avance", fase: "fase_coordinacion", disc: "disc_gestion", h: 4, appr: false, desc: "Resumen ejecutivo para el comité del cliente.", ms: 1, del: null, start: 1, due: 5, prio: "media" },
  { name: "Compilar documentación final", fase: "fase_cierre", disc: "disc_gestion", h: 12, appr: true, desc: "Entregable final ordenado según el pliego.", ms: 2, del: 4, start: 20, due: 34, prio: "media" },
  { name: "Cierre y lecciones aprendidas", fase: "fase_cierre", disc: "disc_gestion", h: 3, appr: false, desc: "Reunión de cierre y registro de lecciones aprendidas.", ms: 2, del: null, start: 30, due: 36, prio: "baja" },
];

const MILESTONES = [
  { name: "Kick-off y relevamiento", desc: "Arranque formal y base de información validada.", due: -35 },
  { name: "Entrega de anteproyecto", desc: "Modelo coordinado y planos para revisión del cliente.", due: 12 },
  { name: "Entrega final", desc: "Memoria técnica y documentación completa.", due: 36 },
];

const DELIVERABLES = [
  { name: "Informe de relevamiento", ms: 0, due: -35 },
  { name: "Modelo base coordinado", ms: 1, due: 4 },
  { name: "Planos para revisión", ms: 1, due: 8 },
  { name: "Memoria técnica", ms: 2, due: 24 },
  { name: "Documentación final", ms: 2, due: 34 },
] as const;

function seedProject(cur: WorkData, project: Project, index: number): WorkData {
  const now = today();
  const mem = project.memberIds;
  const pick = (i: number) => (mem.length ? mem[i % mem.length] : null);
  // El Project Manager no modela: las tareas de ejemplo se reparten entre el resto del equipo
  const doers = mem.filter((id) => id !== pick(0));
  const doer = (i: number) => (doers.length ? doers[i % doers.length] : pick(i));
  const variant = index % 3; // 0 = en término, 1 = atrasado, 2 = recién arrancando
  const allDone = project.status === "completado";
  const shift = allDone ? -50 : variant === 1 ? -30 : variant === 2 ? 6 : 0;
  const off = (n: number) => addDays(now, n + shift);

  const milestones: Milestone[] = MILESTONES.map((m, i) => ({
    id: uid(), projectId: project.id, name: m.name, description: m.desc,
    ownerId: pick(i === 1 ? 2 : 0), dueDate: off(m.due), status: "pendiente",
    // Cada hito arranca cuando termina el anterior (el primero, con el proyecto)
    startDate: i === 0 ? off(m.due - 40) : off(MILESTONES[i - 1].due + 1),
  }));

  const deliverables: Deliverable[] = DELIVERABLES.map((d, i) => ({
    id: uid(), projectId: project.id, milestoneId: milestones[d.ms].id, name: d.name, description: "",
    ownerId: pick(i + 1), dueDate: off(d.due), status: "pendiente",
    // El plazo de un entregable: sus últimas semanas dentro del hito
    startDate: (() => {
      const ms = MILESTONES[d.ms];
      const msStart = d.ms === 0 ? ms.due - 40 : MILESTONES[d.ms - 1].due + 1;
      // Empieza cuando termina el entregable anterior (dependencia fin → inicio)
      const afterPrev = i > 0 ? DELIVERABLES[i - 1].due + 1 : msStart;
      return off(Math.min(d.due, Math.max(msStart, d.due - 18, afterPrev)));
    })(),
  }));


  // Ejemplo de campo propio de UN proyecto (el primero): cantidad de planos afectados
  const planField: FieldDef | null =
    index === 0 ? { id: "pf_" + project.id + "_planos", projectId: project.id, name: "Planos afectados", type: "numero", options: [], sortOrder: 50 } : null;

  const tasks: Task[] = TASKS.map((t, i) => {
    const start = addDays(now, t.start + shift);
    const due = addDays(now, t.due + shift);
    let status: TaskStatus;
    if (allDone) status = "hecha";
    else if (due < addDays(now, -2)) status = variant === 1 && i >= 3 && i % 3 !== 0 ? (i % 2 ? "en_curso" : "en_revision") : "hecha";
    else if (start <= now) status = i % 3 === 0 ? "en_revision" : "en_curso";
    else status = "pendiente";
    // Cierre real: casi siempre cerca de lo planificado; los proyectos atrasados cierran tarde
    const slip = [0, -1, 2, -2, 1, 0, 3, -1, 0, 2, -1, 1, 0, 2][(i + index) % 14] + (variant === 1 ? 4 : 0);
    const closeAt = addDays(due, slip);
    const completedAt = status === "hecha" ? (closeAt > now ? now : closeAt) : null;
    const custom: Task["custom"] = { f_fase: t.fase, f_disciplina: t.disc, f_aprobacion: t.appr };
    if (planField && t.fase === "fase_documentacion") custom[planField.id] = 4 + ((i + index) % 7);
    return {
      id: uid(), projectId: project.id,
      milestoneId: t.ms === null ? null : milestones[t.ms].id,
      deliverableId: t.del === null ? null : deliverables[t.del].id,
      name: t.name, description: t.desc, assigneeId: doer(i + index), status, priority: t.prio,
      startDate: start, dueDate: due, ...TASK_DEFAULTS, estimateHours: t.h, completedAt, custom,
      rank: i * 10, sortOrder: i * 10, createdBy: pick(0), createdAt: new Date().toISOString(),
    };
  });

  // Estado de entregables e hitos derivado de sus tareas (coherente con lo que se ve en el tablero)
  const planOf = (ts: Task[], due: string | null): PlanStatus => {
    if (allDone || (ts.length > 0 && ts.every((t) => t.status === "hecha"))) return "cumplido";
    if (ts.some((t) => t.status !== "pendiente")) return "en_curso";
    return due && due < now ? "en_curso" : "pendiente";
  };
  for (const d of deliverables) d.status = planOf(tasks.filter((t) => t.deliverableId === d.id), d.dueDate);
  for (const m of milestones) {
    const ts = tasks.filter((t) => t.milestoneId === m.id);
    m.status = planOf(ts, m.dueDate);
  }
  // Fechas reales: lo cumplido cerró cuando se cerró su última tarea; lo que está en curso ya empezó
  for (const x of [...deliverables, ...milestones]) {
    const ts = tasks.filter((t) => ("milestoneId" in x ? t.deliverableId : t.milestoneId) === x.id);
    if (x.status === "pendiente") continue;
    // Solo empezó de verdad si lo que lo precede ya terminó (si no, queda esperando y el atraso lo corre)
    const preds = (x.dependsOn ?? []).map((id) => [...deliverables, ...milestones].find((o) => o.id === id));
    const predsDone = preds.every((p) => !p || p.status === "cumplido");
    if (x.startDate && x.startDate <= now && predsDone) x.actualStart = x.startDate;
    else if (x.status === "cumplido") x.actualStart = x.startDate ?? null;
    if (x.status === "cumplido") {
      const ends = ts.map((t) => t.completedAt).filter(Boolean) as string[];
      const last = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : x.dueDate;
      x.actualEnd = last && last > now ? now : last;
    }
  }

  // Plan del proyecto (inicio y fin previstos) según su situación
  const [planStart, planEnd] = allDone ? [-110, -14] : variant === 1 ? [-82, 8] : variant === 2 ? [-45, 44] : [-40, 40];
  const code = `PRY-${String(index + 1).padStart(3, "0")}`;
  const meta: ProjectMeta = {
    projectId: project.id, code, startDate: addDays(now, planStart), endDate: addDays(now, planEnd),
    description: "Proyecto de ingeniería y coordinación BIM. Alcance, hitos y entregables definidos con el cliente en la reunión de arranque.",
    notes: "Datos de ejemplo de la demo: se guardan solo en este navegador.",
    sharepointUrl: "https://quantia.sharepoint.com/sites/proyectos/" + code.toLowerCase(),
    accUrl: index % 2 === 0 ? "https://acc.autodesk.com/docs/files/projects/" + code.toLowerCase() : "",
    mode: "planificado", sprintWeeks: 2, contingencyPct: 10, discoveryHours: null, discoveryEnd: null,
  };
  const seeded = seedMethod({ project, index, now, allDone, tasks, milestones, meta, pick });

  // Los tres roles imprescindibles; el líder funcional de área solo en algunos proyectos (es opcional)
  const lead = pick(0), tech = pick(2) ?? pick(0), coord = pick(1) ?? pick(0);
  // Modeladores: quienes ejecutan las tareas (si el equipo es chico, también lo hacen el coordinador y el líder técnico)
  const onlyModelers = doers.filter((id) => id !== tech && id !== coord);
  const modelers = onlyModelers.length ? onlyModelers : doers;
  const roleUsers: [string, string | null][] = [
    ["lider_proyecto", lead],
    ["lider_tecnico", tech],
    ["coordinador", coord],
    ...modelers.map((id) => ["modelador", id] as [string, string | null]),
  ];
  const assignments = roleUsers.flatMap(([roleKey, userId]) => (userId ? [{ id: uid(), projectId: project.id, userId, roleKey }] : []));

  // La tarea no tiene fechas propias: hereda las de su entregable u hito. Y las ya cerradas hace tiempo se archivan.
  const finalTasks = seeded.tasks.map((t) => {
    const n = normalizeTask(t, deliverables, seeded.milestones);
    return n.status === "hecha" && n.completedAt && n.completedAt < addDays(now, -21) ? { ...n, archived: true, archivedAt: addDays(n.completedAt, 3) } : n;
  });

  return {
    ...cur,
    fields: planField ? [...cur.fields, planField] : cur.fields,
    meta: { ...cur.meta, [project.id]: seeded.meta },
    milestones: [...cur.milestones, ...seeded.milestones],
    deliverables: [...cur.deliverables, ...deliverables],
    tasks: [...cur.tasks, ...finalTasks],
    sprints: [...cur.sprints, ...seeded.sprints],
    changes: [...cur.changes, ...seeded.changes],
    risks: [...cur.risks, ...seeded.risks],
    baselines: [...cur.baselines, ...seeded.baselines],
    assignments: [...cur.assignments, ...assignments],
    meetings: [...(cur.meetings ?? []), ...seedMeetings(project, pick, now, allDone, seeded.meta.startDate)],
    seeded: { ...cur.seeded, [project.id]: true },
  };
}
