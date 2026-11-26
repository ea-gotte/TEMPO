import type { Project } from "../types";
import { addDays, uid } from "../utils";
import type { Deliverable, FieldDef, Milestone, ProjectMeta, ProjectMode, Risk, RiskKind, RiskLevel, Task } from "./types";

/**
 * Estructura inicial de un proyecto: la plantilla de su metodología o la copia de otro
 * proyecto. Todo es puro (no toca el almacén): devuelve lo que hay que agregar.
 */

/* ---------- Código del proyecto ---------- */

/** Código al principio del nombre: "PR_00218_BIM ADIF" → "PR_00218"; "OP-02284 BMO" → "OP-02284". */
export function projectCodeFromName(name: string): string | null {
  const m = name.trim().match(/^([A-Za-z]{1,5}[_-]\d{2,6})(?=$|[\s_\-–—.:])/);
  return m ? m[1].toUpperCase() : null;
}

/** Código a mostrar: el del nombre manda (automático); si el nombre no lo trae, el cargado en la ficha. */
export function projectCode(project: Pick<Project, "name">, meta?: Pick<ProjectMeta, "code"> | null): string {
  return projectCodeFromName(project.name) ?? meta?.code?.trim() ?? "";
}

/* ---------- Plantillas por metodología ---------- */

interface TplDeliverable { name: string; due: number }
interface TplMilestone {
  name: string; desc: string;
  /** Días desde el inicio del proyecto */
  start: number; due: number;
  deliverables: TplDeliverable[];
  gate?: string;
}
interface TplRisk { kind: RiskKind; title: string; description: string; probability: RiskLevel; impact: RiskLevel; mitigation: string }
export interface ProjectTemplate { milestones: TplMilestone[]; risks: TplRisk[] }

const RISK_INFO: TplRisk = {
  kind: "supuesto", title: "La información de partida llega completa y a tiempo",
  description: "Planos, modelos y requisitos del cliente disponibles al arranque.", probability: 2, impact: 3,
  mitigation: "Listar lo necesario en el acta de arranque y avisar por escrito cada faltante.",
};
const RISK_TEAM: TplRisk = {
  kind: "riesgo", title: "Disponibilidad del equipo asignado",
  description: "Las personas del proyecto comparten carga con otros proyectos.", probability: 2, impact: 2,
  mitigation: "Revisar la asignación mensual y avisar con anticipación los picos de carga.",
};

export const TEMPLATES: Record<ProjectMode, ProjectTemplate> = {
  planificado: {
    milestones: [
      { name: "Arranque y Plan de Ejecución BIM", desc: "Reunión de arranque, alcance acordado y BEP aprobado.", start: 0, due: 14,
        deliverables: [{ name: "Acta de arranque", due: 7 }, { name: "Plan de Ejecución BIM (BEP)", due: 14 }] },
      { name: "Modelo base", desc: "Modelos por disciplina y primera coordinación.", start: 15, due: 45,
        deliverables: [{ name: "Modelo base por disciplina", due: 40 }, { name: "Informe de coordinación inicial", due: 45 }] },
      { name: "Proyecto coordinado", desc: "Interferencias resueltas y documentación para revisión.", start: 46, due: 90,
        deliverables: [{ name: "Modelo coordinado", due: 80 }, { name: "Informe de interferencias resueltas", due: 85 }, { name: "Planos para revisión", due: 90 }] },
      { name: "Entrega final", desc: "Documentación completa y cierre con el cliente.", start: 91, due: 120,
        deliverables: [{ name: "Documentación final", due: 115 }, { name: "Modelo final y memoria técnica", due: 120 }] },
    ],
    risks: [
      { kind: "riesgo", title: "Cambios de alcance pedidos por el cliente", description: "Pedidos fuera de lo acordado en el arranque.", probability: 2, impact: 3, mitigation: "Registrar cada pedido como cambio del cliente y aprobarlo antes de ejecutarlo." },
      RISK_INFO,
      { kind: "riesgo", title: "Interferencias entre disciplinas detectadas tarde", description: "Conflictos que aparecen cerca de la entrega.", probability: 2, impact: 2, mitigation: "Rondas de coordinación desde el modelo base, no solo al final." },
      RISK_TEAM,
    ],
  },
  plan_correcciones: {
    milestones: [
      { name: "Arranque y Plan de Ejecución BIM", desc: "Reunión de arranque, alcance acordado y BEP aprobado.", start: 0, due: 14,
        deliverables: [{ name: "Acta de arranque", due: 7 }, { name: "Plan de Ejecución BIM (BEP)", due: 14 }] },
      { name: "Primera entrega", desc: "Modelo y documentación para revisión del cliente.", start: 15, due: 50,
        deliverables: [{ name: "Modelo para revisión", due: 45 }, { name: "Planos para revisión", due: 50 }] },
      { name: "Correcciones del cliente", desc: "Observaciones de la primera entrega resueltas y reenviadas.", start: 51, due: 75,
        deliverables: [{ name: "Entrega corregida", due: 75 }] },
      { name: "Entrega final", desc: "Documentación completa y cierre con el cliente.", start: 76, due: 100,
        deliverables: [{ name: "Documentación final", due: 95 }, { name: "Cierre y lecciones aprendidas", due: 100 }] },
    ],
    risks: [
      { kind: "riesgo", title: "Más rondas de corrección que las previstas", description: "Cada ronda extra consume horas no proyectadas.", probability: 2, impact: 3, mitigation: "Acordar la cantidad de rondas incluidas y registrar las adicionales como cambio." },
      { kind: "riesgo", title: "Observaciones del cliente fuera de alcance", description: "Correcciones que en realidad son pedidos nuevos.", probability: 2, impact: 2, mitigation: "Clasificar cada observación: corrección o cambio del cliente." },
      { kind: "riesgo", title: "Demora del cliente en revisar las entregas", description: "La revisión tardía corre las fechas siguientes.", probability: 2, impact: 2, mitigation: "Fijar plazo de revisión en el arranque y avisar el corrimiento por escrito." },
      RISK_INFO,
    ],
  },
  agil: {
    milestones: [
      { name: "Arranque y backlog inicial", desc: "Objetivos acordados y backlog priorizado con el cliente.", start: 0, due: 10,
        deliverables: [{ name: "Backlog priorizado", due: 10 }] },
      { name: "Primer incremento", desc: "Primera versión demostrable al cliente.", start: 11, due: 45,
        deliverables: [{ name: "Incremento 1", due: 45 }] },
      { name: "Segundo incremento", desc: "Segunda versión con lo priorizado tras la primera revisión.", start: 46, due: 80,
        deliverables: [{ name: "Incremento 2", due: 80 }] },
      { name: "Cierre", desc: "Entrega final y documentación.", start: 81, due: 100,
        deliverables: [{ name: "Entrega final y documentación", due: 100 }] },
    ],
    risks: [
      { kind: "riesgo", title: "Backlog sin priorizar por el cliente", description: "Sin prioridades claras el equipo trabaja en lo que no importa.", probability: 2, impact: 3, mitigation: "Revisión de prioridades con el cliente antes de cada sprint." },
      { kind: "supuesto", title: "El referente del cliente revisa cada sprint", description: "Hay una persona del cliente disponible para validar.", probability: 2, impact: 2, mitigation: "Agendar las revisiones de sprint al arranque." },
      { kind: "riesgo", title: "El alcance crece sin ajustar horas", description: "Se suman pedidos sin sacar otros.", probability: 3, impact: 2, mitigation: "Cada pedido nuevo entra al backlog y desplaza a otro de igual tamaño." },
      RISK_TEAM,
    ],
  },
  hibrido: {
    milestones: [
      { name: "Descubrimiento", desc: "Investigación acotada en tiempo y horas para bajar la incertidumbre.", start: 0, due: 21,
        deliverables: [{ name: "Informe de descubrimiento", due: 21 }] },
      { name: "Puerta de decisión", desc: "Se revisa lo aprendido y se decide cómo continuar.", start: 22, due: 25, deliverables: [],
        gate: "Alcance y horas estimados con confianza media o alta, y los riesgos principales con mitigación definida." },
      { name: "Primer incremento", desc: "Primera versión demostrable al cliente.", start: 26, due: 60,
        deliverables: [{ name: "Incremento 1", due: 60 }] },
      { name: "Entrega final", desc: "Entrega final y documentación.", start: 61, due: 100,
        deliverables: [{ name: "Entrega final y documentación", due: 100 }] },
    ],
    risks: [
      { kind: "desconocido", title: "Incógnitas técnicas sin resolver al cerrar el descubrimiento", description: "Lo que no se sepa al llegar a la puerta de decisión.", probability: 2, impact: 3, mitigation: "Una investigación corta (spike) por incógnita, con tope de horas." },
      { kind: "riesgo", title: "El descubrimiento supera su tope de horas", description: "La exploración se extiende sin decisión.", probability: 2, impact: 2, mitigation: "Tope de horas y fecha límite en la ficha; al llegar, se decide con lo que haya." },
      { kind: "riesgo", title: "El cliente espera fecha comprometida antes de la puerta", description: "Presión para comprometer plazo sin información.", probability: 2, impact: 2, mitigation: "Acordar en el arranque que la fecha se compromete después de la puerta de decisión." },
      RISK_INFO,
    ],
  },
};

/** Lo que se agrega a un proyecto al aplicarle una estructura */
export interface Structure {
  milestones: Milestone[];
  deliverables: Deliverable[];
  risks: Risk[];
  fields: FieldDef[];
  tasks: Task[];
}

/** Estructura de la plantilla de una metodología, con fechas a partir del inicio del proyecto. */
export function structureFromTemplate(projectId: string, mode: ProjectMode, startDate: string, ownerId: string | null): Structure {
  const tpl = TEMPLATES[mode];
  const milestones: Milestone[] = [];
  const deliverables: Deliverable[] = [];
  tpl.milestones.forEach((m, i) => {
    const ms: Milestone = {
      id: uid(), projectId, name: m.name, description: m.desc, ownerId,
      startDate: addDays(startDate, m.start), dueDate: addDays(startDate, m.due), status: "pendiente",
      // Cada hito depende del anterior: si uno se atrasa, los siguientes se corren
      dependsOn: i > 0 ? [milestones[i - 1].id] : [],
      ...(m.gate ? { isGate: true, gateCriteria: m.gate, gateDecision: "pendiente" as const } : {}),
    };
    milestones.push(ms);
    m.deliverables.forEach((d) => {
      deliverables.push({
        id: uid(), projectId, milestoneId: ms.id, name: d.name, description: "", ownerId,
        startDate: ms.startDate, dueDate: addDays(startDate, d.due), status: "pendiente",
      });
    });
  });
  const risks: Risk[] = tpl.risks.map((r) => ({ id: uid(), projectId, ...r, ownerId, reviewDate: addDays(startDate, 30), status: "abierto" }));
  return { milestones, deliverables, risks, fields: [], tasks: [] };
}

/** Lo mínimo del almacén que hace falta para copiar la estructura de un proyecto */
export interface StructureSource {
  milestones: Milestone[];
  deliverables: Deliverable[];
  risks: Risk[];
  fields: FieldDef[];
  tasks: Task[];
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/**
 * Copia la estructura de otro proyecto: hitos, entregables, riesgos y campos propios, y
 * opcionalmente sus tareas. Todo queda como recién planificado: pendiente, sin fechas reales
 * ni decisiones, y con las fechas corridas para que el plan arranque en `startDate`.
 */
export function copyStructure(
  src: StructureSource, sourceProjectId: string, targetProjectId: string, startDate: string,
  opts: { includeTasks: boolean; ownerId: string | null },
): Structure {
  const srcMs = src.milestones.filter((m) => m.projectId === sourceProjectId);
  const srcDel = src.deliverables.filter((d) => d.projectId === sourceProjectId);
  const dates = [...srcMs, ...srcDel].flatMap((x) => [x.startDate, x.dueDate]).filter((d): d is string => !!d).sort();
  const shiftDays = dates.length ? daysBetween(dates[0], startDate) : 0;
  const move = (d: string | null | undefined) => (d ? addDays(d, shiftDays) : null);

  const idMap = new Map<string, string>();
  for (const x of [...srcMs, ...srcDel]) idMap.set(x.id, uid());
  const mapDeps = (ids?: string[]) => (ids ?? []).map((id) => idMap.get(id)).filter((id): id is string => !!id);

  const milestones: Milestone[] = srcMs.map((m) => ({
    id: idMap.get(m.id)!, projectId: targetProjectId, name: m.name, description: m.description, ownerId: opts.ownerId,
    startDate: move(m.startDate), dueDate: move(m.dueDate), status: "pendiente", dependsOn: mapDeps(m.dependsOn),
    ...(m.isGate ? { isGate: true, gateCriteria: m.gateCriteria, gateDecision: "pendiente" as const } : {}),
  }));
  const deliverables: Deliverable[] = srcDel.map((d) => ({
    id: idMap.get(d.id)!, projectId: targetProjectId, milestoneId: d.milestoneId ? idMap.get(d.milestoneId) ?? null : null,
    name: d.name, description: d.description, ownerId: opts.ownerId,
    startDate: move(d.startDate), dueDate: move(d.dueDate), status: "pendiente", dependsOn: mapDeps(d.dependsOn),
  }));
  const risks: Risk[] = src.risks.filter((r) => r.projectId === sourceProjectId).map((r) => ({
    ...r, id: uid(), projectId: targetProjectId, ownerId: opts.ownerId, status: "abierto", reviewDate: addDays(startDate, 30),
  }));

  // Campos propios del proyecto de origen (los globales ya valen para todos)
  const fieldMap = new Map<string, string>();
  const fields: FieldDef[] = src.fields.filter((f) => f.projectId === sourceProjectId).map((f) => {
    const id = uid();
    fieldMap.set(f.id, id);
    return { ...f, id, projectId: targetProjectId, options: f.options.map((o) => ({ ...o })) };
  });

  const tasks: Task[] = !opts.includeTasks ? [] : src.tasks
    .filter((t) => t.projectId === sourceProjectId && !t.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t, i) => {
      const custom: Task["custom"] = {};
      for (const [k, v] of Object.entries(t.custom ?? {})) custom[fieldMap.get(k) ?? k] = v;
      return {
        ...t, id: uid(), projectId: targetProjectId,
        milestoneId: t.milestoneId ? idMap.get(t.milestoneId) ?? null : null,
        deliverableId: t.deliverableId ? idMap.get(t.deliverableId) ?? null : null,
        assigneeId: null, status: "pendiente", startDate: move(t.startDate), dueDate: move(t.dueDate),
        completedAt: null, archived: false, archivedAt: null, sprintId: null, sprintAddedAt: null,
        changeRequestId: null, reviewId: null, custom, rank: i * 10, sortOrder: i * 10,
        createdBy: opts.ownerId, createdAt: new Date().toISOString(),
      };
    });

  return { milestones, deliverables, risks, fields, tasks };
}

/** Último fin planificado de una estructura (para proponer el fin previsto del proyecto) */
export function structureEnd(s: Pick<Structure, "milestones" | "deliverables">): string | null {
  const ends = [...s.milestones, ...s.deliverables].map((x) => x.dueDate).filter((d): d is string => !!d).sort();
  return ends.length ? ends[ends.length - 1] : null;
}

/** ¿El proyecto tiene algo para copiar? */
export function hasStructure(src: StructureSource, projectId: string): boolean {
  return src.milestones.some((m) => m.projectId === projectId) || src.deliverables.some((d) => d.projectId === projectId);
}
