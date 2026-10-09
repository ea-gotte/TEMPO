import { Point, type Canvas, type FabricObject, type Line } from "fabric";
import { lineEnds } from "./connectors";
import type { Pt } from "./geometry";
import { measureLabel, metersPerPixel, type Calibration } from "./measure";

/**
 * Cotas sobre planos (capa Fabric). La escala vive en cada imagen (mPerPx); la
 * etiqueta de cada cota se recalcula según la imagen calibrada que tiene debajo.
 */

/** Escala de la imagen calibrada más arriba que contiene el punto (null si no hay). */
export function calibrationAt(canvas: Canvas, p: Pt): Calibration | null {
  const pt = new Point(p.x, p.y);
  const objs = canvas.getObjects();
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (o.kind === "image" && o.mPerPx && o.containsPoint(pt)) return { scale: o.scaleX, mPerPx: o.mPerPx };
  }
  return null;
}

/** Recalcula las etiquetas de las cotas. Devuelve true si cambió alguna. */
export function refreshMeasures(canvas: Canvas): boolean {
  let changed = false;
  for (const o of canvas.getObjects()) {
    if (o.kind !== "measure" || o.group) continue;
    const { start, end } = lineEnds(o as Line);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const label = measureLabel(Math.hypot(end.x - start.x, end.y - start.y), calibrationAt(canvas, mid));
    if (label !== o.measureLabel) {
      o.set({ measureLabel: label, dirty: true });
      changed = true;
    }
  }
  if (changed) canvas.requestRenderAll();
  return changed;
}

/** Calibra la imagen: la línea a–b (escena) mide `meters` en la realidad. */
export function calibrateImage(img: FabricObject, a: Pt, b: Pt, meters: number) {
  img.set({ mPerPx: metersPerPixel(meters, Math.hypot(b.x - a.x, b.y - a.y), img.scaleX) });
}
