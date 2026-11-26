/**
 * Deshacer/rehacer por instantáneas (texto JSON del tablero). Reemplaza a
 * useUndo/useRedo de Liveblocks en Figma_Clone. Genérico: no sabe de Fabric.
 * Tope por pasos y por tamaño total: las imágenes viajan dentro de cada
 * instantánea, y 50 copias de un plano podrían ocupar cientos de MB.
 */

export interface History {
  /** Reemplaza todo el historial por un estado inicial (al cargar el tablero). */
  reset(state: string): void;
  /** Registra un estado nuevo y descarta lo rehacible. No registra si es igual al actual. */
  push(state: string): boolean;
  undo(): string | null;
  redo(): string | null;
  canUndo(): boolean;
  canRedo(): boolean;
  current(): string | null;
}

export function createHistory({ limit = 50, maxChars = 60_000_000 }: { limit?: number; maxChars?: number } = {}): History {
  let past: string[] = []; // el último es el estado actual
  let future: string[] = [];
  let chars = 0;

  const trim = () => {
    while (past.length > 1 && (past.length > limit + 1 || chars > maxChars)) chars -= past.shift()!.length;
  };

  return {
    reset(state) {
      past = [state];
      future = [];
      chars = state.length;
    },
    push(state) {
      if (past[past.length - 1] === state) return false;
      past.push(state);
      chars += state.length;
      future = [];
      trim();
      return true;
    },
    undo() {
      if (past.length < 2) return null;
      const s = past.pop()!;
      chars -= s.length;
      future.push(s);
      return past[past.length - 1];
    },
    redo() {
      const s = future.pop();
      if (s === undefined) return null;
      past.push(s);
      chars += s.length;
      trim();
      return s;
    },
    canUndo: () => past.length > 1,
    canRedo: () => future.length > 0,
    current: () => past[past.length - 1] ?? null,
  };
}
