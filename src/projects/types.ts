import type { Client, ID, Project, User } from "../types";

/**
 * Gestión de proyectos (DEMO local): el proyecto es el espacio de trabajo.
 * Todo lo de acá se guarda solo en este navegador (ver workStore.ts); la
 * forma de los datos ya es la del modelo propuesto para Supabase.
 */

/** Cómo se gestiona el proyecto: cronograma e hitos, sprints, o descubrimiento y después lo que corresponda. */
export type ProjectMode = "planificado" | "agil" | "hibrido";
/** Tipo de ítem del trabajo. “spike” = investigación acotada; “cambio” = nace de una solicitud del cliente. */
export type TaskKind = "tarea" | "historia" | "bug" | "spike" | "cambio";
/** Qué tan firme es una estimación */
export type Confidence = "alta" | "media" | "baja";

export type TaskStatus = "pendiente" | "en_curso" | "en_revision" | "hecha";
export type TaskPriority = "baja" | "media" | "alta" | "urgente";
/** Hitos y entregables comparten estados. "Atrasado" NO se guarda: se calcula por fecha. */
export type PlanStatus = "pendiente" | "en_curso" | "cumplido";

/** Catálogo de roles de proyecto: agregar uno nuevo es agregar una fila, sin tocar código. */
export interface RoleDef {
  key: string;
  label: string;
  active: boolean;
  /** Quien tiene este rol gestiona el contenido del proyecto (tareas, sprints, riesgos…) */
  manage: boolean;
  /** Quien tiene este rol aprueba los cambios del cliente y las puertas de decisión */
  approve: boolean;
  /** Rol imprescindible: todo proyecto debería tenerlo asignado */
  required: boolean;
  /** Qué se espera de quien tiene este rol (se muestra con el botón de información) */
  responsibilities: string[];
}

/** Una persona puede tener varios roles en un proyecto, y distintos roles en distintos proyectos. */
export interface RoleAssignment {
  id: ID;
  projectId: ID;
  userId: ID;
  roleKey: string;
}

/** Datos de ficha que hoy no existen en `projects` (en producción serían columnas nuevas). */
export interface ProjectMeta {
  projectId: ID;
  code: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
  notes: string;
  /** Carpeta del proyecto en SharePoint */
  sharepointUrl: string;
  /** Carpeta del proyecto en Autodesk Construction Cloud */
  accUrl: string;
  mode: ProjectMode;
  /** Duración típica del sprint (semanas) */
  sprintWeeks: 1 | 2;
  /** Reserva de contingencia sobre las horas proyectadas (%), según la incertidumbre */
  contingencyPct: number;
  /** Descubrimiento acotado: horas máximas y fecha límite */
  discoveryHours: number | null;
  discoveryEnd: string | null;
}

export type GateDecision = "pendiente" | "continuar" | "replantear" | "cancelar";

export interface Milestone {
  id: ID;
  projectId: ID;
  name: string;
  description: string;
  ownerId: ID | null;
  dueDate: string | null;
  status: PlanStatus;
  /** Puerta de decisión: se revisa lo aprendido y se decide cómo seguir */
  isGate?: boolean;
  gateCriteria?: string;
  gateDecision?: GateDecision;
  gateNote?: string;
}

export interface Deliverable {
  id: ID;
  projectId: ID;
  /** Opcional: el entregable puede colgar de un hito o del proyecto directamente */
  milestoneId: ID | null;
  name: string;
  description: string;
  ownerId: ID | null;
  dueDate: string | null;
  status: PlanStatus;
}

/**
 * Campos personalizados (estilo “propiedades” de Notion): el equipo define sus
 * propios campos (Fase, Disciplina, …) sin tocar código. Pueden ser globales
 * (valen para todos los proyectos y permiten filtrar y agrupar en el panel
 * general) o propios de un solo proyecto.
 */
export type FieldType = "texto" | "numero" | "seleccion" | "multiple" | "fecha" | "casilla";

export interface FieldOption {
  id: ID;
  label: string;
  color: string;
}

export interface FieldDef {
  id: ID;
  /** null = global (todos los proyectos); si no, el proyecto al que pertenece */
  projectId: ID | null;
  name: string;
  type: FieldType;
  /** Solo para "seleccion" y "multiple" */
  options: FieldOption[];
  sortOrder: number;
}

/** texto | número | id de opción (selección) | ids (múltiple) | fecha ISO | casilla */
export type FieldValue = string | number | boolean | string[] | null;

export interface Task {
  id: ID;
  /** Siempre presente: la fuente de verdad de a qué proyecto pertenece */
  projectId: ID;
  /**
   * Toda tarea se asigna a un hito (la programación se sigue por hitos y entregables).
   * Si tiene entregable, este campo SIEMPRE se deriva del hito del entregable.
   */
  milestoneId: ID | null;
  deliverableId: ID | null;
  name: string;
  description: string;
  assigneeId: ID | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Ya no se cargan a mano: sin inicio, y la fecha límite se hereda del entregable o del hito de la tarea */
  startDate: string | null;
  dueDate: string | null;
  kind: TaskKind;
  /** Horas estimadas (valor probable); mínimo y máximo son opcionales: si faltan se derivan de la confianza */
  estimateHours: number | null;
  estimateMin: number | null;
  estimateMax: number | null;
  confidence: Confidence | null;
  /** Sprint al que está asignada; null = está en el backlog */
  sprintId: ID | null;
  /** Fecha en que entró al sprint (si fue después del inicio, es alcance agregado) */
  sprintAddedAt: string | null;
  /** Orden de prioridad en el backlog (menor = más arriba) */
  rank: number;
  /** Solicitud de cambio del cliente de la que nació */
  changeRequestId: ID | null;
  /** Fecha real de cierre (se completa sola al pasar a “Hecha”): permite comparar plan vs real */
  completedAt: string | null;
  /** Archivada: tarea ya finalizada que se oculta del listado (sigue contando en avance e indicadores) */
  archived: boolean;
  archivedAt: string | null;
  /** Valores de los campos personalizados, por id de campo */
  custom: Record<ID, FieldValue>;
  /** Orden dentro de su columna en el Kanban */
  sortOrder: number;
  createdBy: ID | null;
  createdAt: string;
}

export type SprintStatus = "planificado" | "activo" | "cerrado";

export interface Sprint {
  id: ID;
  projectId: ID;
  number: number;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  /** % de la jornada que realmente se dedica al proyecto (reuniones, imprevistos, otros proyectos) */
  focusPct: number;
  /** Fotos al iniciar / cerrar el sprint (para velocidad y burndown) */
  committedHours: number | null;
  capacityHours: number | null;
  completedHours: number | null;
  reviewNotes: string;
  retroNotes: string;
}

export type ChangeStatus = "pendiente" | "aprobado" | "diferido" | "rechazado";

/**
 * Solicitud de cambio del cliente. Como el proyecto es de precio cerrado, un
 * cambio aprobado NO se factura aparte: sus horas se “absorben” y quedan
 * medidas para ver cuánto creció el alcance.
 */
export interface ChangeRequest {
  id: ID;
  projectId: ID;
  title: string;
  description: string;
  /** Quién lo pidió del lado del cliente (texto libre) */
  requestedBy: string;
  registeredBy: ID | null;
  createdAt: string;
  urgent: boolean;
  impactHours: number | null;
  impactDays: number | null;
  status: ChangeStatus;
  decidedBy: ID | null;
  decidedAt: string | null;
  decisionNote: string;
  /** Ítem que se creó al aprobarlo */
  taskId: ID | null;
  /** Se aprobó con un sprint en marcha (alcance que entró tarde) */
  duringSprint: boolean;
}

export type RiskKind = "riesgo" | "supuesto" | "desconocido";
export type RiskLevel = 1 | 2 | 3;
export type RiskStatus = "abierto" | "mitigado" | "ocurrido" | "cerrado";

export interface Risk {
  id: ID;
  projectId: ID;
  kind: RiskKind;
  title: string;
  description: string;
  probability: RiskLevel;
  impact: RiskLevel;
  ownerId: ID | null;
  mitigation: string;
  reviewDate: string | null;
  status: RiskStatus;
}

/** Línea base del plan; cada cambio aprobado crea una versión nueva. La v1 es el plan original. */
export interface Baseline {
  id: ID;
  projectId: ID;
  version: number;
  date: string;
  /** Horas estimadas del alcance en ese momento */
  scopeHours: number;
  endDate: string | null;
  reason: string;
  changeRequestId: ID | null;
}

export interface WorkData {
  sprints: Sprint[];
  changes: ChangeRequest[];
  risks: Risk[];
  baselines: Baseline[];
  fields: FieldDef[];
  roles: RoleDef[];
  assignments: RoleAssignment[];
  meta: Record<ID, ProjectMeta>;
  milestones: Milestone[];
  deliverables: Deliverable[];
  tasks: Task[];
  /** Proyectos que ya recibieron sus datos de ejemplo */
  seeded: Record<ID, true>;
}

/** Lo que la app anfitriona le presta a este módulo (el store real, o el seed del demo). */
export interface WorkEnv {
  projects: Project[];
  clients: Client[];
  users: User[];
  me: User;
  /** Minutos ya cargados en el registro de horas, por proyecto */
  minutesByProject: Record<ID, number>;
  /** Ausencias aprobadas (descuentan capacidad del sprint) */
  absences?: { userId: ID; dateFrom: string; dateTo: string }[];
}
