import { overtimeBreakdown } from "./store";
import type { AppState, User } from "./types";
import { minToHM, monthEnd, monthLabel, monthStart } from "./utils";

const h = (min: number) => Math.round((min / 60) * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * Horas extra de un mes por persona y por proyecto. Se cuenta cada día desde el inicio hasta
 * completar la jornada; el excedente es extra y va al proyecto del registro (ver overtimeBreakdown).
 * El porcentaje de cada proyecto es su peso dentro de las horas extra de la persona y dentro de
 * las horas computables del mes.
 */
export function buildOvertimeWorkbook(XLSX: typeof import("xlsx"), state: AppState, users: User[], month: string) {
  const ms = monthStart(month);
  const to = monthEnd(ms);
  const label = monthLabel(ms);
  const projectName = (id: string | null) => state.projects.find((p) => p.id === id)?.name ?? "Sin proyecto";
  const people = users.slice().sort((a, b) => a.name.localeCompare(b.name, "es"));
  const data = people.map((u) => ({ u, bd: overtimeBreakdown(state, u, ms, to) }));

  const summary: (string | number)[][] = [
    [`Horas extra · ${label}`],
    ["Por día, desde el inicio hasta completar la jornada; el resto es extra. No cuentan No laborable ni Vacaciones."],
    [],
    ["Persona", "Horas cargadas", "Horas computables", "Horas extra", "% extra sobre computables"],
    ...data.map(({ u, bd }) => [u.name, h(bd.loadedMin), h(bd.computableMin), h(bd.extraMin), pct(bd.extraMin, bd.computableMin)]),
  ];

  const byProject: (string | number)[][] = [
    ["Persona", "Proyecto", "Horas extra", "% de las extra de la persona", "% de las horas computables del mes"],
  ];
  for (const { u, bd } of data) {
    for (const p of bd.byProject) {
      byProject.push([u.name, projectName(p.projectId), h(p.minutes), pct(p.minutes, bd.extraMin), pct(p.minutes, bd.computableMin)]);
    }
  }

  const detail: (string | number)[][] = [["Fecha", "Persona", "Proyecto", "Inicio", "Fin", "Duración (h)", "Extra (h)"]];
  for (const { u } of data) {
    const bd = overtimeBreakdown(state, u, ms, to);
    const mine = state.entries
      .filter((e) => e.userId === u.id && e.date >= ms && e.date <= to && bd.perEntry.has(e.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    for (const e of mine) {
      detail.push([`${e.date.slice(8)}/${e.date.slice(5, 7)}/${e.date.slice(0, 4)}`, u.name, projectName(e.projectId), minToHM(e.start), minToHM(e.end), h(e.end - e.start), h(bd.perEntry.get(e.id)!)]);
    }
  }

  const wb = XLSX.utils.book_new();
  const add = (name: string, aoa: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("Resumen", summary, [30, 16, 18, 14, 26]);
  add("Por proyecto", byProject, [30, 34, 14, 28, 34]);
  add("Detalle", detail, [12, 30, 34, 8, 8, 14, 12]);
  return { wb, file: `horas-extra_${ms.slice(0, 7)}.xlsx` };
}

export async function downloadOvertimeXlsx(state: AppState, users: User[], month: string): Promise<string> {
  const XLSX = await import("xlsx");
  const { wb, file } = buildOvertimeWorkbook(XLSX, state, users, month);
  XLSX.writeFile(wb, file);
  return file;
}
