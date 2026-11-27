import { today, uid } from "../utils";
import { escapeExcelFormula } from "./changeReport";
import { PLAN_STATUS, TASK_PRIORITY, TASK_STATUS } from "./constants";
import type { Deliverable, Milestone, PlanStatus, Task, TaskPriority, TaskStatus } from "./types";

/**
 * Plan del proyecto en Excel: se exporta una planilla con lo que el proyecto ya
 * tiene (o vacía), se completa y se vuelve a importar.
 *
 * Una fila por hito, entregable o tarea. La jerarquía sale del orden: cada
 * entregable cuelga del hito que tiene arriba y cada tarea del entregable (o
 * hito) que tiene arriba. La columna ID identifica lo que ya existía: con ID se
 * actualiza, sin ID se crea. Importar nunca borra nada.
 */

export type PlanRowType = "hito" | "entregable" | "tarea";
type Cell = string | number | null;

export const PLAN_SHEET = "Plan";
export const PLAN_HEADERS = ["Tipo", "Nombre", "Responsable", "Inicio", "Fin", "Estado", "Horas estimadas", "Prioridad", "Descripción", "ID (no tocar)"] as const;
const COL = { type: 0, name: 1, owner: 2, start: 3, end: 4, status: 5, hours: 6, priority: 7, description: 8, id: 9 };
const TYPE_LABEL: Record<PlanRowType, string> = { hito: "Hito", entregable: "Entregable", tarea: "Tarea" };

export interface PlanUser {
  id: string;
  name: string;
  email?: string | null;
}

export interface PlanSource {
  projectId: string;
  milestones: Milestone[];
  deliverables: Deliverable[];
  tasks: Task[];
  users: PlanUser[];
}

/* ---------- Fechas: Excel las guarda como número de días ---------- */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86400000;

export function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / DAY);
}

const pad = (n: number) => String(n).padStart(2, "0");
const validYMD = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 1990 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Celda de fecha → AAAA-MM-DD. null = vacía; undefined = no se entiende. */
export function cellToISO(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number") {
    if (!isFinite(v) || v < 32874 || v > 73415) return undefined; // 1990 a 2100
    const dt = new Date(EXCEL_EPOCH + Math.floor(v) * DAY);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYMD(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : undefined;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validYMD(y, +m[2], +m[1]) ? `${y}-${pad(+m[2])}-${pad(+m[1])}` : undefined;
  }
  return undefined;
}

/* ---------- Texto ---------- */

/** Sin tildes, en minúsculas y con espacios simples: para comparar lo que escribe una persona. */
export const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Texto de una celda; saca el apóstrofe que se agrega al exportar para que Excel no lo tome como fórmula. */
const text = (v: unknown) => {
  const s = v instanceof Date ? "" : String(v ?? "").trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
};

function parseType(v: unknown): PlanRowType | null {
  const s = norm(v);
  if (s.startsWith("hito")) return "hito";
  if (s.startsWith("entreg")) return "entregable";
  if (s.startsWith("tarea")) return "tarea";
  return null;
}

const DONE = ["hecha", "hecho", "cumplido", "cumplida", "terminado", "terminada", "completado", "completada", "finalizado", "finalizada"];
function parseStatus(v: unknown, type: PlanRowType): PlanStatus | TaskStatus | null {
  const s = norm(v).replace(/_/g, " ");
  if (s === "pendiente") return "pendiente";
  if (s === "en curso" || s === "en proceso") return "en_curso";
  if (s === "en revision") return type === "tarea" ? "en_revision" : "en_curso";
  if (DONE.includes(s)) return type === "tarea" ? "hecha" : "cumplido";
  return null;
}

function parseHours(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/\s*h(s|oras)?\.?$/i, "").replace(",", "."));
  return isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : undefined;
}

/** Busca a la persona por email o por nombre (exacto, o el único que empieza igual). */
function findUser(v: string, users: PlanUser[]): PlanUser | null {
  const s = norm(v);
  const exact = users.filter((u) => norm(u.email) === s || norm(u.name) === s);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const words = s.split(" ");
  const partial = users.filter((u) => words.every((w) => norm(u.name).split(" ").includes(w)));
  return partial.length === 1 ? partial[0] : null;
}

/* ---------- Exportar ---------- */

const statusLabel = (type: PlanRowType, key: string) =>
  (type === "tarea" ? TASK_STATUS : PLAN_STATUS).find((s) => s.key === key)?.label ?? "Pendiente";

/** Las filas del plan, en el orden que define la jerarquía. */
export function planRows(src: PlanSource): Cell[][] {
  const nameOf = (id: string | null | undefined) => (id ? src.users.find((u) => u.id === id)?.name ?? "" : "");
  const date = (iso: string | null | undefined) => (iso ? isoToSerial(iso) : null);
  const byDue = <T extends { dueDate: string | null; name: string }>(a: T, b: T) =>
    (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || a.name.localeCompare(b.name);
  const str = (s: string) => escapeExcelFormula(s ?? "");

  const milestones = src.milestones.filter((m) => m.projectId === src.projectId).sort(byDue);
  const deliverables = src.deliverables.filter((d) => d.projectId === src.projectId);
  const tasks = src.tasks.filter((t) => t.projectId === src.projectId && !t.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const msIds = new Set(milestones.map((m) => m.id));
  const delIds = new Set(deliverables.map((d) => d.id));

  const rows: Cell[][] = [];
  const planRow = (type: "hito" | "entregable", x: Milestone | Deliverable) =>
    rows.push([TYPE_LABEL[type], str(x.name), nameOf(x.ownerId), date(x.startDate), date(x.dueDate), statusLabel(type, x.status), null, null, str(x.description), x.id]);
  const taskRow = (t: Task) =>
    rows.push(["Tarea", str(t.name), nameOf(t.assigneeId), null, null, statusLabel("tarea", t.status), t.estimateHours, TASK_PRIORITY.find((p) => p.key === t.priority)?.label ?? "", str(t.description), t.id]);
  const withTasks = (d: Deliverable) => {
    planRow("entregable", d);
    tasks.filter((t) => t.deliverableId === d.id).forEach(taskRow);
  };

  // Lo que no cuelga de ningún hito va primero: así ninguna fila de arriba se lo apropia
  tasks.filter((t) => !(t.deliverableId && delIds.has(t.deliverableId)) && !(t.milestoneId && msIds.has(t.milestoneId))).forEach(taskRow);
  deliverables.filter((d) => !(d.milestoneId && msIds.has(d.milestoneId))).sort(byDue).forEach(withTasks);
  for (const m of milestones) {
    planRow("hito", m);
    tasks.filter((t) => t.milestoneId === m.id && !(t.deliverableId && delIds.has(t.deliverableId))).forEach(taskRow);
    deliverables.filter((d) => d.milestoneId === m.id).sort(byDue).forEach(withTasks);
  }
  return rows;
}

const HELP: Cell[][] = [
  ["Cómo completar el plan"],
  [],
  ["1.", "Completá la hoja «Plan»: una fila por hito, entregable o tarea."],
  ["2.", "El orden manda: cada entregable cuelga del hito que tiene arriba, y cada tarea del entregable (o del hito) que tiene arriba."],
  ["3.", "Guardá el archivo y subilo en el proyecto, pestaña Plan, botón «Importar Excel». Antes de guardar vas a ver un resumen de lo que cambia."],
  [],
  ["Columna", "Qué va"],
  ["Tipo", "Hito, Entregable o Tarea."],
  ["Nombre", "Obligatorio."],
  ["Responsable", "Nombre o email de la persona, como figura en TEMPO (ver la hoja «Listas»). Vacío = sin asignar."],
  ["Inicio / Fin", "Fechas planificadas (dd/mm/aaaa). «Fin» es la fecha del hito o de la entrega. Las tareas no llevan fechas: toman la de su entregable o hito."],
  ["Estado", "Hitos y entregables: Pendiente, En curso o Cumplido. Tareas: Pendiente, En curso, En revisión o Hecha. Vacío = Pendiente."],
  ["Horas estimadas", "Solo tareas."],
  ["Prioridad", "Solo tareas: Baja, Media, Alta o Urgente. Vacío = Media."],
  ["ID (no tocar)", "Identifica lo que ya existe en TEMPO. Dejalo como está para actualizar esa fila; dejalo vacío en las filas nuevas."],
  [],
  ["Para tener en cuenta"],
  ["•", "Importar nunca borra: lo que saques del archivo sigue en el proyecto. Para borrar, hacelo en TEMPO."],
  ["•", "Si copiás una fila para crear otra, borrale el ID a la copia."],
  ["•", "Para mover una tarea a otro hito o entregable, mové la fila debajo de él."],
  [],
  ["Ejemplo"],
  ["Tipo", "Nombre", "Responsable", "Inicio", "Fin", "Estado", "Horas estimadas", "Prioridad"],
  ["Hito", "Anteproyecto aprobado", "Ana Ríos", "01/03/2027", "31/03/2027", "Pendiente", "", ""],
  ["Tarea", "Reunión de inicio con el cliente", "Ana Ríos", "", "", "Hecha", 2, "Media"],
  ["Entregable", "Memoria descriptiva", "Martín Paz", "05/03/2027", "20/03/2027", "En curso", "", ""],
  ["Tarea", "Redactar la memoria", "Martín Paz", "", "", "En curso", 16, "Alta"],
  ["Tarea", "Revisión interna", "Ana Ríos", "", "", "Pendiente", 4, "Media"],
  ["Entregable", "Planos generales", "Lucía Vega", "10/03/2027", "31/03/2027", "Pendiente", "", ""],
];

/** Las tres hojas del archivo: el plan, cómo completarlo y los valores que se aceptan. */
export function planWorkbookSheets(src: PlanSource & { projectName: string; team: PlanUser[] }): { Plan: Cell[][]; "Cómo completar": Cell[][]; Listas: Cell[][] } {
  const people = [...src.team, ...src.users.filter((u) => !src.team.some((t) => t.id === u.id))];
  const lists: Cell[][] = [["Tipo", "Estado (hitos y entregables)", "Estado (tareas)", "Prioridad", "Personas", "Email"]];
  const cols: string[][] = [Object.values(TYPE_LABEL), PLAN_STATUS.map((s) => s.label), TASK_STATUS.map((s) => s.label), TASK_PRIORITY.map((p) => p.label)];
  const len = Math.max(people.length, ...cols.map((c) => c.length));
  for (let i = 0; i < len; i++) lists.push([...cols.map((c) => c[i] ?? null), people[i]?.name ?? null, people[i]?.email ?? null]);
  return {
    Plan: [[...PLAN_HEADERS], ...planRows(src)],
    "Cómo completar": [[`Proyecto: ${src.projectName}`], [`Exportado el ${today().split("-").reverse().join("/")}`], [], ...HELP],
    Listas: lists,
  };
}

export function planFileName(codeOrName: string, date = today()): string {
  const clean = codeOrName.replace(/[/\\?%*:|"<>]/g, "_").trim().replace(/\s+/g, "_") || "proyecto";
  return `Plan_${clean}_${date}.xlsx`;
}

/** Arma el libro de Excel (se le pasa la librería para poder probarlo sin descargar nada). */
export function buildPlanWorkbook(XLSX: typeof import("xlsx"), src: PlanSource & { projectName: string; team: PlanUser[] }) {
  const sheets = planWorkbookSheets(src);
  const wb = XLSX.utils.book_new();

  const plan = XLSX.utils.aoa_to_sheet(sheets.Plan);
  // Inicio y Fin son fechas de verdad en Excel (se guardan como número y se muestran dd/mm/aaaa)
  for (let r = 1; r < sheets.Plan.length; r++) {
    for (const c of [COL.start, COL.end]) {
      const cell = plan[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = "dd/mm/yyyy";
    }
  }
  plan["!cols"] = [12, 44, 24, 12, 12, 14, 10, 11, 50, 14].map((wch) => ({ wch }));
  plan["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, sheets.Plan.length - 1), c: PLAN_HEADERS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, plan, PLAN_SHEET);

  const help = XLSX.utils.aoa_to_sheet(sheets["Cómo completar"]);
  help["!cols"] = [16, 60, 22, 12, 12, 14, 16, 12].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, help, "Cómo completar");

  const lists = XLSX.utils.aoa_to_sheet(sheets.Listas);
  lists["!cols"] = [14, 28, 18, 12, 30, 34].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, lists, "Listas");
  return wb;
}

/** Arma el Excel y lo descarga. */
export async function downloadPlanWorkbook(src: PlanSource & { projectName: string; team: PlanUser[] }, fileName: string): Promise<void> {
  const XLSX = await import("xlsx");
  XLSX.writeFile(buildPlanWorkbook(XLSX, src), fileName);
}

/* ---------- Importar ---------- */

export interface PlanImportItem {
  /** Fila del Excel (para los avisos) */
  line: number;
  type: PlanRowType;
  /** Id del elemento: el que ya tenía o uno nuevo */
  id: string;
  isNew: boolean;
  /** false = la fila es igual a lo que ya hay en el proyecto */
  changed: boolean;
  name: string;
  description: string;
  ownerId: string | null;
  /** Hitos y entregables */
  startDate: string | null;
  dueDate: string | null;
  status: PlanStatus | TaskStatus;
  /** Tareas */
  estimateHours: number | null;
  priority: TaskPriority;
  /** De quién cuelga, según el orden de las filas */
  milestoneId: string | null;
  deliverableId: string | null;
}

export interface PlanIssue {
  line: number;
  /** Un error impide importar; un aviso no */
  level: "error" | "aviso";
  message: string;
}

export interface PlanImport {
  items: PlanImportItem[];
  issues: PlanIssue[];
}

/** Lee las filas de la hoja «Plan» (con su encabezado) contra lo que el proyecto ya tiene. */
export function parsePlan(table: unknown[][], src: PlanSource, newId: () => string = uid): PlanImport {
  const issues: PlanIssue[] = [];
  const items: PlanImportItem[] = [];
  const headerAt = table.findIndex((r) => norm(r?.[COL.type]) === "tipo" && norm(r?.[COL.name]) === "nombre");
  if (headerAt < 0) {
    return { items, issues: [{ line: 1, level: "error", message: "No se encontró la hoja «Plan» con sus columnas (Tipo, Nombre, …). Usá la planilla que se descarga del proyecto, sin cambiarle las columnas." }] };
  }
  const header = table[headerAt].map(norm);
  const expected = PLAN_HEADERS.map(norm);
  if (expected.some((h, i) => !header[i]?.startsWith(h.split(" (")[0]))) {
    return { items, issues: [{ line: headerAt + 1, level: "error", message: "Las columnas no coinciden con las de la planilla. Descargala de nuevo y pasá ahí los datos." }] };
  }

  const ms = new Map(src.milestones.filter((x) => x.projectId === src.projectId).map((x) => [x.id, x]));
  const del = new Map(src.deliverables.filter((x) => x.projectId === src.projectId).map((x) => [x.id, x]));
  const tk = new Map(src.tasks.filter((x) => x.projectId === src.projectId).map((x) => [x.id, x]));
  const seen = new Set<string>();
  let curM: string | null = null;
  let curD: string | null = null;

  for (let r = headerAt + 1; r < table.length; r++) {
    const row = table[r] ?? [];
    const line = r + 1;
    const err = (message: string) => issues.push({ line, level: "error", message });
    const warn = (message: string) => issues.push({ line, level: "aviso", message });
    if (row.slice(0, PLAN_HEADERS.length).every((c) => text(c) === "")) continue;

    const name = text(row[COL.name]);
    const type = parseType(row[COL.type]);
    if (!type) {
      err(text(row[COL.type]) ? `Tipo «${text(row[COL.type])}» desconocido: tiene que ser Hito, Entregable o Tarea.` : "Falta el tipo (Hito, Entregable o Tarea).");
      continue;
    }
    if (!name) {
      err("Falta el nombre.");
      continue;
    }
    if (name.length > 300) warn("El nombre es muy largo: revisá que no se haya pegado otra cosa.");

    // ¿Ya existe?
    let id = text(row[COL.id]);
    const found = id ? (type === "hito" ? ms.get(id) : type === "entregable" ? del.get(id) : tk.get(id)) : undefined;
    if (id && !found && (ms.has(id) || del.has(id) || tk.has(id))) {
      err(`El ID es de un elemento de otro tipo: no se puede convertir en ${TYPE_LABEL[type].toLowerCase()}. Borrá el ID para crearlo como nuevo.`);
      continue;
    }
    if (id && found && seen.has(id)) {
      warn("ID repetido (¿una fila copiada?): esta fila se crea como nueva.");
      id = "";
    } else if (id && !found) {
      warn("El ID no es de este proyecto: la fila se crea como nueva.");
      id = "";
    }
    const cur = id ? found : undefined;
    if (!id) id = newId();
    seen.add(id);

    // Responsable
    const ownerText = text(row[COL.owner]);
    const curOwner = cur ? (type === "tarea" ? (cur as Task).assigneeId : (cur as Milestone | Deliverable).ownerId) : null;
    let ownerId: string | null = null;
    if (ownerText) {
      const u = findUser(ownerText, src.users);
      if (u) ownerId = u.id;
      else {
        ownerId = curOwner;
        warn(`No se encontró a «${ownerText}»: ${cur ? "se deja el responsable que tenía" : "queda sin asignar"}.`);
      }
    }

    // Estado
    const statusText = text(row[COL.status]);
    let status = (cur?.status ?? "pendiente") as PlanStatus | TaskStatus;
    if (statusText) {
      const s = parseStatus(statusText, type);
      if (s) status = s;
      else warn(`Estado «${statusText}» desconocido: ${cur ? "se deja el que tenía" : "queda Pendiente"}.`);
    }

    const item: PlanImportItem = {
      line, type, id, isNew: !cur, changed: !cur, name, description: text(row[COL.description]), ownerId,
      startDate: null, dueDate: null, status, estimateHours: null, priority: "media", milestoneId: null, deliverableId: null,
    };

    if (type === "tarea") {
      const t = cur as Task | undefined;
      const hours = parseHours(row[COL.hours]);
      if (hours === undefined) warn(`Horas «${text(row[COL.hours])}» ilegibles: ${t ? "se dejan las que tenía" : "quedan vacías"}.`);
      item.estimateHours = hours === undefined ? t?.estimateHours ?? null : hours;
      const prioText = norm(row[COL.priority]);
      const prio = TASK_PRIORITY.find((p) => norm(p.label) === prioText);
      if (prioText && !prio) warn(`Prioridad «${text(row[COL.priority])}» desconocida: ${t ? "se deja la que tenía" : "queda Media"}.`);
      item.priority = prio?.key ?? t?.priority ?? "media";
      item.deliverableId = curD;
      item.milestoneId = curD ? items.find((x) => x.id === curD)?.milestoneId ?? null : curM;
      if (t) {
        item.changed = t.name !== name || (t.description ?? "") !== item.description || t.assigneeId !== ownerId || t.status !== status
          || (t.estimateHours ?? null) !== item.estimateHours || t.priority !== item.priority || (t.deliverableId ?? null) !== item.deliverableId
          || (!item.deliverableId && (t.milestoneId ?? null) !== item.milestoneId);
      }
    } else {
      const start = cellToISO(row[COL.start]);
      const end = cellToISO(row[COL.end]);
      if (start === undefined || end === undefined) {
        err(`Fecha de ${start === undefined ? "inicio" : "fin"} ilegible: usá el formato dd/mm/aaaa.`);
        continue;
      }
      if (start && end && start > end) warn("El inicio es posterior al fin.");
      item.startDate = start;
      item.dueDate = end;
      const p = cur as Milestone | Deliverable | undefined;
      const same = p && p.name === name && (p.description ?? "") === item.description && p.ownerId === ownerId && p.status === status
        && (p.startDate ?? null) === start && (p.dueDate ?? null) === end;
      if (type === "hito") {
        if (p) item.changed = !same;
        curM = id;
        curD = null;
      } else {
        item.milestoneId = curM;
        if (p) item.changed = !same || ((p as Deliverable).milestoneId ?? null) !== curM;
        curD = id;
      }
    }
    items.push(item);
  }

  if (items.length === 0 && !issues.some((i) => i.level === "error")) {
    issues.push({ line: headerAt + 2, level: "error", message: "La hoja «Plan» no tiene filas para importar." });
  }
  return { items, issues };
}

/** Lee el archivo que subió la persona y devuelve las celdas de la hoja «Plan» (o la primera). */
export async function readPlanFile(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = wb.SheetNames.find((n) => norm(n) === norm(PLAN_SHEET)) ?? wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
}

export interface PlanImportSummary {
  nuevos: Record<PlanRowType, number>;
  cambios: Record<PlanRowType, number>;
  iguales: number;
}

export function summarizePlanImport(items: PlanImportItem[]): PlanImportSummary {
  const out: PlanImportSummary = { nuevos: { hito: 0, entregable: 0, tarea: 0 }, cambios: { hito: 0, entregable: 0, tarea: 0 }, iguales: 0 };
  for (const it of items) {
    if (it.isNew) out.nuevos[it.type]++;
    else if (it.changed) out.cambios[it.type]++;
    else out.iguales++;
  }
  return out;
}
