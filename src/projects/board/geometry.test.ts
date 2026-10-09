import { describe, expect, it } from "vitest";
import {
  anchorOnBox, boxFromPoints, clampZoom, cloudPath, connectorEnds, exportScale, fitScale, fitViewport, gridSpec,
  constrainAngle, elbowPoints, elbowRoute, heightForText, sideAnchor, nextMarkerNumber, sizeForText, snap, snapDelta, squareFromPoints, textArea, unionBoxes,
} from "./geometry";

// Caja de 100 × 50 con centro en (50, 25)
const A = { left: 0, top: 0, width: 100, height: 50 };
// Misma medida, 200 a la derecha: centro en (250, 25)
const B = { left: 200, top: 0, width: 100, height: 50 };

describe("boxFromPoints / squareFromPoints", () => {
  it("normaliza un arrastre hacia arriba a la izquierda", () => {
    expect(boxFromPoints({ x: 10, y: 20 }, { x: 4, y: 5 })).toEqual({ left: 4, top: 5, width: 6, height: 15 });
  });
  it("con Shift usa el lado mayor y respeta la dirección del arrastre", () => {
    expect(squareFromPoints({ x: 0, y: 0 }, { x: -30, y: 10 })).toEqual({ left: -30, top: 0, width: 30, height: 30 });
  });
});

describe("anchorOnBox", () => {
  it("apunta a la derecha, izquierda, abajo y arriba", () => {
    expect(anchorOnBox(A, { x: 200, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(anchorOnBox(A, { x: -50, y: 25 })).toEqual({ x: 0, y: 25 });
    expect(anchorOnBox(A, { x: 50, y: 300 })).toEqual({ x: 50, y: 50 });
    expect(anchorOnBox(A, { x: 50, y: -10 })).toEqual({ x: 50, y: 0 });
  });
  it("en diagonal corta el borde que se alcanza primero", () => {
    expect(anchorOnBox(A, { x: 150, y: 125 })).toEqual({ x: 75, y: 50 });
  });
  it("si el destino es el centro, devuelve el centro", () => {
    expect(anchorOnBox(A, { x: 50, y: 25 })).toEqual({ x: 50, y: 25 });
  });
});

describe("connectorEnds", () => {
  it("dos formas enganchadas: de borde a borde", () => {
    expect(connectorEnds(A, B, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 100, y: 25 }, end: { x: 200, y: 25 } });
  });
  it("final suelto: el inicio apunta al extremo libre", () => {
    expect(connectorEnds(A, null, { x: 0, y: 0 }, { x: 50, y: 200 })).toEqual({ start: { x: 50, y: 50 }, end: { x: 50, y: 200 } });
  });
  it("inicio suelto: el final apunta al inicio libre", () => {
    expect(connectorEnds(null, B, { x: 250, y: -100 }, { x: 0, y: 0 })).toEqual({ start: { x: 250, y: -100 }, end: { x: 250, y: 0 } });
  });
  it("formas superpuestas con el mismo centro: ambos extremos en el centro", () => {
    expect(connectorEnds(A, { ...A }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 50, y: 25 }, end: { x: 50, y: 25 } });
  });
});

describe("vista", () => {
  it("unionBoxes", () => {
    expect(unionBoxes([])).toBeNull();
    expect(unionBoxes([A, B])).toEqual({ left: 0, top: 0, width: 300, height: 50 });
  });
  it("clampZoom limita a 10 %–400 %", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
  });
  it("fitViewport encuadra contenido grande y centra", () => {
    const v = fitViewport({ left: 0, top: 0, width: 1000, height: 500 }, { width: 648, height: 448 });
    expect(v.zoom).toBeCloseTo(0.552, 3);
    expect(v.x).toBeCloseTo(48, 3);
    expect(v.y).toBeCloseTo(86, 3);
  });
  it("fitViewport no agranda contenido chico más allá de 100 %", () => {
    expect(fitViewport({ left: 0, top: 0, width: 100, height: 100 }, { width: 800, height: 600 })).toEqual({ zoom: 1, x: 350, y: 250 });
  });
  it("fitViewport con un máximo mayor acerca lo chico (encuadrar la selección)", () => {
    expect(fitViewport({ left: 0, top: 0, width: 100, height: 100 }, { width: 800, height: 600 }, 48, 2)).toEqual({ zoom: 2, x: 300, y: 200 });
    expect(fitViewport({ left: 0, top: 0, width: 10, height: 10 }, { width: 800, height: 600 }, 48, 8).zoom).toBe(4); // nunca más que el zoom máximo
  });
  it("fitScale y exportScale", () => {
    expect(fitScale(2000, 1000, 800, 800)).toBe(0.4);
    expect(fitScale(100, 100, 800, 800)).toBe(1);
    expect(exportScale(1000, 500)).toBe(2);
    expect(exportScale(16000, 100)).toBe(0.5);
  });
  it("gridSpec sigue al desplazamiento y se oculta con poco zoom", () => {
    // los puntos caen en múltiplos de 24 de la escena (donde ajusta la cuadrícula): el fondo se corre medio paso
    expect(gridSpec({ x: 30, y: -10, zoom: 1 })).toEqual({ size: 24, x: 18, y: 2 });
    expect(gridSpec({ x: 0, y: 0, zoom: 2 })).toEqual({ size: 48, x: 24, y: 24 });
    expect(gridSpec({ x: 0, y: 0, zoom: 0.25 })).toBeNull();
  });
});

describe("cloudPath", () => {
  it("rodea la caja con arcos y cierra el trazo", () => {
    const d = cloudPath(100, 50);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/A /g)).toHaveLength(24); // 8 + 4 + 8 + 4
  });
  it("una caja mínima tiene al menos un arco por lado", () => {
    expect(cloudPath(5, 5).match(/A /g)).toHaveLength(4);
  });
});

describe("exportScale con tope de área", () => {
  it("baja la escala si la imagen pasaría de 16 megapíxeles (límite de Safari)", () => {
    // 5000×5000 a 2× serían 100 MP: se baja a 0,8 (4000×4000 = 16 MP)
    expect(exportScale(5000, 5000)).toBeCloseTo(0.8, 5);
  });
  it("un tablero normal sigue saliendo a 2×", () => {
    expect(exportScale(1500, 900)).toBe(2);
  });
});

describe("formas con texto", () => {
  it("el área útil del texto depende de la forma", () => {
    expect(textArea("rect", 200, 100)).toEqual({ width: 176, height: 76 });
    expect(textArea("note", 200, 200)).toEqual({ width: 176, height: 176 });
    expect(textArea("ellipse", 200, 100)).toEqual({ width: 140, height: 70 });
    expect(textArea("diamond", 200, 100)).toEqual({ width: 100, height: 50 });
  });
  it("si el texto entra, el alto no cambia", () => {
    expect(heightForText("rect", 100, 40)).toBe(100);
  });
  it("si no entra, la forma crece justo lo necesario", () => {
    expect(heightForText("rect", 30, 90)).toBe(114); // 90 + 12 × 2
    expect(heightForText("note", 200, 300)).toBe(324);
    expect(heightForText("ellipse", 100, 140)).toBe(200); // 140 / 0,7
    expect(heightForText("diamond", 100, 90)).toBe(180); // 90 / 0,5
  });
});

describe("sizeForText", () => {
  // texto de "área" fija: cuanto más ancho el renglón, menos alto ocupa
  const measure = (textWidth: number) => 10000 / textWidth;

  it("si el texto entra, la forma no cambia", () => {
    expect(sizeForText("diamond", 400, 400, measure)).toEqual({ w: 400, h: 400 });
  });
  it("el rombo crece en ancho y alto, manteniendo la proporción", () => {
    expect(sizeForText("diamond", 100, 100, measure)).toEqual({ w: 200, h: 200 }); // 10000 / (50·2) = 100 ≤ 50·2
  });
  it("la elipse crece lo mínimo para que el texto entre", () => {
    const r = sizeForText("ellipse", 200, 100, measure);
    expect(r).toEqual({ w: 203, h: 102 });
    expect(r.w / r.h).toBeCloseTo(2, 1);
  });
  it("rectángulo y nota crecen solo en alto", () => {
    expect(sizeForText("rect", 100, 40, measure)).toEqual({ w: 100, h: 156 }); // 10000 / 76 + 24
    expect(sizeForText("note", 100, 40, measure).w).toBe(100);
  });
});

describe("ajustar a la cuadrícula", () => {
  it("redondea al múltiplo de 24 más cercano", () => {
    expect(snap(35)).toBe(24);
    expect(snap(37)).toBe(48);
    expect(snap(-13)).toBe(-24);
  });
  it("lleva la esquina superior izquierda de la caja a la cuadrícula", () => {
    expect(snapDelta({ left: 30, top: 50, width: 100, height: 80 })).toEqual({ dx: -6, dy: -2 });
    expect(snapDelta({ left: 48, top: 72, width: 10, height: 10 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("observaciones numeradas", () => {
  it("la primera es la 1", () => {
    expect(nextMarkerNumber([])).toBe(1);
  });
  it("sigue al número más alto (aunque se haya borrado alguna del medio)", () => {
    expect(nextMarkerNumber([1, 2, 5])).toBe(6);
    expect(nextMarkerNumber([3, 1])).toBe(4);
  });
});

describe("constrainAngle (Shift al trazar líneas)", () => {
  it("horizontal y vertical: el extremo queda a la altura o en la vertical del inicio", () => {
    expect(constrainAngle({ x: 10, y: 10 }, { x: 110, y: 18 })).toEqual({ x: 110, y: 10 });
    expect(constrainAngle({ x: 0, y: 0 }, { x: 3, y: -90 })).toEqual({ x: 0, y: -90 });
    expect(constrainAngle({ x: 0, y: 0 }, { x: -60, y: 5 })).toEqual({ x: -60, y: 0 });
  });
  it("diagonal a 45°", () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 90 });
    expect(p.x).toBeCloseTo(95, 6);
    expect(p.y).toBeCloseTo(95, 6);
  });
});

describe("flechas en ángulo", () => {
  const A = { left: 0, top: 0, width: 100, height: 50 };
  const B = { left: 300, top: 100, width: 100, height: 50 };
  it("salen del centro del lado que mira hacia el otro extremo", () => {
    expect(sideAnchor(A, { x: 300, y: 30 })).toEqual({ x: 100, y: 25 });
    expect(sideAnchor(A, { x: 50, y: 400 })).toEqual({ x: 50, y: 50 });
    expect(sideAnchor(A, { x: -200, y: 20 })).toEqual({ x: 0, y: 25 });
  });
  it("los extremos enganchados usan esos anclajes", () => {
    expect(elbowRoute(A, B, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 100, y: 25 }, end: { x: 300, y: 125 }, axes: "hh" });
  });
  it("sin lados conocidos, el recorrido va por la mitad y empieza en el sentido más largo", () => {
    expect(elbowPoints({ x: 100, y: 25 }, { x: 300, y: 125 })).toEqual([{ x: 100, y: 25 }, { x: 200, y: 25 }, { x: 200, y: 125 }, { x: 300, y: 125 }]);
    expect(elbowPoints({ x: 50, y: 50 }, { x: 150, y: 450 })).toEqual([{ x: 50, y: 50 }, { x: 50, y: 250 }, { x: 150, y: 250 }, { x: 150, y: 450 }]);
  });
  it("respeta por dónde sale y por dónde entra: lados de distinta orientación hacen una L", () => {
    expect(elbowPoints({ x: 50, y: 50 }, { x: 300, y: 300 }, "vh")).toEqual([{ x: 50, y: 50 }, { x: 50, y: 300 }, { x: 300, y: 300 }]);
    expect(elbowPoints({ x: 100, y: 25 }, { x: 300, y: 300 }, "hv")).toEqual([{ x: 100, y: 25 }, { x: 300, y: 25 }, { x: 300, y: 300 }]);
    expect(elbowPoints({ x: 50, y: 50 }, { x: 130, y: 300 }, "vv")).toEqual([{ x: 50, y: 50 }, { x: 50, y: 175 }, { x: 130, y: 175 }, { x: 130, y: 300 }]);
  });
  it("una forma debajo de otra: sale por abajo y entra por arriba", () => {
    const C = { left: 80, top: 300, width: 100, height: 50 };
    expect(elbowRoute(A, C, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 50, y: 50 }, end: { x: 130, y: 300 }, axes: "vv" });
  });
  it("una forma alta abajo a la derecha: sale por abajo y entra por el costado (en L)", () => {
    const D = { left: 300, top: 200, width: 40, height: 200 };
    expect(elbowRoute(A, D, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 50, y: 50 }, end: { x: 300, y: 300 }, axes: "vh" });
  });
  it("con un extremo suelto, ese extremo sigue la orientación del otro", () => {
    expect(elbowRoute(A, null, { x: 0, y: 0 }, { x: 400, y: 30 })).toEqual({ start: { x: 100, y: 25 }, end: { x: 400, y: 30 }, axes: "hh" });
  });
});
