import React, { useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type { AbsenceRequest, AppState, OvertimeRequest, ProfessionalEntry, ProfessionalProfile, Project, TimeEntry, User } from "../types";
import { addDays, fmtYearsSince, normText, parseCSV, parseDMY, today, uid, weekStart, yearsAgoISO } from "../utils";
import { countWorkDays, holidayDateSet } from "../store";
import { Icon } from "./Icon";
import { Modal, useToast } from "./ui";
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

  // Nombres de proyecto que vinieron en el archivo pero no existen todavía en
  // Clientes y proyectos (uno por nombre distinto, aunque aparezca en varias filas).
  const missingProjectNames = useMemo(() => {
    const map = new Map<string, string>(); // normText -> nombre tal como vino en el archivo
    for (const { row, status } of withStatus) {
      if (status === "error" || !row.projectRaw || row.projectMatched) continue;
      const key = normText(row.projectRaw);
      if (!map.has(key)) map.set(key, row.projectRaw.trim());
    }
    return map;
  }, [withStatus]);

  /** Da de alta en Clientes y proyectos cada nombre de proyecto que apareció en el
   * archivo y todavía no existe, y vincula automáticamente las filas correspondientes.
   * También los da de alta ya con el equipo (todas las personas que cargaron horas
   * a ese proyecto en el archivo) — si no, el proyecto queda sin nadie asignado y
   * esas mismas personas después no ven el proyecto al editar su propio registro. */
  function createMissingProjects() {
    if (missingProjectNames.size === 0) return;
    const baseCount = state.projects.length;
    const newProjects: Project[] = [...missingProjectNames.entries()].map(([key, name], i) => {
      const memberIds = [...new Set(
        withStatus
          .filter(({ row }) => row.userId && normText(row.projectRaw) === key)
          .map(({ row }) => row.userId as string),
      )];
      return {
        id: uid(), clientId: null, name, color: COLORS[(baseCount + i) % COLORS.length],
        status: "activo", budgetHours: null, memberIds, flightActivityId: null,
      };
    });
    dispatch({ type: "patch", patch: { projects: [...state.projects, ...newProjects] } });
    dispatch({ type: "audit", action: "Proyectos creados desde importación de horas", detail: newProjects.map((p) => p.name).join(", ") });
    setRows((prev) =>
      prev.map((r) => {
        if (!r.projectRaw || r.projectMatched) return r;
        const np = newProjects.find((p) => normText(p.name) === normText(r.projectRaw));
        return np ? { ...r, projectId: np.id, subProjectId: null, projectMatched: true } : r;
      }),
    );
    toast(`${newProjects.length} proyecto${newProjects.length !== 1 ? "s" : ""} creado${newProjects.length !== 1 ? "s" : ""} y vinculado${newProjects.length !== 1 ? "s" : ""} en Clientes y proyectos.`);
  }

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
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "8px 0" }}>
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
            {missingProjectNames.size > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={createMissingProjects}>
                <Icon name="plus" size={13} /> Agregar {missingProjectNames.size} proyecto{missingProjectNames.size !== 1 ? "s" : ""} que falta{missingProjectNames.size !== 1 ? "n" : ""} en Clientes y proyectos
              </button>
            )}
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
                      {[...state.users].sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
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
                        if (kind === "n") {
                          const name = v.row.projectRaw.trim();
                          const memberIds = [...new Set(
                            withStatus
                              .filter((x) => x.row.userId && normText(x.row.projectRaw) === normText(name))
                              .map((x) => x.row.userId as string),
                          )];
                          const np: Project = {
                            id: uid(), clientId: null, name, color: COLORS[state.projects.length % COLORS.length],
                            status: "activo", budgetHours: null, memberIds, flightActivityId: null,
                          };
                          dispatch({ type: "patch", patch: { projects: [...state.projects, np] } });
                          dispatch({ type: "audit", action: "Proyecto creado desde importación de horas", detail: name });
                          setRows((prev) =>
                            prev.map((r) => (!r.projectMatched && normText(r.projectRaw) === normText(name)
                              ? { ...r, projectId: np.id, subProjectId: null, projectMatched: true }
                              : r)),
                          );
                          toast(`Proyecto "${name}" creado y vinculado.`);
                        } else if (kind === "p") updateRow(v.row.id, { projectId: id, subProjectId: null, projectMatched: true });
                        else {
                          const sp = state.subProjects.find((x) => x.id === id);
                          updateRow(v.row.id, { projectId: sp?.projectId ?? null, subProjectId: id, projectMatched: true });
                        }
                      }}
                    >
                      <option value="">{v.row.projectRaw ? `${v.row.projectRaw} (sin match)` : "Sin proyecto — elegir…"}</option>
                      {v.row.projectRaw && <option value="n:1">+ Crear "{v.row.projectRaw}" en Clientes y proyectos</option>}
                      {[...state.projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>{p.name}</option>
                      ))}
                      {[...state.subProjects]
                        .map((sp) => ({ sp, label: `${state.projects.find((p) => p.id === sp.projectId)?.name ?? ""} / ${sp.name}` }))
                        .sort((a, b) => a.label.localeCompare(b.label))
                        .map(({ sp, label }) => (
                          <option key={sp.id} value={`s:${sp.id}`}>{label}</option>
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

/** Recorre TODOS los registros de horas ya cargados (no solo los de un archivo)
 * y agrega a cada proyecto, como miembro, a cualquier persona que tenga horas
 * cargadas ahí y todavía no figure en su equipo — típico de proyectos creados
 * por una importación vieja que no cargó el equipo. */
export function SyncProjectMembersPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const missingCount = useMemo(() => {
    const byProject = new Map<string, Set<string>>();
    for (const e of state.entries) {
      if (!e.projectId) continue;
      if (!byProject.has(e.projectId)) byProject.set(e.projectId, new Set());
      byProject.get(e.projectId)!.add(e.userId);
    }
    let count = 0;
    for (const p of state.projects) {
      const withEntries = byProject.get(p.id);
      if (!withEntries) continue;
      for (const uid of withEntries) if (!p.memberIds.includes(uid)) count++;
    }
    return count;
  }, [state.entries, state.projects]);

  function sync() {
    const byProject = new Map<string, Set<string>>();
    for (const e of state.entries) {
      if (!e.projectId) continue;
      if (!byProject.has(e.projectId)) byProject.set(e.projectId, new Set());
      byProject.get(e.projectId)!.add(e.userId);
    }
    let added = 0;
    let touched = 0;
    const projects = state.projects.map((p) => {
      const withEntries = byProject.get(p.id);
      if (!withEntries) return p;
      const missing = [...withEntries].filter((uid) => !p.memberIds.includes(uid));
      if (missing.length === 0) return p;
      added += missing.length;
      touched += 1;
      return { ...p, memberIds: [...p.memberIds, ...missing] };
    });
    if (added === 0) {
      toast("Ya está todo sincronizado — nadie para agregar.");
      return;
    }
    dispatch({ type: "patch", patch: { projects } });
    dispatch({
      type: "audit",
      action: "Equipos de proyecto sincronizados con horas cargadas",
      detail: `${added} persona(s) agregadas en ${touched} proyecto(s)`,
    });
    toast(`${added} persona${added !== 1 ? "s" : ""} agregada${added !== 1 ? "s" : ""} en ${touched} proyecto${touched !== 1 ? "s" : ""}.`);
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="card-title">Sincronizar equipos de proyecto con horas cargadas</div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10 }}>
        Agrega, en cada proyecto, a cualquier persona que ya tenga horas cargadas ahí y todavía no figure en su equipo
        — pasa sobre todos los registros ya existentes, no hace falta volver a importar nada. Útil sobre todo después
        de una importación vieja que no cargó el equipo de los proyectos que fue creando.
      </p>
      <button className="btn btn-secondary" onClick={sync} disabled={missingCount === 0}>
        <Icon name="users" size={14} /> {missingCount > 0 ? `Agregar ${missingCount} persona(s) a sus proyectos` : "Nada para sincronizar"}
      </button>
    </div>
  );
}

/** Minutos de un día completo de trabajo para esta persona — mismo criterio que
 * usa el resto de la app (compensationMinutes en store.tsx) para convertir
 * días en minutos. */
function dailyMinutesOf(u: User): number {
  return u.jornada === "media" ? 4 * 60 : (u.weeklyHours * 60) / Math.max(1, u.workDays.length);
}

type SaldoTipo = "festivo" | "vacaciones";

/** Carga manual, persona por persona, de lo que se venía llevando afuera de TEMPO
 * — por ejemplo en una planilla de Excel. Cada tipo va a su propio registro:
 * un festivo o fin de semana trabajado arma un registro de horas extra ya
 * aprobado (lo que overtimeBalance() en store.tsx suma para mostrar "horas
 * extra disponibles" al pedir Compensación de horas); unas vacaciones arman
 * una ausencia de tipo Vacaciones ya aprobada, que vacationInfo() descuenta
 * del período que corresponda según su fecha. No tiene límite de una sola vez:
 * sirve también para un ajuste puntual más adelante. */
export function CompDaysBalancePanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="card-title">Cargar saldo (festivos trabajados o vacaciones)</div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10 }}>
        Para arrancar a alguien con lo que ya tenía afuera de TEMPO. Los festivos o fines de semana trabajados quedan
        como horas extra ya aprobadas; las vacaciones quedan como una ausencia aprobada — cada uno en su propio
        registro, sin mezclarse.
      </p>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> Cargar saldo
      </button>
      {open && <CargarSaldoModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function CargarSaldoModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const activeUsers = useMemo(
    () => state.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)),
    [state.users],
  );
  const [tipo, setTipo] = useState<SaldoTipo>("festivo");
  const [userId, setUserId] = useState(activeUsers[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [note, setNote] = useState("");

  const user = state.users.find((u) => u.id === userId);
  const daysNum = Number(days.replace(",", "."));
  const validFestivo = Boolean(user) && Number.isFinite(daysNum) && daysNum > 0;
  const minutes = user && validFestivo ? Math.round(daysNum * dailyMinutesOf(user)) : 0;

  const holidays = useMemo(() => holidayDateSet(state), [state.holidays]);
  const vacDays = user
    ? countWorkDays(dateFrom, dateTo, user.jornada === "media" ? [1, 2, 3, 4, 5] : user.workDays, holidays)
    : 0;
  const validVacaciones = Boolean(user) && Boolean(dateFrom) && Boolean(dateTo) && dateTo >= dateFrom && vacDays > 0;

  const valid = tipo === "festivo" ? validFestivo : validVacaciones;

  function cargar() {
    if (!user || !valid) return;
    if (tipo === "festivo") {
      const o: OvertimeRequest = {
        id: uid(),
        userId: user.id,
        // Una semana atrás para no mezclarse en la tabla de Control de horas con
        // la semana en curso; el saldo lo suma igual sin importar la fecha.
        weekStart: weekStart(addDays(today(), -7)),
        minutes,
        status: "Aprobado",
        createdAt: today(),
        resolvedBy: state.currentUserId,
        resolvedAt: today(),
        supervisorComment: note.trim() || `Saldo cargado a mano: ${daysNum} día(s) de festivo/FDS trabajado.`,
      };
      dispatch({ type: "addOvertime", o });
      dispatch({
        type: "audit",
        action: "Saldo de festivo/FDS cargado a mano",
        detail: `${user.name}: ${daysNum} día(s)`,
      });
      toast(`Cargado: ${user.name} suma ${daysNum} día(s) de festivo/FDS trabajado.`);
    } else {
      const absence: AbsenceRequest = {
        id: uid(),
        userId: user.id,
        type: "Vacaciones",
        dateFrom,
        dateTo,
        reason: note.trim() || "Vacaciones cargadas a mano (saldo previo a TEMPO)",
        attachments: [],
        status: "Aprobado",
        createdAt: today(),
        resolvedBy: state.currentUserId,
        resolvedAt: today(),
      };
      dispatch({ type: "addAbsence", absence });
      dispatch({
        type: "audit",
        action: "Vacaciones cargadas a mano",
        detail: `${user.name}: ${dateFrom} a ${dateTo} (${vacDays} día(s) hábiles)`,
      });
      toast(`Cargado: ${user.name} suma ${vacDays} día(s) de vacaciones (${dateFrom} a ${dateTo}).`);
    }
    onClose();
  }

  return (
    <Modal
      title="Cargar saldo"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={cargar} disabled={!valid}>Cargar</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Tipo</label>
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as SaldoTipo)}>
            <option value="festivo">Festivo o fin de semana trabajado</option>
            <option value="vacaciones">Vacaciones</option>
          </select>
        </div>
        <div className="field">
          <label>Persona</label>
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {tipo === "festivo" ? (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Días a favor</label>
          <input
            type="number" className="input" min="0.5" step="0.5" placeholder="Ej: 18.5"
            value={days} onChange={(e) => setDays(e.target.value)}
          />
          {user && validFestivo && (
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
              Equivale a {minutes} minutos para {user.name} (jornada {user.jornada === "media" ? "media" : "completa"}).
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            Queda como horas extra ya aprobadas: la persona las ve al pedir una ausencia de <strong>Compensación de
            horas</strong>, con el mismo vencimiento a 1 año que las demás. Solo admite días a favor — si alguien
            debe días, se resuelve a mano con esa persona.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className="form-grid">
            <div className="field">
              <label>Desde</label>
              <input type="date" className="input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value); }} />
            </div>
            <div className="field">
              <label>Hasta</label>
              <input type="date" className="input" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          {user && (
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
              {vacDays} día{vacDays !== 1 ? "s" : ""} hábil{vacDays !== 1 ? "es" : ""} según el calendario laboral de {user.name}.
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
            Queda como una ausencia de tipo <strong>Vacaciones</strong> ya aprobada, en su propio registro — se
            descuenta del período de antigüedad al que corresponda la fecha.
          </p>
        </div>
      )}

      <div className="field" style={{ marginTop: 10 }}>
        <label>Nota (opcional)</label>
        <input
          className="input" placeholder="Ej: Saldo acumulado 2025-2026 según planilla de vacaciones"
          value={note} onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ============================== Perfil profesional (formulario externo) ============================== */

/** "6 años" / "1.5" / "3 años aprox" / "2 y medio" -> 6 / 1.5 / 3 / 2.5.
 * El formulario de origen no fuerza formato numérico, así que llegan variantes
 * de texto libre — se toma el primer número que aparece y "medio" suma 0.5. */
function parseYears(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (/medio/.test(s) && !m[1].includes(".") && !m[1].includes(",")) n += 0.5;
  return Number.isFinite(n) ? n : null;
}

interface ProfileImportRow {
  rowNum: number;
  email: string;
  userId: string | null;
  userName: string | null;
  formacionAcademica: string;
  workExperienceSince: string | null;
  bimExperienceSince: string | null;
  certificadosUrls: string[];
  certificadoValidezUrl: string;
  error?: string;
}

async function parseProfileTable(file: File, state: AppState): Promise<{ rows: ProfileImportRow[]; headerError?: string }> {
  const table = await readTable(file);
  if (table.length < 2) return { rows: [], headerError: "El archivo no tiene filas de datos." };
  const header = table[0].map((h) => normText(cellToText(h)));
  const iEmail = findCol(header, ["correo electronico (quantia)", "correo electronico", "email", "correo"]);
  if (iEmail === -1) return { rows: [], headerError: "El archivo debe tener una columna de correo electrónico." };
  const iFormacion = findCol(header, ["formacion academica"]);
  const iCertificados = findCol(header, ["formacion complementaria - certificados"]);
  const iExpLaboral = findCol(header, ["anos de experiencia - laboral"]);
  const iCertValidez = findCol(header, ["certificado de validez laboral"]);
  const iExpBim = findCol(header, ["anos de experiencia - bim"]);

  const todayISO = today();
  const rows: ProfileImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cols = table[r];
    const email = cellToText(cols[iEmail]).trim();
    if (!email) continue;
    const user = state.users.find((u) => normText(u.email) === normText(email));
    const workYears = iExpLaboral >= 0 ? parseYears(cellToText(cols[iExpLaboral])) : null;
    const bimYears = iExpBim >= 0 ? parseYears(cellToText(cols[iExpBim])) : null;
    rows.push({
      rowNum: r + 1,
      email,
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      formacionAcademica: iFormacion >= 0 ? cellToText(cols[iFormacion]).trim() : "",
      workExperienceSince: workYears !== null ? yearsAgoISO(workYears, todayISO) : null,
      bimExperienceSince: bimYears !== null ? yearsAgoISO(bimYears, todayISO) : null,
      certificadosUrls: iCertificados >= 0 ? cellToText(cols[iCertificados]).split(",").map((s) => s.trim()).filter(Boolean) : [],
      certificadoValidezUrl: iCertValidez >= 0 ? cellToText(cols[iCertValidez]).trim() : "",
      error: user ? undefined : "No se encontró un usuario con ese email.",
    });
  }
  return { rows };
}

export function ProfessionalProfileImportPanel() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ProfileImportRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setImporting(true);
    try {
      const { rows: parsed, headerError } = await parseProfileTable(file, state);
      setFileError(headerError ?? "");
      setRows(parsed);
    } catch {
      setFileError("No se pudo leer el archivo. Verificá que sea el .xlsx o .csv de respuestas exportado desde Google Forms.");
      setRows([]);
    } finally {
      setImporting(false);
    }
  }

  function apply() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) return;

    const profiles = [...state.professionalProfiles];
    for (const row of valid) {
      const idx = profiles.findIndex((p) => p.id === row.userId);
      const prev: ProfessionalProfile = idx >= 0
        ? profiles[idx]
        : { id: row.userId!, workExperienceSince: null, bimExperienceSince: null, education: [], courses: [] };

      const education: ProfessionalEntry[] = [...prev.education];
      if (row.formacionAcademica && !education.some((e) => e.title === row.formacionAcademica)) {
        education.push({ id: uid(), title: row.formacionAcademica });
      }
      if (row.certificadoValidezUrl && !education.some((e) => e.fileUrl === row.certificadoValidezUrl)) {
        education.push({ id: uid(), title: "Certificado de validez laboral", fileUrl: row.certificadoValidezUrl });
      }

      const courses: ProfessionalEntry[] = [...prev.courses];
      for (const url of row.certificadosUrls) {
        if (courses.some((c) => c.fileUrl === url)) continue;
        const n = courses.filter((c) => c.title.startsWith("Certificado complementario")).length + 1;
        courses.push({ id: uid(), title: `Certificado complementario ${n}`, fileUrl: url });
      }

      const next: ProfessionalProfile = {
        id: row.userId!,
        workExperienceSince: row.workExperienceSince ?? prev.workExperienceSince,
        bimExperienceSince: row.bimExperienceSince ?? prev.bimExperienceSince,
        education,
        courses,
      };
      if (idx >= 0) profiles[idx] = next;
      else profiles.push(next);
    }

    dispatch({ type: "patch", patch: { professionalProfiles: profiles } });
    dispatch({ type: "audit", action: "Importación de perfil profesional", detail: `${valid.length} personas procesadas desde ${fileName}` });
    toast(`${valid.length} perfil${valid.length !== 1 ? "es" : ""} actualizado${valid.length !== 1 ? "s" : ""}.`);
    setRows([]);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.filter((r) => r.error).length;

  return (
    <ImportCard
      title="Perfil profesional (formulario externo)"
      description='Subí el .xlsx (o .csv) de respuestas exportado desde Google Forms. Columnas reconocidas: correo electrónico, Formación académica, Formación complementaria - Certificados (links separados por coma), Años de experiencia - Laboral, Certificado de validez laboral (link) y Años de experiencia - BIM. Se matchea por email contra los usuarios de TEMPO; "Años de experiencia" (acepta texto libre como "6 años" o "2 y medio") se convierte en la fecha de inicio que usa Formación. Si volvés a importar el mismo archivo no duplica formación ni certificados ya cargados.'
      inputRef={inputRef}
      onPick={onPick}
      fileName={fileName}
      accept=".xlsx,.xls,.csv"
      pickLabel="Elegir archivo de respuestas"
    >
      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="alert" size={13} /> {fileError}
        </p>
      )}
      {importing && <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>Leyendo archivo…</p>}
      {rows.length > 0 && !fileError && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
            <span className="badge ok">{validCount} listas para importar</span>
            {errorCount > 0 && <span className="badge bad">{errorCount} sin usuario en TEMPO</span>}
          </div>
          <PreviewTable
            rows={rows}
            columns={[
              { label: "Fila", render: (r) => r.rowNum },
              { label: "Email", render: (r) => r.email },
              { label: "Persona", render: (r) => r.userName ?? "—" },
              { label: "Formación", render: (r) => r.formacionAcademica || "—" },
              { label: "Exp. laboral", render: (r) => (r.workExperienceSince ? fmtYearsSince(r.workExperienceSince) : "—") },
              { label: "Exp. BIM", render: (r) => (r.bimExperienceSince ? fmtYearsSince(r.bimExperienceSince) : "—") },
              { label: "Certificados", render: (r) => r.certificadosUrls.length + (r.certificadoValidezUrl ? 1 : 0) },
              {
                label: "Estado",
                render: (r) => (r.error ? <span className="badge bad">{r.error}</span> : <span className="badge ok">Listo</span>),
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
