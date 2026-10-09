import type { IconName } from "../../components/Icon";

/**
 * Herramientas, atajos y paletas del tablero (spec §5.1).
 * Adaptado de constants/index.ts de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

export type Tool = "select" | "hand" | "note" | "rect" | "ellipse" | "diamond" | "arrow" | "line" | "cloud" | "pencil" | "image" | "text";
export type ToolGroup = "nav" | "ideas" | "diagram" | "markup" | "common";

export interface ToolDef {
  key: Tool;
  label: string;
  icon: IconName;
  shortcut: string;
  group: ToolGroup;
}

export const TOOLS: ToolDef[] = [
  { key: "select", label: "Seleccionar", icon: "mouse-pointer", shortcut: "V", group: "nav" },
  { key: "hand", label: "Mano (o mantené Espacio)", icon: "hand", shortcut: "H", group: "nav" },
  { key: "note", label: "Nota adhesiva", icon: "sticky-note", shortcut: "N", group: "ideas" },
  { key: "rect", label: "Rectángulo", icon: "square", shortcut: "R", group: "diagram" },
  { key: "ellipse", label: "Elipse", icon: "circle", shortcut: "O", group: "diagram" },
  { key: "diamond", label: "Rombo", icon: "diamond", shortcut: "D", group: "diagram" },
  { key: "arrow", label: "Flecha", icon: "arrow-up-right", shortcut: "A", group: "diagram" },
  { key: "line", label: "Línea", icon: "line", shortcut: "L", group: "diagram" },
  { key: "cloud", label: "Nube de revisión", icon: "cloud", shortcut: "C", group: "markup" },
  { key: "pencil", label: "Lápiz", icon: "pencil", shortcut: "P", group: "markup" },
  { key: "image", label: "Imagen", icon: "image", shortcut: "I", group: "markup" },
  { key: "text", label: "Texto", icon: "type", shortcut: "T", group: "common" },
];

export const SHORTCUT_TO_TOOL: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.shortcut.toLowerCase(), t.key]));

/** Tinta por defecto (texto y trazos) y rojo de las nubes de revisión */
export const INK = "#1f2937";
export const REVIEW_RED = "#e11d48";
export const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
export const NOTE_COLORS = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bae6fd", "#ddd6fe"];
/** Colores de borde, línea y texto */
export const PALETTE = [INK, REVIEW_RED, "#f59e0b", "#16a34a", "#2563eb", "#7c3aed", "#ffffff"];
/** Rellenos de formas ("transparent" = sin relleno) */
export const FILL_COLORS = ["#ffffff", "#e2e8f0", ...NOTE_COLORS, "transparent"];
export const PEN_WIDTHS = [2, 4, 8];
/** Resaltador: colores claros y trazos anchos (se dibujan semitransparentes) */
export const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#f9a8d4", "#93c5fd"];
export const HIGHLIGHT_WIDTHS = [12, 20, 32];
export const STROKE_WIDTHS = [1, 2, 4, 8];
