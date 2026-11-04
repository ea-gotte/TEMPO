import { describe, expect, it } from "vitest";
import type { Project, User } from "../types";
import type { RoleAssignment } from "./types";
import { canSeePortfolioAnalytics, visibleProjects } from "./visibility";

function makeUser(id: string, role: User["role"]): User {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    password: "pass",
    role,
    team: "latam",
    jornada: "completa",
    supervisorId: null,
    weeklyHours: 40,
    workDays: [1, 2, 3, 4, 5],
    dayStart: "09:00",
    dayEnd: "18:00",
    birthday: "1990-01-01",
    hireDate: "2020-01-01",
    active: true,
  };
}

function makeProject(id: string, memberIds: string[] = []): Project {
  return {
    id,
    name: `Proyecto ${id}`,
    clientId: null,
    color: "#5b6cff",
    status: "activo",
    budgetHours: 100,
    memberIds,
    flightActivityId: null,
  };
}

describe("visibility: canSeePortfolioAnalytics", () => {
  it("permite ver analíticas a admin, gerente y supervisor", () => {
    expect(canSeePortfolioAnalytics("admin")).toBe(true);
    expect(canSeePortfolioAnalytics("gerente")).toBe(true);
    expect(canSeePortfolioAnalytics("supervisor")).toBe(true);
  });

  it("deniega analíticas a usuario común y roles desconocidos", () => {
    expect(canSeePortfolioAnalytics("usuario")).toBe(false);
    expect(canSeePortfolioAnalytics("otro")).toBe(false);
    expect(canSeePortfolioAnalytics("")).toBe(false);
  });
});

describe("visibility: visibleProjects", () => {
  const pMemberOnly = makeProject("p-member", ["u-sup", "u-usr"]);
  const pAssignOnly = makeProject("p-assign", []);
  const pBoth = makeProject("p-both", ["u-sup", "u-usr"]);
  const pNeither = makeProject("p-none", ["other-user"]);
  const allProjects = [pMemberOnly, pAssignOnly, pBoth, pNeither];

  const assignments: RoleAssignment[] = [
    { id: "a1", projectId: "p-assign", userId: "u-sup", roleKey: "pm" },
    { id: "a2", projectId: "p-assign", userId: "u-usr", roleKey: "dev" },
    { id: "a3", projectId: "p-both", userId: "u-sup", roleKey: "lead" },
    { id: "a4", projectId: "p-both", userId: "u-usr", roleKey: "dev" },
    { id: "a5", projectId: "p-none", userId: "other-user", roleKey: "dev" },
  ];

  it("admin ve todos los proyectos sin importar membresía ni asignaciones", () => {
    const admin = makeUser("u-admin", "admin");
    const result = visibleProjects(allProjects, assignments, admin);
    expect(result).toHaveLength(4);
    expect(result.map((p) => p.id)).toEqual(["p-member", "p-assign", "p-both", "p-none"]);
  });

  it("gerente ve todos los proyectos sin importar membresía ni asignaciones", () => {
    const gerente = makeUser("u-gerente", "gerente");
    const result = visibleProjects(allProjects, assignments, gerente);
    expect(result).toHaveLength(4);
    expect(result.map((p) => p.id)).toEqual(["p-member", "p-assign", "p-both", "p-none"]);
  });

  it("supervisor solo ve los proyectos donde participa (por memberIds o por asignación)", () => {
    const supervisor = makeUser("u-sup", "supervisor");
    const result = visibleProjects(allProjects, assignments, supervisor);
    expect(result.map((p) => p.id)).toEqual(["p-member", "p-assign", "p-both"]);
    expect(result.find((p) => p.id === "p-none")).toBeUndefined();
  });

  it("usuario solo ve los proyectos donde participa (por memberIds o por asignación)", () => {
    const usuario = makeUser("u-usr", "usuario");
    const result = visibleProjects(allProjects, assignments, usuario);
    expect(result.map((p) => p.id)).toEqual(["p-member", "p-assign", "p-both"]);
    expect(result.find((p) => p.id === "p-none")).toBeUndefined();
  });

  it("retorna lista vacía si el usuario no participa en ningún proyecto", () => {
    const outsider = makeUser("u-outsider", "usuario");
    const result = visibleProjects(allProjects, assignments, outsider);
    expect(result).toEqual([]);
  });

  it("retorna lista vacía si la lista de proyectos original está vacía", () => {
    const admin = makeUser("u-admin", "admin");
    expect(visibleProjects([], assignments, admin)).toEqual([]);
  });
});
