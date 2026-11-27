import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildPlanWorkbook, cellToISO, isoToSerial, parsePlan, planRows, planWorkbookSheets, PLAN_HEADERS, summarizePlanImport, type PlanSource } from "./planExcel";
import type { Deliverable, Milestone, Task } from "./types";

const users = [
  { id: "u1", name: "Ana Ríos", email: "ana@quantia.test" },
  { id: "u2", name: "Martín Paz", email: "martin@quantia.test" },
  { id: "u3", name: "Ana Paz", email: "apaz@quantia.test" },
];

const ms = (id: string, over: Partial<Milestone> = {}): Milestone => ({
  id, projectId: "p1", name: "Hito " + id, description: "", ownerId: null, startDate: null, dueDate: null, actualStart: null, actualEnd: null, status: "pendiente", ...over,
});
const del = (id: string, milestoneId: string | null, over: Partial<Deliverable> = {}): Deliverable => ({
  id, projectId: "p1", milestoneId, name: "Entregable " + id, description: "", ownerId: null, startDate: null, dueDate: null, actualStart: null, actualEnd: null, status: "pendiente", ...over,
});
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, projectId: "p1", milestoneId: null, deliverableId: null, name: "Tarea " + id, description: "", assigneeId: null, status: "pendiente", priority: "media",
  startDate: null, dueDate: null, kind: "tarea", estimateHours: null, estimateMin: null, estimateMax: null, confidence: null, sprintId: null, sprintAddedAt: null,
  rank: 0, changeRequestId: null, completedAt: null, archived: false, archivedAt: null, custom: {}, sortOrder: 0, createdBy: null, createdAt: "2026-01-01T00:00:00Z", ...over,
});

const source = (over: Partial<PlanSource> = {}): PlanSource => ({ projectId: "p1", milestones: [], deliverables: [], tasks: [], users, ...over });
const header = [...PLAN_HEADERS];
let n = 0;
const newId = () => `n${++n}`;

describe("fechas", () => {
  it("van y vuelven como número de Excel sin correrse de día", () => {
    expect(isoToSerial("2027-03-15")).toBe(46461);
    expect(cellToISO(46461)).toBe("2027-03-15");
    expect(cellToISO(isoToSerial("2028-02-29"))).toBe("2028-02-29");
  });
  it("acepta texto dd/mm/aaaa y aaaa-mm-dd; lo que no entiende no lo inventa", () => {
    expect(cellToISO("15/03/2027")).toBe("2027-03-15");
    expect(cellToISO("5-3-27")).toBe("2027-03-05");
    expect(cellToISO("2027-03-15")).toBe("2027-03-15");
    expect(cellToISO("")).toBeNull();
    expect(cellToISO("31/02/2027")).toBeUndefined();
    expect(cellToISO("marzo")).toBeUndefined();
    expect(cellToISO(12)).toBeUndefined();
  });
});

describe("exportar", () => {
  const src = source({
    milestones: [ms("m2", { dueDate: "2027-06-01" }), ms("m1", { dueDate: "2027-03-31", ownerId: "u1", startDate: "2027-03-01" })],
    deliverables: [del("d1", "m1", { dueDate: "2027-03-20" }), del("d0", null)],
    tasks: [task("t1", { deliverableId: "d1", milestoneId: "m1", estimateHours: 8, assigneeId: "u2" }), task("t2", { milestoneId: "m1" }), task("t0"), task("tx", { archived: true })],
  });

  it("ordena por jerarquía: lo suelto primero, y dentro de cada hito sus tareas y después sus entregables", () => {
    expect(planRows(src).map((r) => `${r[0]}:${r[9]}`)).toEqual([
      "Tarea:t0", "Entregable:d0", "Hito:m1", "Tarea:t2", "Entregable:d1", "Tarea:t1", "Hito:m2",
    ]);
  });

  it("pone nombres de personas, fechas como número y deja afuera las tareas archivadas", () => {
    const rows = planRows(src);
    const m1 = rows.find((r) => r[9] === "m1")!;
    expect(m1.slice(0, 6)).toEqual(["Hito", "Hito m1", "Ana Ríos", isoToSerial("2027-03-01"), isoToSerial("2027-03-31"), "Pendiente"]);
    const t1 = rows.find((r) => r[9] === "t1")!;
    expect([t1[2], t1[6], t1[7]]).toEqual(["Martín Paz", 8, "Media"]);
    expect(rows.some((r) => r[9] === "tx")).toBe(false);
  });

  it("un texto que empieza como fórmula sale protegido y vuelve igual", () => {
    const s = source({ milestones: [ms("m1", { name: "=HOY()" })] });
    const rows = planRows(s);
    expect(rows[0][1]).toBe("'=HOY()");
    const back = parsePlan([header, ...rows], s);
    expect(back.items[0]).toMatchObject({ name: "=HOY()", changed: false });
  });

  it("arma las tres hojas, con el equipo del proyecto primero en la lista de personas", () => {
    const sheets = planWorkbookSheets({ ...src, projectName: "PR_001 Demo", team: [users[1]] });
    expect(Object.keys(sheets)).toEqual(["Plan", "Cómo completar", "Listas"]);
    expect(sheets.Plan[0]).toEqual(header);
    expect(sheets.Listas[1][4]).toBe("Martín Paz");
    expect(sheets.Listas.slice(1).map((r) => r[4]).filter(Boolean)).toEqual(["Martín Paz", "Ana Ríos", "Ana Paz"]);
  });
});

describe("importar", () => {
  it("lo exportado vuelve sin cambios, también pasando por un archivo de Excel real", () => {
    const src = source({
      milestones: [ms("m1", { dueDate: "2027-03-31", startDate: "2027-03-01", ownerId: "u1", status: "en_curso", description: "Etapa 1" })],
      deliverables: [del("d1", "m1", { dueDate: "2027-03-20", ownerId: "u2" }), del("d0", null)],
      tasks: [task("t1", { deliverableId: "d1", milestoneId: "m1", estimateHours: 8.5, assigneeId: "u2", status: "en_revision", priority: "alta" }), task("t2", { milestoneId: "m1", status: "hecha" }), task("t0")],
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...planRows(src)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan");
    const read = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
    const table = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets.Plan, { header: 1, raw: true, defval: "" });
    const out = parsePlan(table, src);
    expect(out.issues).toEqual([]);
    expect(out.items).toHaveLength(6);
    expect(out.items.every((i) => !i.isNew && !i.changed)).toBe(true);
    expect(summarizePlanImport(out.items).iguales).toBe(6);
  });

  it("el archivo que se descarga trae las fechas como fechas de Excel y se vuelve a leer igual", () => {
    const src = source({ milestones: [ms("m1", { dueDate: "2027-03-31", startDate: "2027-03-01", ownerId: "u1" })], tasks: [task("t1", { milestoneId: "m1", estimateHours: 4 })] });
    const wb = buildPlanWorkbook(XLSX, { ...src, projectName: "PR_001 Demo", team: [] });
    expect(wb.SheetNames).toEqual(["Plan", "Cómo completar", "Listas"]);
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    // Como lo ve Excel: una fecha con formato dd/mm/aaaa
    const asDates = XLSX.read(bytes, { type: "array", cellDates: true }).Sheets.Plan;
    expect(asDates.E2.t).toBe("d");
    expect((asDates.E2.v as Date).toISOString().slice(0, 10)).toBe("2027-03-31");
    expect(XLSX.read(bytes, { type: "array" }).Sheets.Plan.E2.w).toBe("31/03/2027");
    // Como lo lee la importación
    const read = XLSX.read(bytes, { type: "array" });
    const out = parsePlan(XLSX.utils.sheet_to_json<unknown[]>(read.Sheets.Plan, { header: 1, raw: true, defval: "" }), src);
    expect(out.issues).toEqual([]);
    expect(out.items.map((i) => i.changed)).toEqual([false, false]);
  });

  it("crea lo que no tiene ID y arma la jerarquía por el orden de las filas", () => {
    n = 0;
    const out = parsePlan([
      header,
      ["Hito", "Anteproyecto", "ana@quantia.test", "01/03/2027", "31/03/2027", "", "", "", "Primera etapa", ""],
      ["tarea", "Reunión de inicio", "Martín Paz", "", "", "Hecha", "2,5", "alta", "", ""],
      ["Entregable", "Memoria", "", 46461, 46471, "En curso", "", "", "", ""],
      ["Tarea", "Redactar", "martin paz", "", "", "", 16, "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["HITO", "Proyecto ejecutivo", "", "", "30/06/2027", "", "", "", "", ""],
      ["Tarea", "Coordinación", "", "", "", "", "", "", "", ""],
    ], source(), newId);
    expect(out.issues).toEqual([]);
    const [h1, t1, d1, t2, h2, t3] = out.items;
    expect(h1).toMatchObject({ type: "hito", id: "n1", isNew: true, ownerId: "u1", startDate: "2027-03-01", dueDate: "2027-03-31", status: "pendiente", description: "Primera etapa" });
    expect(t1).toMatchObject({ type: "tarea", milestoneId: "n1", deliverableId: null, ownerId: "u2", status: "hecha", estimateHours: 2.5, priority: "alta" });
    expect(d1).toMatchObject({ type: "entregable", id: "n3", milestoneId: "n1", startDate: "2027-03-15", dueDate: "2027-03-25", status: "en_curso" });
    expect(t2).toMatchObject({ milestoneId: "n1", deliverableId: "n3", ownerId: "u2", estimateHours: 16, priority: "media", status: "pendiente" });
    expect(h2).toMatchObject({ type: "hito", id: "n5", dueDate: "2027-06-30" });
    expect(t3).toMatchObject({ milestoneId: "n5", deliverableId: null, line: 8 });
    expect(summarizePlanImport(out.items).nuevos).toEqual({ hito: 2, entregable: 1, tarea: 3 });
  });

  it("con ID actualiza: detecta qué cambió, también si la fila se movió a otro hito", () => {
    const src = source({
      milestones: [ms("m1", { dueDate: "2027-03-31" }), ms("m2", { dueDate: "2027-06-30" })],
      tasks: [task("t1", { milestoneId: "m1", assigneeId: "u1" }), task("t2", { milestoneId: "m1" })],
    });
    const out = parsePlan([
      header,
      ["Hito", "Hito m1", "", "", "15/04/2027", "Pendiente", "", "", "", "m1"],
      ["Tarea", "Tarea t2", "", "", "", "Pendiente", "", "Media", "", "t2"],
      ["Hito", "Hito m2", "", "", "30/06/2027", "Pendiente", "", "", "", "m2"],
      ["Tarea", "Tarea t1", "Ana Ríos", "", "", "Pendiente", "", "Media", "", "t1"],
    ], src);
    expect(out.issues).toEqual([]);
    expect(out.items.map((i) => [i.id, i.isNew, i.changed])).toEqual([["m1", false, true], ["t2", false, false], ["m2", false, false], ["t1", false, true]]);
    expect(out.items[0].dueDate).toBe("2027-04-15");
    expect(out.items[3].milestoneId).toBe("m2");
  });

  it("vaciar una celda la vacía; estado y prioridad vacíos se quedan como estaban", () => {
    const src = source({ milestones: [ms("m1", { ownerId: "u1", dueDate: "2027-03-31", status: "en_curso" })], tasks: [task("t1", { milestoneId: "m1", estimateHours: 4, priority: "urgente", status: "en_curso" })] });
    const out = parsePlan([header, ["Hito", "Hito m1", "", "", "", "", "", "", "", "m1"], ["Tarea", "Tarea t1", "", "", "", "", "", "", "", "t1"]], src);
    expect(out.items[0]).toMatchObject({ ownerId: null, dueDate: null, status: "en_curso", changed: true });
    expect(out.items[1]).toMatchObject({ estimateHours: null, priority: "urgente", status: "en_curso", changed: true });
  });

  it("avisa sin frenar: persona desconocida o ambigua, estado raro, ID copiado o ajeno", () => {
    n = 0;
    const src = source({ milestones: [ms("m1", { ownerId: "u2" })] });
    const out = parsePlan([
      header,
      ["Hito", "Hito m1", "Pedro", "", "", "Casi", "", "", "", "m1"],
      ["Hito", "Copia", "Ana", "", "", "", "", "", "", "m1"],
      ["Tarea", "Otra", "Ríos", "", "", "", "muchas", "Altísima", "", "zzz"],
    ], src, newId);
    expect(out.issues.every((i) => i.level === "aviso")).toBe(true);
    expect(out.issues.map((i) => i.line)).toEqual([2, 2, 3, 3, 4, 4, 4]);
    expect(out.items[0]).toMatchObject({ id: "m1", ownerId: "u2", status: "pendiente", changed: false });
    // "Ana" podría ser Ana Ríos o Ana Paz: no se adivina
    expect(out.items[1]).toMatchObject({ id: "n1", isNew: true, ownerId: null });
    expect(out.items[2]).toMatchObject({ id: "n2", isNew: true, ownerId: "u1", estimateHours: null, priority: "media", milestoneId: "n1" });
  });

  it("los errores se informan con su fila: tipo, nombre, fecha, tipo cambiado", () => {
    const src = source({ milestones: [ms("m1")] });
    const out = parsePlan([
      header,
      ["Fase", "Algo", "", "", "", "", "", "", "", ""],
      ["Hito", "", "", "", "", "", "", "", "", ""],
      ["Hito", "Con fecha mala", "", "", "31/02/2027", "", "", "", "", ""],
      ["Tarea", "Era un hito", "", "", "", "", "", "", "", "m1"],
      ["", "Sin tipo", "", "", "", "", "", "", "", ""],
    ], src);
    expect(out.issues.map((i) => [i.line, i.level])).toEqual([[2, "error"], [3, "error"], [4, "error"], [5, "error"], [6, "error"]]);
    expect(out.items).toEqual([]);
  });

  it("rechaza un archivo que no es la planilla o que viene vacío", () => {
    expect(parsePlan([["Nombre", "Fecha"], ["x", "y"]], source()).issues[0].level).toBe("error");
    expect(parsePlan([["Tipo", "Nombre", "Fin"]], source()).issues[0].message).toMatch(/columnas/);
    expect(parsePlan([header], source()).issues[0].message).toMatch(/no tiene filas/);
  });
});

describe("guardar lo importado", () => {
  it("crea y actualiza en un solo cambio, con fechas reales y fecha de las tareas ya calculadas", async () => {
    const { workActions, workRemote } = await import("./workStore");
    const pushed: { key: string; op: string; id: string; item?: any }[][] = [];
    workRemote.reset();
    workRemote.setBackend({ push: (c) => { pushed.push(c as never); } });
    workRemote.replaceAll({
      meta: [], reviews: [], sprints: [], changes: [], baselines: [], risks: [], meetings: [], fields: [],
      milestones: [ms("m1", { dueDate: "2027-03-31" })], deliverables: [], tasks: [task("t1", { milestoneId: "m1", dueDate: "2027-03-31" }), task("t9", { milestoneId: "m1", dueDate: "2027-03-31" })],
    });
    n = 0;
    const src = source({ milestones: [ms("m1", { dueDate: "2027-03-31" })], tasks: [task("t1", { milestoneId: "m1", dueDate: "2027-03-31" }), task("t9", { milestoneId: "m1", dueDate: "2027-03-31" })] });
    const parsed = parsePlan([
      header,
      ["Hito", "Hito m1", "", "", "15/04/2027", "En curso", "", "", "", "m1"],
      ["Tarea", "Tarea t1", "Ana Ríos", "", "", "Hecha", 3, "Alta", "", "t1"],
      ["Entregable", "Memoria", "", "", "10/04/2027", "Cumplido", "", "", "", ""],
      ["Tarea", "Redactar", "", "", "", "", 8, "", "", ""],
    ], src, newId);
    expect(parsed.issues).toEqual([]);
    workActions.importPlan("p1", parsed.items, "u1");

    expect(pushed).toHaveLength(1);
    const by = (id: string) => pushed[0].find((c) => c.id === id)?.item;
    expect(pushed[0].every((c) => c.op === "upsert")).toBe(true);
    expect(by("m1")).toMatchObject({ dueDate: "2027-04-15", status: "en_curso" });
    expect(by("m1").actualStart).toBeTruthy();
    expect(by("t1")).toMatchObject({ assigneeId: "u1", status: "hecha", estimateHours: 3, priority: "alta", dueDate: "2027-04-15" });
    expect(by("t1").completedAt).toBeTruthy();
    expect(by("n1")).toMatchObject({ projectId: "p1", milestoneId: "m1", name: "Memoria", status: "cumplido", dueDate: "2027-04-10" });
    expect(by("n1").actualEnd).toBeTruthy();
    expect(by("n2")).toMatchObject({ projectId: "p1", deliverableId: "n1", milestoneId: "m1", dueDate: "2027-04-10", estimateHours: 8, createdBy: "u1", kind: "tarea" });
    // La tarea que no estaba en el archivo no se borra: solo toma la fecha nueva de su hito
    expect(by("t9")).toMatchObject({ dueDate: "2027-04-15" });

    // Volver a subir lo mismo no cambia nada
    workActions.importPlan("p1", parsed.items.map((i) => ({ ...i, isNew: false, changed: false })), "u1");
    expect(pushed).toHaveLength(1);
    workRemote.reset();
  });
});
