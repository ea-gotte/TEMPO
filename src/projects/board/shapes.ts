import { Circle, FabricImage, FabricObject, FabricText, Group, Line, Path, Polygon, Textbox, classRegistry, type Canvas } from "fabric";
import { uid } from "../../utils";
import { cloudPath, type Box, type Pt } from "./geometry";
import { polygonCentroid } from "./measure";
import { withAlpha, type HeadStyle } from "./strokes";
import { FONT, INK, REVIEW_RED } from "./tools";

/**
 * Objetos del tablero sobre Fabric.js 7. Adaptado de lib/shapes.ts de Figma_Clone
 * (github.com/Lyam0udi/Figma_Clone), reescrito para Fabric 7: el origen de todo
 * objeto es su CENTRO, así que left/top = centro.
 */

export type Kind = "note" | "rect" | "ellipse" | "diamond" | "line" | "arrow" | "cloud" | "text" | "path" | "highlight" | "marker" | "measure" | "area" | "image";

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
    /** Observación numerada: su número */
    num?: number;
    /** Imagen calibrada: metros que representa un píxel de la imagen */
    mPerPx?: number;
    /** Cota: el texto que muestra (longitud) */
    measureLabel?: string;
    /** Flecha o línea: texto escrito en su punto medio ("Sí", "No"…) */
    caption?: string;
    /** Observación numerada: qué se observa, y si ya se resolvió */
    detail?: string;
    resolved?: boolean;
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
    num?: number;
    mPerPx?: number;
    measureLabel?: string;
    caption?: string;
    detail?: string;
    resolved?: boolean;
  }
}

// Propiedades propias que viajan al guardar (spec §4)
FabricObject.customProperties = ["id", "kind", "fromId", "toId", "lockedByUser", "baseFontSize", "heads", "num", "mPerPx", "measureLabel", "caption", "detail", "resolved"];

/** Tamaño de letra del texto de flechas y líneas. */
export const CAPTION_SIZE = 14;

/**
 * Escribe un texto en (x, y) del objeto, horizontal y sin deformar aunque el objeto esté girado o
 * escalado, sobre un fondo blanco y del color del trazo (texto de flechas, superficie medida).
 */
function drawUpright(ctx: CanvasRenderingContext2D, o: FabricObject, x: number, y: number, text: string, weight: number) {
  const lines = text.split("\n");
  const lh = CAPTION_SIZE * 1.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / (o.scaleX || 1), 1 / (o.scaleY || 1));
  ctx.rotate((-o.angle * Math.PI) / 180);
  ctx.setLineDash([]);
  ctx.font = `${weight} ${CAPTION_SIZE}px ${FONT}`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const h = lh * lines.length;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-w / 2 - 6, -h / 2 - 3, w + 12, h + 6);
  ctx.fillStyle = typeof o.stroke === "string" ? o.stroke : INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, 0, -h / 2 + lh * (i + 0.5)));
  ctx.restore();
}

/**
 * Línea con punta de flecha: al final (x2, y2) por defecto, al inicio, en ambos extremos o sin punta
 * (así son las líneas nuevas). Puede llevar un texto en el medio.
 */
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
    if (this.caption) drawUpright(ctx, this, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2, this.caption, 500);
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

/** Cota: línea con marcas en los extremos y la longitud escrita en el medio (ver measures.ts). */
export class Measure extends Line {
  static type = "Measure";

  constructor(points?: [number, number, number, number], options?: ConstructorParameters<typeof Line>[1]) {
    super(points, options);
    this.objectCaching = false; // las marcas y el texto sobresalen de la caja de la línea
  }

  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);
    const p = this.calcLinePoints();
    const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    const color = typeof this.stroke === "string" ? this.stroke : INK;
    const tick = Math.max(6, this.strokeWidth * 4);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = this.strokeWidth;
    ctx.setLineDash([]);
    for (const [x, y] of [[p.x1, p.y1], [p.x2, p.y2]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -tick);
      ctx.lineTo(0, tick);
      ctx.stroke();
      ctx.restore();
    }
    if (this.measureLabel) {
      // el texto va sobre la línea y nunca queda cabeza abajo
      ctx.translate((p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2);
      ctx.rotate(angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle);
      ctx.font = `600 13px ${FONT}`;
      const w = ctx.measureText(this.measureLabel).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fillRect(-w / 2 - 4, -24, w + 8, 18);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.measureLabel, 0, -15);
    }
    ctx.restore();
  }
}
classRegistry.setClass(Measure);

/** Superficie medida: polígono semitransparente con su área escrita en el centro (ver measures.ts). */
export class AreaMeasure extends Polygon {
  static type = "AreaMeasure";

  constructor(points?: { x: number; y: number }[], options?: ConstructorParameters<typeof Polygon>[1]) {
    super(points, options);
    this.objectCaching = false; // la etiqueta puede sobresalir de un polígono angosto
  }

  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);
    if (!this.measureLabel) return;
    const c = polygonCentroid(this.points);
    drawUpright(ctx, this, c.x - this.pathOffset.x, c.y - this.pathOffset.y, this.measureLabel, 600);
  }
}
classRegistry.setClass(AreaMeasure);

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

const THIN: Kind[] = ["line", "arrow", "path", "highlight", "cloud", "measure"];
const STRAIGHT: Kind[] = ["line", "arrow", "measure"];

/** Ajustes que no se serializan: se aplican al crear y al cargar. */
export function prepareObject(o: FabricObject) {
  // lo fino se selecciona tocando el trazo, no el rectángulo que lo contiene
  if (o.kind && THIN.includes(o.kind)) o.perPixelTargetFind = true;
  // una recta horizontal o vertical tiene una caja de 1 px de alto o de ancho: con margen (en px de pantalla)
  // se la puede tocar, y también tocando su texto
  if (o.kind && STRAIGHT.includes(o.kind)) o.padding = 8;
  // una imagen (un plano) se agranda o achica solo desde las esquinas: estirarla la deformaría y arruinaría su escala
  if (o.kind === "image") o.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
  applyLock(o, !!o.lockedByUser);
}

function tag<T extends FabricObject>(o: T, kind: Kind): T {
  o.set({ id: uid(), kind });
  prepareObject(o);
  return o;
}

export function createMeasure(a: Pt, b: Pt, stroke = "#2563eb", strokeWidth = 2): Measure {
  return tag(new Measure([a.x, a.y, b.x, b.y], { stroke, strokeWidth }), "measure");
}

/** Relleno de una superficie medida: su color, casi transparente (se ve el plano debajo). */
export const AREA_ALPHA = 0.12;

export function createArea(points: Pt[], stroke = "#2563eb", strokeWidth = 2): AreaMeasure {
  const p = new AreaMeasure(points.map((q) => ({ x: q.x, y: q.y })), {
    fill: withAlpha(stroke, AREA_ALPHA), stroke, strokeWidth, strokeUniform: true, strokeLineJoin: "round",
  });
  return tag(p, "area");
}

/** Flecha o línea (una flecha sin punta: así las dos pueden llevar texto). */
export function createConnector(kind: "arrow" | "line", a: Pt, b: Pt, stroke = INK, strokeWidth = 2): Arrow {
  const l = new Arrow([a.x, a.y, b.x, b.y], { stroke, strokeWidth, strokeLineCap: "round" });
  l.set({ fromId: null, toId: null, ...(kind === "line" ? { heads: "none" as const } : {}) });
  return tag(l, kind);
}

export function createCloud(box: Box, stroke = REVIEW_RED, strokeWidth = 2): Path {
  const w = Math.max(box.width, 24);
  const h = Math.max(box.height, 24);
  const p = new Path(cloudPath(w, h), { fill: "transparent", stroke, strokeWidth, strokeUniform: true, strokeLineJoin: "round" });
  p.set({ left: box.left + w / 2, top: box.top + h / 2 });
  return tag(p, "cloud");
}

export const RESOLVED_GREEN = "#16a34a";

/** Observación numerada (revisión de planos): círculo con el número, de tamaño fijo. */
export function createMarker(at: Pt, num: number, color = REVIEW_RED): Group {
  const circle = new Circle({ left: 0, top: 0, radius: 14, fill: color, stroke: "#ffffff", strokeWidth: 2 });
  const label = new FabricText(String(num), { left: 0, top: 0, fontSize: num > 99 ? 11 : 14, fontWeight: "bold", fontFamily: FONT, fill: "#ffffff" });
  const g = new Group([circle, label]);
  g.set({ left: at.x, top: at.y, num });
  return tag(g, "marker");
}

/** Cambia el número de una observación (renumerar). */
export function setMarkerNumber(g: Group, num: number) {
  const label = g.getObjects()[1] as FabricText;
  label.set({ text: String(num), fontSize: num > 99 ? 11 : 14 });
  g.set({ num, dirty: true });
}

/** Una observación resuelta se ve apagada y con el borde verde (sigue mostrando su número). */
export function setMarkerResolved(g: Group, resolved: boolean) {
  const [circle, label] = g.getObjects();
  circle.set({ stroke: resolved ? RESOLVED_GREEN : "#ffffff", opacity: resolved ? 0.5 : 1 });
  label.set({ opacity: resolved ? 0.8 : 1 });
  g.set({ resolved: resolved || undefined, dirty: true });
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
