import { describe, expect, it } from "vitest";
import { planVsRealRows, planVsRealSummary } from "./planDeviation";
import type { Baseline, Deliverable, Milestone, Task } from "./types";

describe("planVsReal", () => {
  const dummyMilestone = (overrides: Partial<Milestone>): Milestone => ({
    id: "m-1",
    projectId: "p-1",
    name: "Hito de prueba",
    description: "",
    ownerId: null,
    dueDate: "2026-05-10",
    status: "cumplido",
    ...overrides,
  });

  const dummyDeliverable = (overrides: Partial<Deliverable>): Deliverable => ({
    id: "d-1",
    projectId: "p-1",
    milestoneId: "m-1",
    name: "Entregable de prueba",
    description: "",
    ownerId: null,
    dueDate: "2026-05-10",
    status: "cumplido",
    ...overrides,
  });

  const dummyTask = (overrides: Partial<Task>): Task => ({
    id: "t-1",
    projectId: "p-1",
    milestoneId: "m-1",
    deliverableId: null,
    name: "Tarea de prueba",
    description: "",
    assigneeId: null,
    status: "hecha",
    priority: "media",
    startDate: null,
    dueDate: "2026-05-10",
    kind: "tarea",
    estimateHours: 10,
    estimateMin: null,
    estimateMax: null,
    confidence: "alta",
    sprintId: null,
    sprintAddedAt: null,
    rank: 0,
    changeRequestId: null,
    completedAt: "2026-05-09",
    archived: false,
    archivedAt: null,
    custom: {},
    sortOrder: 0,
    createdBy: null,
    createdAt: "2026-05-01",
    ...overrides,
  });

  it("ítem terminado adelantado", () => {
    const m = dummyMilestone({
      startDate: "2026-05-01",
      dueDate: "2026-05-10",
      actualStart: "2026-04-30",
      actualEnd: "2026-05-08",
      status: "cumplido",
    });

    const rows = planVsRealRows([m], [], "2026-05-15");
    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row.type).toBe("Hito");
    expect(row.status).toBe("Adelantado");
    expect(row.startDeviationDays).toBe(-1); // empezó un día antes (-1)
    expect(row.endDeviationDays).toBe(-2); // terminó 2 días antes (-2)
    expect(row.isEndProvisional).toBe(false);
    expect(row.isEndProvisional).toBe(false);
  });

  it("ítem terminado a tiempo", () => {
    const m = dummyMilestone({
      startDate: "2026-05-01",
      dueDate: "2026-05-10",
      actualStart: "2026-05-01",
      actualEnd: "2026-05-10",
      status: "cumplido",
    });

    const rows = planVsRealRows([m], [], "2026-05-15");
    const row = rows[0];

    expect(row.status).toBe("A tiempo");
    expect(row.startDeviationDays).toBe(0);
    expect(row.endDeviationDays).toBe(0);
    expect(row.isEndProvisional).toBe(false);
  });

  it("ítem terminado atrasado", () => {
    const d = dummyDeliverable({
      startDate: "2026-05-01",
      dueDate: "2026-05-10",
      actualStart: "2026-05-03",
      actualEnd: "2026-05-14",
      status: "cumplido",
    });

    const rows = planVsRealRows([], [d], "2026-05-15");
    const row = rows[0];

    expect(row.type).toBe("Entregable");
    expect(row.status).toBe("Atrasado");
    expect(row.startDeviationDays).toBe(2); // arrancó 2 días tarde
    expect(row.endDeviationDays).toBe(4); // terminó 4 días tarde
    expect(row.isEndProvisional).toBe(false);
  });

  it("en curso vencido (provisional)", () => {
    const m = dummyMilestone({
      startDate: "2026-05-01",
      dueDate: "2026-05-10",
      actualStart: "2026-05-01",
      actualEnd: null,
      status: "en_curso",
    });

    // now es 2026-05-13, dueDate era 2026-05-10 (pasaron 3 días)
    const rows = planVsRealRows([m], [], "2026-05-13");
    const row = rows[0];

    expect(row.status).toBe("Atrasado");
    expect(row.isEndProvisional).toBe(true);
    expect(row.isEndProvisional).toBe(true);
    expect(row.endDeviationDays).toBe(3); // desvío contra now
  });

  it("en curso o pendiente no vencido", () => {
    const m1 = dummyMilestone({
      id: "m-1",
      dueDate: "2026-05-20",
      status: "en_curso",
    });
    const m2 = dummyMilestone({
      id: "m-2",
      dueDate: "2026-05-25",
      status: "pendiente",
    });

    const rows = planVsRealRows([m1, m2], [], "2026-05-10");

    expect(rows[0].status).toBe("En curso");
    expect(rows[0].endDeviationDays).toBeNull();
    expect(rows[0].isEndProvisional).toBe(false);

    expect(rows[1].status).toBe("Pendiente");
    expect(rows[1].endDeviationDays).toBeNull();
    expect(rows[1].isEndProvisional).toBe(false);
  });

  it("sin fecha planificada", () => {
    const m = dummyMilestone({
      startDate: null,
      dueDate: null,
      actualStart: "2026-05-01",
      status: "en_curso",
    });

    const rows = planVsRealRows([m], [], "2026-05-10");
    const row = rows[0];

    expect(row.status).toBe("Sin plan");
    expect(row.startDeviationDays).toBeNull();
    expect(row.endDeviationDays).toBeNull();
    expect(row.isEndProvisional).toBe(false);
  });

  it("resumen sin líneas base", () => {
    const m = dummyMilestone({
      dueDate: "2026-05-10",
      actualEnd: "2026-05-10",
      status: "cumplido",
    });
    const rows = planVsRealRows([m], [], "2026-05-15");
    const tasks = [dummyTask({ status: "hecha" })];

    const summary = planVsRealSummary(rows, [], 100, 3600, tasks, "2026-05-15");

    expect(summary.baselineEndShiftDays).toBeNull();
    expect(summary.scopeGrowthHours).toBeNull();
    expect(summary.realHours).toBe(60); // 3600 min = 60 h
    expect(summary.budgetHours).toBe(100);
    expect(summary.hoursVariance).toBe(-40); // 60 - 100 = -40 h
    expect(summary.hoursVariancePct).toBe(-40);
  });

  it("resumen sin presupuesto", () => {
    const m = dummyMilestone({
      dueDate: "2026-05-10",
      actualEnd: "2026-05-10",
      status: "cumplido",
    });
    const rows = planVsRealRows([m], [], "2026-05-15");
    const tasks = [dummyTask({ status: "hecha" })];

    const summary = planVsRealSummary(rows, [], null, 3600, tasks, "2026-05-15");

    expect(summary.budgetHours).toBeNull();
    expect(summary.hoursVariance).toBeNull();
    expect(summary.hoursVariancePct).toBeNull();
    expect(summary.realHours).toBe(60);
  });

  it("cálculo de avance esperado ponderado por duración", () => {
    // Dos hitos con duraciones planificadas de 10 días cada uno (total 20 días)
    const m1 = dummyMilestone({
      id: "m-1",
      startDate: "2026-05-01",
      dueDate: "2026-05-11", // 10 días
      status: "en_curso",
    });
    const m2 = dummyMilestone({
      id: "m-2",
      startDate: "2026-05-11",
      dueDate: "2026-05-21", // 10 días
      status: "pendiente",
    });

    const tasks = [
      dummyTask({ id: "t-1", status: "hecha" }),
      dummyTask({ id: "t-2", status: "pendiente" }),
    ]; // 50% de avance real

    // 1) Al inicio de m1 (2026-05-01): 0% esperado
    const rows1 = planVsRealRows([m1, m2], [], "2026-05-01");
    const s1 = planVsRealSummary(rows1, [], 100, 0, tasks, "2026-05-01");
    expect(s1.expectedProgressPct).toBe(0);
    expect(s1.realProgressPct).toBe(50);
    expect(s1.gapPct).toBe(50); // real (50) - esperado (0)

    // 2) A mitad de m1 (2026-05-06): 5 días completados de 20 = 25% esperado
    const rows2 = planVsRealRows([m1, m2], [], "2026-05-06");
    const s2 = planVsRealSummary(rows2, [], 100, 0, tasks, "2026-05-06");
    expect(s2.expectedProgressPct).toBe(25);
    expect(s2.gapPct).toBe(25);

    // 3) Justo al terminar m1 (2026-05-11): 10 de 20 = 50% esperado
    const rows3 = planVsRealRows([m1, m2], [], "2026-05-11");
    const s3 = planVsRealSummary(rows3, [], 100, 0, tasks, "2026-05-11");
    expect(s3.expectedProgressPct).toBe(50);
    expect(s3.gapPct).toBe(0);

    // 4) A mitad de m2 (2026-05-16): 15 de 20 = 75% esperado
    const rows4 = planVsRealRows([m1, m2], [], "2026-05-16");
    const s4 = planVsRealSummary(rows4, [], 100, 0, tasks, "2026-05-16");
    expect(s4.expectedProgressPct).toBe(75);
    expect(s4.gapPct).toBe(-25); // atrasado respecto a lo esperado

    // 5) Al final de m2 (2026-05-21): 20 de 20 = 100% esperado
    const rows5 = planVsRealRows([m1, m2], [], "2026-05-21");
    const s5 = planVsRealSummary(rows5, [], 100, 0, tasks, "2026-05-21");
    expect(s5.expectedProgressPct).toBe(100);
    expect(s5.gapPct).toBe(-50);
  });

  it("resumen completo con baselines y desvíos medios no provisionales y provisionales", () => {
    // 1 ítem terminado a tiempo, 1 terminado tarde (+4 d), 1 en curso vencido provisional (+3 d)
    const m1 = dummyMilestone({
      id: "m-1",
      dueDate: "2026-05-10",
      actualEnd: "2026-05-10",
      status: "cumplido",
    });
    const m2 = dummyMilestone({
      id: "m-2",
      dueDate: "2026-05-10",
      actualEnd: "2026-05-14",
      status: "cumplido",
    });
    const m3 = dummyMilestone({
      id: "m-3",
      dueDate: "2026-05-10",
      actualEnd: null,
      status: "en_curso",
    });

    const baselines: Baseline[] = [
      {
        id: "b-1",
        projectId: "p-1",
        version: 1,
        date: "2026-01-01",
        scopeHours: 100,
        endDate: "2026-06-01",
        reason: "Inicial",
        changeRequestId: null,
      },
      {
        id: "b-2",
        projectId: "p-1",
        version: 2,
        date: "2026-03-01",
        scopeHours: 120,
        endDate: "2026-06-15",
        reason: "Cambio de alcance",
        changeRequestId: null,
      },
    ];

    const rows = planVsRealRows([m1, m2, m3], [], "2026-05-13");
    const summary = planVsRealSummary(rows, baselines, 100, 6000, [], "2026-05-13");

    // 2 ítems cerrados: 1 a tiempo (0) y 1 tarde (+4) -> 50%
    expect(summary.onTimePct).toBe(50);
    // Desvío medio no provisional: (0 + 4) / 2 = 2 días
    expect(summary.avgSlipDays).toBe(2);
    // Desvío provisional: +3 días
    expect(summary.provisionalAvgSlipDays).toBe(3);
    // Total atrasados: m2 (cerrado tarde) y m3 (en curso vencido) -> 2
    expect(summary.delayedCount).toBe(2);
    // Desvío baseline: diffDays("2026-06-15", "2026-06-01") = 14 días
    expect(summary.baselineEndShiftDays).toBe(14);
    // Crecimiento de alcance: 120 - 100 = 20 h
    expect(summary.scopeGrowthHours).toBe(20);
    // Horas reales: 6000 / 60 = 100 h frente a 100 h presupuesto
    expect(summary.realHours).toBe(100);
    expect(summary.hoursVariance).toBe(0);
    expect(summary.hoursVariancePct).toBe(0);
  });
});
