/**
 * Geometría pura del tablero (sin Fabric): se prueba con Vitest.
 * Coordenadas de "escena" = las del lienzo infinito, sin zoom ni desplazamiento.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Caja alineada a los ejes; left/top = esquina superior izquierda. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Vista: desplazamiento en píxeles de pantalla y zoom (1 = 100 %). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const center = (b: Box): Pt => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

/** Caja a partir de las dos esquinas de un arrastre hecho en cualquier dirección. */
export function boxFromPoints(a: Pt, b: Pt): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Caja cuadrada (Shift) anclada en el inicio del arrastre, con el lado mayor. */
export function squareFromPoints(a: Pt, b: Pt): Box {
  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const end = { x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side };
  return boxFromPoints(a, end);
}

/** Punto del borde de la caja sobre la recta que sale de su centro hacia `toward`. */
export function anchorOnBox(box: Box, toward: Pt): Pt {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty); // el borde (vertical u horizontal) que se alcanza primero
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Extremos de un conector (spec §5.2): cada extremo enganchado se apoya en el borde
 * de su forma, apuntando al centro de la otra forma o al otro extremo si está suelto.
 */
export function connectorEnds(from: Box | null, to: Box | null, start: Pt, end: Pt): { start: Pt; end: Pt } {
  const target = to ? center(to) : end;
  const source = from ? center(from) : start;
  return {
    start: from ? anchorOnBox(from, target) : start,
    end: to ? anchorOnBox(to, source) : end,
  };
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Vista que encuadra el contenido con un margen, sin agrandar más allá de 100 %. */
export function fitViewport(content: Box, view: { width: number; height: number }, padding = 48): Viewport {
  const availW = Math.max(view.width - padding * 2, 1);
  const availH = Math.max(view.height - padding * 2, 1);
  const zoom = clampZoom(Math.min(1, availW / Math.max(content.width, 1), availH / Math.max(content.height, 1)));
  const c = center(content);
  return { zoom, x: view.width / 2 - c.x * zoom, y: view.height / 2 - c.y * zoom };
}

/** Escala para que una imagen entre en el espacio disponible (nunca agranda). */
export const fitScale = (w: number, h: number, availW: number, availH: number) => Math.min(1, availW / w, availH / h);

/** Multiplicador de exportación: 2× salvo que el lado mayor pase de `maxSide` px o el área de `maxArea` (límite de Safari). */
export const exportScale = (w: number, h: number, maxSide = 8000, maxArea = 16_000_000) =>
  Math.min(2, maxSide / Math.max(w, h, 1), Math.sqrt(maxArea / Math.max(w * h, 1)));

/** Cuadrícula de puntos del fondo, sincronizada con la vista. Con poco zoom se oculta (null). */
export function gridSpec(v: Viewport, base = 24): { size: number; x: number; y: number } | null {
  const size = base * v.zoom;
  if (size < 8) return null;
  const mod = (n: number) => ((n % size) + size) % size;
  return { size, x: mod(v.x), y: mod(v.y) };
}

/**
 * Nube de revisión (la de los planos): contorno de arcos de la caja 0..w × 0..h.
 * Se recorre en sentido horario con sweep-flag 1, así cada arco abomba hacia afuera.
 */
export function cloudPath(w: number, h: number): string {
  const arc = Math.min(40, Math.max(12, Math.min(w, h) / 4));
  const nx = Math.max(1, Math.round(w / arc));
  const ny = Math.max(1, Math.round(h / arc));
  const sx = w / nx;
  const sy = h / ny;
  const f = (n: number) => Math.round(n * 100) / 100;
  const parts = ["M 0 0"];
  const a = (r: number, x: number, y: number) => parts.push(`A ${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y)}`);
  for (let i = 1; i <= nx; i++) a(sx / 2, i * sx, 0); // arriba, hacia la derecha
  for (let i = 1; i <= ny; i++) a(sy / 2, w, i * sy); // derecha, hacia abajo
  for (let i = nx - 1; i >= 0; i--) a(sx / 2, i * sx, h); // abajo, hacia la izquierda
  for (let i = ny - 1; i >= 0; i--) a(sy / 2, 0, i * sy); // izquierda, hacia arriba
  parts.push("Z");
  return parts.join(" ");
}

/* ---------- Formas con texto ---------- */

export type LabelShape = "note" | "rect" | "ellipse" | "diamond";
/** Margen interno del texto en notas y rectángulos */
export const LABEL_PAD = 12;
/** Fracción del ancho/alto que el texto puede usar: la elipse y el rombo tienen menos lugar cerca de los bordes */
const LABEL_RATIO: Record<LabelShape, number> = { note: 1, rect: 1, ellipse: 0.7, diamond: 0.5 };

/** Área donde va el texto dentro de una forma de w × h. */
export function textArea(kind: LabelShape, w: number, h: number, pad = LABEL_PAD): { width: number; height: number } {
  const k = LABEL_RATIO[kind];
  return k < 1 ? { width: w * k, height: h * k } : { width: w - pad * 2, height: h - pad * 2 };
}

/** Alto que necesita la forma para que entre un texto de ese alto (nunca achica). */
export function heightForText(kind: LabelShape, h: number, textHeight: number, pad = LABEL_PAD): number {
  const k = LABEL_RATIO[kind];
  const needed = k < 1 ? textHeight / k : textHeight + pad * 2;
  return Math.max(h, Math.ceil(needed));
}
