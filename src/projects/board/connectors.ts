import { Point, type Canvas, type FabricObject, type Line } from "fabric";
import { connectorEnds, elbowRoute, type Box, type Pt } from "./geometry";
import type { Kind } from "./shapes";

/**
 * Conectores (flecha/línea) enganchados a formas: siguen a la forma al moverla
 * (spec §5.2). La geometría pura está en geometry.ts (connectorEnds).
 *
 * Ojo con las líneas de Fabric: x1..y2 quedan viejos cuando el usuario mueve o
 * escala la línea. Por eso los extremos reales se calculan SIEMPRE con lineEnds().
 */

/** Se puede enganchar a notas, formas, textos y nubes; no a imágenes (un plano) ni a lo bloqueado. */
const ATTACHABLE: Kind[] = ["note", "rect", "ellipse", "diamond", "text", "cloud", "marker"];

export const isConnector = (o: FabricObject): o is Line => o.kind === "arrow" || o.kind === "line";
const isAttachable = (o: FabricObject) => !!o.kind && ATTACHABLE.includes(o.kind) && !o.lockedByUser && o.visible;

export function shapeBox(o: FabricObject): Box {
  o.setCoords();
  const r = o.getBoundingRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function lineEnds(l: Line): { start: Pt; end: Pt } {
  const p = l.calcLinePoints();
  const m = l.calcTransformMatrix();
  const s = new Point(p.x1, p.y1).transform(m);
  const e = new Point(p.x2, p.y2).transform(m);
  return { start: { x: s.x, y: s.y }, end: { x: e.x, y: e.y } };
}

export function setLineEnds(l: Line, start: Pt, end: Pt) {
  l.set({ scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0, flipX: false, flipY: false });
  l.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  l.setCoords();
}

/** Forma enganchable más arriba bajo el punto (la última dibujada gana). */
export function shapeAt(canvas: Canvas, p: Pt): FabricObject | null {
  const pt = new Point(p.x, p.y);
  const objs = canvas.getObjects();
  for (let i = objs.length - 1; i >= 0; i--) if (isAttachable(objs[i]) && objs[i].containsPoint(pt)) return objs[i];
  return null;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Reacomoda los conectores enganchados (todos, o solo los que tocan las formas de
 * `only`). Si una forma ya no existe, ese extremo queda suelto donde estaba.
 * Devuelve true si cambió algo.
 */
export function refreshConnectors(canvas: Canvas, only?: Set<string>): boolean {
  const objs = canvas.getObjects();
  const byId = new Map<string, FabricObject>();
  for (const o of objs) if (o.id) byId.set(o.id, o);
  let changed = false;
  for (const o of objs) {
    // dentro de una selección múltiple la flecha se mueve con la selección
    if (!isConnector(o) || o.group || (!o.fromId && !o.toId)) continue;
    if (only && !(o.fromId && only.has(o.fromId)) && !(o.toId && only.has(o.toId))) continue;
    const from = o.fromId ? byId.get(o.fromId) : undefined;
    const to = o.toId ? byId.get(o.toId) : undefined;
    if (o.fromId && !from) { o.fromId = null; changed = true; }
    if (o.toId && !to) { o.toId = null; changed = true; }
    const cur = lineEnds(o);
    const fromBox = from ? shapeBox(from) : null;
    const toBox = to ? shapeBox(to) : null;
    let next = connectorEnds(fromBox, toBox, cur.start, cur.end);
    if (o.route === "elbow") {
      // en ángulo: sale y entra por el centro de los lados, y recuerda por cuáles (para dibujar el recorrido)
      const r = elbowRoute(fromBox, toBox, cur.start, cur.end);
      next = r;
      if (o.elbowAxes !== r.axes) {
        o.set({ elbowAxes: r.axes, dirty: true });
        changed = true;
      }
    }
    if (dist(cur.start, next.start) + dist(cur.end, next.end) > 0.5) {
      setLineEnds(o, next.start, next.end);
      changed = true;
    }
  }
  if (changed) canvas.requestRenderAll();
  return changed;
}
