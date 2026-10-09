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

/** Por dónde sale una flecha en ángulo: "h" por un costado (sale en horizontal), "v" por arriba o abajo. */
export type Axis = "h" | "v";

/** El lado de la caja que cruza la recta hacia `toward` (como en anchorOnBox): su punto medio y su eje. */
function side(box: Box, toward: Pt): { at: Pt; axis: Axis } {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const tx = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity;
  if (tx === Infinity && ty === Infinity) return { at: c, axis: "h" };
  return tx <= ty
    ? { at: { x: c.x + Math.sign(dx) * (box.width / 2), y: c.y }, axis: "h" }
    : { at: { x: c.x, y: c.y + Math.sign(dy) * (box.height / 2) }, axis: "v" };
}

/** Flecha en ángulo: sale del centro del lado de la caja que mira hacia `toward`. */
export const sideAnchor = (box: Box, toward: Pt): Pt => side(box, toward).at;

/**
 * Extremos de una flecha en ángulo y por dónde sale y entra ("vh" = sale por abajo o arriba y
 * entra por un costado). Un extremo suelto sigue la orientación del otro.
 */
export function elbowRoute(from: Box | null, to: Box | null, start: Pt, end: Pt): { start: Pt; end: Pt; axes: `${Axis}${Axis}` } {
  const s = from ? side(from, to ? center(to) : end) : null;
  const e = to ? side(to, from ? center(from) : start) : null;
  const a = s?.at ?? start;
  const b = e?.at ?? end;
  const auto: Axis = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
  const first = s?.axis ?? e?.axis ?? auto;
  const last = e?.axis ?? s?.axis ?? auto;
  return { start: a, end: b, axes: `${first}${last}` };
}

/**
 * Recorrido de una flecha en ángulo. Mismo eje al salir y al entrar: tres tramos por la mitad del
 * camino; ejes distintos: una L. Sin ejes, empieza en el sentido más largo.
 */
export function elbowPoints(a: Pt, b: Pt, axes?: string): Pt[] {
  const auto: Axis = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
  const first = axes?.[0] ?? auto;
  const last = axes?.[1] ?? auto;
  if (first === "h" && last === "v") return [a, { x: b.x, y: a.y }, b];
  if (first === "v" && last === "h") return [a, { x: a.x, y: b.y }, b];
  if (first === "h") {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  const my = (a.y + b.y) / 2;
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Vista que encuadra el contenido con un margen, sin agrandar más allá de `maxZoom` (100 % salvo que se pida otro). */
export function fitViewport(content: Box, view: { width: number; height: number }, padding = 48, maxZoom = 1): Viewport {
  const availW = Math.max(view.width - padding * 2, 1);
  const availH = Math.max(view.height - padding * 2, 1);
  const zoom = clampZoom(Math.min(maxZoom, availW / Math.max(content.width, 1), availH / Math.max(content.height, 1)));
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
  // el punto se dibuja en el centro de cada baldosa: se corre medio paso para que caiga en múltiplos de `base`
  return { size, x: mod(v.x - size / 2), y: mod(v.y - size / 2) };
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

/* ---------- Ajustar a la cuadrícula ---------- */

/** Paso de la cuadrícula en escena (el mismo de los puntos del fondo) */
export const GRID = 24;

export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;

/** Cuánto mover una caja para que su esquina superior izquierda caiga en la cuadrícula. */
export function snapDelta(box: Box, grid = GRID): { dx: number; dy: number } {
  return { dx: snap(box.left, grid) - box.left, dy: snap(box.top, grid) - box.top };
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

/**
 * Tamaño que necesita una forma para que su texto entre. `measure(anchoDelTexto)` devuelve el
 * alto que ocupa el texto con ese ancho de renglón. Rectángulo y nota crecen solo en alto; la
 * elipse y el rombo crecen en ancho y alto manteniendo la proporción (si no, quedarían
 * alargados): se busca el factor mínimo, porque al ensancharse el texto ocupa menos renglones.
 */
export function sizeForText(
  kind: LabelShape, w: number, h: number, measure: (textWidth: number) => number, pad = LABEL_PAD,
): { w: number; h: number } {
  if (LABEL_RATIO[kind] === 1) return { w, h: heightForText(kind, h, measure(textArea(kind, w, h, pad).width), pad) };
  const fits = (s: number) => {
    const a = textArea(kind, w * s, h * s, pad);
    return measure(a.width) <= a.height;
  };
  if (fits(1)) return { w, h };
  let lo = 1;
  let hi = 2;
  while (!fits(hi) && hi < 64) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { w: Math.ceil(w * hi - 1e-6), h: Math.ceil(h * hi - 1e-6) };
}

/** Número de la próxima observación: sigue al más alto (los números no se reutilizan al borrar). */
export const nextMarkerNumber = (nums: number[]) => (nums.length ? Math.max(...nums) : 0) + 1;

/**
 * Shift al trazar una línea, flecha o cota: la dirección se fija al múltiplo de `step` grados más
 * cercano y el extremo es la proyección del puntero sobre esa dirección (en horizontal, el extremo
 * queda a la misma x que el puntero).
 */
export function constrainAngle(a: Pt, b: Pt, step = 45): Pt {
  const k = (step * Math.PI) / 180;
  const angle = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / k) * k;
  // redondeado: cos(90°) no da 0 exacto en coma flotante (y +0 evita un -0)
  const ux = Math.round(Math.cos(angle) * 1e9) / 1e9 + 0;
  const uy = Math.round(Math.sin(angle) * 1e9) / 1e9 + 0;
  const len = (b.x - a.x) * ux + (b.y - a.y) * uy;
  return { x: a.x + ux * len + 0, y: a.y + uy * len + 0 };
}
