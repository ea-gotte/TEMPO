/**
 * Tableros de la DEMO: viven en IndexedDB de este navegador (no en localStorage:
 * las imágenes no entrarían en sus ~5 MB). Interfaz mínima para reemplazarla
 * después por Supabase (spec §8). No importa Fabric: lo usa también el bundle principal.
 */

export interface BoardDoc {
  projectId: string;
  version: 1;
  /** canvas.toObject(): objetos, estilos, imágenes (data URL) */
  fabric: { objects: unknown[]; [key: string]: unknown };
  viewport: { x: number; y: number; zoom: number };
  updatedAt: string;
}

export type LoadResult = { status: "ok"; doc: BoardDoc | null } | { status: "unavailable" } | { status: "corrupt"; raw: unknown };
export type SaveResult = "ok" | "quota" | "unavailable" | "error";

const DB_NAME = "tempo-tableros";
const STORE = "boards";
let dbPromise: Promise<IDBDatabase> | null = null;
let epoch = 0;

/** Cambia con cada “Restablecer”: un tablero abierto desde antes ya no debe guardarse. */
export const boardEpoch = () => epoch;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        if (typeof indexedDB === "undefined") throw new Error("IndexedDB no disponible");
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { keyPath: "projectId" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("IndexedDB bloqueada"));
      } catch (e) {
        reject(e);
      }
    });
    // si falla, se reintenta la próxima vez
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/** Valida un registro leído; null si no tiene la forma esperada. */
export function parseBoardDoc(raw: unknown, projectId: string): BoardDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<BoardDoc>;
  if (d.projectId !== projectId || d.version !== 1 || typeof d.updatedAt !== "string") return null;
  if (!d.fabric || typeof d.fabric !== "object" || !Array.isArray(d.fabric.objects)) return null;
  const v = d.viewport;
  if (!v || !finite(v.x) || !finite(v.y) || !finite(v.zoom) || v.zoom <= 0) return null;
  return d as BoardDoc;
}

export async function loadBoard(projectId: string): Promise<LoadResult> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return { status: "unavailable" };
  }
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(projectId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (raw === undefined) return { status: "ok", doc: null };
    const doc = parseBoardDoc(raw, projectId);
    return doc ? { status: "ok", doc } : { status: "corrupt", raw };
  } catch {
    return { status: "unavailable" };
  }
}

export async function saveBoard(doc: BoardDoc): Promise<SaveResult> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return "unavailable";
  }
  return new Promise<SaveResult>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(doc);
      tx.oncomplete = () => resolve("ok");
      tx.onabort = tx.onerror = () => resolve(tx.error?.name === "QuotaExceededError" ? "quota" : "error");
    } catch (e) {
      resolve(e instanceof DOMException && e.name === "QuotaExceededError" ? "quota" : "error");
    }
  });
}

/** Borra todos los tableros (lo usa “Restablecer datos de ejemplo”). */
export async function clearAllBoards(): Promise<void> {
  epoch += 1; // antes de cualquier await: el desmontaje del tablero abierto ya ve la época nueva
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = tx.onabort = tx.onerror = () => resolve();
    });
  } catch {
    /* sin IndexedDB no hay nada que borrar */
  }
}
