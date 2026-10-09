import { describe, expect, it } from "vitest";
import { findMatches, normalizeText } from "./search";

describe("buscar en el tablero", () => {
  it("sin mayúsculas ni tildes", () => {
    expect(normalizeText("Revisión de CÓTA")).toBe("revision de cota");
  });
  const items = [
    { id: "a", text: "Revisar la cota de losa" },
    { id: "b", text: "Coordinación con instalaciones" },
    { id: "c", text: "" },
    { id: "d", text: "Revisión del plano P-101" },
  ];
  it("devuelve los que contienen la búsqueda, en el orden del tablero", () => {
    expect(findMatches(items, "revis")).toEqual(["a", "d"]);
    expect(findMatches(items, "COORDINACION")).toEqual(["b"]);
  });
  it("una búsqueda vacía no encuentra nada", () => {
    expect(findMatches(items, "   ")).toEqual([]);
  });
});
