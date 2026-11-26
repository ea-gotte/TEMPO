import type { Project, User } from "../types";
import { today } from "../utils";
import type { Deliverable, Milestone, PlanStatus, ProjectMeta, RoleAssignment, Task, WorkData, WorkEnv } from "./types";

/**
 * Una tarea está atrasada si pasó la fecha de su entregable u hito (la tarea no
 * tiene fechas propias: la programación se sigue por hitos y entregables) y no está hecha.
 */
export function isTaskOverdue(t: Task, now = today()): boolean {
  return t.status !== "hecha" && !!t.dueDate && t.dueDate < now;
}

export function isPlanOverdue(x: { status: PlanStatus; dueDate: string | null }, now = today()): boolean {
  return x.status !== "cumplido" && !!x.dueDate && x.dueDate < now;
}

/** Proyecto atrasado: pasó la fecha prevista de fin, o tiene un hito vencido sin cumplir. */
export function isProjectLate(p: Project, meta: ProjectMeta | undefined, milestones: Milestone[], now = today()): boolean {
  if (p.status !== "activo") return false;
  if (meta?.endDate && meta.endDate < now) return true;
  return milestones.some((m) => m.projectId === p.id && isPlanOverdue(m, now));
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

export function taskProgress(tasks: Task[]): Progress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "hecha").length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export type Access = "full" | "status" | "none";

export interface Perms {
  /** Admin o gerente: ven y gestionan todo */
  isStaff: boolean;
  /** Puede crear/editar todo en el proyecto: staff, jefe de proyecto o quien tiene un rol en él */
  canManage: boolean;
  /** Puede ver el espacio de trabajo: staff, miembro o con rol */
  canView: boolean;
  /** Aprueba cambios del cliente y puertas de decisión: staff, jefe de proyecto o un rol con “aprueba” (por defecto, el Project Manager) */
  canApprove: boolean;
  /** Acceso sobre una tarea concreta: completo, solo cambiar el estado (si es suya) o ninguno */
  taskAccess: (t: Task) => Access;
}

export function projectPerms(env: WorkEnv, work: WorkData, projectId: string): Perms {
  const me = env.me;
  const project = env.projects.find((p) => p.id === projectId);
  const isStaff = me.role === "admin" || me.role === "gerente";
  const mine = work.assignments.filter((a) => a.projectId === projectId && a.userId === me.id);
  const flag = (k: "manage" | "approve") => mine.some((a) => work.roles.find((r) => r.key === a.roleKey)?.[k]);
  const hasRole = mine.length > 0; // cualquier rol permite ver el proyecto
  const isMember = !!project?.memberIds.includes(me.id);
  // Gestiona quien tenga un rol con “gestiona”; aprueba quien tenga un rol con “aprueba” (por defecto, el Project Manager)
  const canManage = isStaff || flag("manage");
  return {
    isStaff,
    canManage,
    canApprove: isStaff || flag("approve"),
    canView: isStaff || isMember || hasRole,
    taskAccess: (t) => (canManage ? "full" : t.assigneeId === me.id ? "status" : "none"),
  };
}

/** Personas elegibles como responsables: primero el equipo del proyecto, después el resto de activos. */
export function assignableUsers(env: WorkEnv, project: Project | undefined, assignments: RoleAssignment[]): { team: User[]; others: User[] } {
  const ids = new Set<string>(project?.memberIds ?? []);
  for (const a of assignments) if (a.projectId === project?.id) ids.add(a.userId);
  const active = env.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name));
  return { team: active.filter((u) => ids.has(u.id)), others: active.filter((u) => !ids.has(u.id)) };
}

/**
 * La tarea no tiene fechas propias: su hito sale del entregable (si lo tiene) y su
 * fecha límite es la del entregable o, si no, la del hito. Única fuente de verdad.
 */
export function normalizeTask(t: Task, deliverables: Deliverable[], milestones: Milestone[]): Task {
  const d = t.deliverableId ? deliverables.find((x) => x.id === t.deliverableId) : undefined;
  const milestoneId = d ? d.milestoneId : t.milestoneId;
  const m = milestones.find((x) => x.id === milestoneId);
  return { ...t, milestoneId, startDate: null, dueDate: d?.dueDate ?? m?.dueDate ?? null };
}

/** Hito al que va una tarea nueva si nadie eligió uno: el próximo sin cumplir (o el último). */
export function defaultMilestone(milestones: Milestone[], projectId: string): Milestone | null {
  const mine = milestones.filter((m) => m.projectId === projectId && !m.isGate).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  return mine.find((m) => m.status !== "cumplido") ?? mine[mine.length - 1] ?? null;
}

export const byDue = (a: { dueDate: string | null }, b: { dueDate: string | null }) =>
  (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");

export function userName(users: User[], id: string | null | undefined): string {
  if (!id) return "Sin asignar";
  return users.find((u) => u.id === id)?.name ?? "—";
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}
