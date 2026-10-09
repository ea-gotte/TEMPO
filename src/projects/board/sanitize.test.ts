import { describe, expect, it } from "vitest";
import { MAX_ITEMS, isSafeColor, sanitizeBoardItems } from "./sanitize";

type Item = Record<string, unknown>;

const note = (extra: Item = {}): Item => ({
  type: "Group", kind: "note", id: "n1", left: 100, top: 50, width: 200, height: 200, scaleX: 1, scaleY: 1, angle: 0, opacity: 1,
  baseFontSize: 18, interactive: false, subTargetCheck: false, layoutManager: { type: "layoutManager", strategy: "fit-content" },
  objects: [
    { type: "Rect", left: 0, top: 0, width: 200, height: 200, fill: "#fef08a", stroke: "transparent", strokeWidth: 0, rx: 3, ry: 3,
      shadow: { color: "rgba(0,0,0,0.18)", blur: 10, offsetX: 0, offsetY: 3, affectStroke: false, nonScaling: false } },
    { type: "Textbox", left: 0, top: 0, width: 170, text: "Idea", fontSize: 18, fontFamily: "Inter", fill: "#1f2937", textAlign: "center", styles: [] },
  ],
  ...extra,
});
const arrow = (extra: Item = {}): Item => ({ type: "Arrow", kind: "arrow", id: "a1", left: 0, top: 0, x1: 0, y1: 0, x2: 100, y2: 0, stroke: "#1f2937", strokeWidth: 2, fromId: "n1", toId: null, ...extra });
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("filtro de lo importado o pegado", () => {
  it("una nota normal pasa con sus datos", () => {
    const [n] = sanitizeBoardItems([note()]);
    expect(n).toMatchObject({ type: "Group", kind: "note", id: "n1", left: 100, baseFontSize: 18 });
    const [rect, text] = n.objects as Item[];
    expect(rect).toMatchObject({ type: "Rect", fill: "#fef08a", shadow: { color: "rgba(0,0,0,0.18)", blur: 10, offsetY: 3 } });
    expect(text).toMatchObject({ type: "Textbox", text: "Idea", fontSize: 18, textAlign: "center" });
  });

  it("descarta claves peligrosas o que rompen el tablero", () => {
    const raw = JSON.parse('{"type":"Arrow","kind":"arrow","id":"a","x1":0,"y1":0,"x2":1,"y2":1,"__proto__":{"x":1},"constructor":{"cacheProperties":[]},"excludeFromExport":true,"clipPath":{"type":"Rect"},"selectable":false,"evented":false}');
    const [a] = sanitizeBoardItems([raw]);
    for (const k of ["constructor", "excludeFromExport", "clipPath", "selectable", "evented"]) expect(Object.prototype.hasOwnProperty.call(a, k)).toBe(false);
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
  });

  it("las propiedades propias quedan con su tipo, o se quitan", () => {
    const [a] = sanitizeBoardItems([arrow({ caption: 5, heads: "raro", route: "elbow", elbowAxes: "hx", votes: -3 })]);
    expect(a.caption).toBeUndefined();
    expect(a.heads).toBeUndefined();
    expect(a.route).toBe("elbow");
    expect(a.elbowAxes).toBeUndefined();
    expect(a.votes).toBeUndefined();
    const [b] = sanitizeBoardItems([arrow({ caption: "Sí", heads: "both", elbowAxes: "vh", votes: 3 })]);
    expect(b).toMatchObject({ caption: "Sí", heads: "both", elbowAxes: "vh", votes: 3 });
  });

  it("los enlaces se normalizan y los peligrosos se quitan", () => {
    expect(sanitizeBoardItems([note({ link: "javascript:alert(1)" })])[0].link).toBeUndefined();
    expect(sanitizeBoardItems([note({ link: 1 })])[0].link).toBeUndefined();
    expect(sanitizeBoardItems([note({ link: "quantia.com/obra" })])[0].link).toBe("https://quantia.com/obra");
  });

  it("tamaños absurdos se acotan (si no, la página se cuelga)", () => {
    const [n] = sanitizeBoardItems([note({ baseFontSize: 1e8 })]);
    expect(n.baseFontSize).toBe(200);
    const big = note();
    (big.objects as Item[])[1].fontSize = 1e8;
    expect(((sanitizeBoardItems([big])[0].objects as Item[])[1]).fontSize).toBe(400);
    expect(sanitizeBoardItems([note({ left: Infinity })])).toEqual([]);
  });

  it("imágenes: solo incrustadas (data:), nunca de una dirección externa", () => {
    const img = (src: string): Item => ({ type: "Image", kind: "image", id: "i", left: 0, top: 0, width: 10, height: 10, src, crossOrigin: "anonymous", filters: [{ type: "Blur" }] });
    const [ok] = sanitizeBoardItems([img(PNG)]);
    expect(ok.src).toBe(PNG);
    expect(ok.filters).toEqual([]);
    expect(ok.crossOrigin).toBeUndefined();
    expect(sanitizeBoardItems([img("https://rastreo.example/x.png")])).toEqual([]);
    expect(sanitizeBoardItems([img("data:text/html;base64,PGI+")])).toEqual([]);
  });

  it("colores: solo valores de color; un relleno con patrón o url() se quita", () => {
    expect(isSafeColor("#fef08a")).toBe(true);
    expect(isSafeColor("rgba(91, 108, 255, 0.06)")).toBe(true);
    expect(isSafeColor("transparent")).toBe(true);
    expect(isSafeColor("url(https://x/y)")).toBe(false);
    const [r] = sanitizeBoardItems([{ type: "Frame", kind: "frame", id: "f", left: 0, top: 0, width: 10, height: 10, fill: { type: "pattern", source: "https://x" }, stroke: "url(https://x)" }]);
    expect(r.fill).toBeUndefined();
    expect(r.stroke).toBeUndefined();
  });

  it("descarta tipos desconocidos y objetos cuyo tipo no corresponde a su clase", () => {
    expect(sanitizeBoardItems([{ type: "Script", kind: "note" }])).toEqual([]);
    expect(sanitizeBoardItems([{ type: "Rect", kind: "note", left: 0, top: 0 }])).toEqual([]); // una nota es un grupo
    expect(sanitizeBoardItems([{ type: "Rect", left: 0, top: 0 }])).toEqual([]); // sin tipo de objeto del tablero
    const broken = note();
    (broken.objects as Item[])[1] = { type: "Image", src: "https://x/y.png" };
    expect(sanitizeBoardItems([broken])).toEqual([]); // la nota se quedaría sin su texto
  });

  it("trazos y polígonos con datos inválidos se descartan", () => {
    expect(sanitizeBoardItems([{ type: "Path", kind: "path", id: "p", left: 0, top: 0, path: [["M", 0, 0], ["L", "x", 1]] }])).toEqual([]);
    expect(sanitizeBoardItems([{ type: "Path", kind: "path", id: "p", left: 0, top: 0, path: [["M", 0, 0], ["Q", 1, 2, 3, 4]] }])).toHaveLength(1);
    expect(sanitizeBoardItems([{ type: "AreaMeasure", kind: "area", id: "a", left: 0, top: 0, points: [{ x: 0, y: 0 }, { x: "a", y: 1 }] }])).toEqual([]);
  });

  it("hay un máximo de elementos", () => {
    const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => arrow({ id: `a${i}` }));
    expect(sanitizeBoardItems(many)).toHaveLength(MAX_ITEMS);
  });
});
