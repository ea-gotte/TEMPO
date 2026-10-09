import type { FabricObject, Group, Textbox } from "fabric";
import { createLabeled, isLabeled, readLabeled } from "./labels";
import type { Kind } from "./shapes";
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
}

export interface StylePatch {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  opacity?: number;
  dash?: DashStyle;
  heads?: HeadStyle;
}

const LINES: Kind[] = ["line", "arrow", "path", "cloud", "measure"];

export function readStyle(o: FabricObject): StyleState {
  const base: StyleState = {
    kind: o.kind, fill: null, stroke: null, strokeWidth: null, fontSize: null, opacity: o.opacity, strokeLabel: "Borde", dash: null, heads: null,
  };
  if (isLabeled(o)) {
    const s = readLabeled(o);
    if (o.kind === "note") return { ...base, fill: s.fill ?? null, fontSize: s.fontSize ?? null };
    return { ...base, fill: s.fill ?? null, fontSize: s.fontSize ?? null, stroke: s.stroke ?? null, strokeWidth: s.strokeWidth ?? null, dash: s.dash ?? "solid" };
  }
  if (o.kind === "text") return { ...base, stroke: String(o.fill), fontSize: (o as Textbox).fontSize, strokeLabel: "Color del texto" };
  if (o.kind === "marker") return { ...base, stroke: String((o as Group).getObjects()[0].fill), strokeLabel: "Color" };
  // el resaltador se guarda con transparencia: el panel muestra su color pleno
  if (o.kind === "highlight") return { ...base, stroke: toHex(String(o.stroke)), strokeWidth: o.strokeWidth, strokeLabel: "Resaltador" };
  if (o.kind && LINES.includes(o.kind)) {
    return {
      ...base, stroke: String(o.stroke), strokeWidth: o.strokeWidth, strokeLabel: "Línea",
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
  if (isLabeled(o)) return createLabeled({ ...readLabeled(o), ...rest });
  if (o.kind === "text") {
    if (rest.stroke) o.set({ fill: rest.stroke });
    if (rest.fontSize) o.set({ fontSize: rest.fontSize });
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
