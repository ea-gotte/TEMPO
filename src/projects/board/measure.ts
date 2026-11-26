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

/** Área de un polígono (fórmula del agrimensor), positiva en cualquier sentido de giro. */
export function polygonArea(pts: { x: number; y: number }[]): number {
  let twice = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    twice += p.x * q.y - q.x * p.y;
  });
  return Math.abs(twice) / 2;
}

/** Centro de gravedad del polígono (donde se escribe su superficie). Sin área, el promedio de los vértices. */
export function polygonCentroid(pts: { x: number; y: number }[]): { x: number; y: number } {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    twice += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  });
  if (Math.abs(twice) < 1e-9) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice) };
}

/** Superficie legible: m² con coma decimal (hasta dos), o cm² si es menor a 0,01 m². */
export function formatArea(m2: number): string {
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
  return m2 < 0.01 ? `${fmt(m2 * 10000)} cm²` : `${fmt(m2)} m²`;
}

/** Texto de una superficie de `scenePx2` px² de escena, según la imagen sobre la que está (o null si no hay escala). */
export function areaLabel(scenePx2: number, cal: Calibration | null): string {
  if (!cal) return `${Math.round(scenePx2)} px² (sin escala)`;
  return formatArea((scenePx2 / (cal.scale * cal.scale)) * cal.mPerPx * cal.mPerPx);
}
