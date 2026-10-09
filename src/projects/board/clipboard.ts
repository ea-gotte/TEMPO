import type { Pt } from "./geometry";

/**
 * Portapapeles del tablero (puro, sin Fabric). Copiar escribe en el portapapeles del
 * sistema un tipo propio con los objetos serializados: así se puede pegar en el
 * tablero de otro proyecto, y en otras aplicaciones llega el texto que tenían.
 */

export const BOARD_MIME = "application/x-tempo-tablero";

type Item = Record<string, unknown>;

export function encodeClip(projectId: string, objects: Item[]): string {
  return JSON.stringify({ v: 1, projectId, objects });
}

export function decodeClip(raw: string | null | undefined): { projectId: string; objects: Item[] } | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { v?: unknown; projectId?: unknown; objects?: unknown };
    if (d?.v !== 1 || typeof d.projectId !== "string" || !Array.isArray(d.objects)) return null;
    return { projectId: d.projectId, objects: d.objects as Item[] };
  } catch {
    return null;
  }
}

/** Texto escrito en los objetos (notas, formas con texto, textos), un renglón por objeto. */
export function textOf(objects: Item[]): string {
  const texts = objects.map((o) => {
    if (typeof o.text === "string") return o.text;
    const children = o.objects as Item[] | undefined;
    const label = Array.isArray(children) ? children.find((c) => typeof c.text === "string") : undefined;
    return (label?.text as string | undefined) ?? "";
  });
  return texts.filter((t) => t.trim()).join("\n");
}

/**
 * Desplazamiento de lo pegado. En el mismo tablero, corrido 20 px por cada pegada (como
 * duplicar); desde otro tablero, centrado en el punto de destino (sus coordenadas no
 * significan nada acá).
 */
export function pasteOffset(objects: Item[], target: Pt, sameBoard: boolean, count: number): { dx: number; dy: number } {
  if (sameBoard) return { dx: 20 * count, dy: 20 * count };
  const xs = objects.map((o) => Number(o.left ?? 0));
  const ys = objects.map((o) => Number(o.top ?? 0));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { dx: Math.round(target.x - cx), dy: Math.round(target.y - cy) };
}
