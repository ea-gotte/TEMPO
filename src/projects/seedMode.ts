import type { Project } from "../types";
import { addDays, uid, weekStart } from "../utils";
import { sumHours } from "./agile";
import { defaultMilestone } from "./logic";
import type { Baseline, ChangeRequest, Confidence, Milestone, ProjectMeta, ProjectMode, Risk, Sprint, Task } from "./types";

/**
 * Datos de ejemplo de la metodología (modo del proyecto, sprints, cambios del
 * cliente, riesgos y línea base). Todo relativo a hoy. Solo para la demo.
 */

interface Args {
  project: Project;
  index: number;
  now: string;
  allDone: boolean;
  tasks: Task[];
  milestones: Milestone[];
  meta: ProjectMeta;
  pick: (i: number) => string | null;
}

export interface Seeded {
  tasks: Task[];
  milestones: Milestone[];
  meta: ProjectMeta;
  sprints: Sprint[];
  changes: ChangeRequest[];
  risks: Risk[];
  baselines: Baseline[];
}

const MODES: ProjectMode[] = ["planificado", "agil", "hibrido", "agil", "planificado", "planificado"];

const GOALS = [
  "Cerrar el relevamiento y dejar lista la base del modelo",
  "Modelo estructural coordinado con instalaciones",
  "Detectar interferencias y emitir planos para revisión",
  "Resolver los comentarios del cliente y avanzar la memoria",
];

export function seedMethod(a: Args): Seeded {
  const { project, index, now, allDone, pick } = a;
  const mode: ProjectMode = allDone ? "planificado" : MODES[index % MODES.length];
  const weeks: 1 | 2 = index % 3 === 0 ? 1 : 2;
  const meta: ProjectMeta = {
    ...a.meta, mode, sprintWeeks: mode === "planificado" ? 2 : weeks, contingencyPct: mode === "hibrido" ? 25 : mode === "agil" ? 15 : 10,
    discoveryHours: mode === "hibrido" ? 40 : null, discoveryEnd: mode === "hibrido" ? addDays(now, 5) : null,
  };
  let tasks: Task[] = a.tasks.map((t, i): Task => {
    const open = t.status !== "hecha";
    const confs: Confidence[] = !open ? ["alta"] : mode === "hibrido" ? ["baja", "media", "baja", "media", "alta"] : mode === "agil" ? ["media", "media", "alta", "baja"] : ["alta", "alta", "media"];
    return {
      ...t, rank: i * 10, confidence: confs[i % confs.length],
      kind: (mode === "planificado" ? "tarea" : i % 5 === 3 ? "bug" : "historia") as Task["kind"],
    };
  });
  let milestones = a.milestones;

  /* ---------- Descubrimiento (híbrido): spikes y puerta de decisión ---------- */
  if (mode === "hibrido") {
    const gate: Milestone = {
      id: uid(), projectId: project.id, name: "Puerta: decidir si seguimos", ownerId: pick(0), dueDate: meta.discoveryEnd, status: "en_curso",
      description: "Cierre del descubrimiento: se revisa lo aprendido y se decide cómo continuar.",
      isGate: true, gateDecision: "pendiente", gateNote: "",
      gateCriteria: "Viabilidad técnica validada · estimación del desarrollo con rango acotado · presupuesto y alcance aprobados por el cliente",
    };
    milestones = [gate, ...milestones];
    const spike = (name: string, desc: string, hours: number, status: Task["status"], from: number, to: number, i: number): Task => ({
      id: uid(), projectId: project.id, milestoneId: gate.id, deliverableId: null, name, description: desc, assigneeId: pick(i), status, priority: "alta",
      startDate: addDays(now, from), dueDate: addDays(now, to), kind: "spike", estimateHours: hours, estimateMin: null, estimateMax: null, confidence: "media",
      completedAt: status === "hecha" ? addDays(now, to) : null, archived: false, archivedAt: null, custom: {}, sprintId: null, sprintAddedAt: null, rank: -100 + i, changeRequestId: null,
      sortOrder: -10 + i, createdBy: pick(0), createdAt: new Date().toISOString(),
    });
    tasks = [
      spike("Spike: validar la viabilidad técnica", "Probar la integración con el sistema del cliente en un entorno de prueba.", 10, "hecha", -16, -10, 0),
      spike("Prototipo de la solución", "Prototipo descartable para validar el enfoque con el cliente.", 16, "hecha", -9, -3, 1),
      spike("Estimar el desarrollo con el equipo", "Sesión de estimación con rangos y nivel de confianza.", 6, "en_curso", -2, 3, 2),
      ...tasks,
    ];
  }

  /* ---------- Línea base v1 (plan original) ---------- */
  const baselines: Baseline[] = [{
    id: uid(), projectId: project.id, version: 1, date: meta.startDate ?? addDays(now, -50), scopeHours: sumHours(tasks.filter((t) => t.kind !== "spike")),
    endDate: meta.endDate, reason: "Plan original", changeRequestId: null,
  }];

  /* ---------- Sprints ---------- */
  const sprints: Sprint[] = [];
  // En un proyecto híbrido los sprints empiezan recién cuando la puerta de decisión dice “seguir”
  const agileLike = mode === "agil" && !allDone;
  if (agileLike) {
    const len = meta.sprintWeeks * 7;
    // El sprint en marcha arranca el lunes de esta semana: casi siempre estamos a mitad de camino
    const activeStart = weekStart(now);
    const mk = (n: number, status: Sprint["status"], offset: number): Sprint => {
      const start = addDays(activeStart, offset * len);
      return {
        id: uid(), projectId: project.id, number: n, name: `Sprint ${n}`, goal: GOALS[(n - 1) % GOALS.length], startDate: start, endDate: addDays(start, len - 3), status,
        focusPct: 70, committedHours: null, capacityHours: null, completedHours: null, reviewNotes: "", retroNotes: "",
      };
    };
    const s1 = mk(1, "cerrado", -2), s2 = mk(2, "cerrado", -1), s3 = mk(3, "activo", 0), s4 = mk(4, "planificado", 1);
    sprints.push(s1, s2, s3, s4);
    const done = tasks.filter((t) => t.status === "hecha" && t.kind !== "spike");
    for (const t of done) t.sprintId = !t.completedAt || t.completedAt < s2.startDate ? s1.id : t.completedAt < s3.startDate ? s2.id : s3.id;
    const openT = tasks.filter((t) => t.status !== "hecha" && t.kind !== "spike").sort((x, y) => (x.dueDate ?? "").localeCompare(y.dueDate ?? ""));
    let added = false;
    for (const t of openT) {
      if (t.status === "en_curso" || t.status === "en_revision") {
        t.sprintId = s3.id;
        t.sprintAddedAt = !added ? addDays(s3.startDate, 2) : s3.startDate; // un ítem entró tarde: alcance agregado
        added = true;
      }
    }
    openT.filter((t) => !t.sprintId).slice(0, 3).forEach((t) => { t.sprintId = s4.id; });
    for (const t of done.filter((x) => x.sprintId === s3.id)) t.sprintAddedAt = s3.startDate;
    // Fotos de cada sprint
    [s1, s2].forEach((s, k) => {
      const hrs = sumHours(tasks.filter((t) => t.sprintId === s.id && t.status === "hecha"));
      s.completedHours = hrs >= 20 ? hrs : 32 + k * 12;
      s.committedHours = Math.round(s.completedHours * (1.12 + k * 0.05));
      s.capacityHours = Math.round(s.committedHours * 1.2);
      s.reviewNotes = k === 0 ? "El cliente aprobó la base del modelo. Pidió ajustar el formato de los planos." : "Demo del modelo coordinado. Aparecieron dos cambios de alcance.";
      s.retroNotes = k === 0 ? "Estimamos corto el relevamiento. Acordamos reservar más tiempo para revisiones." : "Mejoró el flujo de revisión. Falta definir antes los criterios de aceptación.";
    });
    const inS3 = tasks.filter((t) => t.sprintId === s3.id);
    s3.committedHours = sumHours(inS3.filter((t) => (t.sprintAddedAt ?? s3.startDate) <= s3.startDate));
    s3.capacityHours = Math.round(s3.committedHours * 1.25);
    // Ideas todavía sin comprometer (una sin estimar, para ver cómo se marca)
    const ideas: [string, number | null, Confidence][] = [
      ["Mejorar la nomenclatura de capas y familias", 8, "media"], ["Plantilla de reporte de interferencias", 12, "media"],
      ["Automatizar la exportación de planos a PDF", 16, "baja"], ["Documentar el flujo de trabajo del equipo", null, "baja"],
    ];
    ideas.forEach(([name, h, conf], i) => tasks.push({
      id: uid(), projectId: project.id, milestoneId: defaultMilestone(milestones, project.id)?.id ?? null, deliverableId: null, name, description: "", assigneeId: null, status: "pendiente", priority: "media",
      startDate: null, dueDate: null, kind: "historia", estimateHours: h, estimateMin: null, estimateMax: null, confidence: conf, completedAt: null, archived: false, archivedAt: null, custom: {},
      sprintId: null, sprintAddedAt: null, rank: 500 + i * 10, changeRequestId: null, sortOrder: 800 + i, createdBy: pick(0), createdAt: new Date().toISOString(),
    }));
    // Backlog priorizado: lo que no entró a ningún sprint
    tasks.filter((t) => !t.sprintId && t.status !== "hecha" && t.kind !== "spike").forEach((t, i) => { t.rank = i * 10; });
  }

  /* ---------- Cambios del cliente (precio cerrado: se absorben) ---------- */
  const changes: ChangeRequest[] = [];
  const active = sprints.find((s) => s.status === "activo");
  type Spec = [string, string, string, number, number, ChangeRequest["status"], number, boolean, number | null];
  const specs: Spec[] = allDone ? [] : [
    // título, descripción, quién pide, horas, días, estado, hace cuántos días, urgente, ¿entra al sprint activo?
    ...(index === 0 ? ([
      ["Agregar el nivel de subsuelo al modelo", "El cliente sumó un nivel de estacionamiento no previsto.", "M. Herrera (cliente)", 30, 5, "aprobado", 25, false, null],
      ["Mover los accesos de camiones", "Cambió la ubicación de los accesos tras la reunión con el municipio.", "M. Herrera (cliente)", 12, 2, "pendiente", 3, false, null],
    ] as Spec[]) : []),
    ...(index === 1 ? ([
      ["Tablero de avance para el cliente", "Reporte semanal con avance por torre.", "L. Prado (cliente)", 24, 3, "aprobado", 20, false, null],
      ["Ajustar entregables al estándar del cliente", "Cambiaron la plantilla de planos y la nomenclatura.", "L. Prado (cliente)", 12, 0, "aprobado", 5, true, 1],
      ["Incorporar la segunda torre al modelo", "Piden sumar la torre B con el mismo nivel de detalle.", "L. Prado (cliente)", 60, 14, "pendiente", 2, true, null],
      ["Exportar también a otro formato BIM", "Para un consultor externo del cliente.", "L. Prado (cliente)", 16, 2, "diferido", 12, false, null],
      ["Rediseñar la fachada completa", "Cambio de concepto arquitectónico.", "L. Prado (cliente)", 80, 20, "rechazado", 30, false, null],
    ] as Spec[]) : []),
    ...(index === 2 ? ([
      ["Integrar sensores adicionales al prototipo", "Sumar dos tipos de sensor al alcance de la prueba.", "R. Soto (cliente)", 20, 3, "aprobado", 8, false, null],
      ["Ampliar el alcance del módulo de análisis", "Quieren más indicadores de los previstos.", "R. Soto (cliente)", 40, 7, "pendiente", 6, false, null],
    ] as Spec[]) : []),
    ...(index === 3 ? ([
      ["Variante de diseño con luminarias LED", "Comparar dos opciones de iluminación.", "A. Vidal (cliente)", 8, 0, "aprobado", 4, true, 1],
      ["Agregar vista de costos al modelo", "Quieren ver costos por elemento.", "A. Vidal (cliente)", 16, 3, "pendiente", 1, false, null],
      ["Cambiar el color de todos los elementos", "Preferencia estética sin impacto técnico.", "A. Vidal (cliente)", 4, 0, "rechazado", 9, false, null],
    ] as Spec[]) : []),
  ];

  let scope = baselines[0].scopeHours;
  let end = baselines[0].endDate;
  let version = 1;
  for (const [title, description, requestedBy, impactHours, impactDays, status, ago, urgent, intoActive] of specs) {
    const createdAt = addDays(now, -ago);
    const decided = status !== "pendiente";
    const decidedAt = decided ? addDays(createdAt, 1) : null;
    const ch: ChangeRequest = {
      id: uid(), projectId: project.id, title, description, requestedBy, registeredBy: pick(1), createdAt, urgent, impactHours, impactDays: impactDays || null, status,
      decidedBy: decided ? pick(0) : null, decidedAt, taskId: null, duringSprint: false,
      decisionNote: status === "rechazado" ? "Fuera de lo acordado: se propone tratarlo en una segunda etapa." : status === "diferido" ? "Se revisa en el próximo trimestre." : status === "aprobado" ? "Aprobado por el Project Manager; se absorbe en el presupuesto." : "",
    };
    if (status === "aprobado") {
      scope = Math.round((scope + impactHours) * 10) / 10;
      if (end && impactDays) end = addDays(end, impactDays);
      const inSprint = intoActive !== null && !!active;
      ch.duringSprint = !!active && decidedAt! >= active.startDate;
      const task: Task = {
        id: uid(), projectId: project.id, milestoneId: defaultMilestone(milestones, project.id)?.id ?? null, deliverableId: null, name: `Cambio: ${title}`, description, assigneeId: pick(index + 2), status: inSprint ? "en_curso" : "pendiente", priority: urgent ? "alta" : "media",
        startDate: null, dueDate: end ? addDays(end, -2) : null, kind: "cambio", estimateHours: impactHours, estimateMin: null, estimateMax: null, confidence: "media", completedAt: null, archived: false, archivedAt: null, custom: {},
        sprintId: inSprint ? active!.id : null, sprintAddedAt: inSprint ? decidedAt : null, rank: -50, changeRequestId: ch.id, sortOrder: 900, createdBy: pick(1), createdAt: new Date().toISOString(),
      };
      tasks.push(task);
      ch.taskId = task.id;
      version++;
      baselines.push({ id: uid(), projectId: project.id, version, date: decidedAt!, scopeHours: scope, endDate: end, reason: `Cambio aprobado: ${title}`, changeRequestId: ch.id });
    }
    changes.push(ch);
  }
  if (end) meta.endDate = end;
  if (active) active.committedHours = sumHours(tasks.filter((t) => t.sprintId === active.id && (t.sprintAddedAt ?? active.startDate) <= active.startDate));

  /* ---------- Riesgos, supuestos y desconocidos ---------- */
  type R = [Risk["kind"], string, string, 1 | 2 | 3, 1 | 2 | 3, string, number | null, Risk["status"]];
  const base: R[] = [
    ["riesgo", "Demoras en la entrega de información del cliente", "Sin planos y datos a tiempo se frena el modelado.", 2, 2, "Pedir la información crítica en la reunión de arranque y fijar fechas.", 10, "abierto"],
    ["riesgo", "Rotación o ausencia de personas clave", "El conocimiento del modelo está concentrado en dos personas.", 1, 3, "Documentar el flujo de trabajo y rotar revisiones.", 25, "abierto"],
    ["supuesto", "El cliente aprueba los entregables en 5 días hábiles", "Si tarda más, se corre el calendario de las etapas siguientes.", 2, 2, "Confirmar el plazo por escrito.", -4, "abierto"],
  ];
  const hybridExtra: R[] = [
    ["desconocido", "No conocemos la API del sistema del cliente", "Falta documentación; la integración podría ser mucho más costosa.", 3, 3, "Spike de integración en el descubrimiento.", 3, "abierto"],
    ["supuesto", "El cliente entrega datos de prueba antes de la semana 2", "Sin datos reales no se puede validar el prototipo.", 2, 3, "", 4, "abierto"],
    ["riesgo", "El alcance del módulo de análisis podría duplicarse", "Hay pedidos informales de indicadores adicionales.", 2, 3, "", -2, "abierto"],
    ["desconocido", "Rendimiento con el volumen real de datos", "No se probó con datos reales.", 2, 2, "Prueba de carga en el prototipo.", 12, "abierto"],
  ];
  const agileExtra: R[] = [
    ["riesgo", "Cambios constantes del cliente durante el sprint", "Los pedidos urgentes desplazan el trabajo comprometido.", 3, 2, "Regla de intercambio: entra uno, sale uno de igual esfuerzo.", 6, "abierto"],
  ];
  const risks: Risk[] = (mode === "hibrido" ? [...hybridExtra, ...base.slice(0, 2)] : mode === "agil" ? [...agileExtra, ...base] : base).map((r, i) => ({
    id: uid(), projectId: project.id, kind: r[0], title: r[1], description: r[2], probability: r[3], impact: r[4], mitigation: r[5], ownerId: pick(i),
    reviewDate: r[6] === null ? null : addDays(now, r[6]), status: allDone ? "cerrado" : r[7],
  }));

  return { tasks, milestones, meta, sprints, changes, risks, baselines };
}
