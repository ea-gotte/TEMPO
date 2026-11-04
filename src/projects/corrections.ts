import type { Deliverable, DeliverableReview, Task } from "./types";

/**
 * Lógica pura para gestión de correcciones por entregable y métricas de retrabajo.
 * Sin dependencias de React ni de estado externo.
 */

export interface DeliverableCorrections {
  rounds: number;
  total: number;
  open: number;
  closed: number;
  estimatedHours: number;
  openHours: number;
  lastReview: DeliverableReview | null;
}

export type CorrectionState =
  | "sin_revisiones"
  | "en_correcciones"
  | "listo_para_entregar"
  | "aprobado";

export interface ProjectRework {
  /** % de horas estimadas de correcciones sobre el total de horas del proyecto (null si no hay horas) */
  reworkPct: number | null;
  /** Rondas promedio de los entregables que tuvieron alguna entrega o revisión */
  avgRounds: number;
  /** % de entregables entregados sin ninguna revisión del cliente (null si no hay entregados) */
  firstPassPct: number | null;
  /** Cantidad de entregables con correcciones abiertas */
  deliverablesWithOpen: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Calcula estadísticas de correcciones de un entregable: rondas, totales,
 * abiertas, cerradas, horas estimadas y última revisión.
 * Son correcciones las tareas kind "correccion" de ese entregable;
 * una tarea archivada cuenta como cerrada si está hecha.
 */
export function deliverableCorrections(
  deliverableId: string,
  tasks: Task[],
  reviews: DeliverableReview[]
): DeliverableCorrections {
  const delReviews = reviews
    .filter((r) => r.deliverableId === deliverableId)
    .sort((a, b) => b.round - a.round || b.date.localeCompare(a.date));

  const rounds = delReviews.length > 0 ? Math.max(...delReviews.map((r) => r.round)) : 0;
  const lastReview = delReviews[0] ?? null;

  const corrTasks = tasks.filter(
    (t) => t.deliverableId === deliverableId && t.kind === "correccion"
  );

  const isClosed = (t: Task) => t.status === "hecha";

  const total = corrTasks.length;
  const closed = corrTasks.filter(isClosed).length;
  const open = corrTasks.filter((t) => !isClosed(t)).length;

  const estimatedHours = r1(
    corrTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0)
  );
  const openHours = r1(
    corrTasks
      .filter((t) => !isClosed(t))
      .reduce((sum, t) => sum + (t.estimateHours ?? 0), 0)
  );

  return {
    rounds,
    total,
    open,
    closed,
    estimatedHours,
    openHours,
    lastReview,
  };
}

/**
 * Estado general de correcciones de un entregable para la interfaz.
 */
export function correctionState(
  deliverable: Pick<Deliverable, "status">,
  stats: Pick<DeliverableCorrections, "rounds" | "open">
): CorrectionState {
  if (stats.rounds === 0) return "sin_revisiones";
  if (stats.open > 0) return "en_correcciones";
  if (deliverable.status === "cumplido") return "aprobado";
  return "listo_para_entregar";
}

/**
 * Métricas de retrabajo a nivel de proyecto: % de retrabajo, promedio de rondas,
 * tasa de aprobación a la primera y entregables con correcciones pendientes.
 */
export function projectRework(
  projectId: string,
  tasks: Task[],
  deliverables: Deliverable[],
  reviews: DeliverableReview[]
): ProjectRework {
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  const projectDeliverables = deliverables.filter((d) => d.projectId === projectId);
  const projectReviews = reviews.filter((r) => r.projectId === projectId);

  const totalHours = projectTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0);
  const corrTasks = projectTasks.filter((t) => t.kind === "correccion");
  const corrHours = corrTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0);

  const reworkPct =
    totalHours > 0 ? Math.round((corrHours / totalHours) * 100) : null;

  // Entregables que tuvieron alguna entrega o revisión
  const deliveredOrReviewed = projectDeliverables.filter(
    (d) =>
      !!d.firstDeliveredAt ||
      !!d.actualEnd ||
      d.status === "cumplido" ||
      projectReviews.some((r) => r.deliverableId === d.id)
  );

  const totalRounds = deliveredOrReviewed.reduce((sum, d) => {
    return sum + deliverableCorrections(d.id, projectTasks, projectReviews).rounds;
  }, 0);

  const avgRounds =
    deliveredOrReviewed.length > 0
      ? r1(totalRounds / deliveredOrReviewed.length)
      : 0;

  // Entregables entregados (cerrados o con fecha de entrega registrada)
  const delivered = projectDeliverables.filter(
    (d) => !!d.firstDeliveredAt || !!d.actualEnd || d.status === "cumplido"
  );

  const deliveredNoClientReview = delivered.filter(
    (d) =>
      !projectReviews.some(
        (r) => r.deliverableId === d.id && r.source === "cliente"
      )
  );

  const firstPassPct =
    delivered.length > 0
      ? Math.round((deliveredNoClientReview.length / delivered.length) * 100)
      : null;

  const deliverablesWithOpen = projectDeliverables.filter(
    (d) => deliverableCorrections(d.id, projectTasks, projectReviews).open > 0
  ).length;

  return {
    reworkPct,
    avgRounds,
    firstPassPct,
    deliverablesWithOpen,
  };
}
