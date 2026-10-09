/**
 * Medir sobre planos (puro, sin Fabric). La escala se guarda en cada imagen como
 * metros por píxel de la imagen, así sigue valiendo si la imagen se agranda o se achica.
 */

export interface Calibration {
  /** Escala con la que se ve la imagen en el lienzo (scaleX) */
  scale: number;
  /** Metros que representa un píxel de la imagen */
  mPerPx: number;
}

/** Escala a partir de una línea de `sceneLen` px de escena que en la realidad mide `realMeters`. */
export const metersPerPixel = (realMeters: number, sceneLen: number, imageScale: number) => realMeters / (sceneLen / imageScale);

/** Longitud legible: centímetros debajo de un metro, coma decimal, hasta dos decimales. */
export function formatLength(meters: number): string {
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
  return meters < 1 ? `${fmt(meters * 100)} cm` : `${fmt(meters)} m`;
}

/** Texto de una cota de `sceneLen` px de escena, según la imagen sobre la que está (o null si no hay escala). */
export function measureLabel(sceneLen: number, cal: Calibration | null): string {
  if (!cal) return `${Math.round(sceneLen)} px (sin escala)`;
  return formatLength((sceneLen / cal.scale) * cal.mPerPx);
}

/** Lo que escribe el usuario al calibrar: "3,5", "3.5 m", "85 cm", "1200 mm". null si no es una longitud positiva. */
export function parseMeters(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = /^(-?\d+(?:[.,]\d+)?)\s*(m|cm|mm)?$/.exec(input.trim().toLowerCase());
  if (!m) return null;
  const value = parseFloat(m[1].replace(",", ".")) * (m[2] === "cm" ? 0.01 : m[2] === "mm" ? 0.001 : 1);
  return value > 0 ? value : null;
}
