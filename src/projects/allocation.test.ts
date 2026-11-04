import { describe, expect, it } from "vitest";
import {
  addMonths,
  allocationIndicator,
  allocationRows,
  monthLabel,
  monthOf,
  personTotals,
  type AllocationInput,
  type MonthHoursInput,
} from "./allocation";

describe("Helpers de mes", () => {
  it("monthOf formatea cadenas y fechas al primer día del mes", () => {
    expect(monthOf("2026-11-04")).toBe("2026-11-01");
    expect(monthOf("2026-11")).toBe("2026-11-01");
    expect(monthOf("2026-11-01")).toBe("2026-11-01");
    expect(monthOf(new Date(2026, 10, 15))).toBe("2026-11-01");
  });

  it("addMonths suma y resta meses correctamente entre años", () => {
    expect(addMonths("2026-11-01", 1)).toBe("2026-12-01");
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonths("2026-11-01", -1)).toBe("2026-10-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-11-01", -6)).toBe("2026-05-01");
  });

  it("monthLabel genera una etiqueta legible en español", () => {
    const lbl = monthLabel("2026-11-01");
    expect(lbl.toLowerCase()).toContain("noviembre");
    expect(lbl).toContain("2026");
  });
});

describe("allocationRows", () => {
  const currentMonth = "2026-11-01";

  it("mes pasado: calcula real, desvío y parcial es false", () => {
    const month = "2026-10-01";
    const allocations: AllocationInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", pct: 50 },
    ];
    // 600 minutos de 1200 minutos totales = 50%
    const hours: MonthHoursInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", minutes: 600, userTotalMinutes: 1200 },
    ];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      projectId: "p1",
      userId: "u1",
      teorico: 50,
      real: 50,
      minutes: 600,
      desvio: 0,
      parcial: false,
      unplanned: false,
    });
  });

  it("mes futuro: real y desvío son null, parcial es false", () => {
    const month = "2026-12-01";
    const allocations: AllocationInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-12-01", pct: 40 },
    ];
    const hours: MonthHoursInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-12-01", minutes: 0, userTotalMinutes: 0 },
    ];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      projectId: "p1",
      userId: "u1",
      teorico: 40,
      real: null,
      minutes: 0,
      desvio: null,
      parcial: false,
      unplanned: false,
    });
  });

  it("mes actual: calcula real, desvío y parcial es true", () => {
    const month = "2026-11-01";
    const allocations: AllocationInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-11-01", pct: 60 },
    ];
    // 480 minutos de 960 totales = 50%
    const hours: MonthHoursInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-11-01", minutes: 480, userTotalMinutes: 960 },
    ];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0].parcial).toBe(true);
    expect(rows[0].teorico).toBe(60);
    expect(rows[0].real).toBe(50);
    expect(rows[0].desvio).toBe(-10); // 50 - 60
    expect(rows[0].unplanned).toBe(false);
  });

  it("persona sin horas en el mes: real es 0 y desvío es -teorico", () => {
    const month = "2026-10-01";
    const allocations: AllocationInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", pct: 75 },
    ];
    const hours: MonthHoursInput[] = [];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0].teorico).toBe(75);
    expect(rows[0].minutes).toBe(0);
    expect(rows[0].real).toBe(0);
    expect(rows[0].desvio).toBe(-75);
    expect(rows[0].unplanned).toBe(false);
  });

  it("horas sin teórico: marcada como no planificada con teórico 0", () => {
    const month = "2026-10-01";
    const allocations: AllocationInput[] = [];
    const hours: MonthHoursInput[] = [
      { projectId: "p2", userId: "u2", month: "2026-10-01", minutes: 300, userTotalMinutes: 600 },
    ];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0].teorico).toBe(0);
    expect(rows[0].minutes).toBe(300);
    expect(rows[0].real).toBe(50);
    expect(rows[0].desvio).toBe(50); // 50 - 0
    expect(rows[0].unplanned).toBe(true);
  });

  it("evita división por cero si userTotalMinutes es 0", () => {
    const month = "2026-10-01";
    const allocations: AllocationInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", pct: 50 },
    ];
    const hours: MonthHoursInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", minutes: 0, userTotalMinutes: 0 },
    ];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows).toHaveLength(1);
    expect(rows[0].real).toBe(0);
    expect(rows[0].desvio).toBe(-50);
  });

  it("redondeos en cálculo de real y desvío a un decimal", () => {
    const month = "2026-10-01";
    const allocations: AllocationInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", pct: 33.3 },
    ];
    // 100 de 300 = 33.3333...%
    const hours: MonthHoursInput[] = [
      { projectId: "p1", userId: "u1", month: "2026-10-01", minutes: 100, userTotalMinutes: 300 },
    ];

    const rows = allocationRows(allocations, hours, month, currentMonth);
    expect(rows[0].real).toBe(33.3);
    expect(rows[0].desvio).toBe(0);
  });
});

describe("personTotals", () => {
  it("suma el teórico por persona y marca sobreasignada si supera 100", () => {
    const rows = [
      { projectId: "p1", userId: "u1", teorico: 60, real: 50, minutes: 100, desvio: -10, parcial: false, unplanned: false },
      { projectId: "p2", userId: "u1", teorico: 50, real: 50, minutes: 100, desvio: 0, parcial: false, unplanned: false },
      { projectId: "p1", userId: "u2", teorico: 100, real: 100, minutes: 200, desvio: 0, parcial: false, unplanned: false },
      { projectId: "p1", userId: "u3", teorico: 40, real: 40, minutes: 80, desvio: 0, parcial: false, unplanned: false },
    ];

    const totals = personTotals(rows);

    // u1: 60 + 50 = 110 > 100 -> sobreasignada
    expect(totals["u1"]).toEqual({
      userId: "u1",
      teorico: 110,
      sobreasignada: true,
    });

    // u2: exactamente 100 -> no supera 100
    expect(totals["u2"]).toEqual({
      userId: "u2",
      teorico: 100,
      sobreasignada: false,
    });

    // u3: 40 -> no sobreasignada
    expect(totals["u3"]).toEqual({
      userId: "u3",
      teorico: 40,
      sobreasignada: false,
    });
  });
});

describe("allocationIndicator", () => {
  it("sin datos o sin filas válidas devuelve null en indicadores y 0 en no planificadas", () => {
    expect(allocationIndicator([])).toEqual({
      cumplimiento: null,
      desvioMedio: null,
      unplannedCount: 0,
      unplannedMinutes: 0,
    });

    // Mes futuro: desvío es null en todas las filas
    const futureRows = [
      { projectId: "p1", userId: "u1", teorico: 50, real: null, minutes: 0, desvio: null, parcial: false, unplanned: false },
    ];
    expect(allocationIndicator(futureRows).cumplimiento).toBeNull();
    expect(allocationIndicator(futureRows).desvioMedio).toBeNull();
  });

  it("calcula cumplimiento ponderado por max(teorico, real) y desvío medio", () => {
    // Fila 1: teorico 50, real 50 -> desvio 0. Peso max(50, 50) = 50. Score = max(0, 100 - 0) = 100.
    // Fila 2: teorico 50, real 30 -> desvio -20. Peso max(50, 30) = 50. Score = max(0, 100 - 20) = 80.
    // Total peso = 100.
    // Score ponderado = (100 * 50 + 80 * 50) / 100 = 90.
    // Desvío medio ponderado = (0 * 50 + 20 * 50) / 100 = 10.
    const rows = [
      { projectId: "p1", userId: "u1", teorico: 50, real: 50, minutes: 500, desvio: 0, parcial: false, unplanned: false },
      { projectId: "p1", userId: "u2", teorico: 50, real: 30, minutes: 300, desvio: -20, parcial: false, unplanned: false },
    ];

    const ind = allocationIndicator(rows);
    expect(ind.cumplimiento).toBe(90);
    expect(ind.desvioMedio).toBe(10);
    expect(ind.unplannedCount).toBe(0);
  });

  it("cuenta filas y minutos no planificados", () => {
    const rows = [
      { projectId: "p1", userId: "u1", teorico: 0, real: 30, minutes: 180, desvio: 30, parcial: false, unplanned: true },
      { projectId: "p2", userId: "u2", teorico: 50, real: 50, minutes: 300, desvio: 0, parcial: false, unplanned: false },
      { projectId: "p3", userId: "u3", teorico: 0, real: 20, minutes: 120, desvio: 20, parcial: false, unplanned: true },
    ];

    const ind = allocationIndicator(rows);
    expect(ind.unplannedCount).toBe(2);
    expect(ind.unplannedMinutes).toBe(300);
  });

  it("ignora filas con peso 0 (sin teórico y sin real)", () => {
    const rows = [
      { projectId: "p1", userId: "u1", teorico: 0, real: 0, minutes: 0, desvio: 0, parcial: false, unplanned: false },
    ];

    const ind = allocationIndicator(rows);
    expect(ind.cumplimiento).toBeNull();
    expect(ind.desvioMedio).toBeNull();
  });
});
