import { describe, expect, it } from "vitest";
import type { Project, User } from "../types";
import {
  projectOrgTree,
  rolesByUser,
  userProjects,
  resolveRoleLabel,
  getRoleRank,
} from "./projectOrg";

const ROLES_CATALOG = [
  { key: "lider_proyecto", label: "Project Manager" },
  { key: "lider_tecnico", label: "Líder Funcional" },
  { key: "coordinador", label: "Coordinador" },
  { key: "modelador", label: "Modelador" },
  { key: "referente", label: "Referente" },
];

function makeUser(id: string, name: string, active = true): User {
  return {
    id,
    name,
    email: `${id}@empresa.com`,
    password: "pass",
    role: "usuario",
    team: "latam",
    jornada: "completa",
    supervisorId: null,
    weeklyHours: 40,
    workDays: [1, 2, 3, 4, 5],
    dayStart: "09:00",
    dayEnd: "18:00",
    birthday: "1990-01-01",
    hireDate: "2024-01-01",
    active,
  };
}

function makeProject(id: string, name: string, memberIds: string[] = []): Project {
  return {
    id,
    clientId: null,
    name,
    color: "#2563eb",
    status: "activo",
    budgetHours: 100,
    memberIds,
    flightActivityId: null,
  };
}

describe("projectOrgTree", () => {
  it("maneja una persona con dos roles: una sola tarjeta en su nivel más alto y lista ambos roles", () => {
    const u1 = makeUser("u1", "Ana Gomez");
    const u2 = makeUser("u2", "Bernardo Perez");
    const project = makeProject("p1", "Proyecto Alfa", ["u1", "u2"]);

    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "lider_proyecto" },
      { projectId: "p1", userId: "u1", roleKey: "coordinador" },
      { projectId: "p1", userId: "u2", roleKey: "modelador" },
    ];

    const { roots, roleLabels } = projectOrgTree(project, assignments, ROLES_CATALOG, [u1, u2]);

    // Ana está en el nivel más alto (PM = 0), por lo que es la única raíz
    expect(roots).toHaveLength(1);
    expect(roots[0].user.id).toBe("u1");

    // Bernardo cuelga de Ana
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].user.id).toBe("u2");

    // Ana tiene ambos roles en roleLabels (ordenados por jerarquía: PM primero, luego Coordinador)
    const anaLabels = roleLabels.get("u1");
    expect(anaLabels).toEqual(["Project Manager", "Coordinador"]);

    // Bernardo tiene rol Modelador
    expect(roleLabels.get("u2")).toEqual(["Modelador"]);
  });

  it("organiza el árbol sin Project Manager: el primer nivel no vacío pasa a ser las raíces", () => {
    const u1 = makeUser("u1", "Carlos Sanchez");
    const u2 = makeUser("u2", "Beatriz Romero");
    const u3 = makeUser("u3", "David Diaz");
    const project = makeProject("p1", "Proyecto Beta", ["u1", "u2", "u3"]);

    // Dos líderes funcionales (nivel 1) y un coordinador (nivel 2)
    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "lider_tecnico" },
      { projectId: "p1", userId: "u2", roleKey: "lider_tecnico" },
      { projectId: "p1", userId: "u3", roleKey: "coordinador" },
    ];

    const { roots } = projectOrgTree(project, assignments, ROLES_CATALOG, [u1, u2, u3]);

    // Raíces: los dos líderes funcionales, ordenados por nombre: Beatriz Romero, luego Carlos Sanchez
    expect(roots).toHaveLength(2);
    expect(roots[0].user.id).toBe("u2");
    expect(roots[1].user.id).toBe("u1");

    // David (coordinador) cuelga del primero del nivel anterior (Beatriz)
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].user.id).toBe("u3");
    expect(roots[1].children).toHaveLength(0);
  });

  it("etiqueta a miembros de project.memberIds sin rol asignado como 'Equipo'", () => {
    const u1 = makeUser("u1", "Agustina Lopez");
    const u2 = makeUser("u2", "Federico Garcia");
    const project = makeProject("p1", "Proyecto Gamma", ["u1", "u2"]);

    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "lider_proyecto" },
    ];

    const { roots, roleLabels } = projectOrgTree(project, assignments, ROLES_CATALOG, [u1, u2]);

    expect(roots).toHaveLength(1);
    expect(roots[0].user.id).toBe("u1");

    // Federico cuelga de Agustina como miembro del equipo
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].user.id).toBe("u2");

    expect(roleLabels.get("u2")).toEqual(["Equipo"]);
  });

  it("ignora usuarios inactivos en el organigrama", () => {
    const u1 = makeUser("u1", "Activo Uno", true);
    const u2 = makeUser("u2", "Inactivo Dos", false);
    const project = makeProject("p1", "Proyecto Inactivos", ["u1", "u2"]);

    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "lider_proyecto" },
      { projectId: "p1", userId: "u2", roleKey: "lider_tecnico" },
    ];

    const { roots, roleLabels } = projectOrgTree(project, assignments, ROLES_CATALOG, [u1, u2]);

    expect(roots).toHaveLength(1);
    expect(roots[0].user.id).toBe("u1");
    expect(roots[0].children).toHaveLength(0);
    expect(roleLabels.has("u2")).toBe(false);
  });

  it("ignora ids inexistentes sin fallar", () => {
    const u1 = makeUser("u1", "Usuario Real");
    const project = makeProject("p1", "Proyecto Ids Fantasmas", ["u1", "fantasma_member"]);

    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "lider_proyecto" },
      { projectId: "p1", userId: "fantasma_asg", roleKey: "coordinador" },
    ];

    const { roots, roleLabels } = projectOrgTree(project, assignments, ROLES_CATALOG, [u1]);

    expect(roots).toHaveLength(1);
    expect(roots[0].user.id).toBe("u1");
    expect(roots[0].children).toHaveLength(0);
    expect(roleLabels.has("fantasma_member")).toBe(false);
    expect(roleLabels.has("fantasma_asg")).toBe(false);
  });

  it("resuelve rol desconocido con roleLabel y si no existe usa la key", () => {
    const u1 = makeUser("u1", "Esteban Quito");
    const u2 = makeUser("u2", "Zulema Silva");
    const project = makeProject("p1", "Proyecto Roles Especiales", ["u1", "u2"]);

    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "esp_bim", roleLabel: "Especialista BIM" },
      { projectId: "p1", userId: "u2", roleKey: "rol_desconocido_sin_label" },
    ];

    const { roleLabels } = projectOrgTree(project, assignments, ROLES_CATALOG, [u1, u2]);

    expect(roleLabels.get("u1")).toEqual(["Especialista BIM"]);
    expect(roleLabels.get("u2")).toEqual(["rol_desconocido_sin_label"]);
  });

  it("retorna árbol vacío si el proyecto está vacío o es nulo", () => {
    const emptyProj = makeProject("p_empty", "Proyecto Vacío", []);
    const res1 = projectOrgTree(emptyProj, [], ROLES_CATALOG, []);
    expect(res1.roots).toEqual([]);
    expect(res1.roleLabels.size).toBe(0);

    const res2 = projectOrgTree(null, [], ROLES_CATALOG, []);
    expect(res2.roots).toEqual([]);
    expect(res2.roleLabels.size).toBe(0);
  });
});

describe("rolesByUser", () => {
  it("construye un mapa de usuario a lista de roles por proyecto", () => {
    const p1 = makeProject("p1", "Torre A");
    const p2 = makeProject("p2", "Hospital B");
    const assignments = [
      { projectId: "p1", userId: "u1", roleKey: "lider_proyecto" },
      { projectId: "p2", userId: "u1", roleKey: "coordinador" },
      { projectId: "p1", userId: "u2", roleKey: "modelador" },
      { projectId: "p_inexistente", userId: "u1", roleKey: "referente" },
    ];

    const map = rolesByUser(assignments, ROLES_CATALOG, [p1, p2]);

    const u1Roles = map.get("u1");
    expect(u1Roles).toBeDefined();
    expect(u1Roles).toHaveLength(2);
    expect(u1Roles).toEqual([
      { projectId: "p1", projectName: "Torre A", roleLabel: "Project Manager" },
      { projectId: "p2", projectName: "Hospital B", roleLabel: "Coordinador" },
    ]);

    const u2Roles = map.get("u2");
    expect(u2Roles).toBeDefined();
    expect(u2Roles).toHaveLength(1);
    expect(u2Roles![0].roleLabel).toBe("Modelador");
  });
});

describe("userProjects", () => {
  it("encuentra proyectos tanto por memberIds como por asignación de roles", () => {
    const pMember = makeProject("p1", "Por Miembro", ["u1"]);
    const pAssign = makeProject("p2", "Por Asignación", ["u2"]);
    const pBoth = makeProject("p3", "Por Ambos", ["u1"]);
    const pNone = makeProject("p4", "Sin Participación", ["u2"]);

    const allProjects = [pMember, pAssign, pBoth, pNone];
    const assignments = [
      { projectId: "p2", userId: "u1", roleKey: "lider_proyecto" },
      { projectId: "p3", userId: "u1", roleKey: "coordinador" },
    ];

    const result1 = userProjects(allProjects, assignments, "u1");
    expect(result1.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);

  });
});
