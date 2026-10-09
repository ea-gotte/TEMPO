import { describe, expect, it } from "vitest";
import type { StyleState } from "./style";
import { MIXED, mergeStyles } from "./styleMerge";

const base: StyleState = { kind: undefined, fill: null, stroke: null, strokeWidth: null, fontSize: null, opacity: 1, strokeLabel: "Borde", dash: null, heads: null, textColor: null, weight: null, route: null };
const image: StyleState = { ...base, kind: "image" };
const rect: StyleState = { ...base, kind: "rect", fill: "#ffffff", stroke: "#1f2937", strokeWidth: 2, fontSize: 16, dash: "solid" };
const rect2: StyleState = { ...rect, fill: "#fef08a", fontSize: 24 };
const arrow: StyleState = { ...base, kind: "arrow", stroke: "#1f2937", strokeWidth: 2, strokeLabel: "Línea", dash: "dashed", heads: "end" };

describe("mergeStyles", () => {
  it("un solo objeto queda igual", () => {
    expect(mergeStyles([rect])).toEqual(rect);
  });
  it("muestra una propiedad si la tiene cualquiera de los objetos, aunque el primero sea una imagen", () => {
    const m = mergeStyles([image, rect]);
    expect(m.fill).toBe("#ffffff");
    expect(m.stroke).toBe("#1f2937");
    expect(m.fontSize).toBe(16);
  });
  it("valores distintos quedan como mixtos (ninguna muestra marcada)", () => {
    const m = mergeStyles([rect, rect2]);
    expect(m.fill).toBe(MIXED);
    expect(m.fontSize).toBe(0);
    expect(m.stroke).toBe("#1f2937");
  });
  it("tipos distintos: sin tipo común y una etiqueta genérica para el color de línea", () => {
    const m = mergeStyles([rect, arrow]);
    expect(m.kind).toBeUndefined();
    expect(m.strokeLabel).toBe("Color");
    expect(m.strokeWidth).toBe(2);
  });
  it("lo que ningún objeto tiene sigue oculto", () => {
    expect(mergeStyles([image, arrow]).fill).toBeNull();
  });
});

describe("mergeStyles: trazo y puntas", () => {
  it("trazos distintos quedan mixtos; las puntas aparecen si alguna flecha las tiene", () => {
    const m = mergeStyles([rect, arrow]);
    expect(m.dash).toBe(MIXED);
    expect(m.heads).toBe("end");
  });
  it("una imagen sola no ofrece trazo ni puntas", () => {
    expect(mergeStyles([image, { ...image }]).dash).toBeNull();
  });
});

describe("mergeStyles: texto", () => {
  it("color del texto y negrita se combinan como el resto", () => {
    const a: StyleState = { ...rect, textColor: "#1f2937", weight: "bold" };
    const b: StyleState = { ...rect2, textColor: "#dc2626", weight: "bold" };
    const m = mergeStyles([a, b, image]);
    expect(m.textColor).toBe(MIXED);
    expect(m.weight).toBe("bold");
    expect(mergeStyles([a, { ...b, weight: "normal" }]).weight).toBe(MIXED);
    expect(mergeStyles([image, arrow]).textColor).toBeNull();
  });
});

describe("mergeStyles: recorrido", () => {
  it("recto y en ángulo mezclados quedan mixtos", () => {
    const a: StyleState = { ...arrow, route: "straight" };
    expect(mergeStyles([a, { ...a, route: "elbow" }]).route).toBe(MIXED);
    expect(mergeStyles([a, rect]).route).toBe("straight");
  });
});
