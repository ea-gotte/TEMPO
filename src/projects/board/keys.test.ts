import { describe, expect, it } from "vitest";
import { keyToAction, shouldIntercept, type KeyLike } from "./keys";

const k = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({
  key, code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o,
});
const down = (e: KeyLike, editing = false) => keyToAction(e, "down", editing);

describe("keyToAction", () => {
  it("las letras eligen herramienta (sin importar mayúsculas)", () => {
    expect(down(k("r"))).toEqual({ type: "tool", tool: "rect" });
    expect(down(k("N"))).toEqual({ type: "tool", tool: "note" });
    expect(down(k("h"))).toEqual({ type: "tool", tool: "hand" });
    expect(down(k("i"))).toEqual({ type: "tool", tool: "image" });
    expect(down(k("q"))).toBeNull();
  });
  it("deshacer y rehacer, con Ctrl o con Cmd", () => {
    expect(down(k("z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(down(k("Z", { ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(down(k("y", { ctrlKey: true }))).toEqual({ type: "redo" });
    expect(down(k("z", { metaKey: true }))).toEqual({ type: "undo" });
  });
  it("duplicar y seleccionar todo; copiar, cortar y pegar los manejan los eventos copy/cut/paste", () => {
    expect(down(k("d", { ctrlKey: true }))).toEqual({ type: "duplicate" });
    expect(down(k("a", { ctrlKey: true }))).toEqual({ type: "selectAll" });
    expect(down(k("c", { ctrlKey: true }))).toBeNull();
    expect(down(k("x", { ctrlKey: true }))).toBeNull();
    expect(down(k("v", { ctrlKey: true }))).toBeNull();
  });
  it("Supr y Retroceso borran; Esc sale", () => {
    expect(down(k("Delete"))).toEqual({ type: "delete" });
    expect(down(k("Backspace"))).toEqual({ type: "delete" });
    expect(down(k("Escape"))).toEqual({ type: "escape" });
  });
  it("las flechas mueven 1 px, y 10 px con Shift", () => {
    expect(down(k("ArrowLeft"))).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(down(k("ArrowDown", { shiftKey: true }))).toEqual({ type: "nudge", dx: 0, dy: 10 });
  });
  it("Shift+1 ajusta al contenido", () => {
    expect(down(k("!", { code: "Digit1", shiftKey: true }))).toEqual({ type: "fit" });
  });
  it("Shift+2 encuadra la selección, con cualquier distribución de teclado", () => {
    expect(down(k("@", { code: "Digit2", shiftKey: true }))).toEqual({ type: "fitSelection" });
    expect(down(k('"', { code: "Digit2", shiftKey: true }))).toEqual({ type: "fitSelection" });
  });
  it("Espacio: mano temporal mientras se mantiene", () => {
    expect(down(k(" ", { code: "Space" }))).toEqual({ type: "spaceDown" });
    expect(keyToAction(k(" ", { code: "Space" }), "up", false)).toEqual({ type: "spaceUp" });
  });
  it("mientras se edita un texto no hay atajos (Review Focus 5)", () => {
    expect(down(k("Delete"), true)).toBeNull();
    expect(down(k("r"), true)).toBeNull();
    expect(down(k(" ", { code: "Space" }), true)).toBeNull();
    expect(down(k("z", { ctrlKey: true }), true)).toBeNull();
  });
  it("con Alt no hace nada", () => {
    expect(down(k("r", { altKey: true }))).toBeNull();
  });
});

describe("shouldIntercept", () => {
  const ctx = { focusInBoard: true, hasSelection: true, textSelected: false };
  it("con el foco fuera del tablero (un botón o enlace de la página) no intercepta nada", () => {
    expect(shouldIntercept({ type: "spaceDown" }, { ...ctx, focusInBoard: false })).toBe(false);
    expect(shouldIntercept({ type: "tool", tool: "rect" }, { ...ctx, focusInBoard: false })).toBe(false);
  });
  it("Ctrl+C solo copia del tablero si hay algo seleccionado y no hay texto de la página seleccionado", () => {
    expect(shouldIntercept({ type: "copy" }, ctx)).toBe(true);
    expect(shouldIntercept({ type: "copy" }, { ...ctx, hasSelection: false })).toBe(false);
    expect(shouldIntercept({ type: "copy" }, { ...ctx, textSelected: true })).toBe(false);
  });
  it("Shift+2 sin selección no hace nada", () => {
    expect(shouldIntercept({ type: "fitSelection" }, { ...ctx, hasSelection: false })).toBe(false);
    expect(shouldIntercept({ type: "fitSelection" }, ctx)).toBe(true);
  });
  it("flechas y Supr solo actúan con una selección (si no, la página se desplaza como siempre)", () => {
    expect(shouldIntercept({ type: "nudge", dx: 0, dy: 1 }, { ...ctx, hasSelection: false })).toBe(false);
    expect(shouldIntercept({ type: "delete" }, { ...ctx, hasSelection: false })).toBe(false);
    expect(shouldIntercept({ type: "nudge", dx: 0, dy: 1 }, ctx)).toBe(true);
  });
  it("el resto de los atajos funciona sin selección", () => {
    expect(shouldIntercept({ type: "undo" }, { ...ctx, hasSelection: false })).toBe(true);
    expect(shouldIntercept({ type: "tool", tool: "note" }, { ...ctx, hasSelection: false })).toBe(true);
  });
});

describe("ayuda de atajos", () => {
  it("? abre la ayuda (en teclado español es Shift + ')", () => {
    expect(keyToAction(k("?", { shiftKey: true, code: "Minus" }), "down", false)).toEqual({ type: "help" });
    expect(keyToAction(k("?", { shiftKey: true, code: "Slash" }), "down", false)).toEqual({ type: "help" });
  });
});

describe("cuadrícula", () => {
  it("G activa o desactiva el ajuste a la cuadrícula", () => {
    expect(keyToAction(k("g"), "down", false)).toEqual({ type: "toggleSnap" });
    expect(keyToAction(k("g"), "down", true)).toBeNull();
  });
});

describe("buscar y ordenar", () => {
  it("Ctrl+F busca en el tablero", () => {
    expect(keyToAction(k("f", { ctrlKey: true }), "down", false)).toEqual({ type: "find" });
  });
  it("Ctrl+] trae al frente y Ctrl+[ envía al fondo (solo con algo seleccionado)", () => {
    expect(keyToAction(k("]", { ctrlKey: true }), "down", false)).toEqual({ type: "front" });
    expect(keyToAction(k("[", { ctrlKey: true }), "down", false)).toEqual({ type: "back" });
    expect(shouldIntercept({ type: "front" }, { focusInBoard: true, hasSelection: false, textSelected: false })).toBe(false);
    expect(shouldIntercept({ type: "back" }, { focusInBoard: true, hasSelection: true, textSelected: false })).toBe(true);
  });
});
