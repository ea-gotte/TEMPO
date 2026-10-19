import { compensationMinutes, expectedMinutesInRange } from "./store";
import type { AppState, ID } from "./types";
import { addDays, addMonths, monthLabel, weekStart } from "./utils";

/**
 * Horas de un proyecto por persona y por mes:
 * - Totales: lo cargado al proyecto.
 * - Extra: por semana (lun–dom), lo cargado por encima de la jornada esperada
 *   (detectado, se haya informado o no), repartido entre los proyectos en
 *   proporción a lo cargado en cada uno esa semana.
 * - Recuperadas: compensaciones aprobadas, atribuidas al proyecto donde se
 *   generó la extra que consumen (el mismo orden FIFO que overtimeBalance) y
 *   al mes de la compensación.
 * - Netas: totales − recuperadas.
 */
export interface ProjectHoursRow {
  userId: ID;
  name: string;
  totalMin: number;
  extraMin: number;
  recoveredMin: number;
  netMin: number;
}

export interface ProjectHoursMonth {
  /** YYYY-MM */
  month: string;
  label: string;
  from: string;
  to: string;
  rows: ProjectHoursRow[];
}

export function projectHoursByMonth(state: AppState, projectId: ID, from: string, to: string): ProjectHoursMonth[] {
  const weekCache = new Map<string, { loaded: number; extra: number; project: number }>();
  const week = (userId: ID, ws: string) => {
    const key = `${userId}|${ws}`;
    const hit = weekCache.get(key);
    if (hit) return hit;
    const we = addDays(ws, 6);
    let loaded = 0;
    let project = 0;
    for (const e of state.entries) {
      if (e.userId !== userId || e.date < ws || e.date > we) continue;
      loaded += e.end - e.start;
      if (e.projectId === projectId) project += e.end - e.start;
    }
    const u = state.users.find((x) => x.id === userId);
    const expected = u ? expectedMinutesInRange(state, u, ws, we) : 0;
    const extra = expected > 0 ? Math.max(0, loaded - expected) : loaded;
    const w = { loaded, extra, project };
    weekCache.set(key, w);
    return w;
  };

  const acc = new Map<string, Map<ID, { total: number; extra: number; recovered: number }>>();
  const cell = (month: string, userId: ID) => {
    let m = acc.get(month);
    if (!m) acc.set(month, (m = new Map()));
    let c = m.get(userId);
    if (!c) m.set(userId, (c = { total: 0, extra: 0, recovered: 0 }));
    return c;
  };

  for (const e of state.entries) {
    if (e.projectId !== projectId || e.date < from || e.date > to) continue;
    const mins = e.end - e.start;
    const w = week(e.userId, weekStart(e.date));
    const c = cell(e.date.slice(0, 7), e.userId);
    c.total += mins;
    if (w.loaded > 0) c.extra += (mins * w.extra) / w.loaded;
  }

  // Recuperadas: se recorre TODO el historial de cada persona para que el
  // consumo FIFO de sus horas extra aprobadas sea el mismo que el del saldo
  const userIds = new Set(state.absences.filter((a) => a.type === "Compensación de horas" && a.status === "Aprobado").map((a) => a.userId));
  for (const userId of userIds) {
    const lots = state.overtime
      .filter((o) => o.userId === userId && o.status === "Aprobado")
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((o) => {
        const w = week(userId, weekStart(o.weekStart));
        return { remaining: o.minutes, share: w.loaded > 0 ? w.project / w.loaded : 0 };
      });
    const comps = state.absences
      .filter((a) => a.userId === userId && a.type === "Compensación de horas" && a.status === "Aprobado")
      .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
    for (const a of comps) {
      let left = compensationMinutes(state, userId, a);
      const inRange = a.dateFrom >= from && a.dateFrom <= to;
      for (const lot of lots) {
        if (left <= 0) break;
        const take = Math.min(lot.remaining, left);
        lot.remaining -= take;
        left -= take;
        if (inRange && take > 0 && lot.share > 0) cell(a.dateFrom.slice(0, 7), userId).recovered += take * lot.share;
      }
    }
  }

  const months: ProjectHoursMonth[] = [];
  for (let m = from.slice(0, 7) + "-01"; m <= to; m = addMonths(m, 1)) {
    const monthEnd = addDays(addMonths(m, 1), -1);
    const label = monthLabel(m).replace(" de ", " ");
    const rows = [...(acc.get(m.slice(0, 7)) ?? new Map()).entries()]
      .map(([userId, c]) => ({
        userId,
        name: state.users.find((u) => u.id === userId)?.name ?? "(persona eliminada)",
        totalMin: c.total,
        extraMin: c.extra,
        recoveredMin: c.recovered,
        netMin: c.total - c.recovered,
      }))
      .filter((r) => r.totalMin > 0 || r.recoveredMin > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    months.push({
      month: m.slice(0, 7),
      label: label.charAt(0).toUpperCase() + label.slice(1),
      from: m < from ? from : m,
      to: monthEnd > to ? to : monthEnd,
      rows,
    });
  }
  return months;
}

const H = (min: number) => Math.round((min / 60) * 100) / 100;

/** Excel con una hoja por mes: Persona | Totales | Extra | Recuperadas | Netas (en horas). */
export async function downloadProjectHoursXlsx(state: AppState, projectId: ID, from: string, to: string): Promise<string> {
  const XLSX = await import("xlsx");
  const { wb, file } = buildProjectHoursWorkbook(XLSX, state, projectId, from, to);
  XLSX.writeFile(wb, file);
  return file;
}

export function buildProjectHoursWorkbook(XLSX: typeof import("xlsx"), state: AppState, projectId: ID, from: string, to: string) {
  const project = state.projects.find((p) => p.id === projectId);
  const pName = project?.name ?? "Proyecto";
  const wb = XLSX.utils.book_new();
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  for (const m of projectHoursByMonth(state, projectId, from, to)) {
    const sum = (k: keyof Omit<ProjectHoursRow, "userId" | "name">) => m.rows.reduce((s, r) => s + r[k], 0);
    const aoa: (string | number)[][] = [
      [`${pName} · ${m.label}`],
      [`Del ${fmt(m.from)} al ${fmt(m.to)}`],
      [],
      ["Persona", "Horas totales proyecto", "Horas extra proyecto", "Horas recuperadas proyecto", "Horas netas proyecto"],
      ...m.rows.map((r) => [r.name, H(r.totalMin), H(r.extraMin), H(r.recoveredMin), H(r.netMin)]),
      ["Total", H(sum("totalMin")), H(sum("extraMin")), H(sum("recoveredMin")), H(sum("netMin"))],
      [],
      ["Extra: lo cargado por encima de la jornada de cada semana, repartido según las horas de cada proyecto esa semana."],
      ["Recuperadas: compensaciones aprobadas en el mes, atribuidas al proyecto donde se generó la extra que consumen."],
      ["Netas: totales − recuperadas."],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 20 }, { wch: 26 }, { wch: 20 }];
    const firstData = 5;
    const lastData = firstData + m.rows.length;
    for (let r = firstData; r <= lastData; r++) {
      for (const col of ["B", "C", "D", "E"]) {
        const c = ws[`${col}${r}`];
        if (c) c.z = "0.00";
      }
    }
    // Nombre de hoja: máx. 31 caracteres y único
    XLSX.utils.book_append_sheet(wb, ws, m.label.slice(0, 31));
  }

  const safe = pName.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
  return { wb, file: `horas-${safe}_${from}_${to}.xlsx` };
}
