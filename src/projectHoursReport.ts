import { compensationMinutes, expectedMinutesInRange } from "./store";
import type { AppState, ID } from "./types";
import { addDays, addMonths, monthLabel, weekStart } from "./utils";

/**
 * Horas de los integrantes de un proyecto, por persona y por mes. El proyecto
 * solo define QUIÉNES aparecen (sus integrantes); extra y recuperadas son los
 * totales de cada persona, sin repartir entre proyectos:
 * - Totales proyecto: lo que la persona cargó a este proyecto.
 * - Extra: por semana (lun–dom), lo cargado en total por encima de la jornada
 *   esperada (detectado, se haya informado o no). Si la semana cae entre dos
 *   meses, cada mes se lleva la parte de la extra que corresponde a lo cargado
 *   en sus días.
 * - Recuperadas: compensaciones de horas aprobadas que empiezan en el mes.
 * - Netas: extra − recuperadas.
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
  const project = state.projects.find((p) => p.id === projectId);
  const members = state.users.filter((u) => project?.memberIds.includes(u.id));

  const weekCache = new Map<string, number>();
  /** Fracción de lo cargado en la semana que es extra (0 a 1) */
  const extraRatio = (userId: ID, ws: string) => {
    const key = `${userId}|${ws}`;
    const hit = weekCache.get(key);
    if (hit !== undefined) return hit;
    const we = addDays(ws, 6);
    let loaded = 0;
    for (const e of state.entries) if (e.userId === userId && e.date >= ws && e.date <= we) loaded += e.end - e.start;
    const u = state.users.find((x) => x.id === userId);
    const expected = u ? expectedMinutesInRange(state, u, ws, we) : 0;
    const extra = expected > 0 ? Math.max(0, loaded - expected) : loaded;
    const ratio = loaded > 0 ? extra / loaded : 0;
    weekCache.set(key, ratio);
    return ratio;
  };

  const acc = new Map<string, { total: number; extra: number; recovered: number }>();
  const cell = (month: string, userId: ID) => {
    const key = `${month}|${userId}`;
    let c = acc.get(key);
    if (!c) acc.set(key, (c = { total: 0, extra: 0, recovered: 0 }));
    return c;
  };

  const memberIds = new Set(members.map((u) => u.id));
  for (const e of state.entries) {
    if (!memberIds.has(e.userId) || e.date < from || e.date > to) continue;
    const mins = e.end - e.start;
    const c = cell(e.date.slice(0, 7), e.userId);
    if (e.projectId === projectId) c.total += mins;
    c.extra += mins * extraRatio(e.userId, weekStart(e.date));
  }

  for (const a of state.absences) {
    if (!memberIds.has(a.userId) || a.type !== "Compensación de horas" || a.status !== "Aprobado") continue;
    if (a.dateFrom < from || a.dateFrom > to) continue;
    cell(a.dateFrom.slice(0, 7), a.userId).recovered += compensationMinutes(state, a.userId, a);
  }

  const months: ProjectHoursMonth[] = [];
  for (let m = from.slice(0, 7) + "-01"; m <= to; m = addMonths(m, 1)) {
    const monthEnd = addDays(addMonths(m, 1), -1);
    const label = monthLabel(m).replace(" de ", " ");
    const rows = members
      .map((u) => {
        const c = acc.get(`${m.slice(0, 7)}|${u.id}`) ?? { total: 0, extra: 0, recovered: 0 };
        return { userId: u.id, name: u.name, totalMin: c.total, extraMin: c.extra, recoveredMin: c.recovered, netMin: c.extra - c.recovered };
      })
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
      ["Integrantes: las personas asignadas al proyecto. Extra y recuperadas son los totales de cada persona (todos sus proyectos), sin repartir."],
      ["Extra: lo cargado por encima de la jornada de cada semana. Recuperadas: compensaciones de horas aprobadas que empiezan en el mes."],
      ["Netas: extra − recuperadas."],
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
