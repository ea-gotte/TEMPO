import { describe, expect, it } from "vitest";
import { filterObservations, observationCounts, observationsTable, renumberObservations, type Observation } from "./observations";

const list: Observation[] = [
  { id: "c", num: 3, detail: "Falta la cota del vano", resolved: false },
  { id: "a", num: 1, detail: "Revisar el\tespesor\nde la losa", resolved: true },
  { id: "b", num: 2, detail: "", resolved: false },
];

describe("observaciones numeradas", () => {
  it("cuenta abiertas y resueltas", () => {
    expect(observationCounts(list)).toEqual({ open: 2, resolved: 1 });
  });

  it("filtra por estado y ordena por número", () => {
    expect(filterObservations(list, "all").map((o) => o.num)).toEqual([1, 2, 3]);
    expect(filterObservations(list, "open").map((o) => o.num)).toEqual([2, 3]);
    expect(filterObservations(list, "resolved").map((o) => o.num)).toEqual([1]);
  });

  it("arma una tabla separada por tabulaciones (se pega en Excel), con la descripción en una sola línea", () => {
    expect(observationsTable(list).split("\n")).toEqual([
      "N.º\tEstado\tObservación",
      "1\tResuelta\tRevisar el espesor de la losa",
      "2\tAbierta\t",
      "3\tAbierta\tFalta la cota del vano",
    ]);
  });
});

describe("renumerar observaciones", () => {
  it("después de borrar alguna: 1, 2, 3… en el orden que tenían", () => {
    const holes = [{ ...list[0], num: 7 }, { ...list[1], num: 1 }, { ...list[2], num: 4 }];
    expect(renumberObservations(holes)).toEqual(new Map([["a", 1], ["b", 2], ["c", 3]]));
  });
  it("si ya están 1, 2, 3 no cambia nada", () => {
    expect(renumberObservations(list).size).toBe(0);
  });
});
