import { describe, expect, it } from "vitest";
import { alignDeltas, distributeDeltas } from "./align";

// tres cajas de distinto tamaño
const a = { left: 0, top: 0, width: 100, height: 50 };
const b = { left: 150, top: 80, width: 60, height: 40 };
const c = { left: 400, top: 20, width: 80, height: 100 };

describe("alignDeltas", () => {
  it("a la izquierda: todos al borde izquierdo del grupo", () => {
    expect(alignDeltas([a, b, c], "left")).toEqual([{ dx: 0, dy: 0 }, { dx: -150, dy: 0 }, { dx: -400, dy: 0 }]);
  });
  it("a la derecha: todos al borde derecho del grupo (480)", () => {
    expect(alignDeltas([a, b, c], "right")).toEqual([{ dx: 380, dy: 0 }, { dx: 270, dy: 0 }, { dx: 0, dy: 0 }]);
  });
  it("centro horizontal: todos al centro del grupo", () => {
    expect(alignDeltas([a, b], "hcenter")).toEqual([{ dx: 55, dy: 0 }, { dx: -75, dy: 0 }]); // grupo 0–210, centro 105
  });
  it("arriba, al medio y abajo", () => {
    expect(alignDeltas([a, b, c], "top")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: -80 }, { dx: 0, dy: -20 }]);
    expect(alignDeltas([a, c], "vmiddle")).toEqual([{ dx: 0, dy: 35 }, { dx: 0, dy: -10 }]); // grupo 0–120, medio 60
    expect(alignDeltas([a, b, c], "bottom")).toEqual([{ dx: 0, dy: 70 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });
});

describe("distributeDeltas", () => {
  it("horizontal: mismo espacio entre cajas, las de los extremos quedan quietas", () => {
    // ancho total ocupado 240 en 0–480: espacio libre 240, dos huecos de 120 → b va a 220
    expect(distributeDeltas([a, b, c], "h")).toEqual([{ dx: 0, dy: 0 }, { dx: 70, dy: 0 }, { dx: 0, dy: 0 }]);
  });
  it("respeta el orden en pantalla aunque la selección venga desordenada", () => {
    expect(distributeDeltas([c, a, b], "h")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 70, dy: 0 }]);
  });
  it("vertical", () => {
    // alto ocupado 190 en 0–120… las cajas se solapan: espacio libre negativo, se reparte igual
    const r = distributeDeltas([a, b, c], "v");
    expect(r[0]).toEqual({ dx: 0, dy: 0 });
    expect(r.every((d) => d.dx === 0)).toBe(true);
  });
  it("con menos de tres no hace nada", () => {
    expect(distributeDeltas([a, b], "h")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });
});
