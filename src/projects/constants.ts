import type { PlanStatus, RoleDef, TaskPriority, TaskStatus } from "./types";

export const TASK_STATUS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "pendiente", label: "Pendiente", color: "var(--text-3)" },
  { key: "en_curso", label: "En curso", color: "var(--accent)" },
  { key: "en_revision", label: "En revisión", color: "var(--warning)" },
  { key: "hecha", label: "Hecha", color: "var(--success)" },
];

export const TASK_PRIORITY: { key: TaskPriority; label: string; color: string }[] = [
  { key: "baja", label: "Baja", color: "var(--text-3)" },
  { key: "media", label: "Media", color: "var(--accent)" },
  { key: "alta", label: "Alta", color: "var(--warning)" },
  { key: "urgente", label: "Urgente", color: "var(--danger)" },
];

export const PLAN_STATUS: { key: PlanStatus; label: string; color: string }[] = [
  { key: "pendiente", label: "Pendiente", color: "var(--text-3)" },
  { key: "en_curso", label: "En curso", color: "var(--accent)" },
  { key: "cumplido", label: "Cumplido", color: "var(--success)" },
];

/**
 * Roles de un proyecto. Los tres imprescindibles: Project Manager (cliente y
 * gestión; es quien aprueba), Líder técnico (soporte técnico) y Coordinador
 * (día a día con los modeladores). El Modelador ejecuta las tareas. El líder
 * funcional de área es opcional y de consulta; Referente y Líder comercial
 * quedan como roles opcionales de consulta. Cada rol lleva sus responsabilidades.
 */
export const DEFAULT_ROLES: RoleDef[] = [
  {
    key: "lider_proyecto", label: "Project Manager", active: true, manage: true, approve: true, required: true,
    responsibilities: [
      "Es el único interlocutor del cliente: recibe sus pedidos y comunica los avances.",
      "Define y mantiene el alcance, los hitos y los entregables del proyecto.",
      "Decide los cambios del cliente en un máximo de 48 horas (aprueba, difiere o rechaza).",
      "Aprueba las puertas de decisión en los proyectos híbridos.",
      "Controla las horas contra lo proyectado y avisa a gerencia ante desvíos.",
    ],
  },
  {
    key: "lider_tecnico", label: "Líder técnico", active: true, manage: true, approve: false, required: true,
    responsibilities: [
      "Da el soporte técnico al equipo y define los criterios y estándares de modelado.",
      "Revisa la calidad técnica de los entregables antes de emitirlos.",
      "Estima el impacto técnico de los cambios que pide el cliente.",
      "Resuelve los bloqueos técnicos que el coordinador le escala.",
      "Participa en las estimaciones y en las puertas de decisión.",
    ],
  },
  {
    key: "coordinador", label: "Coordinador", active: true, manage: true, approve: false, required: true,
    responsibilities: [
      "Conduce el día a día del proyecto con los modeladores.",
      "Reparte las tareas y cuida que nadie quede sobrecargado.",
      "Mantiene actualizado el estado de las tareas, los hitos y los entregables.",
      "Detecta bloqueos y desvíos a tiempo y los escala al Project Manager o al líder técnico.",
      "Prepara cada emisión junto al líder técnico.",
    ],
  },
  {
    key: "modelador", label: "Modelador", active: true, manage: false, approve: false, required: false,
    responsibilities: [
      "Ejecuta las tareas que se le asignan, con la calidad y los estándares acordados.",
      "Mantiene actualizado el estado de sus tareas.",
      "Carga sus horas del proyecto en el registro de tiempo.",
      "Avisa al coordinador de bloqueos, dudas o desvíos de horas apenas los detecta.",
      "Revisa su propio trabajo antes de pasarlo a revisión.",
    ],
  },
  {
    key: "lider_funcional", label: "Líder funcional de área", active: true, manage: false, approve: false, required: false,
    responsibilities: [
      "Es el responsable del área (la columna del organigrama) de la que salen las personas del proyecto.",
      "Asegura que las personas y las competencias necesarias estén disponibles.",
      "Resuelve los conflictos de disponibilidad entre proyectos.",
      "Consulta el avance del proyecto; no modifica su plan.",
    ],
  },
  {
    key: "referente", label: "Referente", active: true, manage: false, approve: false, required: false,
    responsibilities: [
      "Es un contacto de consulta del proyecto.",
      "Aporta contexto y criterio cuando se lo piden.",
      "Consulta el avance; no modifica el plan.",
    ],
  },
  {
    key: "lider_comercial", label: "Líder comercial", active: true, manage: false, approve: false, required: false,
    responsibilities: [
      "Mantiene la relación comercial con el cliente y el contrato (precio cerrado, sin adicionales).",
      "Conoce el alcance contratado para detectar pedidos que lo exceden.",
      "Consulta el estado del proyecto; no modifica el plan.",
    ],
  },
];

export const statusInfo = (k: TaskStatus) => TASK_STATUS.find((s) => s.key === k)!;
export const priorityInfo = (k: TaskPriority) => TASK_PRIORITY.find((s) => s.key === k)!;
export const planInfo = (k: PlanStatus) => PLAN_STATUS.find((s) => s.key === k)!;
