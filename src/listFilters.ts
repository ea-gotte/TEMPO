/**
 * Filtros y orden de los listados de Gestión (solicitudes, horas extra, registro)
 * y de Control de horas. Funciones puras: cada listado dice cómo leer sus filas.
 */

const byName = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

/* ---------- Gestión ---------- */

export type RequestSort = "emision-desc" | "emision-asc" | "fecha-desc" | "fecha-asc" | "persona";

export const REQUEST_SORTS: { key: RequestSort; label: string }[] = [
  { key: "emision-desc", label: "Emisión: más recientes primero" },
  { key: "emision-asc", label: "Emisión: más antiguas primero" },
  { key: "fecha-desc", label: "Fecha pedida: más recientes primero" },
  { key: "fecha-asc", label: "Fecha pedida: más antiguas primero" },
  { key: "persona", label: "Persona (A–Z)" },
];

/** Un valor vacío significa "sin filtrar por eso". */
export interface RequestFilter {
  person: string;
  type: string;
  status: string;
}

/** Lo que cada listado expone de sus filas para filtrarlas y ordenarlas. */
export interface RequestKeys {
  personId: string;
  personName: string;
  type?: string;
  status: string;
  /** Cuándo se emitió la solicitud o, en el registro, cuándo pasó el evento */
  emitted: string;
  /** La fecha que se pide (inicio de la ausencia, mes de las horas extra) */
  date: string;
}

export function filterAndSortRequests<T>(items: T[], filter: RequestFilter, sort: RequestSort, keysOf: (item: T) => RequestKeys): T[] {
  const rows = items
    .map((item) => ({ item, k: keysOf(item) }))
    .filter(({ k }) =>
      (!filter.person || k.personId === filter.person) &&
      (!filter.type || k.type === filter.type) &&
      (!filter.status || k.status === filter.status),
    );

  rows.sort((a, b) => {
    switch (sort) {
      case "emision-asc":
        return a.k.emitted.localeCompare(b.k.emitted) || a.k.date.localeCompare(b.k.date) || byName(a.k.personName, b.k.personName);
      case "fecha-desc":
        return b.k.date.localeCompare(a.k.date) || b.k.emitted.localeCompare(a.k.emitted) || byName(a.k.personName, b.k.personName);
      case "fecha-asc":
        return a.k.date.localeCompare(b.k.date) || a.k.emitted.localeCompare(b.k.emitted) || byName(a.k.personName, b.k.personName);
      case "persona":
        return byName(a.k.personName, b.k.personName) || b.k.emitted.localeCompare(a.k.emitted) || b.k.date.localeCompare(a.k.date);
      case "emision-desc":
      default:
        return b.k.emitted.localeCompare(a.k.emitted) || b.k.date.localeCompare(a.k.date) || byName(a.k.personName, b.k.personName);
    }
  });

  return rows.map((r) => r.item);
}

/* ---------- Control de horas ---------- */

export type HoursStatus = "sin-carga" | "incompleto" | "ok" | "extra";
export type HoursSortKey = "persona" | "supervisor" | "jornada" | "cargado" | "estado" | "extra";

/** Valor del filtro de supervisor para quienes no tienen ninguno asignado. */
export const NO_SUPERVISOR = "__none__";

export interface HoursFilter {
  person: string;
  supervisor: string;
  status: string;
  jornada: string;
}

export interface HoursRowLike {
  u: { id: string; name: string; jornada: string };
  supervisor?: { id: string; name: string };
  loaded: number;
  expected: number;
  overtimeMin: number;
  status: HoursStatus;
}

// De peor a mejor: en orden ascendente, primero lo que hay que atender
const STATUS_RANK: Record<HoursStatus, number> = { "sin-carga": 0, incompleto: 1, ok: 2, extra: 3 };

export function filterAndSortHours<T extends HoursRowLike>(rows: T[], filter: HoursFilter, key: HoursSortKey, dir: "asc" | "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const progress = (r: T) => r.loaded / Math.max(1, r.expected);

  return rows
    .filter((r) =>
      (!filter.person || r.u.id === filter.person) &&
      (!filter.supervisor || (filter.supervisor === NO_SUPERVISOR ? !r.supervisor : r.supervisor?.id === filter.supervisor)) &&
      (!filter.status || r.status === filter.status) &&
      (!filter.jornada || r.u.jornada === filter.jornada),
    )
    .sort((a, b) => {
      let c = 0;
      if (key === "persona") c = byName(a.u.name, b.u.name);
      else if (key === "jornada") c = byName(a.u.jornada, b.u.jornada);
      else if (key === "cargado") c = progress(a) - progress(b);
      else if (key === "estado") c = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      else if (key === "extra") c = a.overtimeMin - b.overtimeMin;
      else if (key === "supervisor") {
        // Quien no tiene supervisor va siempre al final, en cualquier sentido
        if (!a.supervisor || !b.supervisor) {
          if (a.supervisor || b.supervisor) return a.supervisor ? -1 : 1;
        } else c = byName(a.supervisor.name, b.supervisor.name);
      }
      return sign * c || byName(a.u.name, b.u.name);
    });
}
