import { describe, expect, it } from "vitest";
import { SECTION_HEADER, inSection, nextSectionTitle, sectionHit, sectionOrder } from "./sections";

const S = { left: 0, top: 0, width: 800, height: 600 };

describe("secciones del tablero", () => {
  it("se toman por la franja del título o por el borde; adentro, el clic llega a lo que contienen", () => {
    expect(sectionHit(S, { x: 400, y: 10 }, 6)).toBe(true);
    expect(sectionHit(S, { x: 400, y: SECTION_HEADER - 1 }, 6)).toBe(true);
    expect(sectionHit(S, { x: 3, y: 300 }, 6)).toBe(true);
    expect(sectionHit(S, { x: 798, y: 300 }, 6)).toBe(true);
    expect(sectionHit(S, { x: 400, y: 597 }, 6)).toBe(true);
    expect(sectionHit(S, { x: 400, y: 300 }, 6)).toBe(false);
    expect(sectionHit(S, { x: 900, y: 10 }, 6)).toBe(false);
  });

  it("contiene lo que tiene el centro adentro y es más chico que ella", () => {
    expect(inSection(S, { left: 100, top: 100, width: 200, height: 100 })).toBe(true);
    expect(inSection(S, { left: 700, top: 100, width: 200, height: 100 })).toBe(true); // centro en 800: en el borde
    expect(inSection(S, { left: 750, top: 100, width: 200, height: 100 })).toBe(false);
    expect(inSection(S, { left: -10, top: -10, width: 820, height: 620 })).toBe(false); // la que la envuelve no
  });

  it("título siguiente: Sección 1, 2, 3…", () => {
    expect(nextSectionTitle([])).toBe("Sección 1");
    expect(nextSectionTitle(["Planos", "Sección 2", "Sección 7"])).toBe("Sección 8");
  });

  it("las más grandes van atrás: una sección dentro de otra queda adelante", () => {
    expect(sectionOrder([{ ...S, width: 100 }, S, { ...S, width: 400 }])).toEqual([1, 2, 0]);
  });
});
