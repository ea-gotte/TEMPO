import { FabricImage, FabricObject, Line, Path, Textbox, classRegistry, type Canvas } from "fabric";
import { uid } from "../../utils";
import { cloudPath, type Box, type Pt } from "./geometry";
import type { HeadStyle } from "./strokes";
import { FONT, INK, REVIEW_RED } from "./tools";

/**
 * Objetos del tablero sobre Fabric.js 7. Adaptado de lib/shapes.ts de Figma_Clone
 * (github.com/Lyam0udi/Figma_Clone), reescrito para Fabric 7: el origen de todo
 * objeto es su CENTRO, así que left/top = centro.
 */

export type Kind = "note" | "rect" | "ellipse" | "diamond" | "line" | "arrow" | "cloud" | "text" | "path" | "highlight" | "image";

declare module "fabric" {
  interface FabricObject {
    id?: string;
    kind?: Kind;
    /** Conector: id de la forma enganchada en cada extremo (null = suelto) */
    fromId?: string | null;
    toId?: string | null;
    /** Bloqueo pedido por el usuario (para marcar encima de un plano sin moverlo) */
    lockedByUser?: boolean;
    /** Forma con texto: tamaño de letra pedido (el que se ve puede ser menor para que el texto entre) */
    baseFontSize?: number;
    /** Flecha: en qué extremos lleva punta (por defecto, al final) */
    heads?: HeadStyle;
  }
  interface SerializedObjectProps {
    id?: string;
    kind?: Kind;
    fromId?: string | null;
    toId?: string | null;
    lockedByUser?: boolean;
    /** Forma con texto: tamaño de letra pedido (el que se ve puede ser menor para que el texto entre) */
    baseFontSize?: number;
    heads?: HeadStyle;
  }
}

// Propiedades propias que viajan al guardar (spec §4)
FabricObject.customProperties = ["id", "kind", "fromId", "toId", "lockedByUser", "baseFontSize", "heads"];

/** Línea con punta de flecha: al final (x2, y2) por defecto, al inicio, en ambos extremos o sin punta. */
export class Arrow extends Line {
  static type = "Arrow";

  constructor(points?: [number, number, number, number], options?: ConstructorParameters<typeof Line>[1]) {
    super(points, options);
    // sin caché: la punta sobresale de la caja de una línea casi horizontal y se recortaría
    this.objectCaching = false;
  }

  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);
    const p = this.calcLinePoints();
    const heads = this.heads ?? "end";
    if (heads === "end" || heads === "both") this.drawHead(ctx, p.x1, p.y1, p.x2, p.y2);
    if (heads === "start" || heads === "both") this.drawHead(ctx, p.x2, p.y2, p.x1, p.y1);
  }

  /** Punta en (tx, ty), apuntando en la dirección que viene desde (fx, fy). */
  private drawHead(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number) {
    const len = Math.max(10, this.strokeWidth * 4);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(Math.atan2(ty - fy, tx - fx));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-len, len / 2);
    ctx.lineTo(-len, -len / 2);
    ctx.closePath();
    ctx.fillStyle = typeof this.stroke === "string" ? this.stroke : INK;
    ctx.fill();
    ctx.restore();
  }
}
classRegistry.setClass(Arrow);

/** Objeto auxiliar (vista previa al dibujar, editor de texto): no se guarda ni entra al historial. */
export function markTransient<T extends FabricObject>(o: T): T {
  o.excludeFromExport = true;
  return o;
}
export const isTransient = (o: FabricObject) => !!o.excludeFromExport;

/**
 * Bloqueo: no se mueve, escala ni rota, y no se selecciona con clic. Como queda
 * `selectable: false` pero sigue recibiendo eventos, un arrastre encima empieza una
 * selección por área (que además lo excluye): así se seleccionan las marcas del plano.
 */
export function applyLock(o: FabricObject, locked: boolean) {
  o.set({
    lockedByUser: locked,
    selectable: !locked,
    hasControls: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hoverCursor: locked ? "default" : null,
  });
}

const THIN: Kind[] = ["line", "arrow", "path", "highlight", "cloud"];

/** Ajustes que no se serializan: se aplican al crear y al cargar. */
export function prepareObject(o: FabricObject) {
  // lo fino se selecciona tocando el trazo, no el rectángulo que lo contiene
  if (o.kind && THIN.includes(o.kind)) o.perPixelTargetFind = true;
  applyLock(o, !!o.lockedByUser);
}

function tag<T extends FabricObject>(o: T, kind: Kind): T {
  o.set({ id: uid(), kind });
  prepareObject(o);
  return o;
}

export function createConnector(kind: "arrow" | "line", a: Pt, b: Pt, stroke = INK, strokeWidth = 2): Line {
  const C = kind === "arrow" ? Arrow : Line;
  const l = new C([a.x, a.y, b.x, b.y], { stroke, strokeWidth, strokeLineCap: "round" });
  l.set({ fromId: null, toId: null });
  return tag(l, kind);
}

export function createCloud(box: Box, stroke = REVIEW_RED, strokeWidth = 2): Path {
  const w = Math.max(box.width, 24);
  const h = Math.max(box.height, 24);
  const p = new Path(cloudPath(w, h), { fill: "transparent", stroke, strokeWidth, strokeUniform: true, strokeLineJoin: "round" });
  p.set({ left: box.left + w / 2, top: box.top + h / 2 });
  return tag(p, "cloud");
}

export function createText(at: Pt): Textbox {
  const t = new Textbox("", { left: at.x, top: at.y, width: 240, fontSize: 20, fontFamily: FONT, fill: INK });
  return tag(t, "text");
}

export async function createImage(dataUrl: string, at: Pt, scale = 1): Promise<FabricImage> {
  const img = await FabricImage.fromURL(dataUrl);
  img.set({ left: at.x, top: at.y, scaleX: scale, scaleY: scale });
  return tag(img, "image");
}

/** Reemplaza un objeto por otro en el mismo lugar del orden de apilado. */
export function replaceObject(canvas: Canvas, oldObj: FabricObject, next: FabricObject) {
  const i = canvas.getObjects().indexOf(oldObj);
  canvas.remove(oldObj);
  canvas.insertAt(i < 0 ? canvas.getObjects().length : i, next);
}
