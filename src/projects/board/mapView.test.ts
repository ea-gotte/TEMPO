import { describe, expect, it } from "vitest";
import { mapFit, mapToWorld } from "./mapView";

describe("minimapa", () => {
  it("encaja el mundo en el minimapa, centrado y sin deformar", () => {
    expect(mapFit({ left: 0, top: 0, width: 1000, height: 500 }, 200, 100)).toEqual({ scale: 0.2, x: 0, y: 0 });
    expect(mapFit({ left: 0, top: 0, width: 100, height: 100 }, 200, 100)).toEqual({ scale: 1, x: 50, y: 0 });
    expect(mapFit({ left: -500, top: 100, width: 1000, height: 1000 }, 200, 100)).toEqual({ scale: 0.1, x: 100, y: -10 });
  });
  it("un punto del minimapa vuelve a coordenadas del tablero", () => {
    const fit = mapFit({ left: -500, top: 100, width: 1000, height: 1000 }, 200, 100);
    expect(mapToWorld(fit, { x: 100, y: 0 })).toEqual({ x: 0, y: 100 });
    expect(mapToWorld(fit, { x: 150, y: 100 })).toEqual({ x: 500, y: 1100 });
  });
});
