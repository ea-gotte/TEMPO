/**
 * Lógica pura de cálculo de asignación teórica y real mensual por proyecto.
 */

export interface AllocationInput {
  projectId: string;
  userId: string;
  month: string; // "YYYY-MM-01"
  pct: number;
}

export interface MonthHoursInput {
  projectId: string;
  userId: string;
  month: string; // "YYYY-MM-01"
  minutes: number;
  userTotalMinutes: number;
}

export interface AllocationRow {
  projectId: string;
  userId: string;
  teorico: number;
  real: number | null;
  minutes: number;
  desvio: number | null;
  parcial: boolean;
  unplanned: boolean;
}

export interface AllocationIndicator {
  cumplimiento: number | null;
  desvioMedio: number | null;
  unplannedCount: number;
  unplannedMinutes: number;
}

export interface PersonTotal {
  userId: string;
  teorico: number;
  sobreasignada: boolean;
}

/* ============================================================
 * Helpers de mes
 * ============================================================ */

/** Retorna el primer día del mes como "AAAA-MM-01" */
export function monthOf(dateOrStr: string | Date): string {
  if (dateOrStr instanceof Date) {
    const y = dateOrStr.getFullYear();
    const m = String(dateOrStr.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }
  const clean = String(dateOrStr).trim().slice(0, 10);
  const parts = clean.split("-");
  if (parts.length >= 2) {
    const y = parts[0].padStart(4, "0");
    const m = parts[1].padStart(2, "0");
    return `${y}-${m}-01`;
  }
  return clean;
}

/** Suma o resta meses a una fecha "AAAA-MM-01" */
export function addMonths(monthStr: string, n: number): string {
  const clean = monthOf(monthStr);
  const [yStr, mStr] = clean.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = new Date(y, m + n, 1);
  const resY = d.getFullYear();
  const resM = String(d.getMonth() + 1).padStart(2, "0");
  return `${resY}-${resM}-01`;
}

/** Etiqueta legible de un mes (ej. "Noviembre 2026") */
export function monthLabel(monthStr: string): string {
  const clean = monthOf(monthStr);
  const [yStr, mStr] = clean.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = new Date(y, m, 1);
  const raw = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/* ============================================================
 * Filas de asignación
 * ============================================================ */

/**
 * Calcula una fila por combinación persona-proyecto con teórico u horas en el mes.
 */
export function allocationRows(
  allocations: AllocationInput[],
  hours: MonthHoursInput[],
  month: string,
  currentMonth: string,
): AllocationRow[] {
  const targetMonth = monthOf(month);
  const curMonth = monthOf(currentMonth);
  const isFuture = targetMonth > curMonth;
  const isCurrent = targetMonth === curMonth;

  // Filtrar al mes objetivo
  const monthAllocations = allocations.filter((a) => monthOf(a.month) === targetMonth);
  const monthHours = hours.filter((h) => monthOf(h.month) === targetMonth);

  const allocMap = new Map<string, AllocationInput>();
  for (const a of monthAllocations) {
    allocMap.set(`${a.projectId}::${a.userId}`, a);
  }

  const hoursMap = new Map<string, MonthHoursInput>();
  for (const h of monthHours) {
    hoursMap.set(`${h.projectId}::${h.userId}`, h);
  }

  // Todas las combinaciones de persona-proyecto en ese mes
  const allKeys = new Set<string>([...allocMap.keys(), ...hoursMap.keys()]);
  const rows: AllocationRow[] = [];

  for (const key of allKeys) {
    const [projectId, userId] = key.split("::");
    const a = allocMap.get(key);
    const h = hoursMap.get(key);

    const teorico = a ? Number(a.pct) : 0;
    const minutes = h ? Number(h.minutes) : 0;
    const userTotalMinutes = h ? Number(h.userTotalMinutes) : 0;

    let real: number | null = null;
    let desvio: number | null = null;

    if (!isFuture) {
      if (userTotalMinutes > 0 && minutes > 0) {
        real = Math.round(((minutes / userTotalMinutes) * 100) * 10) / 10;
      } else {
        real = 0;
      }
      desvio = Math.round((real - teorico) * 10) / 10;
    }

    const unplanned = teorico === 0 && minutes > 0;

    rows.push({
      projectId,
      userId,
      teorico,
      real,
      minutes,
      desvio,
      parcial: isCurrent,
      unplanned,
    });
  }

  return rows.sort((x, y) => x.projectId.localeCompare(y.projectId) || x.userId.localeCompare(y.userId));
}

/* ============================================================
 * Indicadores
 * ============================================================ */

/**
 * Indicador de asignación del mes:
 * - cumplimiento ponderado por max(teorico, real) sobre filas con desvío
 * - desvío medio absoluto
 * - cantidad de filas no planificadas
 */
export function allocationIndicator(rows: AllocationRow[]): AllocationIndicator {
  const unplannedRows = rows.filter((r) => r.unplanned || (r.teorico === 0 && r.minutes > 0));
  const unplannedCount = unplannedRows.length;
  const unplannedMinutes = unplannedRows.reduce((acc, r) => acc + r.minutes, 0);

  // Filas con desvío no nulo y peso > 0
  const validRows = rows.filter(
    (r) => r.desvio !== null && Math.max(r.teorico, r.real ?? 0) > 0,
  );

  if (validRows.length === 0) {
    return {
      cumplimiento: null,
      desvioMedio: null,
      unplannedCount,
      unplannedMinutes,
    };
  }

  const totalWeight = validRows.reduce((sum, r) => sum + Math.max(r.teorico, r.real ?? 0), 0);

  if (totalWeight <= 0) {
    return {
      cumplimiento: null,
      desvioMedio: null,
      unplannedCount,
      unplannedMinutes,
    };
  }

  let weightedScoreSum = 0;
  let weightedDesvioSum = 0;

  for (const r of validRows) {
    const weight = Math.max(r.teorico, r.real ?? 0);
    const score = Math.max(0, 100 - Math.abs(r.desvio!));
    weightedScoreSum += score * weight;
    weightedDesvioSum += Math.abs(r.desvio!) * weight;
  }

  const cumplimiento = Math.round((weightedScoreSum / totalWeight) * 10) / 10;
  const desvioMedio = Math.round((weightedDesvioSum / totalWeight) * 10) / 10;

  return {
    cumplimiento,
    desvioMedio,
    unplannedCount,
    unplannedMinutes,
  };
}

/* ============================================================
 * Totales por persona
 * ============================================================ */

/**
 * Agrega el teórico total de cada persona y marca si está sobreasignada (> 100%).
 */
export function personTotals(rows: AllocationRow[]): Record<string, PersonTotal> {
  const totals: Record<string, PersonTotal> = {};

  for (const r of rows) {
    if (!totals[r.userId]) {
      totals[r.userId] = {
        userId: r.userId,
        teorico: 0,
        sobreasignada: false,
      };
    }
    totals[r.userId].teorico += r.teorico;
  }

  for (const pt of Object.values(totals)) {
    pt.teorico = Math.round(pt.teorico * 10) / 10;
    pt.sobreasignada = pt.teorico > 100;
  }

  return totals;
}
