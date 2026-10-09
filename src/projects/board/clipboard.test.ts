import { describe, expect, it } from "vitest";
import { decodeClip, encodeClip, pasteOffset, textOf } from "./clipboard";

const note = { type: "Group", kind: "note", left: 100, top: 100, objects: [{ type: "Rect" }, { type: "Textbox", text: "Idea 1" }] };
const text = { type: "Textbox", kind: "text", left: 300, top: 100, text: "Revisar cota" };
const line = { type: "Arrow", kind: "arrow", left: 200, top: 300 };

describe("portapapeles del tablero", () => {
  it("ida y vuelta conserva los objetos y el proyecto de origen", () => {
    const back = decodeClip(encodeClip("p1", [note, line]));
    expect(back).toEqual({ projectId: "p1", objects: [note, line] });
  });
  it("rechaza texto que no es del tablero", () => {
    expect(decodeClip("hola")).toBeNull();
    expect(decodeClip(JSON.stringify({ v: 1, objects: "x" }))).toBeNull();
    expect(decodeClip("")).toBeNull();
    expect(decodeClip(null)).toBeNull();
  });
  it("como texto plano lleva lo escrito en notas, formas y textos", () => {
    expect(textOf([note, text, line])).toBe("Idea 1\nRevisar cota");
    expect(textOf([line])).toBe("");
  });
});

describe("pasteOffset", () => {
  it("en el mismo tablero pega desplazado (como duplicar)", () => {
    expect(pasteOffset([note], { x: 900, y: 900 }, true, 2)).toEqual({ dx: 40, dy: 40 });
  });
  it("en otro tablero centra lo pegado en el punto de destino", () => {
    expect(pasteOffset([note, text], { x: 500, y: 400 }, false, 1)).toEqual({ dx: 300, dy: 300 });
  });
});
