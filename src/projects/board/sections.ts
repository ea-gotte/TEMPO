import type { Box, Pt } from "./geometry";

/**
 * Secciones del tablero (puro, sin Fabric): marcos con título que ordenan el tablero en zonas
 * ("Planos", "Ideas"…). Lo que está adentro se mueve con la sección.
 */

/** Alto de la franja del título, en px de escena */
export const SECTION_HEADER = 36;

/** ¿El punto toma la sección? Solo por la franja del título o cerca del borde: adentro, el clic es para lo que contiene. */
export function sectionHit(b: Box, p: Pt, tol: number): boolean {
  const near = p.x >= b.left - tol && p.x <= b.left + b.width + tol && p.y >= b.top - tol && p.y <= b.top + b.height + tol;
  if (!near) return false;
  return p.y - b.top < SECTION_HEADER || p.x - b.left <= tol || b.left + b.width - p.x <= tol || b.top + b.height - p.y <= tol;
}

/** Un objeto está en la sección si su centro cae adentro y es más chico que ella (la sección que la envuelve, no). */
export function inSection(section: Box, o: Box): boolean {
  const cx = o.left + o.width / 2;
  const cy = o.top + o.height / 2;
  const inside = cx >= section.left && cx <= section.left + section.width && cy >= section.top && cy <= section.top + section.height;
  return inside && o.width * o.height < section.width * section.height;
}

/** "Sección N", con N uno más que el mayor ya usado. */
export function nextSectionTitle(titles: string[]): string {
  const nums = titles.map((t) => /^Sección (\d+)$/.exec(t)?.[1]).filter((n): n is string => !!n).map(Number);
  return `Sección ${Math.max(0, ...nums) + 1}`;
}

/** Orden de apilado (índices, de atrás hacia adelante): las más grandes atrás. */
export function sectionOrder(boxes: Box[]): number[] {
  return boxes.map((_, i) => i).sort((a, b) => boxes[b].width * boxes[b].height - boxes[a].width * boxes[a].height);
}
