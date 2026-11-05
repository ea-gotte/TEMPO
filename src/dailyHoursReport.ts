import type { AppState, TimeEntry } from "./types";
import { addDays, dayLabel, minToHM } from "./utils";

const h = (min: number) => Math.round((min / 60) * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const ddmmyyyy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Excel de horas día por día en un período, con los registros ya filtrados en Reportes:
 * - Por día: persona y proyecto en filas, cada día del período en columnas, con totales.
 * - Detalle diario: una fila por día, persona y proyecto (con subproyecto y descripciones).
 * - Resumen: horas de cada persona en cada proyecto y su peso en el total de la persona.
 */
export function buildDailyHoursWorkbook(XLSX: typeof import("xlsx"), state: AppState, entries: TimeEntry[], from: string, to: string) {
  const person = (id: string) => state.users.find((u) => u.id === id)?.name ?? "—";
  const project = (id: string | null) => state.projects.find((p) => p.id === id);
  const projectName = (id: string | null) => project(id)?.name ?? "Sin proyecto";
  const clientName = (id: string | null) => state.clients.find((c) => c.id === project(id)?.clientId)?.name ?? "";
  const subName = (id?: string | null) => state.subProjects.find((s) => s.id === id)?.name ?? "";

  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const inRange = entries.filter((e) => e.date >= from && e.date <= to);
  const mins = (e: TimeEntry) => e.end - e.start;

  // Persona + proyecto → minutos por día
  const rows = new Map<string, { userId: string; projectId: string | null; perDay: Map<string, number>; total: number }>();
  for (const e of inRange) {
    const key = `${e.userId}|${e.projectId ?? ""}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { userId: e.userId, projectId: e.projectId, perDay: new Map(), total: 0 }));
    r.perDay.set(e.date, (r.perDay.get(e.date) ?? 0) + mins(e));
    r.total += mins(e);
  }
  const sorted = [...rows.values()].sort(
    (a, b) => person(a.userId).localeCompare(person(b.userId), "es") || projectName(a.projectId).localeCompare(projectName(b.projectId), "es"),
  );

  const title = [`Horas por día · ${ddmmyyyy(from)} al ${ddmmyyyy(to)}`];
  // Celdas vacías (null) para los días sin carga: así Excel puede sumar la columna
  const matrix: (string | number | null)[][] = [
    title,
    [],
    ["Persona", "Cliente", "Proyecto", ...days.map((d) => dayLabel(d, { weekday: "short", day: "2-digit", month: "2-digit" })), "Total"],
  ];
  for (const r of sorted) {
    matrix.push([person(r.userId), clientName(r.projectId), projectName(r.projectId), ...days.map((d) => (r.perDay.get(d) ? h(r.perDay.get(d)!) : null)), h(r.total)]);
  }
  const dayTotal = (d: string) => inRange.filter((e) => e.date === d).reduce((a, e) => a + mins(e), 0);
  const grand = inRange.reduce((a, e) => a + mins(e), 0);
  matrix.push(["Total por día", "", "", ...days.map((d) => (dayTotal(d) ? h(dayTotal(d)) : null)), h(grand)]);

  // Detalle: un renglón por día, persona, proyecto y subproyecto
  const detailMap = new Map<string, { date: string; userId: string; projectId: string | null; sub: string; min: number; start: number; end: number; notes: string[] }>();
  for (const e of inRange) {
    const key = `${e.date}|${e.userId}|${e.projectId ?? ""}|${e.subProjectId ?? ""}`;
    let d = detailMap.get(key);
    if (!d) detailMap.set(key, (d = { date: e.date, userId: e.userId, projectId: e.projectId, sub: subName(e.subProjectId), min: 0, start: e.start, end: e.end, notes: [] }));
    d.min += mins(e);
    d.start = Math.min(d.start, e.start);
    d.end = Math.max(d.end, e.end);
    if (e.description.trim() && !d.notes.includes(e.description.trim())) d.notes.push(e.description.trim());
  }
  const detail: (string | number)[][] = [
    title,
    [],
    ["Fecha", "Día", "Persona", "Cliente", "Proyecto", "Subproyecto", "Desde", "Hasta", "Horas", "Descripción"],
    ...[...detailMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || person(a.userId).localeCompare(person(b.userId), "es") || a.start - b.start)
      .map((d) => [
        ddmmyyyy(d.date), dayLabel(d.date, { weekday: "long" }), person(d.userId), clientName(d.projectId), projectName(d.projectId),
        d.sub, minToHM(d.start), minToHM(d.end), h(d.min), d.notes.join("; "),
      ]),
  ];

  // Resumen: persona × proyecto
  const perPerson = new Map<string, number>();
  for (const r of sorted) perPerson.set(r.userId, (perPerson.get(r.userId) ?? 0) + r.total);
  const summary: (string | number)[][] = [
    title,
    [],
    ["Persona", "Cliente", "Proyecto", "Horas", "Días con carga", "% de las horas de la persona"],
    ...sorted.map((r) => [person(r.userId), clientName(r.projectId), projectName(r.projectId), h(r.total), r.perDay.size, pct(r.total, perPerson.get(r.userId) ?? 0)]),
    [],
    ["Total", "", "", h(grand), new Set(inRange.map((e) => e.date)).size, ""],
  ];

  const wb = XLSX.utils.book_new();
  const add = (name: string, aoa: (string | number | null)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("Por día", matrix, [26, 18, 34, ...days.map(() => 10), 9]);
  add("Detalle diario", detail, [11, 11, 26, 18, 34, 22, 7, 7, 7, 60]);
  add("Resumen", summary, [26, 18, 34, 9, 14, 26]);
  return { wb, file: `horas-por-dia_${from}_${to}.xlsx` };
}

export async function downloadDailyHoursXlsx(state: AppState, entries: TimeEntry[], from: string, to: string): Promise<string> {
  const XLSX = await import("xlsx");
  const { wb, file } = buildDailyHoursWorkbook(XLSX, state, entries, from, to);
  XLSX.writeFile(wb, file);
  return file;
}
