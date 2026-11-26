import { describe, expect, it } from "vitest";
import { TEMPLATES, copyStructure, hasStructure, projectCode, projectCodeFromName, structureEnd, structureFromTemplate, type StructureSource } from "./templates";
import type { ProjectMode } from "./types";

describe("projectCodeFromName", () => {
  it("lee el código del principio del nombre", () => {
    expect(projectCodeFromName("PR_00218_BIM ADIF Las Tablas")).toBe("PR_00218");
    expect(projectCodeFromName("OP_02284_BMO Alta Velocidad Portugal")).toBe("OP_02284");
    expect(projectCodeFromName("op-02284 BMO")).toBe("OP-02284");
    expect(projectCodeFromName("PR_00199")).toBe("PR_00199");
  });
  it("no inventa código cuando el nombre no lo trae", () => {
    for (const n of ["I+D", "FORMACIÓN", "NO LABORABLE", "Edificio Meridiano 24", "BIM_2024x", "PR_00218A"]) expect(projectCodeFromName(n)).toBeNull();
  });
  it("el código del nombre manda sobre el de la ficha", () => {
    expect(projectCode({ name: "PR_00218_BIM" }, { code: "PRY-001" })).toBe("PR_00218");
    expect(projectCode({ name: "Formación" }, { code: " INT-01 " })).toBe("INT-01");
    expect(projectCode({ name: "Formación" }, null)).toBe("");
  });
});

describe("structureFromTemplate", () => {
  it("arma hitos encadenados, entregables y riesgos con fechas desde el inicio", () => {
    const s = structureFromTemplate("p1", "plan_correcciones", "2026-12-01", "u1");
    expect(s.milestones.map((m) => m.name)).toEqual(["Arranque y Plan de Ejecución BIM", "Primera entrega", "Correcciones del cliente", "Entrega final"]);
    expect(s.milestones[0].startDate).toBe("2026-12-01");
    expect(s.milestones[0].dueDate).toBe("2026-12-15");
    expect(s.milestones[1].dependsOn).toEqual([s.milestones[0].id]);
    expect(s.deliverables.every((d) => s.milestones.some((m) => m.id === d.milestoneId) && d.status === "pendiente")).toBe(true);
    expect(s.risks.length).toBe(4);
    expect(s.risks.every((r) => r.status === "abierto" && r.ownerId === "u1" && r.projectId === "p1")).toBe(true);
    expect(structureEnd(s)).toBe("2027-03-11");
  });

  it("toda plantilla es coherente: fechas ordenadas y entregables dentro de su hito", () => {
    for (const mode of Object.keys(TEMPLATES) as ProjectMode[]) {
      const tpl = TEMPLATES[mode];
      tpl.milestones.forEach((m, i) => {
        expect(m.start).toBeLessThanOrEqual(m.due);
        if (i > 0) expect(m.start).toBeGreaterThan(tpl.milestones[i - 1].due);
        for (const d of m.deliverables) {
          expect(d.due).toBeGreaterThanOrEqual(m.start);
          expect(d.due).toBeLessThanOrEqual(m.due);
        }
      });
      expect(tpl.risks.length).toBeGreaterThan(0);
    }
  });

  it("el híbrido trae la puerta de decisión", () => {
    const s = structureFromTemplate("p1", "hibrido", "2026-12-01", null);
    const gate = s.milestones.find((m) => m.isGate);
    expect(gate?.gateDecision).toBe("pendiente");
    expect(gate?.gateCriteria).toBeTruthy();
  });
});

describe("copyStructure", () => {
  const src: StructureSource = {
    milestones: [
      { id: "m1", projectId: "a", name: "H1", description: "", ownerId: "x", startDate: "2026-01-10", dueDate: "2026-01-20", status: "cumplido", actualStart: "2026-01-10", actualEnd: "2026-01-22" },
      { id: "m2", projectId: "a", name: "H2", description: "", ownerId: "x", startDate: "2026-01-21", dueDate: "2026-02-10", status: "en_curso", dependsOn: ["m1"], isGate: true, gateCriteria: "ok", gateDecision: "continuar" },
      { id: "mz", projectId: "otro", name: "Ajeno", description: "", ownerId: null, dueDate: "2026-03-01", status: "pendiente" },
    ],
    deliverables: [
      { id: "d1", projectId: "a", milestoneId: "m1", name: "E1", description: "", ownerId: "x", startDate: "2026-01-12", dueDate: "2026-01-20", status: "cumplido", actualEnd: "2026-01-22", firstDeliveredAt: "2026-01-21" },
    ],
    risks: [{ id: "r1", projectId: "a", kind: "riesgo", title: "R", description: "", probability: 2, impact: 2, ownerId: "x", mitigation: "", reviewDate: "2026-01-15", status: "cerrado" }],
    fields: [
      { id: "g", projectId: null, name: "Fase", type: "texto", options: [], sortOrder: 0 },
      { id: "f1", projectId: "a", name: "Planos", type: "numero", options: [], sortOrder: 5 },
    ],
    tasks: [
      { id: "t1", projectId: "a", milestoneId: "m1", deliverableId: "d1", name: "Hecha", status: "hecha", assigneeId: "x", custom: { f1: 3, g: "x" }, sortOrder: 0, rank: 0, archived: false, completedAt: "2026-01-19", startDate: "2026-01-12", dueDate: "2026-01-19" },
      { id: "t2", projectId: "a", milestoneId: null, deliverableId: null, name: "Archivada", status: "hecha", assigneeId: "x", custom: {}, sortOrder: 10, rank: 10, archived: true, completedAt: "2026-01-05", startDate: null, dueDate: null },
    ] as unknown as StructureSource["tasks"],
  };

  it("copia hitos, entregables, riesgos y campos propios como recién planificados", () => {
    const s = copyStructure(src, "a", "b", "2026-06-01", { includeTasks: false, ownerId: "u9" });
    expect(s.milestones.map((m) => [m.name, m.startDate, m.dueDate, m.status])).toEqual([["H1", "2026-06-01", "2026-06-11", "pendiente"], ["H2", "2026-06-12", "2026-07-02", "pendiente"]]);
    expect(s.milestones[0].actualEnd).toBeUndefined();
    expect(s.milestones[1].dependsOn).toEqual([s.milestones[0].id]);
    expect(s.milestones[1].gateDecision).toBe("pendiente");
    expect(s.deliverables[0].milestoneId).toBe(s.milestones[0].id);
    expect(s.deliverables[0].firstDeliveredAt).toBeUndefined();
    expect(s.risks[0]).toMatchObject({ projectId: "b", status: "abierto", ownerId: "u9" });
    expect(s.fields.map((f) => [f.name, f.projectId])).toEqual([["Planos", "b"]]);
    expect(s.tasks).toEqual([]);
    expect(new Set([...s.milestones, ...s.deliverables].map((x) => x.id)).has("m1")).toBe(false);
  });

  it("con tareas: las copia pendientes, sin responsable y enlazadas a lo nuevo; las archivadas no", () => {
    const s = copyStructure(src, "a", "b", "2026-06-01", { includeTasks: true, ownerId: null });
    expect(s.tasks).toHaveLength(1);
    const t = s.tasks[0];
    expect(t).toMatchObject({ name: "Hecha", status: "pendiente", assigneeId: null, completedAt: null, projectId: "b", startDate: "2026-06-03", dueDate: "2026-06-10" });
    expect(t.milestoneId).toBe(s.milestones[0].id);
    expect(t.deliverableId).toBe(s.deliverables[0].id);
    expect(t.custom).toEqual({ [s.fields[0].id]: 3, g: "x" });
  });

  it("sabe si un proyecto tiene algo para copiar", () => {
    expect(hasStructure(src, "a")).toBe(true);
    expect(hasStructure(src, "nada")).toBe(false);
  });
});
