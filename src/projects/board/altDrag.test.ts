import { describe, expect, it } from "vitest";
import { relinkAfterAltDrag } from "./altDrag";

// A y B son formas; "ab" las une; "xa" viene de X (afuera) hacia A
const links = [
  { id: "ab", fromId: "A", toId: "B" },
  { id: "xa", fromId: "X", toId: "A" },
  { id: "free", fromId: null, toId: null },
];

describe("Alt+arrastrar: las flechas quedan con lo que no se movió", () => {
  it("arrastrando solo A: la flecha de afuera pasa a la copia de A, que quedó en su lugar", () => {
    const up = relinkAfterAltDrag(links, new Set(["A"]), new Map([["A", "A2"]]));
    expect(up.get("ab")).toEqual({ fromId: "A2", toId: "B" });
    expect(up.get("xa")).toEqual({ fromId: "X", toId: "A2" });
    expect(up.has("free")).toBe(false);
  });

  it("arrastrando una flecha enganchada: su copia sigue enganchada y la que se mueve queda suelta", () => {
    const up = relinkAfterAltDrag(links, new Set(["xa"]), new Map([["xa", "xa2"]]));
    expect(up.get("xa")).toEqual({ fromId: null, toId: null });
    expect(up.get("xa2")).toEqual({ fromId: "X", toId: "A" });
  });

  it("arrastrando A, B y la flecha entre ellas: lo movido sigue unido entre sí y la copia también", () => {
    const up = relinkAfterAltDrag(links, new Set(["A", "B", "ab"]), new Map([["A", "A2"], ["B", "B2"], ["ab", "ab2"]]));
    expect(up.get("ab")).toEqual({ fromId: "A", toId: "B" });
    expect(up.get("ab2")).toEqual({ fromId: "A2", toId: "B2" });
    expect(up.get("xa")).toEqual({ fromId: "X", toId: "A2" });
  });
});
