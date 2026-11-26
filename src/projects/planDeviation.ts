import { today } from "../utils";
import { taskProgress } from "./logic";
import { diffDays } from "./schedule";
import type { Baseline, Deliverable, Milestone, Task } from "./types";

/**
 * Comparación de planificación esperada vs real y cálculo de desvíos.
 * Funciones puras que reciben `now` por parámetro para facilitar testeo y previsibilidad.
 */

export type PlanVsRealStatus =
  | "Adelantado"
  | "A tiempo"
  | "Atrasado"
  | "Cumplido"
  | "En curso"
  | "Pendiente"
  | "Sin plan";

export type PlanVsRealItemType = "Hito" | "Entregable";

export interface PlanVsRealRow {
  id: string;
  type: PlanVsRealItemType;
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  startDeviationDays: number | null;
  endDeviationDays: number | null;
  isEndProvisional: boolean;
  status: PlanVsRealStatus;
}

export interface PlanVsRealSummary {
  /** % de ítems terminados dentro de su fecha planificada */
  onTimePct: number | null;
  /** Desvío medio de fin en días (solo ítems con desvío no provisional) */
  avgSlipDays: number | null;
  /** Desvío medio de fin en días de ítems provisionales (en curso/vencidos) */
  provisionalAvgSlipDays: number | null;
  /** Cantidad de ítems atrasados (tanto cerrados tarde como en curso vencidos) */
  delayedCount: number;
  /** Desvío del fin del proyecto contra la línea base v1 (último endDate vs v1.endDate; null si no hay base) */
  baselineEndShiftDays: number | null;
  /** Crecimiento de alcance en horas (última base frente a v1) */
  scopeGrowthHours: number | null;
  /** Horas proyectadas (presupuesto) */
  budgetHours: number | null;
  /** Horas reales registradas a nivel de proyecto */
  realHours: number;
  /** Desvío de horas (reales - proyectadas, en h; + = sobreconsumo) */
  hoursVariance: number | null;
  /** Desvío de horas en % (+ = sobreconsumo) */
  hoursVariancePct: number | null;
  /** Avance real según porcentaje de tareas hechas (0 a 100) */
  realProgressPct: number;
  /** Avance esperado por calendario ponderado por duración de fechas planificadas (0 a 100) */
  expectedProgressPct: number | null;
  /** Brecha de avance (% real - % esperado) */
  gapPct: number | null;
}

/**
 * Genera una fila por hito y por entregable comparando plan vs real.
 * Convención de signo: positivo = atrasado, negativo = adelantado.
 */
export function planVsRealRows(
  milestones: Milestone[],
  deliverables: Deliverable[],
  now: string = today()
): PlanVsRealRow[] {
  const mapItem = (
    item: Milestone | Deliverable,
    type: PlanVsRealItemType
  ): PlanVsRealRow => {
    const plannedStart = item.startDate ?? null;
    const plannedEnd = item.dueDate ?? null;
    const actualStart = item.actualStart ?? null;
    const actualEnd = item.actualEnd ?? null;

    // Desvío de inicio: positivo = atrasado, negativo = adelantado
    let startDeviationDays: number | null = null;
    if (plannedStart && actualStart) {
      startDeviationDays = diffDays(actualStart, plannedStart);
    }

    let endDeviationDays: number | null = null;
    let isEndProvisional = false;
    let status: PlanVsRealStatus;

    if (!plannedEnd) {
      // Sin fecha planificada
      endDeviationDays = null;
      isEndProvisional = false;
      status = "Sin plan";
    } else if (item.status === "cumplido") {
      // Terminado
      isEndProvisional = false;
      if (actualEnd) {
        endDeviationDays = diffDays(actualEnd, plannedEnd);
        if (endDeviationDays < 0) {
          status = "Adelantado";
        } else if (endDeviationDays === 0) {
          status = "A tiempo";
        } else {
          status = "Atrasado";
        }
      } else {
        // Marcado cumplido sin fecha real: no se puede medir, y no cuenta para el cumplimiento
        endDeviationDays = null;
        status = "Cumplido";
      }
    } else {
      // No terminó
      if (plannedEnd < now) {
        // Fin planificado ya pasó: desvío contra now y es provisional
        endDeviationDays = diffDays(now, plannedEnd);
        isEndProvisional = true;
        status = "Atrasado";
      } else {
        // Todavía no venció
        endDeviationDays = null;
        isEndProvisional = false;
        status = item.status === "en_curso" ? "En curso" : "Pendiente";
      }
    }

    return {
      id: item.id,
      type,
      name: item.name,
      plannedStart,
      plannedEnd,
      actualStart,
      actualEnd,
      startDeviationDays,
      endDeviationDays,
      isEndProvisional,
      status,
    };
  };

  return [
    ...milestones.map((m) => mapItem(m, "Hito")),
    ...deliverables.map((d) => mapItem(d, "Entregable")),
  ];
}

/**
 * Calcula métricas resumen del proyecto a partir de las filas y datos de línea base / horas / tareas.
 */
export function planVsRealSummary(
  rows: PlanVsRealRow[],
  baselines: Baseline[],
  budgetHours: number | null | undefined,
  realMinutes: number,
  tasks: Task[],
  now: string = today()
): PlanVsRealSummary {
  // 1) % de ítems terminados a tiempo (<= 0 días de desvío de fin)
  const closedItems = rows.filter(
    (r) =>
      !r.isEndProvisional &&
      r.endDeviationDays !== null &&
      (r.status === "A tiempo" || r.status === "Adelantado" || r.status === "Atrasado")
  );
  const onTimeCount = closedItems.filter((r) => r.endDeviationDays! <= 0).length;
  const onTimePct =
    closedItems.length > 0 ? Math.round((onTimeCount / closedItems.length) * 100) : null;

  // 2) Desvío medio de fin en días: no provisional y provisional
  const nonProvisionalDeviations = rows
    .filter((r) => !r.isEndProvisional && r.endDeviationDays !== null)
    .map((r) => r.endDeviationDays!);
  const avgSlipDays =
    nonProvisionalDeviations.length > 0
      ? Math.round(
          (nonProvisionalDeviations.reduce((a, b) => a + b, 0) /
            nonProvisionalDeviations.length) *
            10
        ) / 10
      : null;

  const provisionalDeviations = rows
    .filter((r) => r.isEndProvisional && r.endDeviationDays !== null)
    .map((r) => r.endDeviationDays!);
  const provisionalAvgSlipDays =
    provisionalDeviations.length > 0
      ? Math.round(
          (provisionalDeviations.reduce((a, b) => a + b, 0) /
            provisionalDeviations.length) *
            10
        ) / 10
      : null;

  // 3) Cantidad de ítems atrasados
  const delayedCount = rows.filter((r) => r.status === "Atrasado").length;

  // 4) Desvío del fin del proyecto contra la línea base v1 y crecimiento de alcance
  let baselineEndShiftDays: number | null = null;
  let scopeGrowthHours: number | null = null;

  if (baselines.length > 0) {
    const sortedBaselines = [...baselines].sort((a, b) => a.version - b.version);
    const v1 = sortedBaselines.find((b) => b.version === 1) ?? sortedBaselines[0];
    const last = sortedBaselines[sortedBaselines.length - 1];

    if (v1 && last) {
      if (v1.endDate && last.endDate) {
        baselineEndShiftDays = diffDays(last.endDate, v1.endDate);
      }
      scopeGrowthHours = Math.round((last.scopeHours - v1.scopeHours) * 10) / 10;
    }
  }

  // 5) Horas proyectadas, horas reales y desvío en h y %
  const realHours = Math.round((realMinutes / 60) * 10) / 10;
  const budget = budgetHours != null && budgetHours > 0 ? budgetHours : null;
  let hoursVariance: number | null = null;
  let hoursVariancePct: number | null = null;

  if (budget != null) {
    hoursVariance = Math.round((realHours - budget) * 10) / 10;
    hoursVariancePct = Math.round(((realHours - budget) / budget) * 100);
  }

  // 6) Avance real (taskProgress) frente a avance esperado por calendario
  const progress = taskProgress(tasks);
  const realProgressPct = progress.pct;

  // Avance esperado por calendario ponderado por duración de fechas planificadas
  const rowsWithPlan = rows.filter((r) => r.plannedEnd !== null);
  let expectedProgressPct: number | null = null;

  if (rowsWithPlan.length > 0) {
    let totalDurationDays = 0;
    let expectedCompletedDays = 0;

    for (const r of rowsWithPlan) {
      const pEnd = r.plannedEnd!;
      const pStart = r.plannedStart ?? pEnd;
      const duration = Math.max(1, diffDays(pEnd, pStart));
      totalDurationDays += duration;

      if (now >= pEnd) {
        expectedCompletedDays += duration;
      } else if (now > pStart) {
        const elapsed = Math.max(0, diffDays(now, pStart));
        expectedCompletedDays += Math.min(duration, elapsed);
      }
    }

    if (totalDurationDays > 0) {
      expectedProgressPct = Math.round(
        Math.max(0, Math.min(100, (expectedCompletedDays / totalDurationDays) * 100))
      );
    }
  }

  const gapPct =
    expectedProgressPct != null ? realProgressPct - expectedProgressPct : null;

  return {
    onTimePct,
    avgSlipDays,
    provisionalAvgSlipDays,
    delayedCount,
    baselineEndShiftDays,
    scopeGrowthHours,
    budgetHours: budgetHours ?? null,
    realHours,
    hoursVariance,
    hoursVariancePct,
    realProgressPct,
    expectedProgressPct,
    gapPct,
  };
}
