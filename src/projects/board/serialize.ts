import { util, type Canvas, type FabricObject } from "fabric";
import { uid } from "../../utils";
import type { BoardDoc } from "./boardStore";
import { prepareObject } from "./shapes";

/** Instantáneas del tablero (historial y guardado), carga y copias. */

export interface Snapshot {
  json: string;
  data: BoardDoc["fabric"];
}

/**
 * Estado guardable. canvas.toObject() deja afuera los objetos auxiliares
 * (excludeFromExport) y, con una selección múltiple activa, serializa cada objeto
 * con sus coordenadas reales.
 */
export function snapshot(canvas: Canvas): Snapshot {
  const data = canvas.toObject() as unknown as BoardDoc["fabric"];
  return { json: JSON.stringify(data), data };
}

export async function restore(canvas: Canvas, data: string | BoardDoc["fabric"]) {
  await canvas.loadFromJSON(data);
  canvas.getObjects().forEach(prepareObject);
  canvas.requestRenderAll();
}

/**
 * Inserta copias (pegar/duplicar) con ids nuevos, desplazadas (dx, dy). Un conector
 * conserva su enganche solo si la forma enganchada también se copió. Las copias quedan
 * desbloqueadas salvo con `keepLocks`. En `idsOut` deja el id nuevo de cada original (un
 * elemento que no se pudo crear no está entre los devueltos).
 */
export async function insertCopies(
  canvas: Canvas, items: Record<string, unknown>[], dx: number, dy = dx, keepLocks = false, idsOut?: Map<string, string>,
): Promise<FabricObject[]> {
  const ids = new Map<string, string>();
  for (const it of items) if (typeof it.id === "string") ids.set(it.id, uid());
  ids.forEach((next, old) => idsOut?.set(old, next));
  const remap = (id: unknown) => (typeof id === "string" ? ids.get(id) ?? null : null);
  const data = items.map((it) => ({
    ...it,
    id: remap(it.id) ?? uid(),
    fromId: remap(it.fromId),
    toId: remap(it.toId),
    // pegar o duplicar desbloquea (la copia se mueve); al importar un tablero se respeta lo bloqueado
    lockedByUser: keepLocks ? !!it.lockedByUser : false,
    left: Number(it.left ?? 0) + dx,
    top: Number(it.top ?? 0) + dy,
  }));
  const objs = await util.enlivenObjects<FabricObject>(data);
  for (const o of objs) {
    prepareObject(o);
    canvas.add(o);
  }
  return objs;
}
