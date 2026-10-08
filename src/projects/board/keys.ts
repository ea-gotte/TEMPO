import { SHORTCUT_TO_TOOL, type Tool } from "./tools";

/**
 * Atajos de teclado del tablero (spec §5.6).
 * Adaptado de lib/key-events.ts de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

export type KeyLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

export type KeyAction =
  | { type: "tool"; tool: Tool }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copy" }
  | { type: "duplicate" }
  | { type: "selectAll" }
  | { type: "delete" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "escape" }
  | { type: "fit" }
  | { type: "spaceDown" }
  | { type: "spaceUp" };

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Traduce una tecla a una acción. Mientras se edita un texto, ninguna (las maneja el texto). */
export function keyToAction(e: KeyLike, phase: "down" | "up", editing: boolean): KeyAction | null {
  const space = e.code === "Space" || e.key === " ";
  if (phase === "up") return space ? { type: "spaceUp" } : null;
  if (editing) return null;
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (key === "y") return { type: "redo" };
    if (key === "c") return { type: "copy" };
    if (key === "d") return { type: "duplicate" };
    if (key === "a") return { type: "selectAll" };
    return null; // Ctrl+V y el resto quedan para el navegador
  }
  if (e.altKey) return null;
  if (space) return { type: "spaceDown" };
  if (e.key === "Delete" || e.key === "Backspace") return { type: "delete" };
  if (e.key === "Escape") return { type: "escape" };
  const arrow = ARROWS[e.key];
  if (arrow) {
    const step = e.shiftKey ? 10 : 1;
    return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  if (e.shiftKey) return e.code === "Digit1" ? { type: "fit" } : null;
  const tool = SHORTCUT_TO_TOOL[key];
  return tool ? { type: "tool", tool } : null;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

/** Escucha el teclado mientras el tablero está montado. Devuelve la función para dejar de escuchar. */
export function attachKeys(onAction: (a: KeyAction) => void, isEditing: () => boolean): () => void {
  const down = (e: KeyboardEvent) => {
    if (typing(e.target)) return; // campos del panel y el textarea con el que Fabric edita texto
    const a = keyToAction(e, "down", isEditing());
    if (!a) return;
    e.preventDefault();
    onAction(a);
  };
  const up = (e: KeyboardEvent) => {
    const a = keyToAction(e, "up", false);
    if (a) onAction(a);
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}
