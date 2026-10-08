import type { FabricObject, Textbox } from "fabric";
import { createLabeled, isLabeled, readLabeled } from "./labels";
import type { Kind } from "./shapes";

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
  strokeLabel: "Borde" | "Línea" | "Color del texto";
}

export interface StylePatch {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  opacity?: number;
}

export function readStyle(o: FabricObject): StyleState {
  const base: StyleState = { kind: o.kind, fill: null, stroke: null, strokeWidth: null, fontSize: null, opacity: o.opacity, strokeLabel: "Borde" };
  if (isLabeled(o)) {
    const s = readLabeled(o);
    const note = o.kind === "note";
    return { ...base, fill: s.fill ?? null, fontSize: s.fontSize ?? null, stroke: note ? null : s.stroke ?? null, strokeWidth: note ? null : s.strokeWidth ?? null };
  }
  switch (o.kind) {
    case "text":
      return { ...base, stroke: String(o.fill), fontSize: (o as Textbox).fontSize, strokeLabel: "Color del texto" };
    case "line":
    case "arrow":
    case "path":
    case "cloud":
      return { ...base, stroke: String(o.stroke), strokeWidth: o.strokeWidth, strokeLabel: "Línea" };
    default:
      return base; // imagen: solo opacidad
  }
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
  } else {
    if (rest.stroke) o.set({ stroke: rest.stroke });
    if (rest.strokeWidth) o.set({ strokeWidth: rest.strokeWidth });
  }
  o.setCoords();
  return o;
}
