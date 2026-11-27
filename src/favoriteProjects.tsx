import React, { useMemo, useSyncExternalStore } from "react";
import { Icon } from "./components/Icon";

/**
 * Proyecto favorito de cada persona: el que se propone al cargar un registro
 * nuevo de horas. Hay uno solo a la vez (marcar otro lo reemplaza). Es una
 * preferencia personal: se guarda en este navegador (localStorage), separada
 * por usuario, y no cambia nada del proyecto ni lo ven los demás.
 */
const KEY = "tempo-proyectos-favoritos-v1";
type Stored = Record<string, string[]>;

let cache: Stored | null = null;
let version = 0;
const listeners = new Set<() => void>();

function read(): Stored {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Stored) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function changed() {
  version += 1;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Otra pestaña del mismo navegador cambió los favoritos
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    changed();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function favoriteProjectIds(userId: string): string[] {
  const list = read()[userId];
  return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
}

export function toggleFavoriteProject(userId: string, projectId: string) {
  const current = favoriteProjectIds(userId);
  // Uno solo a la vez: marcar otro proyecto reemplaza al anterior
  const next = current.includes(projectId) ? [] : [projectId];
  cache = { ...read(), [userId]: next };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sin almacenamiento (modo privado): el favorito dura lo que dure la pestaña */
  }
  changed();
}

/** Favoritos de la persona, como conjunto; se actualiza solo cuando cambian. */
export function useFavoriteProjects(userId: string): Set<string> {
  const v = useSyncExternalStore(subscribe, () => version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Set(favoriteProjectIds(userId)), [userId, v]);
}

/** Estrella para marcar o quitar un proyecto de los favoritos de la persona. */
export function FavoriteStar({ userId, projectId, on, size = 15 }: { userId: string; projectId: string; on: boolean; size?: number }) {
  const label = on ? "Quitar como favorito" : "Marcar como favorito: se propone al cargar horas";
  return (
    <button
      type="button"
      className="fav-star"
      aria-pressed={on}
      aria-label={label}
      title={label}
      // No abre el proyecto ni arrastra el cronograma: solo cambia el favorito
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavoriteProject(userId, projectId);
      }}
    >
      <Icon name="star" size={size} style={on ? { fill: "currentColor" } : undefined} />
    </button>
  );
}
