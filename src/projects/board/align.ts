import type { Box } from "./geometry";

/**
 * Alinear y distribuir varios objetos (puro, sin Fabric). Devuelve cuánto mover
 * cada caja, en el mismo orden en que vienen.
 */

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom";
export interface Delta {
  dx: number;
  dy: number;
}

export function alignDeltas(boxes: Box[], mode: AlignMode): Delta[] {
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const top = Math.min(...boxes.map((b) => b.top));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return boxes.map((b) => {
    switch (mode) {
      case "left": return { dx: left - b.left, dy: 0 };
      case "right": return { dx: right - (b.left + b.width), dy: 0 };
      case "hcenter": return { dx: (left + right) / 2 - (b.left + b.width / 2), dy: 0 };
      case "top": return { dx: 0, dy: top - b.top };
      case "bottom": return { dx: 0, dy: bottom - (b.top + b.height) };
      case "vmiddle": return { dx: 0, dy: (top + bottom) / 2 - (b.top + b.height / 2) };
    }
  });
}

/** Mismo espacio entre cajas consecutivas (en el orden en pantalla); la primera y la última quedan quietas. */
export function distributeDeltas(boxes: Box[], axis: "h" | "v"): Delta[] {
  const out: Delta[] = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return out;
  const pos = (b: Box) => (axis === "h" ? b.left : b.top);
  const size = (b: Box) => (axis === "h" ? b.width : b.height);
  const order = boxes.map((_, i) => i).sort((i, j) => pos(boxes[i]) - pos(boxes[j]));
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const used = order.reduce((n, i) => n + size(boxes[i]), 0);
  const gap = (pos(last) + size(last) - pos(first) - used) / (order.length - 1);
  let cursor = pos(first) + size(first) + gap;
  for (const i of order.slice(1, -1)) {
    const d = cursor - pos(boxes[i]);
    out[i] = axis === "h" ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    cursor += size(boxes[i]) + gap;
  }
  return out;
}

/**
 * Ordenar en cuadrícula (p. ej. notas sueltas de una lluvia de ideas): en orden de lectura
 * (por filas, de izquierda a derecha), con tantas columnas como la raíz de la cantidad y celdas
 * del tamaño del elemento más grande, desde la esquina superior izquierda de la selección.
 * Con `score` (por ejemplo, los votos de cada nota), primero los de más puntaje.
 */
export function gridDeltas(boxes: Box[], gap = 24, score?: number[]): Delta[] {
  // filas: un elemento sigue en la fila si empieza antes de la mitad del primero de ella
  const rows: number[][] = [];
  let limit = -Infinity;
  for (const i of boxes.map((_, i) => i).sort((a, b) => boxes[a].top - boxes[b].top)) {
    if (rows.length && boxes[i].top < limit) rows[rows.length - 1].push(i);
    else {
      rows.push([i]);
      limit = boxes[i].top + boxes[i].height / 2;
    }
  }
  const reading = rows.flatMap((r) => r.sort((a, b) => boxes[a].left - boxes[b].left));
  // a igual puntaje se mantiene el orden de lectura (sort es estable)
  const order = score ? [...reading].sort((a, b) => score[b] - score[a]) : reading;
  const cols = Math.ceil(Math.sqrt(boxes.length));
  const cellW = Math.max(...boxes.map((b) => b.width)) + gap;
  const cellH = Math.max(...boxes.map((b) => b.height)) + gap;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const out: Delta[] = boxes.map(() => ({ dx: 0, dy: 0 }));
  order.forEach((i, k) => {
    out[i] = { dx: left + (k % cols) * cellW - boxes[i].left, dy: top + Math.floor(k / cols) * cellH - boxes[i].top };
  });
  return out;
}
