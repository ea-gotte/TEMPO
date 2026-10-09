import { describe, expect, it } from "vitest";
import { formatLength, measureLabel, metersPerPixel, parseMeters } from "./measure";

describe("escala de una imagen", () => {
  it("una línea de 200 px de escena sobre una imagen al 50 % que mide 4 m: 1 px de imagen = 1 cm", () => {
    expect(metersPerPixel(4, 200, 0.5)).toBeCloseTo(0.01, 10);
  });
  it("la cota usa la escala de la imagen aunque la imagen se haya agrandado", () => {
    // imagen al 100 %: los mismos 400 px de imagen ocupan 400 px de escena → 4 m
    expect(measureLabel(400, { scale: 1, mPerPx: 0.01 })).toBe("4 m");
    expect(measureLabel(300, { scale: 0.5, mPerPx: 0.01 })).toBe("6 m");
  });
  it("sin escala calibrada muestra píxeles", () => {
    expect(measureLabel(123.4, null)).toBe("123 px (sin escala)");
  });
});

describe("formatLength", () => {
  it("metros con coma decimal", () => {
    expect(formatLength(3.25)).toBe("3,25 m");
    expect(formatLength(12)).toBe("12 m");
    expect(formatLength(1234.5)).toBe("1234,5 m");
  });
  it("menos de un metro, en centímetros", () => {
    expect(formatLength(0.854)).toBe("85,4 cm");
    expect(formatLength(0.5)).toBe("50 cm");
  });
});

describe("parseMeters", () => {
  it("acepta coma o punto y la unidad opcional", () => {
    expect(parseMeters("3,5")).toBe(3.5);
    expect(parseMeters("3.5 m")).toBe(3.5);
    expect(parseMeters(" 12 ")).toBe(12);
    expect(parseMeters("85 cm")).toBe(0.85);
  });
  it("rechaza lo que no es una longitud positiva", () => {
    expect(parseMeters("")).toBeNull();
    expect(parseMeters("abc")).toBeNull();
    expect(parseMeters("0")).toBeNull();
    expect(parseMeters("-2")).toBeNull();
    expect(parseMeters(null)).toBeNull();
  });
});
