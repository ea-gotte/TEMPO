import { unionBoxes, type Box } from "./geometry";

/**
 * Archivo del tablero (.json), para respaldarlo o pasárselo a otra persona: el tablero vive
 * solo en este navegador. Importarlo agrega su contenido al tablero abierto (puro, sin Fabric).
 */

type Item = Record<string, unknown>;

const APP = "tempo-tablero";

export function encodeBoardFile(project: string, objects: Item[], exportedAt: string): string {
  return JSON.stringify({ app: APP, v: 1, project, exportedAt, objects });
}

const isItemList = (x: unknown): x is Item[] => Array.isArray(x) && x.every((o) => !!o && typeof o === "object" && !Array.isArray(o));

/**
 * Lee un archivo del tablero. También acepta el formato guardado en el navegador (la copia que
 * se descarga cuando un tablero está dañado). null si no es un tablero.
 */
export function decodeBoardFile(text: string): { project: string; objects: Item[] } | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const f = d as { app?: unknown; v?: unknown; project?: unknown; objects?: unknown; fabric?: { objects?: unknown } };
  if (f.app === APP && f.v === 1 && isItemList(f.objects)) return { project: typeof f.project === "string" ? f.project : "", objects: f.objects };
  if (f.app === undefined && f.fabric && typeof f.fabric === "object" && isItemList(f.fabric.objects)) return { project: "", objects: f.fabric.objects };
  return null;
}

/** Caja aproximada de los objetos serializados (sin trazo ni giro): alcanza para ubicarlos. */
export function itemsBounds(objects: Item[]): Box | null {
  return unionBoxes(
    objects.map((o) => {
      const w = Number(o.width ?? 0) * Number(o.scaleX ?? 1);
      const h = Number(o.height ?? 0) * Number(o.scaleY ?? 1);
      const left = Number(o.left ?? 0) - (o.originX === "left" ? 0 : o.originX === "right" ? w : w / 2);
      const top = Number(o.top ?? 0) - (o.originY === "top" ? 0 : o.originY === "bottom" ? h : h / 2);
      return { left, top, width: w, height: h };
    }),
  );
}
