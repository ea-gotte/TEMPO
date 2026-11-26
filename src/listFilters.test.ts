import { describe, expect, it } from "vitest";
import { filterAndSortHours, filterAndSortRequests, NO_SUPERVISOR, type HoursRowLike, type RequestFilter, type RequestKeys } from "./listFilters";

interface Req extends RequestKeys {
  id: string;
}

const req = (id: string, personName: string, emitted: string, date: string, type = "Vacaciones", status = "Pendiente"): Req => ({
  id, personId: personName.toLowerCase(), personName, type, status, emitted, date,
});

const NONE: RequestFilter = { person: "", type: "", status: "" };
const REQS = [
  req("a", "Ana", "2026-10-05", "2026-12-01", "Vacaciones", "Aprobado"),
  req("b", "Beto", "2026-10-20", "2026-11-01", "Horas extra", "Pendiente"),
  req("c", "Ana", "2026-10-20", "2026-11-15", "Licencia médica", "Pendiente"),
  req("d", "Ñandú", "2026-09-01", "2026-09-10", "Vacaciones", "Rechazado"),
  req("e", "Zoe", "2026-11-01", "2026-10-01", "Vacaciones", "Aprobado"),
];
const ids = (list: Req[]) => list.map((r) => r.id).join("");
const run = (filter: RequestFilter, sort: Parameters<typeof filterAndSortRequests>[2]) => filterAndSortRequests(REQS, filter, sort, (r) => r);

describe("filterAndSortRequests", () => {
  it("sin filtros devuelve todo, con la emisión más reciente primero", () => {
    // b y c se emitieron el mismo día: desempata la fecha pedida más reciente
    expect(ids(run(NONE, "emision-desc"))).toBe("ecbad");
  });

  it("ordena por emisión más antigua", () => {
    expect(ids(run(NONE, "emision-asc"))).toBe("dabce");
  });

  it("ordena por la fecha pedida, en los dos sentidos", () => {
    expect(ids(run(NONE, "fecha-desc"))).toBe("acbed");
    expect(ids(run(NONE, "fecha-asc"))).toBe("debca");
  });

  it("ordena por persona y, dentro de cada una, por emisión más reciente", () => {
    // La Ñ va después de la N y no al final, como la ordenaría un sort por código
    expect(ids(run(NONE, "persona"))).toBe("cabde");
  });

  it("filtra por persona, tipo y estado, y los filtros se combinan", () => {
    expect(ids(run({ ...NONE, person: "ana" }, "emision-desc"))).toBe("ca");
    expect(ids(run({ ...NONE, type: "Vacaciones" }, "emision-desc"))).toBe("ead");
    expect(ids(run({ ...NONE, status: "Pendiente" }, "emision-desc"))).toBe("cb");
    expect(ids(run({ person: "ana", type: "Vacaciones", status: "Aprobado" }, "emision-desc"))).toBe("a");
    expect(ids(run({ person: "ana", type: "Horas extra", status: "" }, "emision-desc"))).toBe("");
  });

  it("no modifica la lista original", () => {
    const before = ids(REQS);
    run(NONE, "persona");
    expect(ids(REQS)).toBe(before);
  });
});

const hrow = (name: string, sup: string | null, loaded: number, expected: number, overtimeMin: number, status: HoursRowLike["status"], jornada = "completa"): HoursRowLike => ({
  u: { id: name.toLowerCase(), name, jornada },
  supervisor: sup ? { id: sup.toLowerCase(), name: sup } : undefined,
  loaded, expected, overtimeMin, status,
});

const HOURS = [
  hrow("Carla", "Zoe", 100, 100, 0, "ok"),
  hrow("Ana", null, 0, 100, 0, "sin-carga", "media"),
  hrow("Beto", "Ana", 50, 100, 0, "incompleto"),
  hrow("Dani", "Zoe", 120, 100, 20, "extra"),
];
const NO_FILTER = { person: "", supervisor: "", status: "", jornada: "" };
const names = (rows: HoursRowLike[]) => rows.map((r) => r.u.name[0]).join("");

describe("filterAndSortHours", () => {
  it("ordena por persona en los dos sentidos", () => {
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "persona", "asc"))).toBe("ABCD");
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "persona", "desc"))).toBe("DCBA");
  });

  it("ordena por avance contra lo esperado, no por las horas sueltas", () => {
    const rows = [hrow("Medio", null, 20, 40, 0, "incompleto", "media"), hrow("Lleno", null, 90, 100, 0, "ok")];
    expect(names(filterAndSortHours(rows, NO_FILTER, "cargado", "asc"))).toBe("ML");
  });

  it("ordena por estado, de lo que hay que atender a lo que está bien", () => {
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "estado", "asc"))).toBe("ABCD");
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "estado", "desc"))).toBe("DCBA");
  });

  it("ordena por horas extra y desempata por nombre", () => {
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "extra", "desc"))).toBe("DABC");
  });

  it("deja al final a quien no tiene supervisor, en cualquier sentido", () => {
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "supervisor", "asc"))).toBe("BCDA");
    expect(names(filterAndSortHours(HOURS, NO_FILTER, "supervisor", "desc"))).toBe("CDBA");
  });

  it("filtra por persona, supervisor, estado y jornada", () => {
    expect(names(filterAndSortHours(HOURS, { ...NO_FILTER, person: "beto" }, "persona", "asc"))).toBe("B");
    expect(names(filterAndSortHours(HOURS, { ...NO_FILTER, supervisor: "zoe" }, "persona", "asc"))).toBe("CD");
    expect(names(filterAndSortHours(HOURS, { ...NO_FILTER, supervisor: NO_SUPERVISOR }, "persona", "asc"))).toBe("A");
    expect(names(filterAndSortHours(HOURS, { ...NO_FILTER, status: "extra" }, "persona", "asc"))).toBe("D");
    expect(names(filterAndSortHours(HOURS, { ...NO_FILTER, jornada: "media" }, "persona", "asc"))).toBe("A");
  });

  it("no modifica la lista original", () => {
    const before = names(HOURS);
    filterAndSortHours(HOURS, NO_FILTER, "persona", "desc");
    expect(names(HOURS)).toBe(before);
  });
});
