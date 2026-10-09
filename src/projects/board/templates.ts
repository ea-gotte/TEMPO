import { unionBoxes, type Box, type Pt } from "./geometry";
import { NOTE_COLORS } from "./tools";

/**
 * Plantillas del tablero (puro, sin Fabric): elementos con posición relativa y
 * flechas entre ellos (por índice). BoardTab las crea centradas en la vista.
 */

export interface TemplateItem {
  kind: "note" | "rect" | "ellipse" | "diamond" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill?: string;
}

export interface Template {
  key: string;
  label: string;
  items: TemplateItem[];
  /** Flechas [desde, hasta, texto opcional] por índice de `items` */
  links: [number, number, string?][];
}

const [YELLOW, PINK, GREEN, BLUE] = NOTE_COLORS;

export const TEMPLATES: Template[] = [
  {
    key: "ideas",
    label: "Lluvia de ideas",
    items: [
      { kind: "text", x: 0, y: 0, w: 520, h: 40, text: "Tema: escribí la pregunta o el problema" },
      ...[0, 1].flatMap((row) => [0, 1, 2].map((col): TemplateItem => ({ kind: "note", x: col * 180, y: 70 + row * 180, w: 160, h: 160, text: "", fill: YELLOW }))),
    ],
    links: [],
  },
  {
    key: "retro",
    label: "Retrospectiva",
    items: [
      { kind: "rect", x: 0, y: 0, w: 240, h: 56, text: "Qué salió bien", fill: GREEN },
      { kind: "rect", x: 260, y: 0, w: 240, h: 56, text: "Qué mejorar", fill: PINK },
      { kind: "rect", x: 520, y: 0, w: 240, h: 56, text: "Acciones", fill: BLUE },
      ...[0, 1, 2].flatMap((col) => [0, 1].map((row): TemplateItem => ({ kind: "note", x: col * 260 + 20, y: 76 + row * 160, w: 200, h: 140, text: "", fill: [GREEN, PINK, BLUE][col] }))),
    ],
    links: [],
  },
  {
    key: "approval",
    label: "Flujo de aprobación",
    items: [
      { kind: "ellipse", x: 0, y: 40, w: 120, h: 70, text: "Inicio" },
      { kind: "rect", x: 180, y: 35, w: 170, h: 80, text: "Preparar la entrega" },
      { kind: "diamond", x: 410, y: 15, w: 190, h: 120, text: "¿Aprobado por el cliente?" },
      { kind: "rect", x: 660, y: 35, w: 140, h: 80, text: "Emitir" },
      { kind: "rect", x: 410, y: 200, w: 190, h: 80, text: "Corregir observaciones" },
    ],
    links: [[0, 1], [1, 2], [2, 3, "Sí"], [2, 4, "No"], [4, 1]],
  },
  {
    key: "plan-review",
    label: "Revisión de plano",
    items: [
      { kind: "text", x: 0, y: 0, w: 560, h: 40, text: "Revisión de plano — P-___" },
      {
        kind: "note", x: 0, y: 60, w: 260, h: 220, fill: BLUE,
        text: "1. Pegá el plano (Ctrl+V) y bloquealo.\n2. Calibrá su escala para medir (K).\n3. Marcá con nubes (C) y observaciones numeradas (M).",
      },
      ...[0, 1, 2].map((i): TemplateItem => ({ kind: "note", x: 290, y: 60 + i * 140, w: 260, h: 120, text: `Observación ${i + 1}: `, fill: YELLOW })),
    ],
    links: [],
  },
  {
    key: "risk-matrix",
    label: "Matriz de riesgos",
    items: [
      { kind: "text", x: 0, y: 0, w: 520, h: 40, text: "Matriz de riesgos (probabilidad × impacto)" },
      { kind: "rect", x: 0, y: 60, w: 250, h: 170, text: "Probabilidad alta · impacto bajo\nMonitorear", fill: YELLOW },
      { kind: "rect", x: 270, y: 60, w: 250, h: 170, text: "Probabilidad alta · impacto alto\nMitigar ya", fill: PINK },
      { kind: "rect", x: 0, y: 250, w: 250, h: 170, text: "Probabilidad baja · impacto bajo\nAceptar", fill: GREEN },
      { kind: "rect", x: 270, y: 250, w: 250, h: 170, text: "Probabilidad baja · impacto alto\nPlan de contingencia", fill: BLUE },
    ],
    links: [],
  },
];

/** Caja que encierra todos los elementos de la plantilla (para centrarla en la vista). */
export function templateBounds(t: Template): Box {
  return unionBoxes(t.items.map((i) => ({ left: i.x, top: i.y, width: i.w, height: i.h }))) ?? { left: 0, top: 0, width: 0, height: 0 };
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * Dónde va una plantilla: centrada en la vista si ese lugar está libre; si se encimaría con
 * lo que ya hay, a la derecha de todo el contenido (con un margen), a la misma altura.
 */
export function templateOffset(bounds: Box, center: Pt, occupied: Box[], gap = 80): { dx: number; dy: number } {
  const dx = center.x - (bounds.left + bounds.width / 2);
  const dy = center.y - (bounds.top + bounds.height / 2);
  const placed = { ...bounds, left: bounds.left + dx, top: bounds.top + dy };
  if (!occupied.some((o) => overlaps(placed, o))) return { dx, dy };
  const right = Math.max(...occupied.map((o) => o.left + o.width));
  return { dx: right + gap - bounds.left, dy };
}
