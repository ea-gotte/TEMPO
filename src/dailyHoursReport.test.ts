import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildDailyHoursWorkbook } from "./dailyHoursReport";
import type { AppState, TimeEntry } from "./types";

const state = {
  users: [{ id: "u1", name: "Ana" }, { id: "u2", name: "Beto" }],
  projects: [{ id: "p1", name: "Puente", clientId: "c1" }, { id: "p2", name: "Hospital", clientId: "c1" }],
  clients: [{ id: "c1", name: "ADIF" }],
  subProjects: [],
} as unknown as AppState;

const e = (id: string, userId: string, projectId: string, date: string, start: number, end: number, description = ""): TimeEntry =>
  ({ id, userId, projectId, subProjectId: null, date, start, end, description, tagIds: [] }) as unknown as TimeEntry;

const entries = [
  e("1", "u1", "p1", "2026-11-02", 9 * 60, 13 * 60, "Modelado"),
  e("2", "u1", "p1", "2026-11-02", 14 * 60, 16 * 60, "Revisión"),
  e("3", "u1", "p2", "2026-11-03", 9 * 60, 17 * 60),
  e("4", "u2", "p1", "2026-11-04", 8 * 60, 12 * 60 + 30),
  e("5", "u2", "p1", "2026-11-10", 8 * 60, 9 * 60), // fuera del período
];

const sheet = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, blankrows: false });

describe("buildDailyHoursWorkbook", () => {
  const { wb, file } = buildDailyHoursWorkbook(XLSX, state, entries, "2026-11-02", "2026-11-04");

  it("nombra el archivo con el período y arma las tres hojas", () => {
    expect(file).toBe("horas-por-dia_2026-11-02_2026-11-04.xlsx");
    expect(wb.SheetNames).toEqual(["Por día", "Detalle diario", "Resumen"]);
  });

  it("pone cada día del período en columnas, por persona y proyecto, con totales", () => {
    const rows = sheet(wb, "Por día");
    expect(rows[1]).toHaveLength(3 + 3 + 1); // persona, cliente, proyecto + 3 días + total
    const ana = rows.filter((r) => r[0] === "Ana");
    expect(ana.map((r) => [r[2], r[3], r[4], r[5], r[6]])).toEqual([
      ["Hospital", undefined, 8, undefined, 8],
      ["Puente", 6, undefined, undefined, 6],
    ]);
    const total = rows.find((r) => r[0] === "Total por día")!;
    expect([total[3], total[4], total[5], total[6]]).toEqual([6, 8, 4.5, 18.5]);
  });

  it("agrupa el detalle por día, persona y proyecto, con horario y descripciones", () => {
    const rows = sheet(wb, "Detalle diario").slice(2);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["02/11/2026", expect.any(String), "Ana", "ADIF", "Puente", "", "09:00", "16:00", 6, "Modelado; Revisión"]);
  });

  it("resume horas por persona y proyecto con su peso", () => {
    const rows = sheet(wb, "Resumen");
    const anaPuente = rows.find((r) => r[0] === "Ana" && r[2] === "Puente")!;
    expect([anaPuente[3], anaPuente[4], anaPuente[5]]).toEqual([6, 1, 42.9]);
    expect(rows.find((r) => r[0] === "Total")?.[3]).toBe(18.5);
  });
});
