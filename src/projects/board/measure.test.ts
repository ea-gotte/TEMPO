import { describe, expect, it } from "vitest";
import { areaLabel, formatArea, formatLength, measureLabel, metersPerPixel, parseMeters, polygonArea, polygonCentroid } from "./measure";

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

describe("medir superficies", () => {
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  // forma de L: 100 × 100 menos el cuadrante de 50 × 50 de arriba a la derecha → 7500
  const ell = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

  it("área de un polígono, sin importar el sentido en que se marcaron los vértices", () => {
    expect(polygonArea(square)).toBe(10000);
    expect(polygonArea([...square].reverse())).toBe(10000);
    expect(polygonArea(ell)).toBe(7500);
    expect(polygonArea(square.slice(0, 2))).toBe(0);
  });

  it("centro del polígono (donde va la etiqueta)", () => {
    expect(polygonCentroid(square)).toEqual({ x: 50, y: 50 });
    const c = polygonCentroid(ell);
    expect(c.x).toBeCloseTo(41.667, 3);
    expect(c.y).toBeCloseTo(58.333, 3);
    // sin área (vértices en línea): el promedio de los puntos
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toEqual({ x: 10, y: 0 });
  });

  it("superficie legible: m² con coma decimal, cm² si es muy chica", () => {
    expect(formatArea(12.346)).toBe("12,35 m²");
    expect(formatArea(250)).toBe("250 m²");
    expect(formatArea(0.5)).toBe("0,5 m²");
    expect(formatArea(0.0085)).toBe("85 cm²");
  });

  it("etiqueta según la escala de la imagen de abajo", () => {
    // imagen a escala 0,5 en el lienzo, 1 px de imagen = 2 cm → 1 px de escena = 4 cm; 100 × 100 px de escena = 4 m × 4 m
    expect(areaLabel(10000, { scale: 0.5, mPerPx: 0.02 })).toBe("16 m²");
    expect(areaLabel(10000, null)).toBe("10000 px² (sin escala)");
  });
});
