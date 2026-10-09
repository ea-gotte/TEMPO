import { describe, expect, it } from "vitest";
import { decodeBoardFile, encodeBoardFile, itemsBounds } from "./boardFile";

const objects = [
  { type: "Rect", id: "a", left: 100, top: 50, width: 100, height: 40, scaleX: 2, scaleY: 1, originX: "center", originY: "center" },
  { type: "Textbox", id: "b", left: 400, top: 300, width: 50, height: 20, originX: "left", originY: "top" },
];

describe("archivo del tablero (.json)", () => {
  it("lo que se descarga se vuelve a leer igual", () => {
    const text = encodeBoardFile("Puente peatonal", objects, "2026-10-09T10:00:00.000Z");
    expect(JSON.parse(text)).toMatchObject({ app: "tempo-tablero", v: 1, project: "Puente peatonal" });
    expect(decodeBoardFile(text)).toEqual({ project: "Puente peatonal", objects });
  });

  it("también lee la copia que se descarga de un tablero dañado (el formato guardado)", () => {
    const raw = JSON.stringify({ projectId: "p1", version: 1, fabric: { version: "7.4.0", objects }, viewport: { x: 0, y: 0, zoom: 1 }, updatedAt: "x" });
    expect(decodeBoardFile(raw)).toEqual({ project: "", objects });
  });

  it("rechaza lo que no es un tablero", () => {
    expect(decodeBoardFile("no es json")).toBeNull();
    expect(decodeBoardFile(JSON.stringify({ app: "otra-cosa", v: 1, objects: [] }))).toBeNull();
    expect(decodeBoardFile(JSON.stringify({ app: "tempo-tablero", v: 2, objects: [] }))).toBeNull();
    expect(decodeBoardFile(JSON.stringify({ app: "tempo-tablero", v: 1, objects: [1, "x"] }))).toBeNull();
    expect(decodeBoardFile(JSON.stringify([1, 2]))).toBeNull();
  });

  it("caja aproximada de lo importado (origen al centro o en la esquina, con escala)", () => {
    expect(itemsBounds(objects)).toEqual({ left: 0, top: 30, width: 450, height: 290 });
    expect(itemsBounds([])).toBeNull();
  });
});
