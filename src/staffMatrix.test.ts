import { describe, expect, it } from "vitest";
import { staffMatrix } from "./staffMatrix";
import type { Project, TimeEntry, User } from "./types";

const users = [{ id: "u1", name: "Beto" }, { id: "u2", name: "Ana" }, { id: "u3", name: "Zoe" }] as unknown as User[];
const projects = [{ id: "p1", name: "Puente", color: "#111" }, { id: "p2", name: "Hospital", color: "#222" }] as unknown as Project[];
const e = (id: string, userId: string, projectId: string | null, date: string, start: number, end: number) =>
  ({ id, userId, projectId, date, start, end }) as unknown as TimeEntry;
const entries = [
  e("1", "u1", "p1", "2026-11-02", 540, 780), // 4 h
  e("2", "u1", "p1", "2026-11-03", 540, 660), // 2 h
  e("3", "u1", "p2", "2026-11-03", 720, 780), // 1 h
  e("4", "u2", "p2", "2026-11-10", 480, 960), // 8 h
  e("5", "u2", null, "2026-11-11", 480, 510), // 30 min sin proyecto
  e("6", "u2", "p1", "2026-10-30", 480, 960), // otro mes
  e("7", "ux", "p1", "2026-11-05", 480, 960), // persona fuera de la lista
];

describe("staffMatrix", () => {
  const m = staffMatrix(entries, users, projects, "2026-11");

  it("ordena las personas por nombre e incluye a quien no cargó", () => {
    expect(m.rows.map((r) => r.user.name)).toEqual(["Ana", "Beto", "Zoe"]);
    expect(m.rows[2].totalMin).toBe(0);
  });

  it("solo trae los proyectos con horas en el mes, del mayor al menor", () => {
    expect(m.projects.map((p) => [p.name, p.totalMin])).toEqual([["Hospital", 540], ["Puente", 360], ["Sin proyecto", 30]]);
  });

  it("suma por persona y proyecto, y los totales", () => {
    const beto = m.rows[1];
    expect(beto.byProject.get("p1")).toBe(360);
    expect(beto.byProject.get("p2")).toBe(60);
    expect(beto.totalMin).toBe(420);
    expect(m.totalMin).toBe(930);
    expect(m.maxCellMin).toBe(480);
  });
});
