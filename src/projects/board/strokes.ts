/**
 * Trazos (puro, sin Fabric): transparencia del resaltador y patrones de línea.
 */

export type DashStyle = "solid" | "dashed" | "dotted";
export type HeadStyle = "end" | "start" | "both" | "none";

/** Transparencia del resaltador: deja ver el plano debajo */
export const HIGHLIGHT_ALPHA = 0.35;

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Color en hexadecimal (#rrggbb); lo que no es un color rgb/hex queda igual. */
export function toHex(color: string): string {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (m) return "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  return color.startsWith("#") ? color.toLowerCase() : color;
}

/** Patrón de trazo para Fabric (strokeDashArray), proporcional al grosor. */
export function dashArray(style: DashStyle, width: number): number[] | null {
  if (style === "dashed") return [width * 4, width * 3];
  if (style === "dotted") return [1, width * 3]; // con extremo redondo, cada guion de 1 px es un punto
  return null;
}

export function dashStyleOf(array: number[] | null | undefined): DashStyle {
  if (!array || !array.length) return "solid";
  return array[0] <= 2 ? "dotted" : "dashed";
}
