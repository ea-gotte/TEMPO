import { describe, expect, it } from "vitest";
import { TEMPLATES, templateBounds, templateOffset } from "./templates";

describe("plantillas", () => {
  it("hay plantillas para ideas, diagramas y planos", () => {
    expect(TEMPLATES.map((t) => t.key)).toEqual(["ideas", "retro", "approval", "plan-review", "risk-matrix"]);
  });
  it("cada plantilla tiene elementos con tamaño y texto", () => {
    for (const t of TEMPLATES) {
      expect(t.items.length).toBeGreaterThan(0);
      for (const it of t.items) {
        expect(it.w).toBeGreaterThan(0);
        expect(it.h).toBeGreaterThan(0);
      }
    }
  });
  it("las flechas unen elementos que existen y que se pueden enganchar", () => {
    for (const t of TEMPLATES) {
      for (const [from, to] of t.links) {
        expect(t.items[from]).toBeDefined();
        expect(t.items[to]).toBeDefined();
        expect(from).not.toBe(to);
      }
    }
  });
  it("el flujo de aprobación tiene una decisión con dos salidas", () => {
    const flow = TEMPLATES.find((t) => t.key === "approval")!;
    const decision = flow.items.findIndex((i) => i.kind === "diamond");
    expect(flow.links.filter(([from]) => from === decision)).toHaveLength(2);
  });
});

describe("templateBounds", () => {
  it("caja que encierra todos los elementos", () => {
    expect(templateBounds({ key: "x", label: "x", items: [
      { kind: "note", x: 10, y: 20, w: 100, h: 50, text: "" },
      { kind: "rect", x: 200, y: 0, w: 40, h: 40, text: "" },
    ], links: [] })).toEqual({ left: 10, top: 0, width: 230, height: 70 });
  });
});

describe("templateOffset", () => {
  const bounds = { left: 0, top: 0, width: 200, height: 100 };
  it("en un lugar libre, centrada en la vista", () => {
    expect(templateOffset(bounds, { x: 500, y: 300 }, [])).toEqual({ dx: 400, dy: 250 });
  });
  it("si se encima con lo que ya hay, va a la derecha de todo, con un margen", () => {
    const occupied = [{ left: 350, top: 200, width: 300, height: 200 }, { left: 900, top: 0, width: 100, height: 100 }];
    expect(templateOffset(bounds, { x: 500, y: 300 }, occupied)).toEqual({ dx: 1080, dy: 250 }); // 1000 + 80
  });
  it("si lo que hay está lejos, igual va al centro", () => {
    expect(templateOffset(bounds, { x: 500, y: 300 }, [{ left: 2000, top: 2000, width: 50, height: 50 }])).toEqual({ dx: 400, dy: 250 });
  });
});
