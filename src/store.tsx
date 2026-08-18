import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { AppState, User, TimeEntry, RunningTimer, AbsenceRequest, Notification, OvertimeRequest, EmailRecord, Holiday, Client, Project, SubProject, AuditLog, CorpEvent, CompanySettings, RolePermission, LeaveTypeConfig, Tag, Role } from "./types";
import { seedState } from "./data";
import { isoDate, uid, hashPassword, addDays, addMonths, parseISO, today } from "./utils";
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
  | { type: "updateAbsence"; absence: AbsenceRequest }
  | { type: "deleteAbsence"; id: string }
  | { type: "addOvertime"; o: OvertimeRequest }
  | { type: "resolveOvertime"; id: string; status: "Aprobado" | "Rechazado"; comment: string; by: string }
  | { type: "updateOvertime"; o: OvertimeRequest }
  | { type: "deleteOvertime"; id: string }
  | { type: "notify"; n: Omit<Notification, "id" | "read" | "date"> }
  | { type: "markNotifsRead" }
  | { type: "syncNotifications"; notifications: Notification[] }
  | { type: "audit"; action: string; detail: string }
  | { type: "syncEntries"; entries: TimeEntry[] }
  | { type: "syncAbsences"; absences: AbsenceRequest[] }
  | { type: "addHoliday"; holiday: Holiday }
  | { type: "deleteHoliday"; id: string }
  | { type: "syncHolidays"; holidays: Holiday[] }
  | { type: "syncClients"; clients: Client[] }
  | { type: "syncProjects"; projects: Project[] }
  | { type: "syncSubProjects"; subProjects: SubProject[] }
  | { type: "syncOvertime"; overtime: OvertimeRequest[] }
  | { type: "syncAudit"; audit: AuditLog[] }
  | { type: "syncCorpEvents"; corpEvents: CorpEvent[] }
  | {
      type: "syncSettings";
      company: CompanySettings;
      rolePermissions: Record<Role, RolePermission[]>;
      leaveTypeConfig: LeaveTypeConfig[];
      tags: Tag[];
    };

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
    subProjectId: t.subProjectId,
    description: t.description,
    tagIds: t.tagIds,
    date: sameDay,
    start: startMin,
    end: endMin,
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
 * Agrega una notificación al estado LOCAL solo si es para el usuario actual — las
 * notificaciones para otras personas se insertan directo en el servidor (ver el caso
 * "notify"/"addAbsence"/etc. en syncActionToSupabase) y esa persona las recibe al
 * hacer fetch o por Realtime, no a través de este reducer.
 */
function withNotification(s: AppState, userId: string, n: Omit<Notification, "id" | "read" | "date" | "userId">): AppState {
  if (userId !== s.currentUserId) return s;
  return { ...s, notifications: [{ id: uid(), read: false, date: isoDate(new Date()), userId, ...n }, ...s.notifications] };
}

/** Contenido de las notificaciones ligadas a solicitudes — compartido entre el reducer
 * (aplicación local optimista) y syncActionToSupabase (fila real en el servidor), para
 * que ambos generen exactamente el mismo texto. */
type NotificationContent = Pick<Notification, "kind" | "title" | "body">;

function absenceSubmittedNotification(absence: AbsenceRequest): NotificationContent {
  return {
    kind: "solicitud", title: "Solicitud enviada",
    body: `${absence.type} del ${absence.dateFrom} al ${absence.dateTo}.`,
  };
}
function absenceResolvedNotification(absence: AbsenceRequest, status: "Aprobado" | "Rechazado"): NotificationContent {
  return {
    kind: "aprobacion", title: `Solicitud ${status.toLowerCase()}`,
    body: `${absence.type} (${absence.dateFrom}) fue ${status.toLowerCase()}.`,
  };
}
function overtimeSubmittedNotification(s: AppState, o: OvertimeRequest): NotificationContent {
  return {
    kind: "exceso", title: "Horas extra informadas",
    body: `${s.users.find((u) => u.id === o.userId)?.name ?? "?"}: ${Math.round(o.minutes / 60 * 10) / 10} h extra (semana ${o.weekStart}) enviadas a supervisión.`,
  };
}
function overtimeResolvedNotification(o: OvertimeRequest, status: "Aprobado" | "Rechazado"): NotificationContent {
  return {
    kind: "aprobacion", title: `Horas extra ${status.toLowerCase()}s`,
    body: `${Math.round(o.minutes / 60 * 10) / 10} h extra de la semana ${o.weekStart} fueron ${status.toLowerCase()}s${status === "Aprobado" ? " y ya se pueden recuperar como compensación" : ""}.`,
  };
}

/**
 * Toda notificación nueva genera automáticamente una copia por correo — bandeja de
 * salida. state.notifications solo contiene notificaciones dirigidas al usuario
 * actual (las de otras personas se guardan directo en el servidor, ver "notify" en
 * syncActionToSupabase), así que el destinatario siempre es el propio usuario.
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
    case "addAbsence": {
      const withAbsence = { ...s, absences: [a.absence, ...s.absences] };
      const notified = withNotification(withAbsence, a.absence.userId, absenceSubmittedNotification(a.absence));
      return withAudit(notified, "Solicitud de ausencia", a.absence.type);
    }
    case "resolveAbsence": {
      const ab = s.absences.find((x) => x.id === a.id);
      if (!ab) return s;
      const withResolved = {
        ...s,
        absences: s.absences.map((x) =>
          x.id === a.id ? { ...x, status: a.status, supervisorComment: a.comment, resolvedBy: a.by, resolvedAt: isoDate(new Date()) } : x,
        ),
      };
      const notified = withNotification(withResolved, ab.userId, absenceResolvedNotification(ab, a.status));
      return withAudit(
        notified,
        `Ausencia ${a.status.toLowerCase()}`,
        ab.type,
      );
    }
    case "updateAbsence":
      return withAudit(
        { ...s, absences: s.absences.map((x) => (x.id === a.absence.id ? a.absence : x)) },
        "Solicitud modificada",
        `${a.absence.type} · ${s.users.find((u) => u.id === a.absence.userId)?.name ?? a.absence.userId}`,
      );
    case "deleteAbsence": {
      const ab = s.absences.find((x) => x.id === a.id);
      return withAudit(
        { ...s, absences: s.absences.filter((x) => x.id !== a.id) },
        "Solicitud eliminada",
        ab ? `${ab.type} · ${s.users.find((u) => u.id === ab.userId)?.name ?? ab.userId}` : a.id,
      );
    }
    case "addOvertime": {
      const withOt = { ...s, overtime: [a.o, ...s.overtime] };
      const notified = withNotification(withOt, a.o.userId, overtimeSubmittedNotification(s, a.o));
      return withAudit(
        notified,
        "Horas extra informadas",
        `Semana ${a.o.weekStart} · ${a.o.minutes} min`,
      );
    }
    case "resolveOvertime": {
      const o = s.overtime.find((x) => x.id === a.id);
      if (!o) return s;
      const withResolved = {
        ...s,
        overtime: s.overtime.map((x) =>
          x.id === a.id ? { ...x, status: a.status, supervisorComment: a.comment, resolvedBy: a.by, resolvedAt: isoDate(new Date()) } : x,
        ),
      };
      const notified = withNotification(withResolved, o.userId, overtimeResolvedNotification(o, a.status));
      return withAudit(
        notified,
        `Horas extra ${a.status.toLowerCase()}s`,
        `Semana ${o.weekStart}`,
      );
    }
    case "updateOvertime":
      return withAudit(
        { ...s, overtime: s.overtime.map((x) => (x.id === a.o.id ? a.o : x)) },
        "Horas extra modificadas",
        `Semana ${a.o.weekStart} · ${s.users.find((u) => u.id === a.o.userId)?.name ?? a.o.userId}`,
      );
    case "deleteOvertime": {
      const o = s.overtime.find((x) => x.id === a.id);
      return withAudit(
        { ...s, overtime: s.overtime.filter((x) => x.id !== a.id) },
        "Horas extra eliminadas",
        o ? `Semana ${o.weekStart} · ${s.users.find((u) => u.id === o.userId)?.name ?? o.userId}` : a.id,
      );
    }
    case "notify": {
      if (a.n.userId !== s.currentUserId) return s;
      return {
        ...s,
        notifications: [{ id: uid(), read: false, date: isoDate(new Date()), ...a.n }, ...s.notifications],
      };
    }
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
    case "syncSubProjects":
      return { ...s, subProjects: a.subProjects };
    case "syncOvertime":
      return { ...s, overtime: a.overtime };
    case "syncAudit":
      return { ...s, audit: a.audit };
    case "syncCorpEvents":
      return { ...s, corpEvents: a.corpEvents };
    case "syncSettings":
      return { ...s, company: a.company, rolePermissions: a.rolePermissions, leaveTypeConfig: a.leaveTypeConfig, tags: a.tags };
    case "syncNotifications":
      return { ...s, notifications: a.notifications };
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
          subProjects: parsed.subProjects ?? [],
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
    sub_project_id: e.subProjectId,
    description: e.description,
    tag_ids: e.tagIds,
    date: e.date,
    start_min: e.start,
    end_min: e.end,
    favorite: e.favorite ?? false,
    recurring: e.recurring ?? null,
  };
}

function fromEntryRow(r: any): TimeEntry {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    subProjectId: r.sub_project_id ?? null,
    description: r.description ?? "",
    tagIds: r.tag_ids ?? [],
    date: r.date,
    start: r.start_min,
    end: r.end_min,
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
    budget_hours: p.budgetHours,
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
    budgetHours: r.budget_hours,
    memberIds: r.member_ids ?? [],
    notionUrl: r.notion_url ?? undefined,
  };
}

function toSubProjectRow(sp: SubProject) {
  return {
    id: sp.id,
    project_id: sp.projectId,
    name: sp.name,
    status: sp.status,
    budget_hours: sp.budgetHours,
  };
}
function fromSubProjectRow(r: any): SubProject {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    status: r.status,
    budgetHours: r.budget_hours,
  };
}

function toOvertimeRow(o: OvertimeRequest) {
  return {
    id: o.id,
    user_id: o.userId,
    week_start: o.weekStart,
    minutes: o.minutes,
    status: o.status,
    created_at: o.createdAt,
    resolved_by: o.resolvedBy ?? null,
    resolved_at: o.resolvedAt ?? null,
    supervisor_comment: o.supervisorComment ?? null,
  };
}
function fromOvertimeRow(r: any): OvertimeRequest {
  return {
    id: r.id,
    userId: r.user_id,
    weekStart: r.week_start,
    minutes: r.minutes,
    status: r.status,
    createdAt: r.created_at,
    resolvedBy: r.resolved_by ?? undefined,
    resolvedAt: r.resolved_at ?? undefined,
    supervisorComment: r.supervisor_comment ?? undefined,
  };
}

function toAuditRow(a: AuditLog) {
  return { id: a.id, at: a.at, user_id: a.userId, action: a.action, detail: a.detail };
}
function fromAuditRow(r: any): AuditLog {
  return { id: r.id, at: r.at, userId: r.user_id, action: r.action, detail: r.detail ?? "" };
}

function toCorpEventRow(e: CorpEvent) {
  return {
    id: e.id,
    date: e.date,
    type: e.type,
    title: e.title,
    all_day: e.allDay,
    time_from: e.timeFrom ?? null,
    time_to: e.timeTo ?? null,
  };
}
function fromCorpEventRow(r: any): CorpEvent {
  return {
    id: r.id,
    date: r.date,
    type: r.type,
    title: r.title,
    allDay: r.all_day ?? true,
    timeFrom: r.time_from ?? undefined,
    timeTo: r.time_to ?? undefined,
  };
}

function toNotificationRow(n: Notification) {
  return { id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body, date: n.date, read: n.read };
}
function fromNotificationRow(r: any): Notification {
  return { id: r.id, userId: r.user_id, kind: r.kind, title: r.title, body: r.body, date: r.date, read: r.read };
}

/** Config global de la app (empresa, permisos, tipos de licencia y etiquetas): una sola fila en app_settings. */
interface LocalSettings {
  company: CompanySettings;
  rolePermissions: Record<Role, RolePermission[]>;
  leaveTypeConfig: LeaveTypeConfig[];
  tags: Tag[];
}

/** PostgREST corta cualquier select() en el "Max Rows" configurado en el
 * proyecto de Supabase (1000 por defecto), en silencio y sin error — con el
 * equipo cargando horas todos los días, time_entries lo cruza fácil y la app
 * se queda cargando solo una parte sin que nadie se entere. Se pagina con
 * .range() hasta recibir una página vacía, sin asumir cuál es el límite real
 * del servidor (podría no ser 1000). */
async function fetchAllRows<T = any>(table: string, pageSize = 1000): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    from += data.length;
  }
  return { data: rows, error: null };
}

async function fetchEntriesAndAbsences(dispatch: React.Dispatch<Action>, localSettings: LocalSettings) {
  const [
    { data: entryRows, error: entriesErr },
    { data: absenceRows, error: absencesErr },
    { data: holidayRows, error: holidaysErr },
    { data: clientRows, error: clientsErr },
    { data: projectRows, error: projectsErr },
    { data: subProjectRows, error: subProjectsErr },
    { data: overtimeRows, error: overtimeErr },
    { data: auditRows, error: auditErr },
    { data: corpEventRows, error: corpEventsErr },
    { data: settingsRow, error: settingsErr },
    { data: notificationRows, error: notificationsErr },
  ] = await Promise.all([
    fetchAllRows("time_entries"),
    fetchAllRows("absence_requests"),
    fetchAllRows("holidays"),
    fetchAllRows("clients"),
    fetchAllRows("projects"),
    fetchAllRows("sub_projects"),
    fetchAllRows("overtime_requests"),
    supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(300),
    fetchAllRows("corp_events"),
    supabase.from("app_settings").select("*").eq("id", "global").maybeSingle(),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  if (entriesErr) console.warn("Error al leer time_entries:", entriesErr);
  if (absencesErr) console.warn("Error al leer absence_requests:", absencesErr);
  if (holidaysErr) console.warn("Error al leer holidays:", holidaysErr);
  if (clientsErr) console.warn("Error al leer clients:", clientsErr);
  if (projectsErr) console.warn("Error al leer projects:", projectsErr);
  if (subProjectsErr) console.warn("Error al leer sub_projects:", subProjectsErr);
  if (overtimeErr) console.warn("Error al leer overtime_requests:", overtimeErr);
  if (auditErr) console.warn("Error al leer audit_log:", auditErr);
  if (corpEventsErr) console.warn("Error al leer corp_events:", corpEventsErr);
  if (settingsErr) console.warn("Error al leer app_settings:", settingsErr);
  if (notificationsErr) console.warn("Error al leer notifications:", notificationsErr);
  dispatch({ type: "syncEntries", entries: (entryRows || []).map(fromEntryRow) });
  dispatch({ type: "syncAbsences", absences: (absenceRows || []).map(fromAbsenceRow) });
  dispatch({ type: "syncHolidays", holidays: (holidayRows || []).map(fromHolidayRow) });
  dispatch({ type: "syncClients", clients: (clientRows || []).map(fromClientRow) });
  dispatch({ type: "syncProjects", projects: (projectRows || []).map(fromProjectRow) });
  dispatch({ type: "syncSubProjects", subProjects: (subProjectRows || []).map(fromSubProjectRow) });
  dispatch({ type: "syncOvertime", overtime: (overtimeRows || []).map(fromOvertimeRow) });
  dispatch({ type: "syncAudit", audit: (auditRows || []).map(fromAuditRow) });
  dispatch({ type: "syncCorpEvents", corpEvents: (corpEventRows || []).map(fromCorpEventRow) });
  dispatch({ type: "syncNotifications", notifications: (notificationRows || []).map(fromNotificationRow) });
  if (settingsRow) {
    dispatch({
      type: "syncSettings",
      company: settingsRow.company,
      rolePermissions: settingsRow.role_permissions,
      leaveTypeConfig: settingsRow.leave_type_config,
      tags: settingsRow.tags,
    });
  } else if (!settingsErr) {
    // Todavía no existe la fila de configuración global: la inicializamos con los valores
    // actuales de este navegador (los de data.ts la primera vez que corre alguien).
    const { error } = await supabase.from("app_settings").upsert(
      {
        id: "global",
        company: localSettings.company,
        role_permissions: localSettings.rolePermissions,
        leave_type_config: localSettings.leaveTypeConfig,
        tags: localSettings.tags,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) console.warn("Error al inicializar app_settings:", error);
  }
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

/** Inserta una notificación en el servidor para su destinatario (no en la del emisor). */
async function insertNotification(userId: string, n: NotificationContent): Promise<string | null> {
  const { error } = await supabase.from("notifications").insert({
    id: uid(), user_id: userId, kind: n.kind, title: n.title, body: n.body,
    date: isoDate(new Date()), read: false,
  });
  return error?.message ?? null;
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
      if (a.patch.subProjects) {
        const err = await reconcileTable("sub_projects", prevState.subProjects, a.patch.subProjects, toSubProjectRow);
        if (err) errors.push(err);
      }
      if (a.patch.corpEvents) {
        const err = await reconcileTable("corp_events", prevState.corpEvents, a.patch.corpEvents, toCorpEventRow);
        if (err) errors.push(err);
      }
      if (a.patch.company || a.patch.tags || a.patch.rolePermissions || a.patch.leaveTypeConfig) {
        const { error } = await supabase
          .from("app_settings")
          .update({
            company: a.patch.company ?? prevState.company,
            role_permissions: a.patch.rolePermissions ?? prevState.rolePermissions,
            leave_type_config: a.patch.leaveTypeConfig ?? prevState.leaveTypeConfig,
            tags: a.patch.tags ?? prevState.tags,
          })
          .eq("id", "global");
        if (error) errors.push(error.message);
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
      const notifErr = await insertNotification(a.absence.userId, absenceSubmittedNotification(a.absence));
      return error?.message ?? notifErr;
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
      const ab = prevState.absences.find((x) => x.id === a.id);
      const notifErr = ab ? await insertNotification(ab.userId, absenceResolvedNotification(ab, a.status)) : null;
      return error?.message ?? notifErr;
    }
    case "updateAbsence": {
      const { error } = await supabase.from("absence_requests").update(toAbsenceRow(a.absence)).eq("id", a.absence.id);
      return error?.message ?? null;
    }
    case "deleteAbsence": {
      const { error } = await supabase.from("absence_requests").delete().eq("id", a.id);
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
    case "addOvertime": {
      const { error } = await supabase.from("overtime_requests").insert(toOvertimeRow(a.o));
      const notifErr = await insertNotification(a.o.userId, overtimeSubmittedNotification(prevState, a.o));
      return error?.message ?? notifErr;
    }
    case "resolveOvertime": {
      const { error } = await supabase
        .from("overtime_requests")
        .update({
          status: a.status,
          supervisor_comment: a.comment || null,
          resolved_by: a.by,
          resolved_at: isoDate(new Date()),
        })
        .eq("id", a.id);
      const o = prevState.overtime.find((x) => x.id === a.id);
      const notifErr = o ? await insertNotification(o.userId, overtimeResolvedNotification(o, a.status)) : null;
      return error?.message ?? notifErr;
    }
    case "updateOvertime": {
      const { error } = await supabase.from("overtime_requests").update(toOvertimeRow(a.o)).eq("id", a.o.id);
      return error?.message ?? null;
    }
    case "deleteOvertime": {
      const { error } = await supabase.from("overtime_requests").delete().eq("id", a.id);
      return error?.message ?? null;
    }
    case "notify":
      // Efímeras: solo un toast informativo del propio dispositivo, no vale la pena
      // guardarlas — evita escribir una fila por cada inicio/fin de cronómetro.
      if (a.n.kind === "timer-start" || a.n.kind === "timer-stop") return null;
      return await insertNotification(a.n.userId, a.n);
    case "markNotifsRead": {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", prevState.currentUserId).eq("read", false);
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

  // Si la pestaña queda en segundo plano/minimizada un buen rato, el navegador
  // pausa los temporizadores y el refresco automático del token de Supabase
  // (autoRefreshToken) puede no dispararse a tiempo — la app sigue mostrando
  // "con sesión" porque nunca revalida contra el reloj, pero el token que se
  // manda en cada request ya venció. Eso hacía que auth.uid() no matcheara del
  // lado del servidor y cualquier escritura (registros de horas, auditoría...)
  // rebotara con 42501, aunque en la app pareciera que todo seguía andando.
  //
  // getSession() (probado antes) revisa la sesión guardada pero no siempre
  // fuerza una renovación real cuando el token YA venció del todo — está
  // pensado para el caso "está por vencer", no "ya venció hace rato".
  // refreshSession() sí fuerza el intercambio del refresh token por uno nuevo,
  // sin importar el estado del access token actual. Si ni así se puede renovar
  // (el refresh token también quedó inválido — puede pasar con varias pestañas
  // compitiendo por el mismo refresh, que en Supabase es de un solo uso), lo
  // correcto es cerrar esa sesión rota en vez de dejarla fallando en silencio:
  // signOut() dispara el listener de abajo, que limpia el estado y muestra
  // el login de nuevo para volver a entrar con una sesión sana.
  useEffect(() => {
    async function revalidate() {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return; // sin sesión (no logueado): nada que renovar acá
      const expiresAt = (session.expires_at ?? 0) * 1000;
      // Solo forzar el refresh si el token ya venció o está por vencer (margen
      // de 60s) — si todavía es válido no hace falta tocarlo, para no pisarle
      // el refresh token (de un solo uso en Supabase) a otra pestaña abierta
      // con la misma cuenta.
      if (expiresAt - Date.now() > 60_000) return;
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn("No se pudo renovar la sesión de Supabase, cerrando sesión para volver a un login limpio:", error);
        await supabase.auth.signOut().catch(() => {});
      }
    }
    revalidate(); // también al montar, por si el token ya llegó vencido en la carga inicial
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
    };
  }, []);

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
              supervisorId: p.supervisor_id || null,
              weeklyHours: p.weekly_hours || 40,
              workDays: p.work_days && p.work_days.length > 0 ? p.work_days : [1, 2, 3, 4, 5],
              dayStart: p.day_start || "09:00",
              dayEnd: p.day_end || "18:00",
              birthday: p.birthday || "1990-01-01",
              hireDate: p.hire_date || "2024-01-01",
              calendarTz: p.calendar_tz || undefined,
              calendarTz2: p.calendar_tz2 || undefined,
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
              patch: { authenticated: false, currentUserId: "", users: [], passwordRecovery: false, entries: [], absences: [], notifications: [] },
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
    const localSettings: LocalSettings = {
      company: state.company,
      rolePermissions: state.rolePermissions,
      leaveTypeConfig: state.leaveTypeConfig,
      tags: state.tags,
    };
    const refetch = () => {
      if (!cancelled) fetchEntriesAndAbsences(dispatch, localSettings);
    };
    // Realtime dispara un evento POR FILA, no por operación: una importación
    // masiva (ej. Clockify) que inserta cientos de filas de golpe generaba
    // cientos de refetch/re-render casi simultáneos y la pantalla parpadeaba.
    // Con debounce, una ráfaga de eventos termina en un solo refetch cuando
    // la ráfaga se frena.
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refetch, 500);
    };
    refetch();
    const channel = supabase
      .channel("tempo-entries-absences")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_requests" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "sub_projects" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "overtime_requests" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "corp_events" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, debouncedRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, debouncedRefetch)
      // audit_log queda afuera a propósito: casi cualquier acción genera una fila ahí,
      // y traer las 300 de vuelta en cada una sería un refetch constante para poco beneficio.
      .subscribe();
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [state.authenticated]);

  // Auditoría: cada entrada NUEVA (no vista todavía en este navegador) que sea
  // propia se sube a Supabase. Se rastrea por id en un Set en vez de comparar
  // posiciones en el array — comparar "contra el primer id de la vez anterior"
  // se rompía apenas ese id dejaba de estar primero (p.ej. tras un refetch de
  // Realtime que reordena o reemplaza state.audit), tratando de vuelta filas ya
  // sincronizadas o ajenas como "nuevas" e intentando insertarlas — RLS
  // solo permite insertar auditoría propia (user_id = auth.uid()), así que eso
  // rebotaba con 42501 en el log de Supabase (ruidoso, pero sin romper nada).
  // No hace falta persistir el Set entre recargas: en la carga inicial ya se
  // trae todo lo propio existente desde la base, así que no hay nada legítimo
  // para volver a insertar hasta que ocurra una acción nueva.
  const syncedAuditIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!state.authenticated) return;
    const toSync = state.audit.filter((a) => a.userId === state.currentUserId && !syncedAuditIdsRef.current.has(a.id));
    if (toSync.length === 0) return;
    for (const a of toSync) syncedAuditIdsRef.current.add(a.id);
    // Log temporal de diagnóstico (42501 en audit_log que no se explica leyendo
    // el código): todo como texto plano (JSON.stringify) en vez de objetos
    // colapsables, para poder copiar la línea entera sin tener que expandir nada.
    const rowsForLog = toSync.map(toAuditRow);
    const me = state.users.find((u) => u.id === state.currentUserId);
    console.log(
      "[audit-sync] intento de upsert:",
      JSON.stringify({ currentUserId: state.currentUserId, meEmail: me?.email, meRole: me?.role, rows: rowsForLog }),
    );
    supabase
      .from("audit_log")
      .upsert(rowsForLog)
      .then(({ error, status, statusText }) => {
        if (error) {
          console.warn(
            "[audit-sync] ERROR:",
            JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint, status, statusText, rows: rowsForLog }),
          );
        }
      });
  }, [state.audit, state.authenticated, state.currentUserId]);

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
          n: { userId: state.currentUserId, kind: "error", title: "Error al guardar", body: `No se pudo sincronizar un cambio con el servidor: ${errMsg}` },
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

/** Después de 3 meses de la semana trabajada, esas horas extra ya no se pueden
 * reclamar/informar a supervisión. */
export function overtimeClaimDeadline(weekStartISO: string): string {
  return addMonths(weekStartISO, 3);
}

/** Minutos de una ausencia de "Compensación de horas" (por horario si está
 * cargado, si no por días hábiles a jornada completa/media del usuario). */
function compensationMinutes(state: AppState, userId: string, a: AbsenceRequest): number {
  if (a.timeFrom && a.timeTo) {
    const [h1, m1] = a.timeFrom.split(":").map(Number);
    const [h2, m2] = a.timeTo.split(":").map(Number);
    const mins = h2 * 60 + m2 - (h1 * 60 + m1);
    return mins > 0 ? mins : 0;
  }
  const u = state.users.find((x) => x.id === userId);
  const dailyMin = u ? (u.jornada === "media" ? 4 * 60 : (u.weeklyHours * 60) / Math.max(1, u.workDays.length)) : 8 * 60;
  const activeWorkDays = u ? (u.jornada === "media" ? [1, 2, 3, 4, 5] : u.workDays) : [1, 2, 3, 4, 5];
  const workDaysCount = countWorkDays(a.dateFrom, a.dateTo, activeWorkDays, holidayDateSet(state));
  return Math.round(workDaysCount * dailyMin);
}

export interface OvertimeBalance {
  availableMin: number; // saldo disponible ahora (sin vencer)
  expiredMin: number; // minutos que vencieron sin usarse (más de un año sin recuperar)
  expiringSoonMin: number; // de lo disponible, cuánto vence en los próximos 90 días
  nextExpiration: string | null; // fecha del vencimiento más próximo entre lo disponible
}

/**
 * Saldo de horas extra con vencimiento: cada semana de horas extra aprobada da
 * un año de plazo (desde esa semana) para recuperarla vía "Compensación de
 * horas"; lo que no se usa para entonces se pierde. El consumo se descuenta de
 * lo más antiguo primero (FIFO), como un saldo de puntos que vence.
 */
export function overtimeBalance(state: AppState, userId: string, todayISO: string = today()): OvertimeBalance {
  const lots = state.overtime
    .filter((o) => o.userId === userId && o.status === "Aprobado")
    .map((o) => ({ weekStart: o.weekStart, remaining: o.minutes }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const compensations = state.absences
    .filter((a) => a.userId === userId && a.type === "Compensación de horas" && a.status === "Aprobado")
    .map((a) => ({ dateFrom: a.dateFrom, minutes: compensationMinutes(state, userId, a) }))
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

  for (const c of compensations) {
    let toConsume = c.minutes;
    for (const lot of lots) {
      if (toConsume <= 0) break;
      const take = Math.min(lot.remaining, toConsume);
      lot.remaining -= take;
      toConsume -= take;
    }
  }

  let availableMin = 0;
  let expiredMin = 0;
  let expiringSoonMin = 0;
  let nextExpiration: string | null = null;
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    const expiresAt = addDays(lot.weekStart, 365);
    if (expiresAt <= todayISO) {
      expiredMin += lot.remaining;
      continue;
    }
    availableMin += lot.remaining;
    const daysLeft = Math.round((parseISO(expiresAt).getTime() - parseISO(todayISO).getTime()) / 86400000);
    if (daysLeft <= 90) expiringSoonMin += lot.remaining;
    if (!nextExpiration || expiresAt < nextExpiration) nextExpiration = expiresAt;
  }

  return { availableMin, expiredMin, expiringSoonMin, nextExpiration };
}

/**
 * Horas extra disponibles ahora mismo (aprobadas, menos lo ya recuperado, menos
 * lo vencido). Atajo sobre overtimeBalance() para los llamadores que solo
 * necesitan el número.
 */
export function validatedOvertimeMin(state: AppState, userId: string, todayISO: string = today()): number {
  return overtimeBalance(state, userId, todayISO).availableMin;
}

/** Proyectos visibles para un usuario: admin/gerente ven todo; usuario y supervisor
 * (que solo tiene acceso extra a Control de horas, no a proyectos) solo donde son miembros */
export function visibleProjects(state: AppState, userId: string) {
  const u = state.users.find((x) => x.id === userId);
  if (!u || (u.role !== "usuario" && u.role !== "supervisor")) return state.projects;
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

/** Todas las fechas (YYYY-MM-DD) de un rango, incluyendo ambos extremos */
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  let guard = 0;
  while (d <= to && guard < 400) {
    out.push(d);
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

function isWeekendDate(dateISO: string): boolean {
  const dow = parseISO(dateISO).getDay(); // 0=Dom, 6=Sáb
  return dow === 0 || dow === 6;
}

/**
 * Advertencias a mostrar al aprobar una solicitud de ausencia: superposición con otra
 * solicitud ya aprobada del mismo usuario, o que el rango caiga en fin de semana/feriado.
 * Son avisos, no bloqueos: el supervisor conserva la decisión final.
 */
export function absenceWarnings(state: AppState, absence: AbsenceRequest): string[] {
  const warnings: string[] = [];
  const overlapping = state.absences.filter(
    (o) =>
      o.id !== absence.id &&
      o.userId === absence.userId &&
      o.status === "Aprobado" &&
      o.dateFrom <= absence.dateTo &&
      absence.dateFrom <= o.dateTo,
  );
  for (const o of overlapping) {
    warnings.push(`Se superpone con otra solicitud aprobada: ${o.type} (${fmtDateShort(o.dateFrom)}${o.dateFrom !== o.dateTo ? ` → ${fmtDateShort(o.dateTo)}` : ""}).`);
  }

  const days = eachDate(absence.dateFrom, absence.dateTo);
  const holidays = holidayDateSet(state);
  const weekendDays = days.filter(isWeekendDate);
  const holidayDays = days.filter((d) => holidays.has(d));

  if (days.length > 0 && weekendDays.length === days.length) {
    warnings.push("Todo el rango solicitado cae en fin de semana.");
  } else if (weekendDays.length > 0) {
    warnings.push(`Incluye ${weekendDays.length} día${weekendDays.length !== 1 ? "s" : ""} de fin de semana.`);
  }
  if (holidayDays.length > 0) {
    const titles = holidayDays.map((d) => state.holidays.find((h) => h.date === d)?.title ?? d);
    warnings.push(`Incluye feriado${holidayDays.length !== 1 ? "s" : ""}: ${titles.join(", ")}.`);
  }
  return warnings;
}

/**
 * Advertencias a mostrar al aprobar horas extra: que esa semana se superponga con una
 * ausencia ya aprobada del mismo usuario. Aviso, no bloqueo.
 */
export function overtimeWarnings(state: AppState, ot: OvertimeRequest): string[] {
  const warnings: string[] = [];
  const weekEnd = addDays(ot.weekStart, 6);
  const overlapping = state.absences.filter(
    (a) => a.userId === ot.userId && a.status === "Aprobado" && a.dateFrom <= weekEnd && ot.weekStart <= a.dateTo,
  );
  for (const a of overlapping) {
    warnings.push(`Esa semana se superpone con una ausencia aprobada: ${a.type} (${fmtDateShort(a.dateFrom)}${a.dateFrom !== a.dateTo ? ` → ${fmtDateShort(a.dateTo)}` : ""}).`);
  }
  return warnings;
}

function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
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
