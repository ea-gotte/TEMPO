import type { FabricObject, Group, Textbox } from "fabric";
import { createLabeled, isLabeled, readLabeled } from "./labels";
import { AREA_ALPHA, type Kind } from "./shapes";
import { INK } from "./tools";
import { HIGHLIGHT_ALPHA, dashArray, dashStyleOf, toHex, withAlpha, type DashStyle, type HeadStyle } from "./strokes";

/**
 * Estilo que muestra y cambia el panel de propiedades (spec §5.4).
 * Adaptado de settings/* de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 * `null` = esa propiedad no aplica a este tipo de objeto.
 */

export interface StyleState {
  kind: Kind | undefined;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  fontSize: number | null;
  opacity: number;
  strokeLabel: "Borde" | "Línea" | "Color del texto" | "Resaltador" | "Color";
  /** Patrón de línea (DashStyle), o "mixed" en una selección con varios */
  dash: string | null;
  /** Puntas de la flecha (HeadStyle), o "mixed" */
  heads: string | null;
  /** Color del texto de una forma con texto (en un texto suelto, su color es `stroke`) */
  textColor: string | null;
  /** "bold" o "normal" (o "mixed"): formas con texto y textos */
  weight: string | null;
}

export interface StylePatch {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  opacity?: number;
  dash?: DashStyle;
  heads?: HeadStyle;
  textColor?: string;
  weight?: "bold" | "normal";
}

const LINES: Kind[] = ["line", "arrow", "path", "cloud", "measure", "area"];

export function readStyle(o: FabricObject): StyleState {
  const base: StyleState = {
    kind: o.kind, fill: null, stroke: null, strokeWidth: null, fontSize: null, opacity: o.opacity, strokeLabel: "Borde", dash: null, heads: null, textColor: null, weight: null,
  };
  if (isLabeled(o)) {
    const s = readLabeled(o);
    const text = { textColor: s.color ?? INK, weight: s.bold ? "bold" : "normal" };
    if (o.kind === "note") return { ...base, ...text, fill: s.fill ?? null, fontSize: s.fontSize ?? null };
    return { ...base, ...text, fill: s.fill ?? null, fontSize: s.fontSize ?? null, stroke: s.stroke ?? null, strokeWidth: s.strokeWidth ?? null, dash: s.dash ?? "solid" };
  }
  if (o.kind === "text") {
    const t = o as Textbox;
    return { ...base, stroke: String(t.fill), fontSize: t.fontSize, strokeLabel: "Color del texto", weight: t.fontWeight === "bold" ? "bold" : "normal" };
  }
  if (o.kind === "marker") return { ...base, stroke: String((o as Group).getObjects()[0].fill), strokeLabel: "Color" };
  // el resaltador se guarda con transparencia: el panel muestra su color pleno
  if (o.kind === "highlight") return { ...base, stroke: toHex(String(o.stroke)), strokeWidth: o.strokeWidth, strokeLabel: "Resaltador" };
  if (o.kind && LINES.includes(o.kind)) {
    return {
      ...base, stroke: String(o.stroke), strokeWidth: o.strokeWidth, strokeLabel: o.kind === "area" ? "Color" : "Línea",
      dash: dashStyleOf(o.strokeDashArray), heads: o.kind === "arrow" ? o.heads ?? "end" : null,
    };
  }
  return base; // imagen: solo opacidad
}

/** Aplica el cambio. Una forma con texto se reconstruye: devuelve el objeto nuevo (mismo id). */
export function applyStyle(o: FabricObject, p: StylePatch): FabricObject {
  if (p.opacity !== undefined) o.set({ opacity: p.opacity });
  const { opacity: _ignored, ...rest } = p;
  if (!Object.keys(rest).length) return o;
  if (isLabeled(o)) {
    const { textColor, weight, ...shape } = rest;
    const spec = readLabeled(o);
    return createLabeled({ ...spec, ...shape, color: textColor ?? spec.color, bold: weight ? weight === "bold" : spec.bold });
  }
  if (o.kind === "text") {
    if (rest.stroke) o.set({ fill: rest.stroke });
    if (rest.fontSize) o.set({ fontSize: rest.fontSize });
    if (rest.weight) o.set({ fontWeight: rest.weight });
  } else if (o.kind === "marker") {
    if (rest.stroke) {
      (o as Group).getObjects()[0].set({ fill: rest.stroke });
      o.set({ dirty: true });
    }
  } else if (o.kind === "highlight") {
    if (rest.stroke) o.set({ stroke: withAlpha(toHex(rest.stroke), HIGHLIGHT_ALPHA) });
    if (rest.strokeWidth) o.set({ strokeWidth: rest.strokeWidth });
  } else if (o.kind && LINES.includes(o.kind)) {
    if (rest.stroke) o.set({ stroke: rest.stroke });
    // la superficie medida se rellena con su color, casi transparente
    if (rest.stroke && o.kind === "area") o.set({ fill: withAlpha(toHex(rest.stroke), AREA_ALPHA) });
    if (rest.strokeWidth) o.set({ strokeWidth: rest.strokeWidth });
    // el patrón es proporcional al grosor: se recalcula también al cambiar el grosor
    if (rest.dash || rest.strokeWidth) {
      const dash = rest.dash ?? dashStyleOf(o.strokeDashArray);
      o.set({ strokeDashArray: dashArray(dash, o.strokeWidth) });
      if (dash === "dotted") o.set({ strokeLineCap: "round" });
    }
    if (rest.heads && o.kind === "arrow") o.set({ heads: rest.heads });
  }
  o.setCoords();
  return o;
}
