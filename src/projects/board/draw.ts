import { Line, Polyline, Rect, type Canvas, type FabricObject } from "fabric";
import { shapeAt, shapeBox } from "./connectors";
import { boxFromPoints, connectorEnds, constrainAngle, nextMarkerNumber, snap, squareFromPoints, type Box, type Pt } from "./geometry";
import { createLabeled } from "./labels";
import { polygonArea } from "./measure";
import { createArea, createCloud, createConnector, createMarker, createMeasure, createText, markTransient } from "./shapes";
import type { Tool } from "./tools";

/**
 * Crear objetos con el mouse: arrastrar define el tamaño (con una vista previa
 * punteada) y un clic crea uno de tamaño por defecto.
 * Adaptado de handleCanvasMouseDown/Move/Up de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

const DRAG_TOOLS: Tool[] = ["note", "rect", "ellipse", "diamond", "arrow", "line", "cloud", "measure", "calibrate"];
const PREVIEW = { stroke: "#5b6cff", strokeWidth: 1.5, strokeDashArray: [6, 4], strokeUniform: true, selectable: false, evented: false };

export interface DrawOptions {
  tool: () => Tool;
  noteColor: () => string;
  /** Se creó un objeto (ya agregado y seleccionado). `editing` = quedó escribiéndose (texto). */
  onCreated: (obj: FabricObject, editing: boolean) => void;
  /** Ajustar a la cuadrícula: los puntos del arrastre caen en la cuadrícula */
  snap: () => boolean;
  /** Se trazó la línea para calibrar la escala (no crea ningún objeto) */
  onCalibrate: (a: Pt, b: Pt) => void;
}

export function attachDrawing(c: Canvas, opts: DrawOptions): () => void {
  const at = (p: Pt): Pt => (opts.snap() ? { x: snap(p.x), y: snap(p.y) } : { x: p.x, y: p.y });
  let start: Pt | null = null;
  let preview: FabricObject | null = null;

  // Superficie: los vértices se marcan de a un clic; la vista previa sigue al puntero
  let poly: Pt[] = [];
  let polyPreview: Polyline | null = null;
  const showPoly = (pointer: Pt | null) => {
    if (polyPreview) c.remove(polyPreview);
    polyPreview = poly.length ? markTransient(new Polyline(pointer ? [...poly, pointer] : poly, { ...PREVIEW, fill: "rgba(37,99,235,0.08)" })) : null;
    if (polyPreview) c.add(polyPreview);
    c.requestRenderAll();
  };
  const dropPoly = () => {
    poly = [];
    showPoly(null);
  };
  const finishPoly = () => {
    const pts = poly;
    dropPoly();
    // menos de 3 vértices, o casi sin superficie en pantalla: no se crea nada
    if (pts.length < 3 || polygonArea(pts) * c.getZoom() ** 2 < 64) return;
    const area = createArea(pts);
    c.add(area);
    c.setActiveObject(area);
    opts.onCreated(area, false);
    c.requestRenderAll();
  };
  /** Con Shift, el lado nuevo queda horizontal, vertical o a 45° */
  const nextVertex = (o: { scenePoint: Pt; e: Event }) => {
    const p = at(o.scenePoint);
    const last = poly[poly.length - 1];
    return last && (o.e as MouseEvent).shiftKey ? constrainAngle(last, p) : p;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!poly.length) return;
    if (e.key === "Enter") finishPoly();
    else if (e.key === "Escape") dropPoly();
  };
  window.addEventListener("keydown", onKey);

  const offs = [
    () => window.removeEventListener("keydown", onKey),
    c.on("mouse:down", (o) => {
      if ((o.e as MouseEvent).button === 1) return; // botón del medio = desplazar
      const tool = opts.tool();
      if (tool !== "area" && poly.length) dropPoly(); // se cambió de herramienta a mitad de camino
      if (tool === "area") {
        const p = nextVertex(o);
        const z = c.getZoom();
        // clic sobre el primer vértice: cierra la superficie
        if (poly.length >= 3 && Math.hypot(p.x - poly[0].x, p.y - poly[0].y) * z < 10) return finishPoly();
        // el doble clic que la cierra manda antes dos clics en el mismo lugar: no se repite el vértice
        const last = poly[poly.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) * z < 4) return;
        poly.push(p);
        showPoly(p);
        return;
      }
      if (tool === "marker") {
        // la herramienta queda activa para numerar varias seguidas (1, 2, 3…)
        const nums = c.getObjects().filter((x) => x.kind === "marker").map((x) => x.num ?? 0);
        const m = createMarker(at(o.scenePoint), nextMarkerNumber(nums));
        c.add(m);
        opts.onCreated(m, false);
        return;
      }
      if (tool === "text") {
        const t = createText(at(o.scenePoint));
        c.add(t);
        c.setActiveObject(t);
        t.enterEditing();
        opts.onCreated(t, true);
        return;
      }
      if (!DRAG_TOOLS.includes(tool)) return;
      start = at(o.scenePoint);
      preview = markTransient(
        tool === "arrow" || tool === "line" || tool === "measure" || tool === "calibrate"
          ? new Line([start.x, start.y, start.x, start.y], PREVIEW)
          : new Rect({ ...PREVIEW, left: start.x, top: start.y, width: 0, height: 0, fill: "rgba(91,108,255,0.06)" }),
      );
      c.add(preview);
    }),
    c.on("mouse:dblclick", () => {
      if (opts.tool() === "area" && poly.length) finishPoly();
    }),
    c.on("mouse:move", (o) => {
      if (poly.length) {
        if (opts.tool() === "area") showPoly(nextVertex(o));
        else dropPoly();
        return;
      }
      if (!start || !preview) return;
      const p = at(o.scenePoint);
      if (preview instanceof Line) {
        // con Shift, la recta queda horizontal, vertical o a 45°
        const q = (o.e as MouseEvent).shiftKey ? constrainAngle(start, p) : p;
        preview.set({ x2: q.x, y2: q.y });
      }
      else {
        const b = (o.e as MouseEvent).shiftKey ? squareFromPoints(start, p) : boxFromPoints(start, p);
        preview.set({ left: b.left + b.width / 2, top: b.top + b.height / 2, width: b.width, height: b.height });
      }
      c.requestRenderAll();
    }),
    c.on("mouse:up", (o) => {
      if (!start || !preview) return;
      const a = start;
      const straight = preview instanceof Line && (o.e as MouseEvent).shiftKey;
      const b = straight ? constrainAngle(a, at(o.scenePoint)) : at(o.scenePoint);
      c.remove(preview);
      start = null;
      preview = null;
      if (opts.tool() === "calibrate") {
        opts.onCalibrate(a, b);
        c.requestRenderAll();
        return;
      }
      const obj = finish(c, opts.tool(), a, b, (o.e as MouseEvent).shiftKey, opts.noteColor(), opts.snap());
      if (obj) {
        c.add(obj);
        c.setActiveObject(obj);
        opts.onCreated(obj, false);
      }
      c.requestRenderAll();
    }),
  ];
  return () => offs.forEach((off) => off());
}

function finish(c: Canvas, tool: Tool, a: Pt, b: Pt, shift: boolean, noteColor: string, snapOn: boolean): FabricObject | null {
  // tamaño por defecto (clic sin arrastre): con la cuadrícula, la esquina también cae en ella
  const place = (box: Box): Box => (snapOn ? { ...box, left: snap(box.left), top: snap(box.top) } : box);
  // menos de 4 px de pantalla es un clic, no un arrastre
  const dragged = Math.hypot(b.x - a.x, b.y - a.y) * c.getZoom() > 4;
  switch (tool) {
    case "note":
      return createLabeled({ kind: "note", fill: noteColor, box: dragged ? boxFromPoints(a, b) : place({ left: a.x - 100, top: a.y - 100, width: 200, height: 200 }) });
    case "rect":
    case "ellipse":
    case "diamond":
      return createLabeled({
        kind: tool,
        box: dragged ? (shift ? squareFromPoints(a, b) : boxFromPoints(a, b)) : place({ left: a.x - 80, top: a.y - 50, width: 160, height: 100 }),
      });
    case "cloud":
      return dragged ? createCloud(boxFromPoints(a, b)) : null;
    case "measure":
      return dragged ? createMeasure(a, b) : null;
    case "arrow":
    case "line": {
      if (!dragged) return null;
      const from = shapeAt(c, a);
      const hit = shapeAt(c, b);
      const to = hit === from ? null : hit; // empezar y terminar en la misma forma no la engancha dos veces
      const ends = connectorEnds(from ? shapeBox(from) : null, to ? shapeBox(to) : null, a, b);
      const line = createConnector(tool, ends.start, ends.end);
      line.set({ fromId: from?.id ?? null, toId: to?.id ?? null });
      return line;
    }
    default:
      return null;
  }
}
