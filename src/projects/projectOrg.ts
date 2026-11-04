import type { Project, User } from "../types";
import type { TreeNode } from "../orgTree";
import type { RoleAssignment, RoleDef } from "./types";

/**
 * Estructura organizativa y roles por proyecto.
 * Funciones puras para armar el árbol jerárquico de un proyecto y resolver
 * la asignación de roles de cada persona.
 */

export interface AssignmentLike {
  id?: string;
  projectId: string;
  userId: string;
  roleKey: string;
  roleLabel?: string;
}

export interface UserRoleItem {
  projectId: string;
  projectName: string;
  roleLabel: string;
}

export interface ProjectOrgResult {
  roots: TreeNode[];
  roleLabels: Map<string, string[]>;
}

/**
 * Resuelve la etiqueta legible de un rol.
 * Prioridad: catálogo de roles (work.roles) -> roleLabel del assignment -> roleKey.
 */
export function resolveRoleLabel(
  roleKey: string,
  roleLabel?: string,
  roles?: Array<{ key: string; label: string }>,
): string {
  const found = roles?.find((r) => r.key === roleKey);
  if (found && found.label) return found.label;
  if (roleLabel) return roleLabel;
  return roleKey;
}

/**
 * Prioridad jerárquica de roles (menor número = mayor jerarquía):
 * 0: Project Manager ("lider_proyecto")
 * 1: Líder Funcional ("lider_tecnico")
 * 2: Coordinador ("coordinador")
 * 3: Otros roles
 * 4: Miembros sin rol ("Equipo")
 */
export function getRoleRank(roleKey: string): number {
  if (roleKey === "lider_proyecto") return 0;
  if (roleKey === "lider_tecnico") return 1;
  if (roleKey === "coordinador") return 2;
  return 3;
}

/**
 * Devuelve el árbol del proyecto con el mismo tipo TreeNode que usa buildLayout (raíces),
 * más un Map userId -> etiquetas de rol en ese proyecto.
 *
 * Jerarquía por niveles:
 * 1) Project Manager
 * 2) Líder Funcional
 * 3) Coordinador
 * 4) Otros roles
 * 5) Miembros de project.memberIds sin rol (etiqueta "Equipo")
 *
 * Cada persona aparece en el nivel de su rol más alto. La gente de cada nivel cuelga
 * del primero del nivel no vacío anterior, ordenados por nombre para que el resultado
 * sea estable. Si no hay Project Manager, el primer nivel no vacío son las raíces.
 * Solo usuarios activos; ignora ids inexistentes.
 */
export function projectOrgTree(
  project: { id: string; memberIds?: string[] } | null | undefined,
  assignments: AssignmentLike[],
  roles: Array<{ key: string; label: string }>,
  users: User[],
): ProjectOrgResult {
  const roleLabels = new Map<string, string[]>();

  if (!project || !project.id) {
    return { roots: [], roleLabels };
  }

  // Filtrar solo usuarios activos
  const activeUsersById = new Map<string, User>();
  for (const u of users) {
    if (u && u.active) {
      activeUsersById.set(u.id, u);
    }
  }

  // Asignaciones del proyecto para usuarios activos y existentes
  const projectAssignments = assignments.filter(
    (a) => a.projectId === project.id && activeUsersById.has(a.userId),
  );

  // Agrupar asignaciones por usuario
  const assignmentsByUser = new Map<string, AssignmentLike[]>();
  for (const a of projectAssignments) {
    if (!assignmentsByUser.has(a.userId)) {
      assignmentsByUser.set(a.userId, []);
    }
    assignmentsByUser.get(a.userId)!.push(a);
  }

  // Identificar miembros de memberIds activos
  const validMemberIds = (project.memberIds ?? []).filter((id) => activeUsersById.has(id));

  // Todos los usuarios participantes (por asignación o por memberIds)
  const participatingUserIds = new Set<string>([
    ...Array.from(assignmentsByUser.keys()),
    ...validMemberIds,
  ]);

  if (participatingUserIds.size === 0) {
    return { roots: [], roleLabels };
  }

  // Determinar nivel y etiquetas de rol para cada persona
  const userRanks = new Map<string, number>();

  for (const userId of participatingUserIds) {
    const user = activeUsersById.get(userId);
    if (!user) continue;

    const userAsg = assignmentsByUser.get(userId) ?? [];

    if (userAsg.length > 0) {
      // Ordenar asignaciones por jerarquía para que la etiqueta principal aparezca primero
      const sortedAsg = [...userAsg].sort((a, b) => {
        const diff = getRoleRank(a.roleKey) - getRoleRank(b.roleKey);
        if (diff !== 0) return diff;
        return a.roleKey.localeCompare(b.roleKey);
      });

      const bestRank = Math.min(...sortedAsg.map((a) => getRoleRank(a.roleKey)));
      userRanks.set(userId, bestRank);

      const labels: string[] = [];
      for (const a of sortedAsg) {
        const lbl = resolveRoleLabel(a.roleKey, a.roleLabel, roles);
        if (!labels.includes(lbl)) {
          labels.push(lbl);
        }
      }
      roleLabels.set(userId, labels);
    } else {
      // Miembro sin rol asignado
      userRanks.set(userId, 4);
      roleLabels.set(userId, ["Equipo"]);
    }
  }

  // Agrupar en niveles: 0 (PM), 1 (LF), 2 (Coord), 3 (Otros), 4 (Equipo)
  const levelBuckets: User[][] = [[], [], [], [], []];
  for (const userId of participatingUserIds) {
    const rank = userRanks.get(userId);
    const user = activeUsersById.get(userId);
    if (rank !== undefined && user) {
      levelBuckets[rank].push(user);
    }
  }

  // Ordenar alfabéticamente dentro de cada nivel para estabilidad
  for (const bucket of levelBuckets) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Conservar solo niveles con al menos una persona
  const nonEmptyLevels = levelBuckets.filter((bucket) => bucket.length > 0);
  if (nonEmptyLevels.length === 0) {
    return { roots: [], roleLabels };
  }

  // Crear nodos del árbol
  const nodeMap = new Map<string, TreeNode>();
  for (const bucket of nonEmptyLevels) {
    for (const u of bucket) {
      nodeMap.set(u.id, { user: u, children: [] });
    }
  }

  // El primer nivel no vacío conforma las raíces
  const roots: TreeNode[] = nonEmptyLevels[0].map((u) => nodeMap.get(u.id)!);

  // La gente de cada nivel posterior cuelga del primero del nivel anterior
  for (let i = 1; i < nonEmptyLevels.length; i++) {
    const parentUser = nonEmptyLevels[i - 1][0];
    const parentNode = nodeMap.get(parentUser.id)!;
    for (const childUser of nonEmptyLevels[i]) {
      const childNode = nodeMap.get(childUser.id)!;
      parentNode.children.push(childNode);
    }
    // Asegurar orden por nombre en children
    parentNode.children.sort((a, b) => a.user.name.localeCompare(b.user.name));
  }

  return { roots, roleLabels };
}

/**
 * Devuelve un Map userId -> lista de { projectId, projectName, roleLabel }.
 */
export function rolesByUser(
  assignments: AssignmentLike[],
  roles: Array<{ key: string; label: string }>,
  projects: Array<{ id: string; name: string }>,
): Map<string, UserRoleItem[]> {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const result = new Map<string, UserRoleItem[]>();

  for (const a of assignments) {
    const project = projectMap.get(a.projectId);
    if (!project) continue;

    const roleLabel = resolveRoleLabel(a.roleKey, a.roleLabel, roles);

    if (!result.has(a.userId)) {
      result.set(a.userId, []);
    }
    const list = result.get(a.userId)!;
    if (!list.some((item) => item.projectId === a.projectId && item.roleLabel === roleLabel)) {
      list.push({
        projectId: project.id,
        projectName: project.name,
        roleLabel,
      });
    }
  }

  return result;
}

/** Proyectos en los que participa una persona, por memberIds o por asignación de rol. */
export function userProjects(
  projects: Project[],
  assignments: Array<{ projectId: string; userId: string }>,
  userId: string,
): Project[] {
  const assignedProjectIds = new Set(assignments.filter((a) => a.userId === userId).map((a) => a.projectId));
  return projects.filter((p) => p.memberIds.includes(userId) || assignedProjectIds.has(p.id));
}
