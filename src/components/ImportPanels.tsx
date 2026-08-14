import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type { AppState, Jornada, ProjectStatus, Role, TimeEntry, User } from "../types";
import { addDays, downloadFile, normText, parseCSV, parseDMY, toCSV, today, uid } from "../utils";
import { Icon } from "./Icon";
import { useToast } from "./ui";
import { COLORS } from "../pages/Projects";

function findCol(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h));
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

/* ============================== Cuentas ============================== */

interface AccountRow {
  rowNum: number;
  name: string;
  email: string;
  role: Role;
  weeklyHours: number;
  hireDate: string;
  password?: string;
  supervisorEmail?: string;
  status: "nuevo" | "actualizado";
  error?: string;
}

function parseAccountsCSV(text: string, state: AppState): { rows: AccountRow[]; headerError?: string } {
  const table = parseCSV(text);
  if (table.length < 2) return { rows: [], headerError: "El archivo no tiene filas de datos." };
  const header = table[0].map(normText);
  const iName = findCol(header, ["nombre", "name", "nombre completo", "full name"]);
  const iEmail = findCol(header, ["email", "correo", "e-mail", "correo electronico"]);
  if (iName === -1 || iEmail === -1) {
    return { rows: [], headerError: "El archivo debe tener al menos columnas de Nombre y Email." };
  }
  const iRole = findCol(header, ["rol", "role"]);
  const iHours = findCol(header, ["horas semanales", "horas", "weekly hours", "hours"]);
  const iHire = findCol(header, ["fecha de ingreso", "fecha ingreso", "hire date", "start date", "fecha de inicio"]);
  const iPass = findCol(header, ["clave", "password", "contrasena", "contraseña"]);
  const iSup = findCol(header, ["supervisor", "manager", "reporta a"]);

  const rows: AccountRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    const name = (cols[iName] ?? "").trim();
    const email = (cols[iEmail] ?? "").trim();
    if (!name && !email) continue;

    let error: string | undefined;
    if (!name) error = "Falta el nombre.";
    else if (!email || !/^\S+@\S+\.\S+$/.test(email)) error = "Email inválido o vacío.";

    const roleRaw = iRole >= 0 ? normText(cols[iRole] ?? "") : "";
    let role: Role = "usuario";
    if (roleRaw.includes("admin")) role = "admin";
    else if (roleRaw.includes("gerente") || roleRaw.includes("gerencia") || roleRaw.includes("manager")) role = "gerente";
    else if (roleRaw.includes("supervis")) role = "supervisor";

    const weeklyHours = iHours >= 0 && cols[iHours] ? Number(cols[iHours]) || state.company.defaultWeeklyHours : state.company.defaultWeeklyHours;
    const hireRaw = iHire >= 0 ? (cols[iHire] ?? "").trim() : "";
    const hireDate = (hireRaw && parseDMY(hireRaw)) || today();

    const existing = state.users.find((u) => normText(u.email) === normText(email));

    rows.push({
      rowNum: r + 1,
      name,
      email,
      role,
      weeklyHours,
      hireDate,
      password: iPass >= 0 ? (cols[iPass] ?? "").trim() || undefined : undefined,
      supervisorEmail: iSup >= 0 ? (cols[iSup] ?? "").trim() || undefined : undefined,
      status: existing ? "actualizado" : "nuevo",
      error,
    });
  }
  return { rows };
}

export function AccountsImportPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");

  async function onPick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const text = await readFileText(file);
    const { rows: parsed, headerError } = parseAccountsCSV(text, state);
    setFileError(headerError ?? "");
    setRows(parsed);
  }

  function downloadTemplate() {
    const csv = toCSV([
      ["Nombre", "Email", "Rol", "Horas semanales", "Fecha de ingreso", "Clave", "Supervisor"],
      ["Juan Pérez", "juan.perez@empresa.com", "empleado", "40", "01/03/2024", "", "carla@quantia.com"],
    ]);
    downloadFile("plantilla-cuentas.csv", csv, "text/csv;charset=utf-8");
  }

  function apply() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) return;

    const users = [...state.users];

    for (const row of valid) {
      const jornada: Jornada = row.weeklyHours >= 35 ? "completa" : "media";
      const existingIdx = users.findIndex((u) => normText(u.email) === normText(row.email));
      if (existingIdx >= 0) {
        const prev = users[existingIdx];
        users[existingIdx] = {
          ...prev,
          name: row.name,
          role: row.role,
          weeklyHours: row.weeklyHours,
          jornada,
          hireDate: row.hireDate,
          password: row.password || prev.password,
        };
      } else {
        const newUser: User = {
          id: uid(),
          name: row.name,
          email: row.email,
          password: row.password || `${row.name.split(" ")[0].toLowerCase()}123`,
          role: row.role,
          jornada,
          supervisorId: null,
          weeklyHours: row.weeklyHours,
          workDays: [1, 2, 3, 4, 5],
          dayStart: state.company.defaultDayStart,
          dayEnd: state.company.defaultDayEnd,
          birthday: "1990-01-01",
          hireDate: row.hireDate,
          active: true,
          online: false,
        };
        users.push(newUser);
      }
    }
    // Segunda pasada: resolver supervisor por email (puede referenciar a alguien recién creado)
    for (const row of valid) {
      if (!row.supervisorEmail) continue;
      const sup = users.find((u) => normText(u.email) === normText(row.supervisorEmail!));
      if (!sup) continue;
      const idx = users.findIndex((u) => normText(u.email) === normText(row.email));
      if (idx >= 0) users[idx] = { ...users[idx], supervisorId: sup.id };
    }

    dispatch({ type: "patch", patch: { users } });
    dispatch({ type: "audit", action: "Importación de cuentas", detail: `${valid.length} cuentas procesadas desde ${fileName}` });
    toast(`${valid.length} cuenta${valid.length !== 1 ? "s" : ""} importada${valid.length !== 1 ? "s" : ""}.`);
    setRows([]);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const validCount = rows.filter((r) => !r.error).length;
  const newCount = rows.filter((r) => !r.error && r.status === "nuevo").length;
  const errorCount = rows.filter((r) => r.error).length;

  return (
    <ImportCard
      title="Cuentas (usuarios)"
      description="Columnas reconocidas: Nombre, Email, Rol, Horas semanales, Fecha de ingreso (dd/mm/aaaa), Clave y Supervisor (email). Se matchea por email: si ya existe, se actualiza."
      onDownloadTemplate={downloadTemplate}
      inputRef={inputRef}
      onPick={onPick}
      fileName={fileName}
    >
      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={13} /> {fileError}
        </p>
      )}
      {rows.length > 0 && !fileError && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
            <span className="badge ok">{newCount} nuevas</span>
            <span className="badge acc">{validCount - newCount} a actualizar</span>
            {errorCount > 0 && <span className="badge bad">{errorCount} con error</span>}
          </div>
          <PreviewTable
            rows={rows}
            columns={[
              { label: "Fila", render: (r) => r.rowNum },
              { label: "Nombre", render: (r) => r.name },
              { label: "Email", render: (r) => r.email },
              { label: "Rol", render: (r) => r.role },
              { label: "Ingreso", render: (r) => r.hireDate },
              {
                label: "Estado",
                render: (r) =>
                  r.error ? (
                    <span className="badge bad">{r.error}</span>
                  ) : (
                    <span className={`badge ${r.status === "nuevo" ? "ok" : "acc"}`}>{r.status}</span>
                  ),
              },
            ]}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn btn-primary" onClick={apply} disabled={validCount === 0}>
              <Icon name="check" size={14} /> Confirmar importación ({validCount})
            </button>
          </div>
        </>
      )}
    </ImportCard>
  );
}

/* ============================== Proyectos ============================== */

function mapProjectStatus(raw: string): ProjectStatus {
  const n = normText(raw);
  if (!n) return "activo";
  if (n.includes("pausa") || n.includes("hold")) return "pausado";
  if (n.includes("complet") || n.includes("done") || n.includes("finish")) return "completado";
  if (n.includes("archiv")) return "archivado";
  return "activo";
}

interface ProjectRow {
  rowNum: number;
  name: string;
  clientName?: string;
  status: ProjectStatus;
  budgetHours: number | null;
  notionUrl?: string;
  members: string[];
  unresolvedMembers: string[];
  status2: "nuevo" | "actualizado";
  error?: string;
}

function parseProjectsCSV(text: string, state: AppState): { rows: ProjectRow[]; headerError?: string } {
  const table = parseCSV(text);
  if (table.length < 2) return { rows: [], headerError: "El archivo no tiene filas de datos." };
  const header = table[0].map(normText);
  const iName = findCol(header, ["proyecto", "nombre", "project", "project name"]);
  if (iName === -1) return { rows: [], headerError: "El archivo debe tener una columna Proyecto (o Nombre)." };
  const iClient = findCol(header, ["cliente", "client"]);
  const iStatus = findCol(header, ["estado", "status"]);
  const iBudget = findCol(header, ["horas proyectadas", "presupuesto", "budget", "estimated hours", "horas presupuestadas"]);
  const iNotion = findCol(header, ["notion", "notion url", "link"]);
  const iMembers = findCol(header, ["miembros", "members", "equipo", "team"]);

  const rows: ProjectRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    const name = (cols[iName] ?? "").trim();
    if (!name) continue;

    const budgetRaw = iBudget >= 0 ? (cols[iBudget] ?? "").trim() : "";
    const budgetHours = budgetRaw ? Number(budgetRaw) || null : null;

    const memberEmails = iMembers >= 0 ? (cols[iMembers] ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [];
    const members: string[] = [];
    const unresolvedMembers: string[] = [];
    for (const email of memberEmails) {
      const u = state.users.find((x) => normText(x.email) === normText(email));
      if (u) members.push(u.id);
      else unresolvedMembers.push(email);
    }

    const existing = state.projects.find((p) => normText(p.name) === normText(name));

    rows.push({
      rowNum: r + 1,
      name,
      clientName: iClient >= 0 ? (cols[iClient] ?? "").trim() || undefined : undefined,
      status: iStatus >= 0 ? mapProjectStatus(cols[iStatus] ?? "") : "activo",
      budgetHours,
      notionUrl: iNotion >= 0 ? (cols[iNotion] ?? "").trim() || undefined : undefined,
      members,
      unresolvedMembers,
      status2: existing ? "actualizado" : "nuevo",
    });
  }
  return { rows };
}

export function ProjectsImportPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");

  async function onPick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const text = await readFileText(file);
    const { rows: parsed, headerError } = parseProjectsCSV(text, state);
    setFileError(headerError ?? "");
    setRows(parsed);
  }

  function downloadTemplate() {
    const csv = toCSV([
      ["Proyecto", "Cliente", "Estado", "Horas proyectadas", "Notion", "Miembros"],
      ["Nuevo Proyecto", "Cliente Ejemplo", "activo", "200", "https://notion.so/pagina", "juan.perez@empresa.com;carla@quantia.com"],
    ]);
    downloadFile("plantilla-proyectos.csv", csv, "text/csv;charset=utf-8");
  }

  function apply() {
    const valid = rows;
    if (valid.length === 0) return;

    const clients = [...state.clients];
    const projects = [...state.projects];

    const ensureClient = (name?: string): string | null => {
      if (!name) return null;
      const found = clients.find((c) => normText(c.name) === normText(name));
      if (found) return found.id;
      const nc = { id: uid(), name, color: COLORS[clients.length % COLORS.length] };
      clients.push(nc);
      return nc.id;
    };

    for (const row of valid) {
      const clientId = ensureClient(row.clientName);
      const existingIdx = projects.findIndex((p) => normText(p.name) === normText(row.name));
      if (existingIdx >= 0) {
        const prev = projects[existingIdx];
        projects[existingIdx] = {
          ...prev,
          clientId: clientId ?? prev.clientId,
          status: row.status,
          budgetHours: row.budgetHours ?? prev.budgetHours,
          notionUrl: row.notionUrl || prev.notionUrl,
          memberIds: row.members.length > 0 ? row.members : prev.memberIds,
        };
      } else {
        projects.push({
          id: uid(),
          clientId,
          name: row.name,
          color: COLORS[projects.length % COLORS.length],
          status: row.status,
          budgetHours: row.budgetHours,
          memberIds: row.members,
          notionUrl: row.notionUrl,
        });
      }
    }

    const unresolved = valid.flatMap((r) => r.unresolvedMembers);
    dispatch({ type: "patch", patch: { clients, projects } });
    dispatch({ type: "audit", action: "Importación de proyectos", detail: `${valid.length} proyectos procesados desde ${fileName}` });
    toast(
      `${valid.length} proyecto${valid.length !== 1 ? "s" : ""} importado${valid.length !== 1 ? "s" : ""}.` +
        (unresolved.length > 0 ? ` ${unresolved.length} miembro(s) no encontrados por email.` : ""),
    );
    setRows([]);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const newCount = rows.filter((r) => r.status2 === "nuevo").length;

  return (
    <ImportCard
      title="Proyectos y clientes"
      description="Columnas reconocidas: Proyecto, Cliente, Estado, Horas proyectadas, Notion, Miembros (emails separados por ; o ,). El cliente se crea automáticamente si no existe; se matchea por nombre de proyecto."
      onDownloadTemplate={downloadTemplate}
      inputRef={inputRef}
      onPick={onPick}
      fileName={fileName}
    >
      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={13} /> {fileError}
        </p>
      )}
      {rows.length > 0 && !fileError && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
            <span className="badge ok">{newCount} nuevos</span>
            <span className="badge acc">{rows.length - newCount} a actualizar</span>
          </div>
          <PreviewTable
            rows={rows}
            columns={[
              { label: "Fila", render: (r) => r.rowNum },
              { label: "Proyecto", render: (r) => r.name },
              { label: "Cliente", render: (r) => r.clientName ?? "—" },
              { label: "Estado", render: (r) => r.status },
              { label: "Miembros", render: (r) => (r.unresolvedMembers.length > 0 ? `${r.members.length} ok, ${r.unresolvedMembers.length} no encontrados` : String(r.members.length)) },
              { label: "Resultado", render: (r) => <span className={`badge ${r.status2 === "nuevo" ? "ok" : "acc"}`}>{r.status2}</span> },
            ]}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn btn-primary" onClick={apply}>
              <Icon name="check" size={14} /> Confirmar importación ({rows.length})
            </button>
          </div>
        </>
      )}
    </ImportCard>
  );
}

/* ============================== Registros de horas (Clockify) ============================== */

/** Lee un archivo .csv o .xlsx/.xls y lo devuelve como tabla de celdas.
 * Las celdas de fecha de un xlsx llegan como Date (gracias a cellDates); todo
 * lo demás llega como string, igual que el resto de los importadores CSV. */
async function readTable(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name)) {
    return parseCSV(await readFileText(file));
  }
  // Import diferido: xlsx pesa varios cientos de KB y solo lo necesita este
  // panel de administración, no vale la pena en el bundle principal.
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
}

function cellToText(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "").trim();
}

/** Convierte una celda de fecha (Date de xlsx, o texto ISO/dd-mm-aaaa de un CSV) a YYYY-MM-DD.
 * Usa los getters UTC para no correr el día por la zona horaria del navegador. */
function cellToISODate(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return parseDMY(s);
}

function parseHM(v: unknown): number | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mnt = Number(m[2]);
  if (h > 23 || mnt > 59) return null;
  return h * 60 + mnt;
}

interface ClockifyRow {
  /** Identificador único de la fila para actualizarla a mano (distinto de
   * rowNum: un registro que cruza medianoche se parte en dos ClockifyRow con
   * el mismo rowNum, uno por día). */
  id: string;
  rowNum: number;
  personName: string;
  userId: string | null;
  projectRaw: string;
  projectId: string | null;
  subProjectId: string | null;
  projectMatched: boolean;
  description: string;
  tagIds: string[];
  date: string;
  start: number;
  end: number;
  /** Fecha/hora inválida detectada al parsear — no se puede resolver a mano, a
   * diferencia de usuario/proyecto que sí se pueden asignar manualmente. */
  dateTimeError?: string;
}

type RowStatus = "nuevo" | "duplicado" | "error";

/** Estado derivado de una fila: se recalcula en cada render (no se guarda en
 * el propio row) para que asignar usuario/proyecto a mano lo actualice solo. */
function rowStatus(r: ClockifyRow, state: AppState): { status: RowStatus; error?: string } {
  if (r.dateTimeError) return { status: "error", error: r.dateTimeError };
  if (!r.userId) return { status: "error", error: "Usuario no encontrado por email" };
  if (state.entries.some((e) => e.userId === r.userId && e.date === r.date && e.start === r.start && e.end === r.end)) {
    return { status: "duplicado" };
  }
  return { status: "nuevo" };
}

function fmtHM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function parseClockifyTable(table: unknown[][], state: AppState): { rows: ClockifyRow[]; headerError?: string; skippedZero: number } {
  if (table.length < 2) return { rows: [], skippedZero: 0, headerError: "El archivo no tiene filas de datos." };
  const header = table[0].map((h) => normText(cellToText(h)));
  const iProject = findCol(header, ["proyecto", "project", "project name"]);
  const iDesc = findCol(header, ["descripcion", "description"]);
  const iEmail = findCol(header, ["correo electronico", "email", "correo", "e-mail"]);
  const iUser = findCol(header, ["usuario", "user"]);
  const iTags = findCol(header, ["etiquetas", "tags"]);
  const iDateFrom = findCol(header, ["fecha de inicio", "start date"]);
  const iTimeFrom = findCol(header, ["hora de inicio", "start time"]);
  const iDateTo = findCol(header, ["fecha de finalizacion", "end date"]);
  const iTimeTo = findCol(header, ["hora de finalizacion", "end time"]);

  if (iEmail === -1) return { rows: [], skippedZero: 0, headerError: "El archivo debe tener una columna de correo electrónico (Correo electrónico / Email)." };
  if (iDateFrom === -1 || iTimeFrom === -1 || iTimeTo === -1) {
    return { rows: [], skippedZero: 0, headerError: "Faltan columnas de fecha/hora (Fecha de inicio, Hora de inicio, Hora de finalización)." };
  }

  const rows: ClockifyRow[] = [];
  let skippedZero = 0;
  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    if (!cols || cols.every((c) => cellToText(c) === "")) continue;

    const email = cellToText(cols[iEmail]);
    const personName = iUser >= 0 ? cellToText(cols[iUser]) : email;
    const user = state.users.find((u) => normText(u.email) === normText(email)) ?? null;

    const projectRaw = iProject >= 0 ? cellToText(cols[iProject]) : "";
    const projN = normText(projectRaw);
    const proj = projN ? state.projects.find((p) => normText(p.name) === projN) : undefined;
    const sub = !proj && projN ? state.subProjects.find((sp) => normText(sp.name) === projN) : undefined;
    const projectId = proj?.id ?? sub?.projectId ?? null;
    const subProjectId = sub?.id ?? null;
    const projectMatched = !!(proj || sub);

    const tagNames = iTags >= 0 ? cellToText(cols[iTags]).split(",").map((s) => s.trim()).filter(Boolean) : [];
    const tagIds = tagNames
      .map((tn) => state.tags.find((t) => normText(t.name) === normText(tn))?.id)
      .filter((id): id is string => !!id);

    const dateFrom = cellToISODate(cols[iDateFrom]);
    const dateTo = iDateTo >= 0 ? cellToISODate(cols[iDateTo]) : dateFrom;
    const start = parseHM(cols[iTimeFrom]);
    const end = parseHM(cols[iTimeTo]);

    // Duración 0:00 (inicio y fin iguales): se omite directamente, no vale la
    // pena mostrarla como fila con error — no hay nada que corregir a mano.
    if (start !== null && end !== null && start === end) {
      skippedZero++;
      continue;
    }

    const base = {
      rowNum: r + 1,
      personName,
      userId: user?.id ?? null,
      projectRaw,
      projectId,
      subProjectId,
      projectMatched,
      description: iDesc >= 0 ? cellToText(cols[iDesc]) : "",
      tagIds,
    };

    if (!dateFrom || start === null || end === null) {
      rows.push({ id: `${r}`, ...base, date: dateFrom ?? "", start: start ?? 0, end: end ?? 0, dateTimeError: "Fecha u hora inválida" });
    } else if (dateTo && dateTo !== dateFrom) {
      if (dateTo === addDays(dateFrom, 1)) {
        // Cruza medianoche: TEMPO no tiene un campo de "fecha de fin", así que
        // se divide en dos registros (uno por día) que juntos representan el
        // mismo horario real: [start, 24:00) el primer día y [00:00, end) el
        // segundo — en vez de bloquear la fila entera.
        rows.push({ id: `${r}-a`, ...base, date: dateFrom, start, end: 24 * 60 });
        rows.push({ id: `${r}-b`, ...base, date: dateTo, start: 0, end });
      } else {
        rows.push({ id: `${r}`, ...base, date: dateFrom, start, end, dateTimeError: "El registro cruza más de un día (no soportado)" });
      }
    } else if (end <= start) {
      rows.push({ id: `${r}`, ...base, date: dateFrom, start, end, dateTimeError: "La hora de fin debe ser posterior a la de inicio" });
    } else {
      rows.push({ id: `${r}`, ...base, date: dateFrom, start, end });
    }
  }
  return { rows, skippedZero };
}

type RowFilter = "all" | "nuevo" | "duplicado" | "error" | "sin-proyecto";

export function TimeEntriesImportPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ClockifyRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [skippedZero, setSkippedZero] = useState(0);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setFilter("all");
    try {
      const table = await readTable(file);
      const { rows: parsed, headerError, skippedZero: skipped } = parseClockifyTable(table, state);
      setFileError(headerError ?? "");
      setRows(parsed);
      setSkippedZero(skipped);
    } catch {
      setFileError("No se pudo leer el archivo. Verificá que sea un .xlsx o .csv exportado desde Clockify.");
      setRows([]);
      setSkippedZero(0);
    }
  }

  function updateRow(id: string, patch: Partial<ClockifyRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const withStatus = useMemo(() => rows.map((row) => ({ row, ...rowStatus(row, state) })), [rows, state.entries]);

  async function apply() {
    const valid = withStatus.filter((v) => v.status === "nuevo").map((v) => v.row);
    if (valid.length === 0) return;
    setImporting(true);
    const entries: TimeEntry[] = valid.map((r) => ({
      id: uid(),
      userId: r.userId!,
      projectId: r.projectId,
      subProjectId: r.subProjectId,
      description: r.description,
      tagIds: r.tagIds,
      date: r.date,
      start: r.start,
      end: r.end,
      favorite: false,
      recurring: null,
    }));
    dispatch({ type: "addEntries", entries });
    dispatch({ type: "audit", action: "Importación de registros de horas", detail: `${entries.length} registros procesados desde ${fileName}` });
    toast(`${entries.length} registro${entries.length !== 1 ? "s" : ""} importado${entries.length !== 1 ? "s" : ""}.`);
    setImporting(false);
    setRows([]);
    setFileName("");
    setSkippedZero(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  const newCount = withStatus.filter((v) => v.status === "nuevo").length;
  const dupCount = withStatus.filter((v) => v.status === "duplicado").length;
  const errorCount = withStatus.filter((v) => v.status === "error").length;
  const noProjectCount = withStatus.filter((v) => v.status !== "error" && v.row.projectRaw && !v.row.projectMatched).length;

  const visible = withStatus.filter((v) => {
    if (filter === "all") return true;
    if (filter === "sin-proyecto") return v.status !== "error" && v.row.projectRaw && !v.row.projectMatched;
    return v.status === filter;
  });

  const filters: { key: RowFilter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: rows.length },
    { key: "nuevo", label: "Nuevos", count: newCount },
    { key: "duplicado", label: "Ya cargados", count: dupCount },
    { key: "error", label: "Con error", count: errorCount },
    { key: "sin-proyecto", label: "Sin proyecto", count: noProjectCount },
  ];

  return (
    <ImportCard
      title="Registros de horas (Clockify)"
      description="Subí el .xlsx (o .csv) del 'Informe de tiempo detallado' que exporta Clockify. Se matchea por email; el proyecto se busca por nombre de proyecto o subproyecto en TEMPO. Si no encuentra a la persona o el proyecto, se lo podés asignar a mano en la tabla. Los registros ya cargados (misma persona, fecha y horario) se detectan y no se duplican."
      inputRef={inputRef}
      onPick={onPick}
      fileName={fileName}
      accept=".xlsx,.xls,.csv"
      pickLabel="Elegir archivo de Clockify"
    >
      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={13} /> {fileError}
        </p>
      )}
      {skippedZero > 0 && !fileError && (
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "8px 0 0" }}>
          {skippedZero} registro{skippedZero !== 1 ? "s" : ""} con duración 0:00 omitido{skippedZero !== 1 ? "s" : ""} automáticamente.
        </p>
      )}
      {rows.length > 0 && !fileError && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
            {filters.map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? "on" : ""}`}
                onClick={() => setFilter(f.key)}
                disabled={f.count === 0 && f.key !== "all"}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          <PreviewTable
            rows={visible}
            columns={[
              {
                label: "Fila",
                render: (v) => (v.row.id.endsWith("-a") ? `${v.row.rowNum} (1/2)` : v.row.id.endsWith("-b") ? `${v.row.rowNum} (2/2)` : v.row.rowNum),
              },
              {
                label: "Persona",
                render: (v) =>
                  v.row.userId ? (
                    state.users.find((u) => u.id === v.row.userId)?.name ?? v.row.personName
                  ) : (
                    <select
                      className="select"
                      style={{ fontSize: 12, minWidth: 160 }}
                      value=""
                      onChange={(e) => e.target.value && updateRow(v.row.id, { userId: e.target.value })}
                    >
                      <option value="">{v.row.personName ? `${v.row.personName} (no encontrado)` : "Elegir persona…"}</option>
                      {state.users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  ),
              },
              {
                label: "Proyecto",
                render: (v) =>
                  v.row.projectMatched ? (
                    state.projects.find((p) => p.id === v.row.projectId)?.name ??
                    state.subProjects.find((sp) => sp.id === v.row.subProjectId)?.name ??
                    "—"
                  ) : (
                    <select
                      className="select"
                      style={{ fontSize: 12, minWidth: 180 }}
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [kind, id] = val.split(":");
                        if (kind === "p") updateRow(v.row.id, { projectId: id, subProjectId: null, projectMatched: true });
                        else {
                          const sp = state.subProjects.find((x) => x.id === id);
                          updateRow(v.row.id, { projectId: sp?.projectId ?? null, subProjectId: id, projectMatched: true });
                        }
                      }}
                    >
                      <option value="">{v.row.projectRaw ? `${v.row.projectRaw} (sin match)` : "Sin proyecto — elegir…"}</option>
                      {state.projects.map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>{p.name}</option>
                      ))}
                      {state.subProjects.map((sp) => (
                        <option key={sp.id} value={`s:${sp.id}`}>
                          {state.projects.find((p) => p.id === sp.projectId)?.name} / {sp.name}
                        </option>
                      ))}
                    </select>
                  ),
              },
              { label: "Fecha", render: (v) => v.row.date || "—" },
              { label: "Horario", render: (v) => (v.row.date ? `${fmtHM(v.row.start)} – ${fmtHM(v.row.end)}` : "—") },
              {
                label: "Estado",
                render: (v) =>
                  v.status === "error" ? (
                    <span className="badge bad">{v.error}</span>
                  ) : v.status === "duplicado" ? (
                    <span className="badge acc">Ya cargado</span>
                  ) : v.row.projectRaw && !v.row.projectMatched ? (
                    <span className="badge warn">Nuevo (sin proyecto)</span>
                  ) : (
                    <span className="badge ok">Nuevo</span>
                  ),
              },
            ]}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn btn-primary" onClick={apply} disabled={newCount === 0 || importing}>
              <Icon name="check" size={14} /> {importing ? "Importando…" : `Confirmar importación (${newCount})`}
            </button>
          </div>
        </>
      )}
    </ImportCard>
  );
}

/* ============================== Configuración ============================== */

type ConfigPayload = Pick<AppState, "company" | "rolePermissions" | "leaveTypeConfig">;

function isValidConfig(obj: unknown): obj is ConfigPayload {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const company = o.company as Record<string, unknown> | undefined;
  const rp = o.rolePermissions as Record<string, unknown> | undefined;
  return (
    Boolean(company) &&
    typeof company?.name === "string" &&
    Boolean(rp) &&
    Array.isArray(rp?.admin) &&
    Array.isArray(rp?.supervisor) &&
    Array.isArray(rp?.empleado) &&
    Array.isArray(o.leaveTypeConfig)
  );
}

export function ConfigImportExportPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  function exportConfig() {
    const payload: ConfigPayload = {
      company: state.company,
      rolePermissions: state.rolePermissions,
      leaveTypeConfig: state.leaveTypeConfig,
    };
    downloadFile("configuracion-tempo.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const text = (await readFileText(file)).replace(/^﻿/, "");
      const parsed = JSON.parse(text);
      if (!isValidConfig(parsed)) {
        setError("El archivo no tiene el formato esperado (company, rolePermissions, leaveTypeConfig).");
        return;
      }
      dispatch({ type: "patch", patch: { company: parsed.company, rolePermissions: parsed.rolePermissions, leaveTypeConfig: parsed.leaveTypeConfig } });
      dispatch({ type: "audit", action: "Configuración importada", detail: `Desde ${file.name}` });
      toast("Configuración importada: empresa, permisos y tipos de licencia.");
    } catch {
      setError("No se pudo leer el archivo. Verificá que sea un JSON válido exportado desde TEMPO.");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="card card-pad">
      <div className="card-title">Configuración (permisos, tipos de licencia y empresa)</div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10 }}>
        Clockify no exporta permisos ni configuración de roles — este archivo es el formato propio de TEMPO, útil para
        respaldar la configuración o transferirla entre instancias.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={exportConfig}>
          <Icon name="download" size={14} /> Exportar configuración
        </button>
        <button className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={14} /> Importar configuración
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={13} /> {error}
        </p>
      )}
    </div>
  );
}

/* ============================== Componentes compartidos ============================== */

function ImportCard({
  title,
  description,
  onDownloadTemplate,
  inputRef,
  onPick,
  fileName,
  accept = ".csv,text/csv",
  pickLabel = "Elegir archivo CSV",
  children,
}: {
  title: string;
  description: string;
  onDownloadTemplate?: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (file: File | undefined) => void;
  fileName: string;
  accept?: string;
  pickLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="card-title">{title}</div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10 }}>{description}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {onDownloadTemplate && (
          <button className="btn btn-secondary" onClick={onDownloadTemplate}>
            <Icon name="download" size={14} /> Descargar plantilla CSV
          </button>
        )}
        <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={14} /> {pickLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        {fileName && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{fileName}</span>}
      </div>
      {children}
    </div>
  );
}

function PreviewTable<T>({ rows, columns }: { rows: T[]; columns: { label: string; render: (r: T) => React.ReactNode }[] }) {
  const shown = rows.slice(0, 50);
  return (
    <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.label}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <div style={{ padding: 8, fontSize: 11.5, color: "var(--text-3)", textAlign: "center" }}>
          Mostrando {shown.length} de {rows.length} filas — se procesarán todas al confirmar.
        </div>
      )}
    </div>
  );
}
