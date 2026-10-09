/** Observaciones numeradas de la revisión de planos (puro, sin Fabric): lista, filtros y tabla para copiar. */

export interface Observation {
  id: string;
  num: number;
  detail: string;
  resolved: boolean;
}

export type ObservationFilter = "all" | "open" | "resolved";

export function observationCounts(list: Observation[]): { open: number; resolved: number } {
  const resolved = list.filter((o) => o.resolved).length;
  return { open: list.length - resolved, resolved };
}

/** Las del estado pedido, por número. */
export function filterObservations(list: Observation[], filter: ObservationFilter): Observation[] {
  return list
    .filter((o) => filter === "all" || o.resolved === (filter === "resolved"))
    .sort((a, b) => a.num - b.num);
}

/** Tabla separada por tabulaciones (se pega bien en Excel y en un correo): una fila por observación. */
export function observationsTable(list: Observation[]): string {
  const rows = filterObservations(list, "all").map((o) =>
    [o.num, o.resolved ? "Resuelta" : "Abierta", o.detail.replace(/\s+/g, " ").trim()].join("\t"),
  );
  return ["N.º\tEstado\tObservación", ...rows].join("\n");
}
