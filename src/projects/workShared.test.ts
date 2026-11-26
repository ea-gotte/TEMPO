import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "../types";
import type { Risk, WorkData } from "./types";
import { diffWork, workActions, workRemote, type WorkChange } from "./workStore";

const risk = (id: string, over: Partial<Risk> = {}): Risk => ({
  id, projectId: "p1", kind: "riesgo", title: "Riesgo " + id, description: "", probability: 2, impact: 2,
  ownerId: null, mitigation: "", reviewDate: null, status: "abierto", ...over,
});

const base = (over: Partial<WorkData> = {}): WorkData => ({
  meetings: [], sprints: [], changes: [], risks: [], baselines: [], fields: [], roles: [], assignments: [],
  meta: {}, milestones: [], deliverables: [], tasks: [], reviews: [], seeded: {}, ...over,
});

describe("diffWork", () => {
  it("no informa nada si el contenido es el mismo aunque los objetos sean otros", () => {
    const a = base({ risks: [risk("r1")] });
    const b = base({ risks: [risk("r1")] });
    expect(diffWork(a, b)).toEqual([]);
  });

  it("distingue lo nuevo, lo editado y lo borrado", () => {
    const a = base({ risks: [risk("r1"), risk("r2")] });
    const b = base({ risks: [risk("r1", { title: "Otro" }), risk("r3")] });
    const out = diffWork(a, b).map((c) => `${c.key}:${c.op}:${c.id}`).sort();
    expect(out).toEqual(["risks:delete:r2", "risks:upsert:r1", "risks:upsert:r3"]);
  });

  it("trata la ficha por proyecto (su id es el del proyecto)", () => {
    const meta = { projectId: "p1", code: "A", startDate: null, endDate: null, description: "", notes: "", sharepointUrl: "", accUrl: "", mode: "planificado" as const, sprintWeeks: 2 as const, contingencyPct: 10, discoveryHours: null, discoveryEnd: null };
    const out = diffWork(base({ meta: { p1: meta } }), base({ meta: { p1: { ...meta, code: "B" } } }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "meta", op: "upsert", id: "p1", projectId: "p1" });
  });

  it("no mira lo que no se comparte (roles, asignaciones, marcas locales)", () => {
    const out = diffWork(base(), base({ seeded: { p1: true }, assignments: [{ id: "a", projectId: "p1", userId: "u", roleKey: "x" }] }));
    expect(out).toEqual([]);
  });
});

describe("almacén compartido", () => {
  let pushed: WorkChange[][];

  beforeEach(() => {
    pushed = [];
    workRemote.reset();
    workRemote.setBackend({ push: (c) => { pushed.push(c); } });
    workRemote.replaceAll({ meta: [], milestones: [], deliverables: [], reviews: [], tasks: [], sprints: [], changes: [], baselines: [], risks: [risk("r1")], meetings: [], fields: [] });
  });

  it("lo que llega de la base no se vuelve a subir", () => {
    expect(workRemote.isShared()).toBe(true);
    workRemote.apply([{ key: "risks", op: "upsert", id: "r2", projectId: "p1", item: risk("r2") }]);
    workRemote.apply([{ key: "risks", op: "delete", id: "r1", projectId: null }]);
    expect(pushed).toEqual([]);
  });

  it("lo que cambia la persona sí se sube, y solo eso", () => {
    const r = workActions.addRisk({ ...risk("x"), title: "Nuevo" });
    workActions.updateRisk("r1", { status: "mitigado" });
    expect(pushed).toHaveLength(2);
    expect(pushed[0]).toMatchObject([{ key: "risks", op: "upsert", id: r.id }]);
    expect(pushed[1]).toMatchObject([{ key: "risks", op: "upsert", id: "r1" }]);
  });

  it("preparar la ficha por defecto de un proyecto no sube nada", () => {
    workActions.ensureProjects([{ id: "p9", name: "PR_00999_Prueba", clientId: null, color: "#000", status: "activo", memberIds: [] } as unknown as Project]);
    expect(pushed).toEqual([]);
  });

  it("sin la base conectada no se sube nada", () => {
    workRemote.reset();
    workActions.addRisk({ ...risk("y") });
    expect(pushed).toEqual([]);
  });
});
