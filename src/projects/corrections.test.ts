import { describe, expect, it } from "vitest";
import {
  correctionState,
  deliverableCorrections,
  projectRework,
} from "./corrections";
import type { Deliverable, DeliverableReview, Task } from "./types";

function mockDeliverable(overrides: Partial<Deliverable> = {}): Deliverable {
  return {
    id: "del-1",
    projectId: "proj-1",
    milestoneId: "ms-1",
    name: "Entregable 1",
    description: "",
    ownerId: null,
    startDate: "2026-10-01",
    dueDate: "2026-10-15",
    actualStart: "2026-10-01",
    actualEnd: null,
    status: "en_curso",
    firstDeliveredAt: null,
    ...overrides,
  };
}

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    projectId: "proj-1",
    milestoneId: "ms-1",
    deliverableId: "del-1",
    name: "Tarea 1",
    description: "",
    assigneeId: null,
    status: "pendiente",
    priority: "media",
    startDate: null,
    dueDate: null,
    kind: "tarea",
    estimateHours: 10,
    estimateMin: null,
    estimateMax: null,
    confidence: "media",
    sprintId: null,
    sprintAddedAt: null,
    rank: 0,
    changeRequestId: null,
    reviewId: null,
    completedAt: null,
    archived: false,
    archivedAt: null,
    custom: {},
    sortOrder: 0,
    createdBy: null,
    createdAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function mockReview(overrides: Partial<DeliverableReview> = {}): DeliverableReview {
  return {
    id: "rev-1",
    projectId: "proj-1",
    deliverableId: "del-1",
    round: 1,
    date: "2026-10-16",
    source: "cliente",
    note: "Ajustar interferencias",
    createdBy: "user-1",
    createdAt: "2026-10-16T10:00:00Z",
    ...overrides,
  };
}

describe("corrections", () => {
  it("sin revisiones", () => {
    const del = mockDeliverable();
    const stats = deliverableCorrections(del.id, [], []);

    expect(stats.rounds).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.open).toBe(0);
    expect(stats.closed).toBe(0);
    expect(stats.estimatedHours).toBe(0);
    expect(stats.openHours).toBe(0);
    expect(stats.lastReview).toBeNull();
    expect(correctionState(del, stats)).toBe("sin_revisiones");
  });

  it("una ronda abierta", () => {
    const del = mockDeliverable();
    const rev = mockReview({ round: 1 });
    const t1 = mockTask({
      id: "c-1",
      kind: "correccion",
      reviewId: rev.id,
      status: "en_curso",
      estimateHours: 5,
    });
    const t2 = mockTask({
      id: "c-2",
      kind: "correccion",
      reviewId: rev.id,
      status: "pendiente",
      estimateHours: 3,
    });

    const stats = deliverableCorrections(del.id, [t1, t2], [rev]);
    expect(stats.rounds).toBe(1);
    expect(stats.total).toBe(2);
    expect(stats.open).toBe(2);
    expect(stats.closed).toBe(0);
    expect(stats.estimatedHours).toBe(8);
    expect(stats.openHours).toBe(8);
    expect(stats.lastReview?.id).toBe(rev.id);
    expect(correctionState(del, stats)).toBe("en_correcciones");
  });

  it("dos rondas con correcciones mixtas", () => {
    const del = mockDeliverable();
    const rev1 = mockReview({ id: "rev-1", round: 1, date: "2026-10-10" });
    const rev2 = mockReview({ id: "rev-2", round: 2, date: "2026-10-20" });

    const t1 = mockTask({
      id: "c-1",
      kind: "correccion",
      reviewId: rev1.id,
      status: "hecha",
      estimateHours: 4,
    });
    const t2 = mockTask({
      id: "c-2",
      kind: "correccion",
      reviewId: rev2.id,
      status: "pendiente",
      estimateHours: 6,
    });

    const stats = deliverableCorrections(del.id, [t1, t2], [rev1, rev2]);
    expect(stats.rounds).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.closed).toBe(1);
    expect(stats.estimatedHours).toBe(10);
    expect(stats.openHours).toBe(6);
    expect(stats.lastReview?.id).toBe("rev-2");
    expect(correctionState(del, stats)).toBe("en_correcciones");
  });

  it("todo cerrado: listo para entregar y aprobado (con tareas archivadas hechas)", () => {
    const del = mockDeliverable({ status: "en_curso" });
    const rev = mockReview();
    const t1 = mockTask({
      id: "c-1",
      kind: "correccion",
      status: "hecha",
      estimateHours: 4,
    });
    const t2 = mockTask({
      id: "c-2",
      kind: "correccion",
      status: "hecha",
      archived: true,
      estimateHours: 6,
    });

    const stats = deliverableCorrections(del.id, [t1, t2], [rev]);
    expect(stats.open).toBe(0);
    expect(stats.closed).toBe(2);
    expect(stats.openHours).toBe(0);
    expect(stats.estimatedHours).toBe(10);

    // Cuando el entregable aún no está cumplido:
    expect(correctionState(del, stats)).toBe("listo_para_entregar");

    // Cuando pasa a cumplido:
    const delAprobado = { ...del, status: "cumplido" as const };
    expect(correctionState(delAprobado, stats)).toBe("aprobado");
  });

  it("proyecto sin horas no divide por cero", () => {
    const del = mockDeliverable();
    const rev = mockReview();
    const t1 = mockTask({ kind: "correccion", estimateHours: null });
    const t2 = mockTask({ kind: "tarea", estimateHours: 0 });

    const rework = projectRework("proj-1", [t1, t2], [del], [rev]);
    expect(rework.reworkPct).toBeNull();
    expect(rework.avgRounds).toBe(1);
    expect(rework.deliverablesWithOpen).toBe(1);
  });

  it("entregable sin entregar: firstPassPct da null si no hay ninguno entregado", () => {
    const del = mockDeliverable({
      status: "pendiente",
      firstDeliveredAt: null,
      actualEnd: null,
    });

    const rework = projectRework("proj-1", [], [del], []);
    expect(rework.firstPassPct).toBeNull();
    expect(rework.avgRounds).toBe(0);
  });

  it("revisión interna frente a revisión del cliente", () => {
    const del1 = mockDeliverable({
      id: "del-1",
      status: "cumplido",
      firstDeliveredAt: "2026-10-15",
    });
    const del2 = mockDeliverable({
      id: "del-2",
      status: "cumplido",
      firstDeliveredAt: "2026-10-20",
    });

    // del1 solo tuvo revisión interna (cuenta como aprobado a la primera frente al cliente)
    const revInterna = mockReview({
      id: "r-int",
      deliverableId: "del-1",
      source: "interna",
    });

    // del2 tuvo revisión del cliente
    const revCliente = mockReview({
      id: "r-cli",
      deliverableId: "del-2",
      source: "cliente",
    });

    const tasks = [
      mockTask({ kind: "tarea", estimateHours: 40 }),
      mockTask({ kind: "correccion", deliverableId: "del-1", estimateHours: 5, status: "hecha" }),
      mockTask({ kind: "correccion", deliverableId: "del-2", estimateHours: 5, status: "hecha" }),
    ];

    const rework = projectRework(
      "proj-1",
      tasks,
      [del1, del2],
      [revInterna, revCliente]
    );

    // 1 de 2 entregables no tuvo revisión del cliente => 50%
    expect(rework.firstPassPct).toBe(50);
    // 10h de correcciones / 50h totales = 20%
    expect(rework.reworkPct).toBe(20);
    // (1 ronda + 1 ronda) / 2 entregables = 1 ronda promedio
    expect(rework.avgRounds).toBe(1);
    expect(rework.deliverablesWithOpen).toBe(0);
  });
});
