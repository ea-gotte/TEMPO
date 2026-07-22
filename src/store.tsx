import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { AppState, User, TimeEntry, RunningTimer, AbsenceRequest, Notification, WeekValidation, OvertimeRequest, EmailRecord, Holiday, Client, Project, Team, Department } from "./types";
import { seedState } from "./data";
import { isoDate, uid, hashPassword } from "./utils";
import { supabase, isPasswordRecoveryLink } from "./supabase";

const LS_KEY = "tempo-state-v1";

type Action =
  | { type: "patch"; patch: Partial<AppState> }
  | { type: "login"; userId: string }
  | { type: "logout" }
  | { type: "toggleTheme" }
  | { type: "addEntry"; entry: TimeEntry }
  | { type: "updateEntry"; entry: TimeEntry }
  | { type: "deleteEntry"; id: string }
  | { type: "addEntries"; entries: TimeEntry[] }
  | { type: "startTimer"; timer: RunningTimer }
  | { type: "stopTimer"; id: string; discard?: boolean; entry?: TimeEntry }
  | { type: "addAbsence"; absence: AbsenceRequest }
  | { type: "resolveAbsence"; id: string; status: "Aprobado" | "Rechazado"; comment: string; by: string }
  | { type: "validateWeek"; v: WeekValidation }
  | { type: "unvalidateWeek"; userId: string; weekStart: string }
  | { type: "addOvertime"; o: OvertimeRequest }
  | { type: "resolveOvertime"; id: string; status: "Aprobado" | "Rechazado"; comment: string; by: string }
  | { type: "notify"; n: Omit<Notification, "id" | "read" | "date"> }
  | { type: "markNotifsRead" }
  | { type: "audit"; action: string; detail: string }
  | { type: "syncEntries"; entries: TimeEntry[] }
  | { type: "syncAbsences"; absences: AbsenceRequest[] }
  | { type: "addHoliday"; holiday: Holiday }
  | { type: "deleteHoliday"; id: string }
  | { type: "syncHolidays"; holidays: Holiday[] }
  | { type: "syncClients"; clients: Client[] }
  | { type: "syncProjects"; projects: Project[] }
  | { type: "syncTeams"; teams: Team[] }
  | { type: "syncDepartments"; departments: Department[] };

/** Construye el registro que resulta de detener un cronómetro (compartido con la sincronización a Supabase) */
function buildStoppedEntry(t: RunningTimer, currentUserId: string): TimeEntry {
  const now = new Date();
  const started = new Date(t.startedAt);
  const sameDay = isoDate(started);
  const startMin = started.getHours() * 60 + started.getMinutes();
  const endMinRaw = isoDate(now) === sameDay ? now.getHours() * 60 + now.getMinutes() : 24 * 60 - 1;
  const endMin = Math.max(endMinRaw, startMin + 1);
  return {
    id: uid(),
    userId: currentUserId,
    projectId: t.projectId,
    taskId: t.taskId,
    description: t.description,
    tagIds: t.tagIds,
    date: sameDay,
    start: startMin,
    end: endMin,
    billable: t.billable,
  };
}

function withAudit(s: AppState, action: string, detail: string): AppState {
  return {
    ...s,
    audit: [
      { id: uid(), at: new Date().toISOString(), userId: s.currentUserId, action, detail },
      ...s.audit,
    ].slice(0, 300),
  };
}

/**
 * Toda notificación nueva genera automáticamente una copia por correo,
 * dirigida a la persona relacionada (o al usuario actual) — bandeja de salida.
 */
function mirrorNotificationsToEmail(prev: AppState, next: AppState): AppState {
  if (next.notifications === prev.notifications || next.notifications.length <= prev.notifications.length) {
    return next;
  }
  const added = next.notifications.slice(0, next.notifications.length - prev.notifications.length);
  const currentEmail = next.users.find((u) => u.id === next.currentUserId)?.email ?? "";
  const newEmails: EmailRecord[] = added.map((n) => ({
    id: uid(),
    to: currentEmail,
    subject: `[TEMPO] ${n.title}`,
    body: n.body,
    at: new Date().toISOString(),
  }));
  return { ...next, emails: [...newEmails, ...next.emails] };
}

function reducer(s: AppState, a: Action): AppState {
  return mirrorNotificationsToEmail(s, baseReducer(s, a));
}

function baseReducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "patch":
      return { ...s, ...a.patch };
    case "login":
      return withAudit(
        { ...s, currentUserId: a.userId, authenticated: true },
        "Inicio de sesión",
        s.users.find((u) => u.id === a.userId)?.email ?? a.userId,
      );
    case "logout":
      return withAudit({ ...s, authenticated: false }, "Cierre de sesión", s.users.find((u) => u.id === s.currentUserId)?.email ?? "");
    case "toggleTheme":
      return { ...s, theme: s.theme === "light" ? "dark" : "light" };
    case "addEntry":
      return withAudit({ ...s, entries: [...s.entries, a.entry] }, "Registro creado", a.entry.description || "(sin descripción)");
    case "updateEntry":
      return withAudit(
        { ...s, entries: s.entries.map((e) => (e.id === a.entry.id ? a.entry : e)) },
        "Registro modificado",
        a.entry.description || a.entry.id,
      );
    case "deleteEntry": {
      const e = s.entries.find((x) => x.id === a.id);
      return withAudit(
        { ...s, entries: s.entries.filter((x) => x.id !== a.id) },
        "Registro eliminado",
        e?.description || a.id,
      );
    }
    case "addEntries":
      return withAudit({ ...s, entries: [...s.entries, ...a.entries] }, "Registros copiados", `${a.entries.length} registros`);
    case "startTimer":
      return withAudit({ ...s, timers: [...s.timers, a.timer] }, "Cronómetro iniciado", a.timer.description || "(sin descripción)");
    case "stopTimer": {
      const t = s.timers.find((x) => x.id === a.id);
      if (!t) return s;
      const rest = s.timers.filter((x) => x.id !== a.id);
      if (a.discard) return withAudit({ ...s, timers: rest }, "Cronómetro descartado", t.description || "");
      const entry = a.entry ?? buildStoppedEntry(t, s.currentUserId);
      return withAudit({ ...s, timers: rest, entries: [...s.entries, entry] }, "Cronómetro detenido", t.description || "");
    }
    case "addAbsence":
      return withAudit(
        {
          ...s,
          absences: [a.absence, ...s.absences],
          notifications: [
            {
              id: uid(), kind: "solicitud", title: "Solicitud enviada",
              body: `${a.absence.type} del ${a.absence.dateFrom} al ${a.absence.dateTo}.`,
              date: isoDate(new Date()), read: false,
            },
            ...s.notifications,
          ],
        },
        "Solicitud de ausencia",
        a.absence.type,
      );
    case "resolveAbsence": {
      const ab = s.absences.find((x) => x.id === a.id);
      if (!ab) return s;
      return withAudit(
        {
          ...s,
          absences: s.absences.map((x) =>
            x.id === a.id ? { ...x, status: a.status, supervisorComment: a.comment, resolvedBy: a.by, resolvedAt: isoDate(new Date()) } : x,
          ),
          notifications: [
            {
              id: uid(), kind: "aprobacion",
              title: `Solicitud ${a.status.toLowerCase()}`,
              body: `${ab.type} (${ab.dateFrom}) fue ${a.status.toLowerCase()}.`,
              date: isoDate(new Date()), read: false,
            },
            ...s.notifications,
          ],
        },
        `Ausencia ${a.status.toLowerCase()}`,
        ab.type,
      );
    }
    case "validateWeek":
      return withAudit(
        { ...s, validations: [...s.validations.filter((x) => !(x.userId === a.v.userId && x.weekStart === a.v.weekStart)), a.v] },
        "Semana validada",
        `Usuario ${s.users.find((u) => u.id === a.v.userId)?.name ?? a.v.userId} · semana ${a.v.weekStart}`,
      );
    case "unvalidateWeek":
      return withAudit(
        { ...s, validations: s.validations.filter((x) => !(x.userId === a.userId && x.weekStart === a.weekStart)) },
        "Validación deshecha",
        `Usuario ${s.users.find((u) => u.id === a.userId)?.name ?? a.userId} · semana ${a.weekStart}`,
      );
    case "addOvertime":
      return withAudit(
        {
          ...s,
          overtime: [a.o, ...s.overtime],
          notifications: [
            {
              id: uid(), kind: "exceso", title: "Horas extra informadas",
              body: `${s.users.find((u) => u.id === a.o.userId)?.name ?? "?"}: ${Math.round(a.o.minutes / 60 * 10) / 10} h extra (semana ${a.o.weekStart}) enviadas a supervisión.`,
              date: isoDate(new Date()), read: false,
            },
            ...s.notifications,
          ],
        },
        "Horas extra informadas",
        `Semana ${a.o.weekStart} · ${a.o.minutes} min`,
      );
    case "resolveOvertime": {
      const o = s.overtime.find((x) => x.id === a.id);
      if (!o) return s;
      return withAudit(
        {
          ...s,
          overtime: s.overtime.map((x) =>
            x.id === a.id ? { ...x, status: a.status, supervisorComment: a.comment, resolvedBy: a.by, resolvedAt: isoDate(new Date()) } : x,
          ),
          notifications: [
            {
              id: uid(), kind: "aprobacion",
              title: `Horas extra ${a.status.toLowerCase()}s`,
              body: `${Math.round(o.minutes / 60 * 10) / 10} h extra de la semana ${o.weekStart} fueron ${a.status.toLowerCase()}s${a.status === "Aprobado" ? " y ya se pueden recuperar como compensación" : ""}.`,
              date: isoDate(new Date()), read: false,
            },
            ...s.notifications,
          ],
        },
        `Horas extra ${a.status.toLowerCase()}s`,
        `Semana ${o.weekStart}`,
      );
    }
    case "notify":
      return {
        ...s,
        notifications: [{ id: uid(), read: false, date: isoDate(new Date()), ...a.n }, ...s.notifications],
      };
    case "markNotifsRead":
      return { ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) };
    case "audit":
      return withAudit(s, a.action, a.detail);
    case "syncEntries":
      return { ...s, entries: a.entries };
    case "syncAbsences":
      return { ...s, absences: a.absences };
    case "addHoliday":
      return withAudit({ ...s, holidays: [...s.holidays, a.holiday] }, "Feriado agregado", `${a.holiday.title} (${a.holiday.date})`);
    case "deleteHoliday": {
      const h = s.holidays.find((x) => x.id === a.id);
      return withAudit({ ...s, holidays: s.holidays.filter((x) => x.id !== a.id) }, "Feriado eliminado", h?.title ?? a.id);
    }
    case "syncHolidays":
      return { ...s, holidays: a.holidays };
    case "syncClients":
      return { ...s, clients: a.clients };
    case "syncProjects":
      return { ...s, projects: a.projects };
    case "syncTeams":
      return { ...s, teams: a.teams };
    case "syncDepartments":
      return { ...s, departments: a.departments };
  }
}

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.users && parsed.entries) {
        // Migración de estados guardados con versiones anteriores del esquema
        const defaults = seedState();
        return {
          ...parsed,
          validations: parsed.validations ?? [],
          overtime: parsed.overtime ?? [],
          emails: parsed.emails ?? [],
          holidays: [],
          authenticated: parsed.authenticated ?? false,
          passwordRecovery: isPasswordRecoveryLink,
          rolePermissions: parsed.rolePermissions ?? defaults.rolePermissions,
          leaveTypeConfig: parsed.leaveTypeConfig ?? defaults.leaveTypeConfig,
          users: [],
          projects: parsed.projects.map((p) => ({
            ...p,
            memberIds: p.memberIds ?? [],
          })),
          absences: parsed.absences.map((a) => ({
            ...a,
            // Versiones anteriores guardaban adjuntos como string[]
            attachments: (a.attachments ?? []).map((f: unknown) =>
              typeof f === "string" ? { name: f } : (f as { name: string; url?: string }),
            ),
          })),
        };
      }
    }
  } catch {
    /* seed */
  }
  return { ...seedState(), passwordRecovery: isPasswordRecoveryLink };
}

/**
 * Guarda el estado en localStorage. Los adjuntos (data URLs) pueden ser grandes
 * y superar la cuota; si eso pasa, se guarda una versión sin el contenido de los
 * adjuntos para no perder el resto (siguen descargables en la sesión actual).
 */
function persist(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...state, users: [] }));
  } catch {
    try {
      const light: AppState = {
        ...state,
        users: [],
        absences: state.absences.map((a) => ({
          ...a,
          attachments: a.attachments.map((f) => ({ name: f.name, size: f.size })),
        })),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(light));
    } catch {
      /* sin espacio: se mantiene solo en memoria */
    }
  }
}

// ============================================================
// Sincronización con Supabase de registros de horas y ausencias (Fase 1)
// ============================================================

function toEntryRow(e: TimeEntry) {
  return {
    id: e.id,
    user_id: e.userId,
    project_id: e.projectId,
    task_id: e.taskId,
    description: e.description,
    tag_ids: e.tagIds,
    date: e.date,
    start_min: e.start,
    end_min: e.end,
    billable: e.billable,
    favorite: e.favorite ?? false,
    recurring: e.recurring ?? null,
  };
}

function fromEntryRow(r: any): TimeEntry {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    taskId: r.task_id,
    description: r.description ?? "",
    tagIds: r.tag_ids ?? [],
    date: r.date,
    start: r.start_min,
    end: r.end_min,
    billable: r.billable,
    favorite: r.favorite,
    recurring: r.recurring,
  };
}

function toAbsenceRow(a: AbsenceRequest) {
  return {
    id: a.id,
    user_id: a.userId,
    type: a.type,
    date_from: a.dateFrom,
    date_to: a.dateTo,
    time_from: a.timeFrom ?? null,
    time_to: a.timeTo ?? null,
    reason: a.reason,
    attachments: a.attachments,
    status: a.status,
    supervisor_comment: a.supervisorComment ?? null,
    created_at: a.createdAt,
    resolved_by: a.resolvedBy ?? null,
    resolved_at: a.resolvedAt ?? null,
  };
}

function fromAbsenceRow(r: any): AbsenceRequest {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    timeFrom: r.time_from ?? undefined,
    timeTo: r.time_to ?? undefined,
    reason: r.reason ?? "",
    attachments: r.attachments ?? [],
    status: r.status,
    supervisorComment: r.supervisor_comment ?? undefined,
    createdAt: r.created_at,
    resolvedBy: r.resolved_by ?? undefined,
    resolvedAt: r.resolved_at ?? undefined,
  };
}

function toHolidayRow(h: Holiday) {
  return { id: h.id, date: h.date, type: h.type, title: h.title };
}

function fromHolidayRow(r: any): Holiday {
  return { id: r.id, date: r.date, type: r.type, title: r.title };
}

function toClientRow(c: Client) {
  return { id: c.id, name: c.name, color: c.color, archived: c.archived ?? false };
}
function fromClientRow(r: any): Client {
  return { id: r.id, name: r.name, color: r.color, archived: r.archived ?? false };
}

function toProjectRow(p: Project) {
  return {
    id: p.id,
    client_id: p.clientId,
    name: p.name,
    color: p.color,
    status: p.status,
    billable: p.billable,
    hourly_rate: p.hourlyRate,
    cost_rate: p.costRate,
    budget_hours: p.budgetHours,
    tasks: p.tasks,
    member_ids: p.memberIds,
    notion_url: p.notionUrl ?? null,
  };
}
function fromProjectRow(r: any): Project {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    color: r.color,
    status: r.status,
    billable: r.billable,
    hourlyRate: r.hourly_rate,
    costRate: r.cost_rate,
    budgetHours: r.budget_hours,
    tasks: r.tasks ?? [],
    memberIds: r.member_ids ?? [],
    notionUrl: r.notion_url ?? undefined,
  };
}

function toTeamRow(t: Team) {
  return { id: t.id, name: t.name };
}
function fromTeamRow(r: any): Team {
  return { id: r.id, name: r.name };
}

function toDepartmentRow(d: Department) {
  return { id: d.id, name: d.name };
}
function fromDepartmentRow(r: any): Department {
  return { id: r.id, name: r.name };
}

async function fetchEntriesAndAbsences(dispatch: React.Dispatch<Action>) {
  const [
    { data: entryRows, error: entriesErr },
    { data: absenceRows, error: absencesErr },
    { data: holidayRows, error: holidaysErr },
    { data: clientRows, error: clientsErr },
    { data: projectRows, error: projectsErr },
    { data: teamRows, error: teamsErr },
    { data: departmentRows, error: departmentsErr },
  ] = await Promise.all([
    supabase.from("time_entries").select("*"),
    supabase.from("absence_requests").select("*"),
    supabase.from("holidays").select("*"),
    supabase.from("clients").select("*"),
    supabase.from("projects").select("*"),
    supabase.from("teams").select("*"),
    supabase.from("departments").select("*"),
  ]);
  if (entriesErr) console.warn("Error al leer time_entries:", entriesErr);
  if (absencesErr) console.warn("Error al leer absence_requests:", absencesErr);
  if (holidaysErr) console.warn("Error al leer holidays:", holidaysErr);
  if (clientsErr) console.warn("Error al leer clients:", clientsErr);
  if (projectsErr) console.warn("Error al leer projects:", projectsErr);
  if (teamsErr) console.warn("Error al leer teams:", teamsErr);
  if (departmentsErr) console.warn("Error al leer departments:", departmentsErr);
  dispatch({ type: "syncEntries", entries: (entryRows || []).map(fromEntryRow) });
  dispatch({ type: "syncAbsences", absences: (absenceRows || []).map(fromAbsenceRow) });
  dispatch({ type: "syncHolidays", holidays: (holidayRows || []).map(fromHolidayRow) });
  dispatch({ type: "syncClients", clients: (clientRows || []).map(fromClientRow) });
  dispatch({ type: "syncProjects", projects: (projectRows || []).map(fromProjectRow) });
  dispatch({ type: "syncTeams", teams: (teamRows || []).map(fromTeamRow) });
  dispatch({ type: "syncDepartments", departments: (departmentRows || []).map(fromDepartmentRow) });
}

/** Reconcilia una tabla completa contra Supabase: inserta lo nuevo, actualiza lo cambiado, borra lo quitado. */
async function reconcileTable<T extends { id: string }>(
  table: string,
  prevList: T[],
  nextList: T[],
  toRow: (item: T) => any,
): Promise<string | null> {
  const prevById = new Map(prevList.map((x) => [x.id, x]));
  const nextIds = new Set(nextList.map((x) => x.id));
  const toInsert = nextList.filter((x) => !prevById.has(x.id));
  const toUpdate = nextList.filter((x) => {
    const prev = prevById.get(x.id);
    return prev && JSON.stringify(prev) !== JSON.stringify(x);
  });
  const toDelete = prevList.filter((x) => !nextIds.has(x.id));

  const errors: string[] = [];
  if (toInsert.length > 0) {
    const { error } = await supabase.from(table).insert(toInsert.map(toRow));
    if (error) errors.push(error.message);
  }
  for (const item of toUpdate) {
    const { error } = await supabase.from(table).update(toRow(item)).eq("id", item.id);
    if (error) errors.push(error.message);
  }
  for (const item of toDelete) {
    const { error } = await supabase.from(table).delete().eq("id", item.id);
    if (error) errors.push(error.message);
  }
  return errors.length > 0 ? errors.join("; ") : null;
}

/** Refleja en Supabase las acciones que modifican registros de horas y ausencias. */
async function syncActionToSupabase(a: Action, prevState: AppState): Promise<string | null> {
  switch (a.type) {
    case "patch": {
      const errors: string[] = [];
      if (a.patch.clients) {
        const err = await reconcileTable("clients", prevState.clients, a.patch.clients, toClientRow);
        if (err) errors.push(err);
      }
      if (a.patch.projects) {
        const err = await reconcileTable("projects", prevState.projects, a.patch.projects, toProjectRow);
        if (err) errors.push(err);
      }
      if (a.patch.teams) {
        const err = await reconcileTable("teams", prevState.teams, a.patch.teams, toTeamRow);
        if (err) errors.push(err);
      }
      if (a.patch.departments) {
        const err = await reconcileTable("departments", prevState.departments, a.patch.departments, toDepartmentRow);
        if (err) errors.push(err);
      }
      return errors.length > 0 ? errors.join("; ") : null;
    }
    case "addEntry": {
      const { error } = await supabase.from("time_entries").insert(toEntryRow(a.entry));
      return error?.message ?? null;
    }
    case "updateEntry": {
      const { error } = await supabase.from("time_entries").update(toEntryRow(a.entry)).eq("id", a.entry.id);
      return error?.message ?? null;
    }
    case "deleteEntry": {
      const { error } = await supabase.from("time_entries").delete().eq("id", a.id);
      return error?.message ?? null;
    }
    case "addEntries": {
      if (a.entries.length === 0) return null;
      const { error } = await supabase.from("time_entries").insert(a.entries.map(toEntryRow));
      return error?.message ?? null;
    }
    case "stopTimer": {
      if (a.discard || !a.entry) return null;
      const { error } = await supabase.from("time_entries").insert(toEntryRow(a.entry));
      return error?.message ?? null;
    }
    case "addAbsence": {
      const { error } = await supabase.from("absence_requests").insert(toAbsenceRow(a.absence));
      return error?.message ?? null;
    }
    case "resolveAbsence": {
      const { error } = await supabase
        .from("absence_requests")
        .update({
          status: a.status,
          supervisor_comment: a.comment || null,
          resolved_by: a.by,
          resolved_at: isoDate(new Date()),
        })
        .eq("id", a.id);
      return error?.message ?? null;
    }
    case "addHoliday": {
      const { error } = await supabase.from("holidays").insert(toHolidayRow(a.holiday));
      return error?.message ?? null;
    }
    case "deleteHoliday": {
      const { error } = await supabase.from("holidays").delete().eq("id", a.id);
      return error?.message ?? null;
    }
    default:
      return null;
  }
}

const StoreCtx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    const id = setTimeout(() => persist(state), 300);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  // Sincronizar sesión y perfiles desde Supabase
  useEffect(() => {
    let authListener: any = null;
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          if (session) {
            const { data: profiles } = await supabase.from("profiles").select("*");

            const currentUserId = session.user.id;
            const mappedUsers: User[] = (profiles || []).map((p: any) => ({
              id: p.id,
              name: p.name || p.email?.split("@")[0] || "Usuario",
              email: p.email,
              password: "", // Supabase Auth maneja la clave
              role: p.role || "usuario",
              jornada: p.jornada || "completa",
              teamId: p.team_id || "t1",
              departmentId: p.department_id || "d1",
              supervisorId: p.supervisor_id || null,
              weeklyHours: p.weekly_hours || 40,
              workDays: [1, 2, 3, 4, 5],
              dayStart: p.day_start || "09:00",
              dayEnd: p.day_end || "18:00",
              birthday: p.birthday || "1990-01-01",
              hireDate: p.hire_date || "2024-01-01",
              active: p.active ?? true,
              online: p.online ?? true,
              mustChangePassword: p.must_change_password ?? false
            }));

            if (!mappedUsers.some((u) => u.id === currentUserId)) {
              const meta = session.user.user_metadata || {};
              mappedUsers.push({
                id: currentUserId,
                name: meta.name || session.user.email?.split("@")[0] || "Usuario",
                email: session.user.email || "",
                password: "",
                role: (meta.role as any) || "admin",
                jornada: (meta.jornada as any) || "completa",
                teamId: "t1",
                departmentId: "d1",
                supervisorId: null,
                weeklyHours: 40,
                workDays: [1, 2, 3, 4, 5],
                dayStart: "09:00",
                dayEnd: "18:00",
                birthday: "1990-01-01",
                hireDate: "2024-01-01",
                active: true,
                online: true,
                mustChangePassword: false
              });
            }

            dispatch({
              type: "patch",
              patch: {
                authenticated: true,
                currentUserId: currentUserId,
                users: mappedUsers,
                // El evento PASSWORD_RECOVERY se dispara al abrir el enlace del email de
                // recuperación: hay que mostrar el formulario de nueva clave en vez de la app.
                ...(event === "PASSWORD_RECOVERY" ? { passwordRecovery: true } : {}),
              }
            });
          } else {
            dispatch({
              type: "patch",
              patch: { authenticated: false, currentUserId: "", users: [], passwordRecovery: false, entries: [], absences: [] },
            });
          }
        } catch (dbErr) {
          console.warn("Supabase Database sync warning:", dbErr);
        }
      });
      authListener = subscription;
    } catch (authErr) {
      console.warn("Supabase Auth initialization failed:", authErr);
    }

    return () => {
      if (authListener) authListener.unsubscribe();
    };
  }, []);

  // Registros de horas y ausencias: carga inicial desde Supabase + Realtime para
  // reflejar cambios de otros usuarios (o de esta misma sesión en otra pestaña).
  useEffect(() => {
    if (!state.authenticated) return;
    let cancelled = false;
    const refetch = () => {
      if (!cancelled) fetchEntriesAndAbsences(dispatch);
    };
    refetch();
    const channel = supabase
      .channel("tempo-entries-absences")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_requests" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "departments" }, refetch)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [state.authenticated]);

  // Envuelve el dispatch: además de actualizar el estado local, refleja en Supabase
  // las acciones sobre registros de horas y ausencias.
  const syncedDispatch = useCallback<React.Dispatch<Action>>(
    (a) => {
      let finalAction = a;
      if (a.type === "stopTimer" && !a.discard && !a.entry) {
        const t = state.timers.find((x) => x.id === a.id);
        if (t) finalAction = { ...a, entry: buildStoppedEntry(t, state.currentUserId) };
      }
      dispatch(finalAction);
      syncActionToSupabase(finalAction, state).then((errMsg) => {
        if (!errMsg) return;
        console.warn("Supabase sync error:", errMsg);
        dispatch({
          type: "notify",
          n: { kind: "error", title: "Error al guardar", body: `No se pudo sincronizar un cambio con el servidor: ${errMsg}` },
        });
      });
    },
    [state],
  );

  const value = useMemo(() => ({ state, dispatch: syncedDispatch }), [state, syncedDispatch]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore fuera de StoreProvider");
  return ctx;
}

/**
 * Horas extra disponibles: horas extra aprobadas menos las ausencias de compensación aprobadas.
 */
export function validatedOvertimeMin(state: AppState, userId: string): number {
  const approvedOvertime = state.overtime
    .filter((o) => o.userId === userId && o.status === "Aprobado")
    .reduce((a, o) => a + o.minutes, 0);

  const usedCompensation = state.absences
    .filter((a) => a.userId === userId && a.type === "Compensación de horas" && a.status === "Aprobado")
    .reduce((acc, a) => {
      if (a.timeFrom && a.timeTo) {
        const [h1, m1] = a.timeFrom.split(":").map(Number);
        const [h2, m2] = a.timeTo.split(":").map(Number);
        const mins = h2 * 60 + m2 - (h1 * 60 + m1);
        return acc + (mins > 0 ? mins : 0);
      }
      const u = state.users.find((x) => x.id === userId);
      const dailyMin = u
        ? u.jornada === "media"
          ? 4 * 60
          : (u.weeklyHours * 60) / Math.max(1, u.workDays.length)
        : 8 * 60;
      const activeWorkDays = u ? (u.jornada === "media" ? [1, 2, 3, 4, 5] : u.workDays) : [1, 2, 3, 4, 5];
      const workDaysCount = countWorkDays(a.dateFrom, a.dateTo, activeWorkDays, holidayDateSet(state));
      return acc + Math.round(workDaysCount * dailyMin);
    }, 0);

  return Math.max(0, approvedOvertime - usedCompensation);
}

/** Proyectos visibles para un usuario: admin/supervisor ven todo; empleados solo donde son miembros */
export function visibleProjects(state: AppState, userId: string) {
  const u = state.users.find((x) => x.id === userId);
  if (!u || u.role !== "usuario") return state.projects;
  return state.projects.filter((p) => p.memberIds.includes(userId));
}

/** Días hábiles del usuario dentro de un rango de fechas (inclusive), excluyendo feriados */
function countWorkDays(from: string, to: string, workDays: number[], holidays?: Set<string>): number {
  let count = 0;
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  let guard = 0;
  while (d <= end && guard < 400) {
    const dow = ((d.getDay() + 6) % 7) + 1; // 1=Lun..7=Dom
    if (workDays.includes(dow) && !holidays?.has(isoDate(d))) count++;
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return count;
}

/** Fechas de feriados como set de strings YYYY-MM-DD, para excluirlas del conteo de días hábiles */
function holidayDateSet(state: AppState): Set<string> {
  return new Set(state.holidays.map((h) => h.date));
}

export interface VacationInfo {
  monthsWorked: number;
  entitled: number; // días hábiles del período vigente
  used: number; // días hábiles de vacaciones aprobadas en el período
  available: number;
  expiration: string; // vencimiento del período (próximo aniversario)
  daysToExpire: number;
}

/**
 * Contabilidad de vacaciones por antigüedad:
 * - 10 días hábiles por año, desde la fecha de ingreso (sin acumulación mensual).
 * - Vencimiento: el aniversario de ingreso siguiente; se notifica desde 3 meses antes.
 */
export function vacationInfo(state: AppState, userId: string, todayISO: string): VacationInfo {
  const u = state.users.find((x) => x.id === userId)!;
  const hire = new Date(u.hireDate + "T00:00:00");
  const now = new Date(todayISO + "T00:00:00");

  let monthsWorked = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
  if (now.getDate() < hire.getDate()) monthsWorked--;
  monthsWorked = Math.max(0, monthsWorked);

  const entitled = 10;

  // Período vigente: desde el último aniversario (o el ingreso) hasta el próximo aniversario
  const yearsDone = Math.floor(monthsWorked / 12);
  const periodStart = new Date(hire);
  periodStart.setFullYear(hire.getFullYear() + yearsDone);
  const periodEnd = new Date(hire);
  periodEnd.setFullYear(hire.getFullYear() + yearsDone + 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const holidays = holidayDateSet(state);
  const used = state.absences
    .filter(
      (a) =>
        a.userId === userId &&
        a.type === "Vacaciones" &&
        a.status === "Aprobado" &&
        a.dateFrom >= fmt(periodStart) &&
        a.dateFrom < fmt(periodEnd),
    )
    .reduce((acc, a) => acc + countWorkDays(a.dateFrom, a.dateTo, u.jornada === "media" ? [1, 2, 3, 4, 5] : u.workDays, holidays), 0);

  const expiration = fmt(periodEnd);
  const daysToExpire = Math.round((periodEnd.getTime() - now.getTime()) / 86400000);

  return { monthsWorked, entitled, used, available: Math.max(0, entitled - used), expiration, daysToExpire };
}

/** Solapamiento entre registros del mismo usuario y día */
export function overlaps(entries: TimeEntry[], candidate: TimeEntry): TimeEntry[] {
  return entries.filter(
    (e) =>
      e.id !== candidate.id &&
      e.userId === candidate.userId &&
      e.date === candidate.date &&
      e.start < candidate.end &&
      candidate.start < e.end,
  );
}
