import React, { useMemo, useSyncExternalStore } from "react";
import { Icon } from "./components/Icon";

/**
 * Proyectos favoritos de cada persona. Es una preferencia personal: se guarda
 * en este navegador (localStorage), separada por usuario, y no cambia nada del
 * proyecto ni lo ven los demás.
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
  const next = current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId];
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

/** Orden para listas: los favoritos primero, sin tocar el orden del resto. */
export function favoritesFirst<T>(items: T[], idOf: (item: T) => string, favorites: Set<string>): T[] {
  if (favorites.size === 0) return items;
  return [...items.filter((it) => favorites.has(idOf(it))), ...items.filter((it) => !favorites.has(idOf(it)))];
}

/** Estrella para marcar o quitar un proyecto de los favoritos de la persona. */
export function FavoriteStar({ userId, projectId, on, size = 15 }: { userId: string; projectId: string; on: boolean; size?: number }) {
  const label = on ? "Quitar de favoritos" : "Marcar como favorito";
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
