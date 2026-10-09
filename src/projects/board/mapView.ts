import type { Box, Pt } from "./geometry";

/** Minimapa (puro, sin Fabric): cómo se dibuja el tablero en un recuadro chico y cómo se vuelve de él. */

export interface MapFit {
  /** px del minimapa por px del tablero */
  scale: number;
  /** dónde cae el origen del tablero en el minimapa */
  x: number;
  y: number;
}

/** Encaja `world` en un minimapa de w × h, centrado y sin deformar. */
export function mapFit(world: Box, w: number, h: number): MapFit {
  const scale = Math.min(w / Math.max(world.width, 1), h / Math.max(world.height, 1));
  return {
    scale,
    x: (w - world.width * scale) / 2 - world.left * scale,
    y: (h - world.height * scale) / 2 - world.top * scale,
  };
}

export const mapToWorld = (f: MapFit, p: Pt): Pt => ({ x: (p.x - f.x) / f.scale, y: (p.y - f.y) / f.scale });
