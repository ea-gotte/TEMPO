import type { Project, Role, User } from "../types";
import type { RoleAssignment } from "./types";

/**
 * Determina si el rol puede ver las analíticas de cartera en el panel general
 * (Ocupación del equipo, Estado e Indicadores).
 * Admin, gerente y supervisor pueden verlas; usuario no (solo ve Cronograma).
 */
export function canSeePortfolioAnalytics(role: Role | string): boolean {
  return role === "admin" || role === "gerente" || role === "supervisor";
}

/**
 * Filtra los proyectos visibles según el rol del usuario:
 * - Admin y gerente ven todos los proyectos.
 * - Supervisor y usuario solo ven aquellos en los que participan
 *   (están en project.memberIds o tienen asignación de rol en work.assignments).
 */
export function visibleProjects(
  projects: Project[],
  assignments: RoleAssignment[],
  me: { id: string; role: Role | string } | User,
): Project[] {
  if (me.role === "admin" || me.role === "gerente") {
    return projects;
  }

  const assignedProjectIds = new Set<string>();
  for (const a of assignments) {
    if (a.userId === me.id) {
      assignedProjectIds.add(a.projectId);
    }
  }

  return projects.filter(
    (p) => (p.memberIds && p.memberIds.includes(me.id)) || assignedProjectIds.has(p.id),
  );
}
