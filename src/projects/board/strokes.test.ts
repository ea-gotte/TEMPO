import { describe, expect, it } from "vitest";
import { dashArray, dashStyleOf, toHex, withAlpha } from "./strokes";

describe("colores del resaltador", () => {
  it("agrega transparencia a un color", () => {
    expect(withAlpha("#fde047", 0.35)).toBe("rgba(253, 224, 71, 0.35)");
  });
  it("vuelve al hexadecimal (para marcar la muestra de la paleta)", () => {
    expect(toHex("rgba(253, 224, 71, 0.35)")).toBe("#fde047");
    expect(toHex("#2563EB")).toBe("#2563eb");
    expect(toHex("transparent")).toBe("transparent");
  });
});

describe("estilo de línea", () => {
  it("continua no tiene patrón", () => {
    expect(dashArray("solid", 2)).toBeNull();
  });
  it("discontinua y punteada escalan con el grosor", () => {
    expect(dashArray("dashed", 2)).toEqual([8, 6]);
    expect(dashArray("dashed", 4)).toEqual([16, 12]);
    expect(dashArray("dotted", 2)).toEqual([1, 6]);
  });
  it("lee el estilo desde el patrón guardado", () => {
    expect(dashStyleOf(null)).toBe("solid");
    expect(dashStyleOf([])).toBe("solid");
    expect(dashStyleOf([8, 6])).toBe("dashed");
    expect(dashStyleOf([1, 6])).toBe("dotted");
  });
});
