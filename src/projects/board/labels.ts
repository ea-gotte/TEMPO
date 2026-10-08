import { Ellipse, Group, Polygon, Rect, Shadow, Textbox, type Canvas, type FabricObject } from "fabric";
import { uid } from "../../utils";
import type { Box } from "./geometry";
import { markTransient, prepareObject, replaceObject } from "./shapes";
import { FONT, INK, NOTE_COLORS } from "./tools";

/**
 * Formas con texto (nota adhesiva, rectángulo, elipse, rombo) = Group[figura, Textbox].
 * Cambiar tamaño, texto o estilo = reconstruir la forma con el mismo id (los conectores
 * la siguen encontrando): más simple y robusto que editar los hijos de un grupo.
 */

export type LabeledKind = "note" | "rect" | "ellipse" | "diamond";
const LABELED: string[] = ["note", "rect", "ellipse", "diamond"];

export const isLabeled = (o: FabricObject | null | undefined): o is Group => !!o && !!o.kind && LABELED.includes(o.kind);

export interface LabeledSpec {
  kind: LabeledKind;
  /** Caja sin rotar, en coordenadas de escena */
  box: Box;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  angle?: number;
  opacity?: number;
  id?: string;
}

const PAD = 12;

/** Achica la letra hasta que el texto entre en el alto disponible (mínimo 8 px). */
function fitText(t: Textbox, maxHeight: number) {
  while (t.height > maxHeight && t.fontSize > 8) {
    t.set({ fontSize: t.fontSize - 1 });
    t.initDimensions();
  }
}

export function createLabeled(s: LabeledSpec): Group {
  const w = Math.max(s.box.width, 24);
  const h = Math.max(s.box.height, 24);
  const note = s.kind === "note";
  const base = {
    left: 0,
    top: 0,
    strokeUniform: true,
    fill: s.fill ?? (note ? NOTE_COLORS[0] : "#ffffff"),
    stroke: note ? "transparent" : s.stroke ?? INK,
    strokeWidth: note ? 0 : s.strokeWidth ?? 2,
  };
  const shape =
    s.kind === "ellipse"
      ? new Ellipse({ ...base, rx: w / 2, ry: h / 2 })
      : s.kind === "diamond"
        ? new Polygon([{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }], base)
        : new Rect({ ...base, width: w, height: h, rx: note ? 3 : 6, ry: note ? 3 : 6 });
  if (note) shape.set({ shadow: new Shadow({ color: "rgba(0,0,0,0.18)", blur: 10, offsetY: 3 }) });
  // el rombo y la elipse tienen menos lugar útil cerca de los bordes
  const k = s.kind === "diamond" ? 0.5 : s.kind === "ellipse" ? 0.7 : 1;
  const textW = k < 1 ? w * k : w - PAD * 2;
  const textH = k < 1 ? h * k : h - PAD * 2;
  const label = new Textbox(s.text ?? "", {
    left: 0,
    top: 0,
    width: Math.max(textW, 16),
    fontSize: s.fontSize ?? (note ? 18 : 16),
    fontFamily: FONT,
    fill: INK,
    textAlign: "center",
  });
  fitText(label, Math.max(textH, 12));
  const g = new Group([shape, label]);
  g.set({ left: s.box.left + w / 2, top: s.box.top + h / 2, angle: s.angle ?? 0, opacity: s.opacity ?? 1, id: s.id ?? uid(), kind: s.kind });
  g.setCoords();
  prepareObject(g);
  return g;
}

/** Tamaño propio de la figura (sin escala del grupo ni borde). */
function shapeSize(shape: FabricObject): { w: number; h: number } {
  if (shape instanceof Polygon) {
    const xs = shape.points.map((p) => p.x);
    const ys = shape.points.map((p) => p.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { w: shape.width, h: shape.height };
}

/** Lee una forma con texto como especificación, con la escala del grupo ya aplicada al tamaño. */
export function readLabeled(g: Group): LabeledSpec {
  const [shape, label] = g.getObjects() as [FabricObject, Textbox];
  const size = shapeSize(shape);
  const w = size.w * g.scaleX;
  const h = size.h * g.scaleY;
  return {
    kind: g.kind as LabeledKind,
    id: g.id,
    box: { left: g.left - w / 2, top: g.top - h / 2, width: w, height: h },
    text: label.text,
    fill: String(shape.fill),
    stroke: String(shape.stroke),
    strokeWidth: shape.strokeWidth,
    fontSize: label.fontSize,
    angle: g.angle,
    opacity: g.opacity,
  };
}

/**
 * Edita el texto de una forma: pone encima un Textbox auxiliar con el fondo de la
 * forma y, al salir de la edición, reconstruye la forma con el texto nuevo.
 */
export function editLabel(canvas: Canvas, g: Group, onDone: (next: Group) => void) {
  const spec = readLabeled(g);
  const [, label] = g.getObjects() as [FabricObject, Textbox];
  const editor = markTransient(
    new Textbox(label.text, {
      left: g.left,
      top: g.top,
      angle: g.angle,
      width: label.width * g.scaleX,
      fontSize: label.fontSize * g.scaleY,
      fontFamily: FONT,
      fill: INK,
      textAlign: "center",
      backgroundColor: spec.fill && spec.fill !== "transparent" ? spec.fill : "#ffffff",
    }),
  );
  canvas.add(editor);
  canvas.setActiveObject(editor);
  editor.enterEditing();
  editor.selectAll();
  editor.on("editing:exited", () => {
    canvas.remove(editor);
    const next = createLabeled({ ...spec, text: editor.text });
    replaceObject(canvas, g, next);
    canvas.setActiveObject(next);
    canvas.requestRenderAll();
    onDone(next);
  });
}

/** Una forma con texto escalada se reconstruye a escala 1, para que la letra no se deforme. */
export function bakeScaledLabels(canvas: Canvas, only?: FabricObject[]): Group[] {
  const out: Group[] = [];
  for (const o of only ?? canvas.getObjects()) {
    if (!isLabeled(o) || o.group) continue; // dentro de una selección múltiple, después
    if (Math.abs(o.scaleX - 1) < 1e-3 && Math.abs(o.scaleY - 1) < 1e-3) continue;
    const next = createLabeled(readLabeled(o));
    replaceObject(canvas, o, next);
    out.push(next);
  }
  return out;
}
