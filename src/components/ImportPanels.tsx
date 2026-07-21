import React, { useRef, useState } from "react";
import { useStore } from "../store";
import type { AppState, Jornada, ProjectStatus, Role, User } from "../types";
import { downloadFile, normText, parseCSV, parseDMY, toCSV, today, uid } from "../utils";
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
  teamName?: string;
  departmentName?: string;
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
  const iTeam = findCol(header, ["equipo", "team"]);
  const iDept = findCol(header, ["departamento", "department"]);
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
    let role: Role = "empleado";
    if (roleRaw.includes("admin")) role = "admin";
    else if (roleRaw.includes("supervis") || roleRaw.includes("manager")) role = "supervisor";

    const weeklyHours = iHours >= 0 && cols[iHours] ? Number(cols[iHours]) || state.company.defaultWeeklyHours : state.company.defaultWeeklyHours;
    const hireRaw = iHire >= 0 ? (cols[iHire] ?? "").trim() : "";
    const hireDate = (hireRaw && parseDMY(hireRaw)) || today();

    const existing = state.users.find((u) => normText(u.email) === normText(email));

    rows.push({
      rowNum: r + 1,
      name,
      email,
      role,
      teamName: iTeam >= 0 ? (cols[iTeam] ?? "").trim() || undefined : undefined,
      departmentName: iDept >= 0 ? (cols[iDept] ?? "").trim() || undefined : undefined,
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
      ["Nombre", "Email", "Rol", "Equipo", "Departamento", "Horas semanales", "Fecha de ingreso", "Clave", "Supervisor"],
      ["Juan Pérez", "juan.perez@empresa.com", "empleado", "Estructuras", "Ingeniería", "40", "01/03/2024", "", "carla@quantia.com"],
    ]);
    downloadFile("plantilla-cuentas.csv", csv, "text/csv;charset=utf-8");
  }

  function apply() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) return;

    const teams = [...state.teams];
    const departments = [...state.departments];
    const users = [...state.users];

    const ensureTeam = (name?: string): string | null => {
      if (!name) return null;
      const found = teams.find((t) => normText(t.name) === normText(name));
      if (found) return found.id;
      const nt = { id: uid(), name };
      teams.push(nt);
      return nt.id;
    };
    const ensureDept = (name?: string): string | null => {
      if (!name) return null;
      const found = departments.find((d) => normText(d.name) === normText(name));
      if (found) return found.id;
      const nd = { id: uid(), name };
      departments.push(nd);
      return nd.id;
    };

    for (const row of valid) {
      const teamId = ensureTeam(row.teamName);
      const departmentId = ensureDept(row.departmentName);
      const jornada: Jornada = row.weeklyHours >= 35 ? "completa" : "media";
      const existingIdx = users.findIndex((u) => normText(u.email) === normText(row.email));
      if (existingIdx >= 0) {
        const prev = users[existingIdx];
        users[existingIdx] = {
          ...prev,
          name: row.name,
          role: row.role,
          teamId: teamId ?? prev.teamId,
          departmentId: departmentId ?? prev.departmentId,
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
          teamId,
          departmentId,
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

    dispatch({ type: "patch", patch: { users, teams, departments } });
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
      description="Columnas reconocidas: Nombre, Email, Rol, Equipo, Departamento, Horas semanales, Fecha de ingreso (dd/mm/aaaa), Clave y Supervisor (email). Se matchea por email: si ya existe, se actualiza."
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
              { label: "Equipo", render: (r) => r.teamName ?? "—" },
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
          billable: false,
          hourlyRate: 0,
          costRate: 0,
          budgetHours: row.budgetHours,
          tasks: [],
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
  children,
}: {
  title: string;
  description: string;
  onDownloadTemplate: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (file: File | undefined) => void;
  fileName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="card-title">{title}</div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10 }}>{description}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-secondary" onClick={onDownloadTemplate}>
          <Icon name="download" size={14} /> Descargar plantilla CSV
        </button>
        <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" size={14} /> Elegir archivo CSV
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
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
