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

/** `userIds`: personas a incluir; si no se indica, los integrantes del proyecto. */
export function projectHoursByMonth(state: AppState, projectId: ID, from: string, to: string, userIds?: ID[]): ProjectHoursMonth[] {
  const project = state.projects.find((p) => p.id === projectId);
  const members = state.users.filter((u) => (userIds ? userIds.includes(u.id) : project?.memberIds.includes(u.id)));

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

/** Excel con una hoja Resumen y una por mes: Persona | Totales | Extra | Recuperadas | Netas (en horas). */
export async function downloadProjectHoursXlsx(state: AppState, projectId: ID, from: string, to: string, userIds?: ID[]): Promise<string> {
  const XLSX = await import("xlsx");
  const { wb, file } = buildProjectHoursWorkbook(XLSX, state, projectId, from, to, userIds);
  XLSX.writeFile(wb, file);
  return file;
}

const HEADER = ["Horas totales proyecto", "Horas extra proyecto", "Horas recuperadas proyecto", "Horas netas proyecto"];
const NOTES = [
  ["Personas: las elegidas al exportar (por defecto, los integrantes del proyecto). Extra y recuperadas son los totales de cada persona (todos sus proyectos), sin repartir."],
  ["Extra: lo cargado por encima de la jornada de cada semana. Recuperadas: compensaciones de horas aprobadas que empiezan en el mes."],
  ["Netas: extra − recuperadas."],
];
type Sums = Pick<ProjectHoursRow, "totalMin" | "extraMin" | "recoveredMin" | "netMin">;
const zero = (): Sums => ({ totalMin: 0, extraMin: 0, recoveredMin: 0, netMin: 0 });
const add = (a: Sums, b: Sums) => { a.totalMin += b.totalMin; a.extraMin += b.extraMin; a.recoveredMin += b.recoveredMin; a.netMin += b.netMin; return a; };
const hours = (r: Sums) => [H(r.totalMin), H(r.extraMin), H(r.recoveredMin), H(r.netMin)];

export function buildProjectHoursWorkbook(XLSX: typeof import("xlsx"), state: AppState, projectId: ID, from: string, to: string, userIds?: ID[]) {
  const project = state.projects.find((p) => p.id === projectId);
  const pName = project?.name ?? "Proyecto";
  const wb = XLSX.utils.book_new();
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const months = projectHoursByMonth(state, projectId, from, to, userIds);

  /** Hoja con formato de horas (0.00) en las columnas numéricas de las filas indicadas */
  const sheet = (aoa: (string | number)[][], numericRows: number[], firstCol = 32) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: firstCol }, { wch: 22 }, { wch: 20 }, { wch: 26 }, { wch: 20 }];
    for (const r of numericRows) {
      for (const col of ["B", "C", "D", "E"]) {
        const c = ws[`${col}${r}`];
        if (c) c.z = "0.00";
      }
    }
    return ws;
  };

  // ---------- Resumen: todo el período ----------
  const byPerson = new Map<ID, { name: string } & Sums>();
  const byMonth = months.map((m) => ({ label: m.label, sums: m.rows.reduce((acc, r) => add(acc, r), zero()) }));
  for (const m of months) {
    for (const r of m.rows) {
      const cur = byPerson.get(r.userId) ?? { name: r.name, ...zero() };
      byPerson.set(r.userId, add(cur, r) as { name: string } & Sums);
    }
  }
  const people = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const grand = byMonth.reduce((acc, m) => add(acc, m.sums), zero());
  const summary: (string | number)[][] = [
    [`${pName} · Resumen`],
    [`Del ${fmt(from)} al ${fmt(to)} · ${months.length} mes${months.length === 1 ? "" : "es"} · ${people.length} persona${people.length === 1 ? "" : "s"}`],
    [],
    ["Por persona (todo el período)"],
    ["Persona", ...HEADER],
    ...people.map((p) => [p.name, ...hours(p)]),
    ["Total", ...hours(grand)],
    [],
    ["Por mes"],
    ["Mes", ...HEADER],
    ...byMonth.map((m) => [m.label, ...hours(m.sums)]),
    ["Total", ...hours(grand)],
    [],
    ...NOTES,
  ];
  const pStart = 6;
  const mStart = pStart + people.length + 4; // total, vacía, "Por mes" y encabezado
  const numeric = [
    ...Array.from({ length: people.length + 1 }, (_, i) => pStart + i),
    ...Array.from({ length: byMonth.length + 1 }, (_, i) => mStart + i),
  ];
  XLSX.utils.book_append_sheet(wb, sheet(summary, numeric), "Resumen");

  // ---------- Una hoja por mes ----------
  for (const m of months) {
    const total = m.rows.reduce((acc, r) => add(acc, r), zero());
    const aoa: (string | number)[][] = [
      [`${pName} · ${m.label}`],
      [`Del ${fmt(m.from)} al ${fmt(m.to)}`],
      [],
      ["Persona", ...HEADER],
      ...m.rows.map((r) => [r.name, ...hours(r)]),
      ["Total", ...hours(total)],
      [],
      ...NOTES,
    ];
    // Nombre de hoja: máx. 31 caracteres
    XLSX.utils.book_append_sheet(wb, sheet(aoa, Array.from({ length: m.rows.length + 1 }, (_, i) => 5 + i)), m.label.slice(0, 31));
  }

  const safe = pName.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
  return { wb, file: `horas-${safe}_${from}_${to}.xlsx` };
}
