import { Line, Rect, type Canvas, type FabricObject } from "fabric";
import { shapeAt, shapeBox } from "./connectors";
import { boxFromPoints, connectorEnds, snap, squareFromPoints, type Box, type Pt } from "./geometry";
import { createLabeled } from "./labels";
import { createCloud, createConnector, createText, markTransient } from "./shapes";
import type { Tool } from "./tools";

/**
 * Crear objetos con el mouse: arrastrar define el tamaño (con una vista previa
 * punteada) y un clic crea uno de tamaño por defecto.
 * Adaptado de handleCanvasMouseDown/Move/Up de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

const DRAG_TOOLS: Tool[] = ["note", "rect", "ellipse", "diamond", "arrow", "line", "cloud"];
const PREVIEW = { stroke: "#5b6cff", strokeWidth: 1.5, strokeDashArray: [6, 4], strokeUniform: true, selectable: false, evented: false };

export interface DrawOptions {
  tool: () => Tool;
  noteColor: () => string;
  /** Se creó un objeto (ya agregado y seleccionado). `editing` = quedó escribiéndose (texto). */
  onCreated: (obj: FabricObject, editing: boolean) => void;
  /** Ajustar a la cuadrícula: los puntos del arrastre caen en la cuadrícula */
  snap: () => boolean;
}

export function attachDrawing(c: Canvas, opts: DrawOptions): () => void {
  const at = (p: Pt): Pt => (opts.snap() ? { x: snap(p.x), y: snap(p.y) } : { x: p.x, y: p.y });
  let start: Pt | null = null;
  let preview: FabricObject | null = null;

  const offs = [
    c.on("mouse:down", (o) => {
      if ((o.e as MouseEvent).button === 1) return; // botón del medio = desplazar
      const tool = opts.tool();
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
        tool === "arrow" || tool === "line"
          ? new Line([start.x, start.y, start.x, start.y], PREVIEW)
          : new Rect({ ...PREVIEW, left: start.x, top: start.y, width: 0, height: 0, fill: "rgba(91,108,255,0.06)" }),
      );
      c.add(preview);
    }),
    c.on("mouse:move", (o) => {
      if (!start || !preview) return;
      const p = at(o.scenePoint);
      if (preview instanceof Line) preview.set({ x2: p.x, y2: p.y });
      else {
        const b = (o.e as MouseEvent).shiftKey ? squareFromPoints(start, p) : boxFromPoints(start, p);
        preview.set({ left: b.left + b.width / 2, top: b.top + b.height / 2, width: b.width, height: b.height });
      }
      c.requestRenderAll();
    }),
    c.on("mouse:up", (o) => {
      if (!start || !preview) return;
      const a = start;
      const b = at(o.scenePoint);
      c.remove(preview);
      start = null;
      preview = null;
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
