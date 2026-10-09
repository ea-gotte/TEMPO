import { describe, expect, it } from "vitest";
import { fitWithin, hasAlpha, needsReencode, validateImageFile } from "./image";

describe("validateImageFile", () => {
  it("acepta PNG, JPG, WebP y GIF", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) expect(validateImageFile({ type, size: 1000 })).toBeNull();
  });
  it("rechaza lo que no es imagen, y también SVG", () => {
    expect(validateImageFile({ type: "application/pdf", size: 10 })).toMatch(/PNG, JPG, WebP o GIF/);
    expect(validateImageFile({ type: "image/svg+xml", size: 10 })).not.toBeNull();
  });
  it("rechaza más de 25 MB y acepta exactamente 25 MB", () => {
    expect(validateImageFile({ type: "image/png", size: 25 * 1024 * 1024 + 1 })).toMatch(/25 MB/);
    expect(validateImageFile({ type: "image/png", size: 25 * 1024 * 1024 })).toBeNull();
  });
});

describe("fitWithin", () => {
  it("reduce una imagen horizontal a 4096 de lado mayor", () => {
    expect(fitWithin(8192, 4096)).toEqual({ width: 4096, height: 2048, scaled: true });
  });
  it("reduce una vertical", () => {
    expect(fitWithin(3000, 6000)).toEqual({ width: 2048, height: 4096, scaled: true });
  });
  it("no toca una chica ni una de exactamente 4096", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(4096, 100)).toEqual({ width: 4096, height: 100, scaled: false });
  });
});

describe("hasAlpha", () => {
  it("detecta un píxel con transparencia", () => {
    expect(hasAlpha(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128]))).toBe(true);
  });
  it("una imagen opaca no tiene", () => {
    expect(hasAlpha(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
  });
});

describe("needsReencode", () => {
  it("recodifica si hubo que reducirla", () => {
    expect(needsReencode(500_000, true)).toBe(true);
  });
  it("recodifica una imagen pesada aunque no pase de 4096 px (cada instantánea del historial la copia)", () => {
    expect(needsReencode(4 * 1024 * 1024 + 1, false)).toBe(true);
  });
  it("deja intacta una imagen chica que no se redujo", () => {
    expect(needsReencode(4 * 1024 * 1024, false)).toBe(false);
  });
});
