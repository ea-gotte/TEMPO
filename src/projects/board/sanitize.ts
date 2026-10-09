import { normalizeLink } from "./links";

/**
 * Filtro de lo que entra de afuera (un archivo de tablero importado o algo pegado del
 * portapapeles), antes de dárselo a Fabric (puro, sin Fabric). Fabric copia cada clave del
 * objeto serializado sobre el objeto real, así que un archivo armado a mano podía colgar la
 * página, dejar el tablero sin poder abrirse, o hacer que se descargaran imágenes de afuera.
 * Por eso: solo tipos y claves conocidos, cada valor con su tipo y en un rango razonable, e
 * imágenes solo incrustadas (data:). Lo que no cumple se quita; si lo que falta es esencial,
 * se descarta el elemento entero.
 */

type Item = Record<string, unknown>;

/** Máximo de elementos que se aceptan de una vez */
export const MAX_ITEMS = 5000;

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|hsla?\([\d\s.,%deg]+\)|[a-z]{0,20})$/i;
/** Un valor de color (hex, rgb, hsl o un nombre); no un url() ni otra cosa que el navegador vaya a buscar */
export const isSafeColor = (v: unknown): v is string => typeof v === "string" && v.length <= 60 && COLOR.test(v.trim());

const IMAGE_SRC = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]*$/i;
const PATH_CMD = /^[MLHVCSQTAZmlhvcsqtaz]$/;
const KINDS = ["note", "rect", "ellipse", "diamond", "line", "arrow", "cloud", "text", "path", "highlight", "marker", "measure", "area", "image", "frame"];
/** Clase que corresponde a cada tipo de objeto del tablero (si no coincide, el código del tablero fallaría) */
const KIND_TYPES: Record<string, string[]> = {
  note: ["Group"], rect: ["Group"], ellipse: ["Group"], diamond: ["Group"], marker: ["Group"],
  arrow: ["Arrow", "Line"], line: ["Arrow", "Line"], measure: ["Measure"], area: ["AreaMeasure"], frame: ["Frame"],
  image: ["Image"], text: ["Textbox"], path: ["Path"], highlight: ["Path"], cloud: ["Path"],
};
/** Lo que puede ir dentro de un grupo (forma con texto u observación) */
const CHILD_TYPES = ["Rect", "Ellipse", "Polygon", "Textbox", "Circle", "Text"];

/** Regla de una clave: devuelve el valor limpio, `undefined` para quitar la clave o INVALID para descartar el elemento. */
const INVALID = Symbol("invalid");
type Rule = (v: unknown) => unknown;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (min: number, max: number): Rule => (v) => (finite(v) ? Math.min(max, Math.max(min, v)) : undefined);
const pos: Rule = (v) => (finite(v) && Math.abs(v) <= 1e7 ? v : INVALID);
const bool: Rule = (v) => (typeof v === "boolean" ? v : undefined);
const str = (max: number): Rule => (v) => (typeof v === "string" ? v.slice(0, max) : undefined);
const oneOf = (...values: string[]): Rule => (v) => (typeof v === "string" && values.includes(v) ? v : undefined);
const color: Rule = (v) => (v === null || isSafeColor(v) ? v : undefined);
const dash: Rule = (v) => (v === null || (Array.isArray(v) && v.length <= 32 && v.every((n) => finite(n) && n >= 0 && n <= 1e4)) ? v : undefined);
const ref: Rule = (v) => (v === null ? null : typeof v === "string" && v.length <= 100 ? v : undefined);
const shadow: Rule = (v) => {
  if (v === null) return null;
  if (!v || typeof v !== "object") return undefined;
  const s = v as Item;
  if (!isSafeColor(s.color) || ![s.blur, s.offsetX, s.offsetY].every((n) => n === undefined || finite(n))) return undefined;
  return { color: s.color, blur: num(0, 200)(s.blur ?? 0), offsetX: num(-500, 500)(s.offsetX ?? 0), offsetY: num(-500, 500)(s.offsetY ?? 0), affectStroke: false, nonScaling: false };
};
const points: Rule = (v) =>
  Array.isArray(v) && v.length <= 10000 && v.every((p) => p && typeof p === "object" && finite((p as Item).x) && finite((p as Item).y))
    ? v.map((p) => ({ x: (p as Item).x, y: (p as Item).y }))
    : INVALID;
const path: Rule = (v) =>
  Array.isArray(v) && v.length <= 200000 && v.every((seg) => Array.isArray(seg) && seg.length >= 1 && seg.length <= 8 && typeof seg[0] === "string" && PATH_CMD.test(seg[0]) && seg.slice(1).every(finite))
    ? v.map((seg) => [...(seg as unknown[])])
    : INVALID;
const src: Rule = (v) => (typeof v === "string" && IMAGE_SRC.test(v) ? v : INVALID);
const link: Rule = (v) => (typeof v === "string" && v.length <= 2000 ? normalizeLink(v) || undefined : undefined);

const COMMON: Record<string, Rule> = {
  type: (v) => v, // ya validado
  version: str(20),
  originX: oneOf("left", "center", "right"),
  originY: oneOf("top", "center", "bottom"),
  left: pos,
  top: pos,
  width: num(0, 1e6),
  height: num(0, 1e6),
  fill: color,
  stroke: color,
  backgroundColor: color,
  strokeWidth: num(0, 500),
  strokeDashArray: dash,
  strokeDashOffset: num(-1e4, 1e4),
  strokeLineCap: oneOf("butt", "round", "square"),
  strokeLineJoin: oneOf("miter", "round", "bevel"),
  strokeMiterLimit: num(0, 100),
  strokeUniform: bool,
  scaleX: num(-1e4, 1e4),
  scaleY: num(-1e4, 1e4),
  angle: num(-36000, 36000),
  skewX: num(-89, 89),
  skewY: num(-89, 89),
  flipX: bool,
  flipY: bool,
  opacity: num(0, 1),
  visible: bool,
  shadow,
  fillRule: oneOf("nonzero", "evenodd"),
  paintFirst: oneOf("fill", "stroke"),
  globalCompositeOperation: oneOf("source-over", "multiply"),
  // propias del tablero
  id: str(100),
  kind: oneOf(...KINDS),
  fromId: ref,
  toId: ref,
  lockedByUser: bool,
  baseFontSize: num(8, 200),
  heads: oneOf("end", "start", "both", "none"),
  num: (v) => (finite(v) && v >= 1 && v <= 99999 ? Math.round(v) : undefined),
  mPerPx: (v) => (finite(v) && v > 0 && v < 1e6 ? v : undefined),
  measureLabel: str(200),
  caption: str(500),
  detail: str(5000),
  resolved: bool,
  link,
  votes: (v) => (finite(v) && v >= 1 && v <= 9999 ? Math.round(v) : undefined),
  route: oneOf("elbow"),
  elbowAxes: (v) => (typeof v === "string" && /^[hv]{2}$/.test(v) ? v : undefined),
};

const TEXT: Record<string, Rule> = {
  text: str(20000),
  fontSize: num(1, 400),
  fontWeight: (v) => (typeof v === "string" && /^(normal|bold|[1-9]00)$/.test(v) ? v : finite(v) ? num(100, 900)(v) : undefined),
  fontFamily: str(200),
  fontStyle: oneOf("normal", "italic", "oblique"),
  lineHeight: num(0.5, 5),
  underline: bool,
  overline: bool,
  linethrough: bool,
  textAlign: oneOf("left", "center", "right", "justify", "justify-left", "justify-center", "justify-right"),
  textBackgroundColor: color,
  charSpacing: num(-1000, 5000),
  direction: oneOf("ltr", "rtl"),
  minWidth: num(0, 1e6),
  splitByGrapheme: bool,
  textDecorationThickness: num(0, 1000),
};

const LINE: Record<string, Rule> = { x1: pos, y1: pos, x2: pos, y2: pos };
const ROUNDED: Record<string, Rule> = { rx: num(0, 1e6), ry: num(0, 1e6) };

const BY_TYPE: Record<string, Record<string, Rule>> = {
  Rect: ROUNDED,
  Frame: ROUNDED,
  Ellipse: ROUNDED,
  Circle: { radius: num(0, 1e6), startAngle: num(-360, 720), endAngle: num(-360, 720), counterClockwise: bool },
  Line: LINE,
  Arrow: LINE,
  Measure: LINE,
  Polygon: { points },
  AreaMeasure: { points },
  Path: { path },
  Textbox: TEXT,
  Text: TEXT,
  Image: { src, cropX: num(0, 1e6), cropY: num(0, 1e6), filters: () => [] },
  Group: {
    objects: () => undefined, // se limpia aparte
    layoutManager: (v) => {
      const l = v as Item | null;
      return l && l.type === "layoutManager" && l.strategy === "fit-content" ? { type: "layoutManager", strategy: "fit-content" } : undefined;
    },
  },
};

function clean(raw: unknown, allowed: string[]): Item | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Item;
  const type = o.type;
  if (typeof type !== "string" || !allowed.includes(type)) return null;
  const rules = { ...COMMON, ...BY_TYPE[type] };
  const out: Item = {};
  for (const key of Object.keys(o)) {
    const rule = Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : undefined;
    if (!rule) continue; // clave desconocida (o peligrosa): fuera
    const v = rule(o[key]);
    if (v === INVALID) return null;
    if (v !== undefined) out[key] = v;
  }
  if (type === "Image" && out.src === undefined) return null;
  if (type === "Group") {
    const children = Array.isArray(o.objects) ? o.objects.slice(0, 50).map((c) => clean(c, CHILD_TYPES)) : [];
    if (!children.length || children.some((c) => c === null)) return null;
    out.objects = children;
  }
  return out;
}

/** Deja solo lo que el tablero sabe manejar (ver arriba). Mantiene el orden. */
export function sanitizeBoardItems(items: unknown[]): Item[] {
  const out: Item[] = [];
  for (const raw of items) {
    if (out.length >= MAX_ITEMS) break;
    const o = clean(raw, Object.keys(BY_TYPE).filter((t) => !CHILD_TYPES.includes(t) || t === "Textbox"));
    if (!o || typeof o.kind !== "string" || !KIND_TYPES[o.kind]?.includes(o.type as string)) continue;
    // una forma con texto o una observación son un grupo con la figura y su texto
    if (o.type === "Group") {
      const kids = o.objects as Item[];
      if (kids.length < 2 || !["Textbox", "Text"].includes(kids[1].type as string)) continue;
    }
    out.push(o);
  }
  return out;
}
