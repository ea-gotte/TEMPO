import { describe, expect, it } from "vitest";
import { createHistory } from "./history";

describe("createHistory", () => {
  it("deshace y rehace en orden", () => {
    const h = createHistory();
    h.reset("a");
    h.push("b");
    h.push("c");
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.redo()).toBeNull();
  });

  it("registrar algo nuevo descarta lo que se podía rehacer", () => {
    const h = createHistory();
    h.reset("a");
    h.push("b");
    h.undo();
    h.push("x");
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe("a");
  });

  it("no registra un estado igual al actual", () => {
    const h = createHistory();
    h.reset("a");
    expect(h.push("a")).toBe(false);
    expect(h.canUndo()).toBe(false);
  });

  it("guarda como máximo 50 pasos", () => {
    const h = createHistory();
    h.reset("s0");
    for (let i = 1; i <= 60; i++) h.push(`s${i}`);
    let n = 0;
    while (h.undo() !== null) n++;
    expect(n).toBe(50);
    expect(h.current()).toBe("s10");
  });

  it("descarta los estados más viejos si se pasa del tamaño total", () => {
    const h = createHistory({ maxChars: 10 });
    h.reset("aaaa");
    h.push("bbbb");
    h.push("cccc"); // 12 caracteres > 10: se va "aaaa"
    expect(h.undo()).toBe("bbbb");
    expect(h.undo()).toBeNull();
  });

  it("reset borra el historial", () => {
    const h = createHistory();
    h.reset("a");
    h.push("b");
    h.reset("z");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.current()).toBe("z");
  });
});
