import { fmtDate, today } from "../utils";
import { scopeStats } from "./agile";
import type { Baseline, ChangeRequest, ChangeStatus, Task } from "./types";

export interface ChangeReportUser {
  id: string;
  name: string;
}

export interface ChangeReportProject {
  id?: string;
  name: string;
  code?: string | null;
  clientId?: string | null;
}

export interface ChangeReportTask {
  id: string;
  name: string;
}

export interface ChangeReportInput {
  project: ChangeReportProject;
  code?: string | null;
  clientName?: string | null;
  clients?: { id: string; name: string }[];
  reportDate?: string;
  changes: ChangeRequest[];
  baselines: Baseline[];
  users: ChangeReportUser[];
  tasks?: ChangeReportTask[];
}

export type SheetRow = (string | number)[];

export interface ChangeReportSheetsOutput {
  Resumen: SheetRow[];
  Cambios: SheetRow[];
  "Líneas base": SheetRow[];
  [sheetName: string]: SheetRow[];
}

/**
 * Protege contra inyección de fórmulas en Excel (CSV/XLSX formula injection).
 * Todo texto que venga de usuarios y empiece con =, +, -, @, tabulador (\t) o
 * retorno de carro (\r) debe llevar un apóstrofe adelante.
 * Los números siguen siendo números.
 */
export function escapeExcelFormula<T>(val: T): T {
  if (typeof val !== "string") return val;
  if (/^[=+\-@\t\r]/.test(val)) {
    return `'${val}` as unknown as T;
  }
  return val;
}

const STATUS_LABELS: Record<ChangeStatus, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  diferido: "Diferido",
  rechazado: "Rechazado",
};

/**
 * Función PURA que construye las filas (arrays de arrays) de las tres hojas
 * del historial de cambios del proyecto: Resumen, Cambios y Líneas base.
 */
export function changeReportSheets(input: ChangeReportInput): ChangeReportSheetsOutput {
  const reportDate = input.reportDate ?? today();
  const baselines = input.baselines ?? [];
  const changes = input.changes ?? [];
  const users = input.users ?? [];
  const tasks = input.tasks ?? [];

  const clientName =
    input.clientName ??
    (input.clients && input.project.clientId
      ? input.clients.find((c) => c.id === input.project.clientId)?.name
      : "") ??
    "";

  const projectCode = input.code ?? input.project.code ?? "";
  const st = scopeStats(baselines, changes, reportDate);

  const usersMap = new Map<string, string>();
  for (const u of users) {
    usersMap.set(u.id, u.name);
  }

  const tasksMap = new Map<string, string>();
  for (const t of tasks) {
    tasksMap.set(t.id, t.name);
  }

  const changesMap = new Map<string, string>();
  for (const c of changes) {
    changesMap.set(c.id, c.title);
  }

  // 1. Hoja "Resumen"
  const growthStr = st.growthPct === null ? "—" : `${st.growthPct > 0 ? "+" : ""}${st.growthPct}%`;
  const currentEndStr = st.currentEnd ? fmtDate(st.currentEnd) : "—";

  const resumenRows: SheetRow[] = [
    ["Proyecto", escapeExcelFormula(input.project?.name || "")],
    ["Código", escapeExcelFormula(projectCode || "")],
    ["Cliente", escapeExcelFormula(clientName || "")],
    ["Fecha del informe", fmtDate(reportDate)],
    ["Solicitudes", st.total],
    ["Aprobadas", st.approved],
    ["Rechazadas", st.rejected],
    ["Diferidas", st.deferred],
    ["Pendientes", st.pending],
    ["Horas absorbidas", st.absorbedHours],
    ["Crecimiento del alcance", growthStr],
    ["Fin actual", currentEndStr],
  ];

  // 2. Hoja "Cambios", ordenada de la más vieja a la más nueva
  const sortedChanges = [...changes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const cambiosHeaders = [
    "Fecha de solicitud",
    "Título",
    "Descripción",
    "Pedido por",
    "Registrado por",
    "Urgente",
    "Impacto (horas)",
    "Impacto (días)",
    "Estado",
    "Decidido por",
    "Fecha de decisión",
    "Nota de la decisión",
    "Tarea creada",
    "Entró en pleno sprint",
  ];

  const cambiosRows: SheetRow[] = [
    cambiosHeaders,
    ...sortedChanges.map((c) => [
      fmtDate(c.createdAt),
      escapeExcelFormula(c.title || ""),
      escapeExcelFormula(c.description || ""),
      escapeExcelFormula(c.requestedBy || ""),
      escapeExcelFormula((c.registeredBy ? usersMap.get(c.registeredBy) : "") || ""),
      c.urgent ? "Sí" : "No",
      c.impactHours != null ? c.impactHours : "",
      c.impactDays != null ? c.impactDays : "",
      STATUS_LABELS[c.status] ?? c.status,
      escapeExcelFormula((c.decidedBy ? usersMap.get(c.decidedBy) : "") || ""),
      c.decidedAt ? fmtDate(c.decidedAt) : "",
      escapeExcelFormula(c.decisionNote || ""),
      escapeExcelFormula((c.taskId ? tasksMap.get(c.taskId) : "") || ""),
      c.duringSprint ? "Sí" : "No",
    ]),
  ];

  // 3. Hoja "Líneas base", ordenada por versión ascendente
  const sortedBaselines = [...baselines].sort((a, b) => a.version - b.version);

  const lineasBaseHeaders = [
    "Versión",
    "Fecha",
    "Alcance (horas)",
    "Fin previsto",
    "Motivo",
    "Solicitud relacionada",
  ];

  const lineasBaseRows: SheetRow[] = [
    lineasBaseHeaders,
    ...sortedBaselines.map((b) => [
      b.version,
      fmtDate(b.date),
      b.scopeHours,
      b.endDate ? fmtDate(b.endDate) : "",
      escapeExcelFormula(b.reason || ""),
      escapeExcelFormula((b.changeRequestId ? changesMap.get(b.changeRequestId) : "") || ""),
    ]),
  ];

  return {
    Resumen: resumenRows,
    Cambios: cambiosRows,
    "Líneas base": lineasBaseRows,
  };
}

/** Arma el nombre del archivo sanitizando caracteres no permitidos. */
export function buildReportFilename(input: {
  code?: string | null;
  project: { name: string; code?: string | null };
  reportDate?: string;
}): string {
  const rawCodeOrName = input.code?.trim() || input.project.code?.trim() || input.project.name || "proyecto";
  const cleanName = rawCodeOrName.replace(/[/\\?%*:|"<>]/g, "_").trim().replace(/\s+/g, "_") || "proyecto";
  const dateStr = input.reportDate ?? today();
  return `Historial_cambios_${cleanName}_${dateStr}.xlsx`;
}

/**
 * Importa xlsx dinámicamente, arma el libro de tres hojas y descarga el archivo Excel.
 */
export async function downloadChangeReport(input: ChangeReportInput): Promise<void> {
  const XLSX = await import("xlsx");
  const sheets = changeReportSheets(input);
  const wb = XLSX.utils.book_new();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const filename = buildReportFilename(input);
  XLSX.writeFile(wb, filename);
}
