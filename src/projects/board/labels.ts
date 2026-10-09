import { Ellipse, Group, Polygon, Rect, Shadow, Textbox, type Canvas, type FabricObject } from "fabric";
import { uid } from "../../utils";
import { sizeForText, textArea, type Box } from "./geometry";
import { dashArray, dashStyleOf, type DashStyle } from "./strokes";
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
  dash?: DashStyle;
  /** Color y negrita del texto (por defecto, tinta y normal) */
  color?: string;
  bold?: boolean;
  angle?: number;
  opacity?: number;
  id?: string;
}

/** Letra mínima al achicar para que el texto entre: más chica no se lee. Si aun así no entra, la forma crece. */
const MIN_FONT = 12;

/** Achica la letra hasta que el texto entre en el alto disponible, sin bajar de `min`. */
function fitText(t: Textbox, maxHeight: number, min: number) {
  while (t.height > maxHeight && t.fontSize > min) {
    t.set({ fontSize: t.fontSize - 1 });
    t.initDimensions();
  }
}

export function createLabeled(s: LabeledSpec): Group {
  const boxW = Math.max(s.box.width, 24);
  const boxH = Math.max(s.box.height, 24);
  const note = s.kind === "note";
  const wanted = s.fontSize ?? (note ? 18 : 16);
  const area = textArea(s.kind, boxW, boxH);
  const label = new Textbox(s.text ?? "", {
    left: 0,
    top: 0,
    width: Math.max(area.width, 16),
    fontSize: wanted,
    fontFamily: FONT,
    fill: s.color ?? INK,
    fontWeight: s.bold ? "bold" : "normal",
    textAlign: "center",
  });
  fitText(label, Math.max(area.height, 12), Math.min(MIN_FONT, wanted));
  // si con la letra mínima el texto todavía no entra, la forma crece (la esquina de arriba a la izquierda
  // queda fija): rectángulo y nota en alto; elipse y rombo en ancho y alto, manteniendo la proporción
  const measure = (textWidth: number) => {
    label.set({ width: Math.max(textWidth, 16) });
    label.initDimensions();
    return label.height;
  };
  const { w, h } = sizeForText(s.kind, boxW, boxH, measure);
  measure(textArea(s.kind, w, h).width); // el renglón definitivo, para el tamaño elegido
  const base = {
    left: 0,
    top: 0,
    strokeUniform: true,
    fill: s.fill ?? (note ? NOTE_COLORS[0] : "#ffffff"),
    stroke: note ? "transparent" : s.stroke ?? INK,
    strokeWidth: note ? 0 : s.strokeWidth ?? 2,
    strokeDashArray: note ? null : dashArray(s.dash ?? "solid", s.strokeWidth ?? 2),
    strokeLineCap: (s.dash === "dotted" ? "round" : "butt") as CanvasLineCap,
  };
  const shape =
    s.kind === "ellipse"
      ? new Ellipse({ ...base, rx: w / 2, ry: h / 2 })
      : s.kind === "diamond"
        ? new Polygon([{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }], base)
        : new Rect({ ...base, width: w, height: h, rx: note ? 3 : 6, ry: note ? 3 : 6 });
  if (note) shape.set({ shadow: new Shadow({ color: "rgba(0,0,0,0.18)", blur: 10, offsetY: 3 }) });
  const g = new Group([shape, label]);
  g.set({ left: s.box.left + w / 2, top: s.box.top + h / 2, angle: s.angle ?? 0, opacity: s.opacity ?? 1, id: s.id ?? uid(), kind: s.kind, baseFontSize: wanted });
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
    dash: dashStyleOf(shape.strokeDashArray),
    color: String(label.fill),
    bold: label.fontWeight === "bold" || undefined,
    // el tamaño pedido, no el achicado: si la forma crece, la letra vuelve a su tamaño
    fontSize: g.baseFontSize ?? label.fontSize,
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
      fill: spec.color ?? INK,
      fontWeight: spec.bold ? "bold" : "normal",
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
