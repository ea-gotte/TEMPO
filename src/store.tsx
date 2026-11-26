import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { AppState, User, TimeEntry, RunningTimer, AbsenceRequest, AbsenceType, ID, Notification, OvertimeRequest, RequestEvent, EmailRecord, Holiday, Client, Project, SubProject, AuditLog, CorpEvent, CompanySettings, RolePermission, LeaveTypeConfig, Tag, Role, FlightCategory, FlightActivity, ProfessionalProfile, Survey, SurveyResponse, FeedbackItem } from "./types";
import { seedState } from "./data";
import { isoDate, uid, hashPassword, addDays, addMonths, parseISO, today, monthStart, monthEnd, minToHM } from "./utils";
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
  | { type: "pauseTimer"; id: string }
  | { type: "resumeTimer"; id: string }
  | { type: "stopTimer"; id: string; discard?: boolean; entries?: TimeEntry[] }
  | { type: "addAbsence"; absence: AbsenceRequest }
  | { type: "resolveAbsence"; id: string; status: "Aprobado" | "Rechazado" | "Devuelto"; comment: string; by: string }
  | { type: "updateAbsence"; absence: AbsenceRequest }
  | { type: "deleteAbsence"; id: string }
  | { type: "addOvertime"; o: OvertimeRequest }
  | { type: "resolveOvertime"; id: string; status: "Aprobado" | "Rechazado" | "Devuelto"; comment: string; by: string }
  | { type: "updateOvertime"; o: OvertimeRequest }
  | { type: "deleteOvertime"; id: string }
  | { type: "notify"; n: Omit<Notification, "id" | "read" | "date"> }
  | { type: "markNotifsRead" }
  | { type: "syncNotifications"; notifications: Notification[] }
  | { type: "audit"; action: string; detail: string }
  | { type: "syncEntries"; entries: TimeEntry[] }
  | { type: "applyEntryChanges"; upserts: TimeEntry[]; removeIds: ID[] }
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
  | { type: "syncFlightCategories"; flightCategories: FlightCategory[] }
  | { type: "syncFlightActivities"; flightActivities: FlightActivity[] }
  | { type: "syncProfessionalProfiles"; professionalProfiles: ProfessionalProfile[] }
  | { type: "syncSurveys"; surveys: Survey[] }
  | { type: "syncSurveyResponses"; surveyResponses: SurveyResponse[] }
  | { type: "syncFeedbackItems"; feedbackItems: FeedbackItem[] }
  | {
      type: "syncSettings";
      company: CompanySettings;
      rolePermissions: Record<Role, RolePermission[]>;
      leaveTypeConfig: LeaveTypeConfig[];
      tags: Tag[];
    };

/** Milisegundos trabajados de un cronómetro: los tramos cerrados por pausas más el
 * tramo en curso (si no está en pausa). */
export function timerActiveMs(t: RunningTimer, now = Date.now()): number {
  const closed = (t.segments ?? []).reduce((sum, s) => sum + (s.to - s.from), 0);
  return closed + (t.paused ? 0 : Math.max(0, now - t.startedAt));
}

/** Construye los registros que resultan de detener un cronómetro (compartido con la
 * sincronización a Supabase). Cada tramo trabajado entre pausas es un registro, así el
 * tiempo en pausa no se cuenta y el calendario muestra las horas reales. Los tramos que
 * quedan pegados o se pisan por el redondeo a minutos se unen en uno solo. */
function buildStoppedEntries(t: RunningTimer, currentUserId: string): TimeEntry[] {
  const now = Date.now();
  const segs = [...(t.segments ?? [])];
  if (!t.paused) segs.push({ from: t.startedAt, to: now });

  const entries: TimeEntry[] = [];
  for (const seg of segs) {
    const started = new Date(seg.from);
    const ended = new Date(seg.to);
    const date = isoDate(started);
    const start = started.getHours() * 60 + started.getMinutes();
    const endRaw = isoDate(ended) === date ? ended.getHours() * 60 + ended.getMinutes() : 24 * 60 - 1;
    const end = Math.max(endRaw, start + 1);
    const prev = entries[entries.length - 1];
    if (prev && prev.date === date && start <= prev.end) {
      prev.end = Math.max(prev.end, end);
      continue;
    }
    entries.push({
      id: uid(),
      userId: currentUserId,
      projectId: t.projectId,
      subProjectId: t.subProjectId,
      description: t.description,
      tagIds: t.tagIds,
      date,
      start,
      end,
    });
  }
  return entries;
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
const RESOLVE_ACTION = { Aprobado: "Aprobada", Rechazado: "Rechazada", Devuelto: "Devuelta" } as const;

/**
 * Suma una decisión al historial de la solicitud. Toda devolución queda registrada; las demás
 * decisiones solo cuando la solicitud ya tiene ida y vuelta (así una aprobación directa no cambia nada).
 */
function withResolutionEvent(
  history: RequestEvent[] | undefined,
  status: "Aprobado" | "Rechazado" | "Devuelto",
  by: string,
  comment: string,
): RequestEvent[] | undefined {
  if (status !== "Devuelto" && !history?.length) return history;
  return [...(history ?? []), { at: new Date().toISOString(), by, action: RESOLVE_ACTION[status], comment: comment.trim() || undefined }];
}

function absenceResolvedNotification(absence: AbsenceRequest, status: "Aprobado" | "Rechazado" | "Devuelto", comment = ""): NotificationContent {
  if (status === "Devuelto") {
    return {
      kind: "aprobacion", title: "Solicitud devuelta",
      body: `${absence.type} (${absence.dateFrom}) volvió con observaciones${comment ? `: ${comment}` : ""}. Corregila y reenviala.`,
    };
  }
  return {
    kind: "aprobacion", title: `Solicitud ${status.toLowerCase()}`,
    body: `${absence.type} (${absence.dateFrom}) fue ${status.toLowerCase()}.`,
  };
}
/** "septiembre de 2026" para las solicitudes mensuales, "semana del 2026-08-10" para las viejas */
/**
 * Solicitud de horas extra que ya cubre el mes (para no pedirlo dos veces): la mensual de ese mes
 * o una semanal vieja que lo toque. El saldo cargado a mano no cuenta: no es una solicitud.
 */
export function overtimeRequestForMonth(state: AppState, userId: string, ms: string): OvertimeRequest | undefined {
  const me = monthEnd(ms);
  return state.overtime.find((o) => {
    if (o.userId !== userId || o.kind === "saldo") return false;
    const [from, to] = overtimeRange(o.weekStart);
    return from <= me && ms <= to;
  });
}

export function overtimePeriodLabel(weekStart: string): string {
  return weekStart.endsWith("-01")
    ? new Date(weekStart + "T00:00:00").toLocaleDateString("es", { month: "long", year: "numeric" })
    : `semana del ${weekStart}`;
}

function overtimeSubmittedNotification(s: AppState, o: OvertimeRequest): NotificationContent {
  return {
    kind: "exceso", title: "Horas extra informadas",
    body: `${s.users.find((u) => u.id === o.userId)?.name ?? "?"}: ${Math.round(o.minutes / 60 * 10) / 10} h extra (${overtimePeriodLabel(o.weekStart)}) enviadas a Recursos Humanos.`,
  };
}
function overtimeResolvedNotification(o: OvertimeRequest, status: "Aprobado" | "Rechazado" | "Devuelto", comment = ""): NotificationContent {
  if (status === "Devuelto") {
    return {
      kind: "aprobacion", title: "Horas extra devueltas",
      body: `Tus horas extra (${overtimePeriodLabel(o.weekStart)}) volvieron con observaciones${comment ? `: ${comment}` : ""}. Corregí lo indicado y reenviá la solicitud.`,
    };
  }
  return {
    kind: "aprobacion", title: `Horas extra ${status.toLowerCase()}s`,
    body: `${Math.round(o.minutes / 60 * 10) / 10} h extra de ${overtimePeriodLabel(o.weekStart)} fueron ${status.toLowerCase()}s${status === "Aprobado" ? " y ya se pueden recuperar como compensación" : ""}.`,
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
    case "pauseTimer": {
      const now = Date.now();
      return {
        ...s,
        timers: s.timers.map((t) =>
          t.id === a.id && !t.paused
            ? { ...t, paused: true, segments: [...(t.segments ?? []), { from: t.startedAt, to: now }] }
            : t,
        ),
      };
    }
    case "resumeTimer":
      return { ...s, timers: s.timers.map((t) => (t.id === a.id && t.paused ? { ...t, paused: false, startedAt: Date.now() } : t)) };
    case "stopTimer": {
      const t = s.timers.find((x) => x.id === a.id);
      if (!t) return s;
      const rest = s.timers.filter((x) => x.id !== a.id);
      if (a.discard) return withAudit({ ...s, timers: rest }, "Cronómetro descartado", t.description || "");
      const built = a.entries ?? buildStoppedEntries(t, s.currentUserId);
      return withAudit({ ...s, timers: rest, entries: [...s.entries, ...built] }, "Cronómetro detenido", t.description || "");
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
          x.id === a.id ? { ...x, status: a.status, supervisorComment: a.comment, resolvedBy: a.by, resolvedAt: isoDate(new Date()), history: withResolutionEvent(x.history, a.status, a.by, a.comment) } : x,
        ),
      };
      const notified = withNotification(withResolved, ab.userId, absenceResolvedNotification(ab, a.status, a.comment));
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
          x.id === a.id ? { ...x, status: a.status, supervisorComment: a.comment, resolvedBy: a.by, resolvedAt: isoDate(new Date()), history: withResolutionEvent(x.history, a.status, a.by, a.comment) } : x,
        ),
      };
      const notified = withNotification(withResolved, o.userId, overtimeResolvedNotification(o, a.status, a.comment));
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
    case "syncEntries": {
      // Los registros que no cambiaron conservan su objeto: las tarjetas del calendario no se redibujan
      const prev = new Map(s.entries.map((e) => [e.id, e]));
      return { ...s, entries: a.entries.map((e) => { const old = prev.get(e.id); return old && sameEntry(old, e) ? old : e; }) };
    }
    case "applyEntryChanges": {
      const gone = new Set(a.removeIds);
      const incoming = new Map(a.upserts.map((e) => [e.id, e]));
      let changed = false;
      const next: TimeEntry[] = [];
      for (const e of s.entries) {
        if (gone.has(e.id)) { changed = true; continue; }
        const inc = incoming.get(e.id);
        if (!inc) { next.push(e); continue; }
        incoming.delete(e.id);
        if (sameEntry(e, inc)) next.push(e);
        else { next.push(inc); changed = true; }
      }
      for (const e of incoming.values()) { next.push(e); changed = true; }
      // El eco de un cambio propio llega idéntico a lo que ya hay: no se toca nada
      return changed ? { ...s, entries: next } : s;
    }
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
    case "syncFlightCategories":
      return { ...s, flightCategories: a.flightCategories };
    case "syncFlightActivities":
      return { ...s, flightActivities: a.flightActivities };
    case "syncProfessionalProfiles":
      return { ...s, professionalProfiles: a.professionalProfiles };
    case "syncSurveys":
      return { ...s, surveys: a.surveys };
    case "syncSurveyResponses":
      return { ...s, surveyResponses: a.surveyResponses };
    case "syncFeedbackItems":
      return { ...s, feedbackItems: a.feedbackItems };
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
          flightCategories: parsed.flightCategories ?? defaults.flightCategories,
          flightActivities: parsed.flightActivities ?? defaults.flightActivities,
          professionalProfiles: parsed.professionalProfiles ?? [],
          surveys: parsed.surveys ?? [],
          surveyResponses: parsed.surveyResponses ?? [],
          feedbackItems: parsed.feedbackItems ?? [],
          users: [],
          projects: parsed.projects.map((p) => ({
            ...p,
            memberIds: p.memberIds ?? [],
            flightActivityId: p.flightActivityId ?? null,
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
  // Primera visita en este navegador: arranca con el tema del sistema
  let theme: AppState["theme"] = "light";
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch {
    /* sin matchMedia: claro */
  }
  return { ...seedState(), theme, passwordRecovery: isPasswordRecoveryLink };
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

/** true si dos versiones de un registro dicen lo mismo */
function sameEntry(a: TimeEntry, b: TimeEntry): boolean {
  return a.userId === b.userId && a.projectId === b.projectId && a.subProjectId === b.subProjectId
    && a.description === b.description && a.date === b.date && a.start === b.start && a.end === b.end
    && a.favorite === b.favorite && JSON.stringify(a.tagIds) === JSON.stringify(b.tagIds)
    && JSON.stringify(a.recurring ?? null) === JSON.stringify(b.recurring ?? null);
}

/**
 * Registros con una escritura propia todavía viajando al servidor (id → cuántas). Mientras tanto
 * se ignoran los avisos del servidor sobre ese registro: lo local es igual o más nuevo, y aplicar
 * el eco de un cambio anterior hacía que la tarjeta volviera un instante a su posición vieja.
 */
const pendingEntryWrites = new Map<string, number>();

/** false hasta que llega la primera lectura de registros del servidor en esta sesión */
let entriesFromServer = false;
/** Los registros en pantalla ya vienen del servidor (y no de lo guardado en el navegador) */
export function serverEntriesLoaded(): boolean {
  return entriesFromServer;
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
    // Solo si hay ida y vuelta: así nada se rompe en bases sin la columna history (fase 33)
    ...(a.history?.length ? { history: a.history } : {}),
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
    history: r.history?.length ? r.history : undefined,
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
    flight_activity_id: p.flightActivityId,
    // Solo si está elegida: así un proyecto sin metodología no pisa la columna
    ...(p.managementMode ? { management_mode: p.managementMode } : {}),
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
    flightActivityId: r.flight_activity_id ?? null,
    managementMode: r.management_mode ?? null,
  };
}

function toFlightCategoryRow(c: FlightCategory) {
  return { id: c.id, name: c.name, active: c.active };
}
function fromFlightCategoryRow(r: any): FlightCategory {
  return { id: r.id, name: r.name, active: r.active };
}
function toFlightActivityRow(a: FlightActivity) {
  return { id: a.id, category_id: a.categoryId, name: a.name, active: a.active };
}
function fromFlightActivityRow(r: any): FlightActivity {
  return { id: r.id, categoryId: r.category_id, name: r.name, active: r.active };
}

function toProfessionalProfileRow(p: ProfessionalProfile) {
  return {
    id: p.id,
    work_experience_since: p.workExperienceSince,
    bim_experience_since: p.bimExperienceSince,
    education: p.education,
    courses: p.courses,
  };
}
function fromProfessionalProfileRow(r: any): ProfessionalProfile {
  return {
    id: r.id,
    workExperienceSince: r.work_experience_since,
    bimExperienceSince: r.bim_experience_since,
    education: r.education ?? [],
    courses: r.courses ?? [],
  };
}

function toSurveyRow(s: Survey) {
  return {
    id: s.id,
    title: s.title,
    questions: s.questions,
    launched_at: s.launchedAt,
    due_date: s.dueDate,
    created_by: s.createdBy,
  };
}
function fromSurveyRow(r: any): Survey {
  return {
    id: r.id,
    title: r.title,
    questions: r.questions ?? [],
    launchedAt: r.launched_at,
    dueDate: r.due_date,
    createdBy: r.created_by,
  };
}

function toSurveyResponseRow(r: SurveyResponse) {
  return { id: r.id, survey_id: r.surveyId, user_id: r.userId, answers: r.answers, submitted_at: r.submittedAt };
}
function fromSurveyResponseRow(r: any): SurveyResponse {
  return { id: r.id, surveyId: r.survey_id, userId: r.user_id, answers: r.answers ?? [], submittedAt: r.submitted_at };
}

function toFeedbackItemRow(f: FeedbackItem) {
  return {
    id: f.id,
    user_id: f.userId,
    type: f.type,
    title: f.title,
    description: f.description,
    status: f.status,
    created_at: f.createdAt,
    admin_response: f.adminResponse ?? null,
    responded_by: f.respondedBy ?? null,
    responded_at: f.respondedAt ?? null,
  };
}
function fromFeedbackItemRow(r: any): FeedbackItem {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    description: r.description ?? "",
    status: r.status,
    createdAt: r.created_at,
    adminResponse: r.admin_response ?? undefined,
    respondedBy: r.responded_by ?? undefined,
    respondedAt: r.responded_at ?? undefined,
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
    ...(o.history?.length ? { history: o.history } : {}),
    ...(o.kind ? { kind: o.kind } : {}),
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
    history: r.history?.length ? r.history : undefined,
    kind: r.kind === "saldo" ? "saldo" : undefined,
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
  // Una página, con orden fijo (sin orden, dos páginas pueden repetir o saltear filas) y reintentos:
  // un error pasajero no debe terminar en "0 registros", como si se hubieran perdido.
  const page = async (from: number, to: number, count: boolean) => {
    const run = () => supabase.from(table).select("*", count ? { count: "exact" } : undefined).order("id").range(from, to);
    let result = await run();
    for (let attempt = 0; result.error && attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      result = await run();
    }
    return result;
  };
  // La primera página trae además el total: con eso el resto se pide en paralelo en vez de
  // una detrás de otra (time_entries son más de diez páginas).
  const first = await page(0, pageSize - 1, true);
  if (first.error) return { data: [], error: first.error };
  const rows = (first.data ?? []) as T[];
  const total = first.count ?? rows.length;
  // El servidor puede cortar en menos filas que las pedidas: el tamaño real es lo que devolvió
  const step = rows.length;
  if (step === 0 || step >= total) return { data: rows, error: null };
  const starts: number[] = [];
  for (let from = step; from < total; from += step) starts.push(from);
  const PARALLEL = 4;
  for (let i = 0; i < starts.length; i += PARALLEL) {
    const batch = await Promise.all(starts.slice(i, i + PARALLEL).map((from) => page(from, from + step - 1, false)));
    for (const r of batch) {
      if (r.error) return { data: rows, error: r.error };
      rows.push(...((r.data ?? []) as T[]));
    }
  }
  // Si entró o salió una fila entre página y página, alguna puede venir repetida
  const seen = new Set<unknown>();
  const unique = rows.filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return { data: unique, error: null };
}

/** Marca de "esta tabla no se pidió en esta lectura" (lecturas parciales por tabla) */
const SKIPPED = { skipped: true };
const SKIP = Promise.resolve({ data: null as any, error: SKIPPED as any });
const failed = (err: unknown) => Boolean(err) && err !== SKIPPED;

/** Tablas que se leen juntas en una lectura completa */
const SYNC_TABLES = [
  "time_entries", "absence_requests", "absences_calendar", "holidays", "clients", "projects", "sub_projects",
  "overtime_requests", "audit_log", "corp_events", "app_settings", "notifications", "flight_categories",
  "flight_activities", "professional_profiles", "surveys", "survey_responses", "feedback_items",
];

async function fetchEntriesAndAbsences(
  dispatch: React.Dispatch<Action>,
  localSettings: LocalSettings,
  // ¿Sigue siendo esta la última lectura pedida de esa tabla? Si no, su respuesta ya es vieja
  isCurrent: (table: string) => boolean = () => true,
  // Solo estas tablas (aviso de cambio del servidor); sin esto, todas
  only?: Set<string>,
) {
  const want = (t: string) => !only || only.has(t);
  // Las ausencias se arman con dos lecturas (las propias completas + las aprobadas de todos)
  const wantAbsences = want("absence_requests") || want("absences_calendar");
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
    { data: flightCategoryRows, error: flightCategoriesErr },
    { data: flightActivityRows, error: flightActivitiesErr },
    { data: profileRows, error: profilesErr },
    { data: surveyRows, error: surveysErr },
    { data: surveyResponseRows, error: surveyResponsesErr },
    { data: feedbackItemRows, error: feedbackItemsErr },
    { data: calendarAbsenceRows, error: calendarAbsencesErr },
  ] = await Promise.all([
    want("time_entries") ? fetchAllRows("time_entries") : SKIP,
    // Completas: las propias y, si es staff, las de todos (RLS, fase 31)
    wantAbsences ? fetchAllRows("absence_requests") : SKIP,
    want("holidays") ? fetchAllRows("holidays") : SKIP,
    want("clients") ? fetchAllRows("clients") : SKIP,
    want("projects") ? fetchAllRows("projects") : SKIP,
    want("sub_projects") ? fetchAllRows("sub_projects") : SKIP,
    want("overtime_requests") ? fetchAllRows("overtime_requests") : SKIP,
    want("audit_log") ? supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(300) : SKIP,
    want("corp_events") ? fetchAllRows("corp_events") : SKIP,
    want("app_settings") ? supabase.from("app_settings").select("*").eq("id", "global").maybeSingle() : SKIP,
    want("notifications") ? supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100) : SKIP,
    want("flight_categories") ? fetchAllRows("flight_categories") : SKIP,
    want("flight_activities") ? fetchAllRows("flight_activities") : SKIP,
    want("professional_profiles") ? fetchAllRows("professional_profiles") : SKIP,
    want("surveys") ? fetchAllRows("surveys") : SKIP,
    want("survey_responses") ? fetchAllRows("survey_responses") : SKIP,
    want("feedback_items") ? fetchAllRows("feedback_items") : SKIP,
    // Las aprobadas de todos, sin motivo, adjuntos ni comentario: para el calendario
    wantAbsences ? fetchAllRows("absences_calendar") : SKIP,
  ]);
  if (failed(entriesErr)) console.warn("Error al leer time_entries:", entriesErr);
  if (failed(absencesErr)) console.warn("Error al leer absence_requests:", absencesErr);
  if (failed(holidaysErr)) console.warn("Error al leer holidays:", holidaysErr);
  if (failed(clientsErr)) console.warn("Error al leer clients:", clientsErr);
  if (failed(projectsErr)) console.warn("Error al leer projects:", projectsErr);
  if (failed(subProjectsErr)) console.warn("Error al leer sub_projects:", subProjectsErr);
  if (failed(overtimeErr)) console.warn("Error al leer overtime_requests:", overtimeErr);
  if (failed(auditErr)) console.warn("Error al leer audit_log:", auditErr);
  if (failed(corpEventsErr)) console.warn("Error al leer corp_events:", corpEventsErr);
  if (failed(settingsErr)) console.warn("Error al leer app_settings:", settingsErr);
  if (failed(notificationsErr)) console.warn("Error al leer notifications:", notificationsErr);
  if (failed(flightCategoriesErr)) console.warn("Error al leer flight_categories:", flightCategoriesErr);
  if (failed(flightActivitiesErr)) console.warn("Error al leer flight_activities:", flightActivitiesErr);
  if (failed(profilesErr)) console.warn("Error al leer professional_profiles:", profilesErr);
  if (failed(surveysErr)) console.warn("Error al leer surveys:", surveysErr);
  if (failed(surveyResponsesErr)) console.warn("Error al leer survey_responses:", surveyResponsesErr);
  if (failed(feedbackItemsErr)) console.warn("Error al leer feedback_items:", feedbackItemsErr);
  if (failed(calendarAbsencesErr)) console.warn("Error al leer absences_calendar:", calendarAbsencesErr);
  // Guard contra respuestas fuera de orden (ahora por tabla, ver isCurrent): si mientras esta consulta viajaba
  // ida y vuelta se disparó un refetch más nuevo (p.ej. por el propio drag de
  // una tarjeta en Calendario), esta respuesta ya está desactualizada — aplicarla
  // pisaría un cambio más reciente con uno viejo (se veía como "la tarjeta
  // vuelve a su posición y después se corrige").
  // Cada sync se manda SOLO si esa tabla en particular no dio error: si una
  // falló (incluso después de los reintentos de fetchAllRows), se deja como
  // estaba en vez de reemplazarla por una lista vacía — antes, un error
  // transitorio en una sola tabla (p. ej. time_entries) hacía que todo lo ya
  // cargado desapareciera de golpe de la pantalla, aunque siguiera intacto
  // en la base; con el próximo refetch que sí funcione se pone al día solo.
  if (!entriesErr && isCurrent("time_entries")) entriesFromServer = true;
  if (!entriesErr && isCurrent("time_entries")) dispatch({ type: "syncEntries", entries: (entryRows || []).map(fromEntryRow) });
  if (!absencesErr && isCurrent("absence_requests")) {
    // Las completas mandan; de la vista se suman solo las que no vinieron completas
    // (las ajenas, para quien no es staff). Si la vista falla (p. ej. todavía no se
    // corrió la fase 31) se muestran las que ya devolvió la tabla.
    const full: AbsenceRequest[] = (absenceRows || []).map(fromAbsenceRow);
    const fullIds = new Set(full.map((a) => a.id));
    const shared = calendarAbsencesErr
      ? []
      : (calendarAbsenceRows || []).filter((r: any) => !fullIds.has(r.id)).map(fromAbsenceRow);
    dispatch({ type: "syncAbsences", absences: [...full, ...shared] });
  }
  if (!holidaysErr && isCurrent("holidays")) dispatch({ type: "syncHolidays", holidays: (holidayRows || []).map(fromHolidayRow) });
  if (!clientsErr && isCurrent("clients")) dispatch({ type: "syncClients", clients: (clientRows || []).map(fromClientRow) });
  if (!projectsErr && isCurrent("projects")) dispatch({ type: "syncProjects", projects: (projectRows || []).map(fromProjectRow) });
  if (!subProjectsErr && isCurrent("sub_projects")) dispatch({ type: "syncSubProjects", subProjects: (subProjectRows || []).map(fromSubProjectRow) });
  if (!overtimeErr && isCurrent("overtime_requests")) dispatch({ type: "syncOvertime", overtime: (overtimeRows || []).map(fromOvertimeRow) });
  if (!auditErr && isCurrent("audit_log")) dispatch({ type: "syncAudit", audit: (auditRows || []).map(fromAuditRow) });
  if (!corpEventsErr && isCurrent("corp_events")) dispatch({ type: "syncCorpEvents", corpEvents: (corpEventRows || []).map(fromCorpEventRow) });
  if (!notificationsErr && isCurrent("notifications")) dispatch({ type: "syncNotifications", notifications: (notificationRows || []).map(fromNotificationRow) });
  if (!flightCategoriesErr && isCurrent("flight_categories")) dispatch({ type: "syncFlightCategories", flightCategories: (flightCategoryRows || []).map(fromFlightCategoryRow) });
  if (!flightActivitiesErr && isCurrent("flight_activities")) dispatch({ type: "syncFlightActivities", flightActivities: (flightActivityRows || []).map(fromFlightActivityRow) });
  if (!profilesErr && isCurrent("professional_profiles")) dispatch({ type: "syncProfessionalProfiles", professionalProfiles: (profileRows || []).map(fromProfessionalProfileRow) });
  if (!surveysErr && isCurrent("surveys")) dispatch({ type: "syncSurveys", surveys: (surveyRows || []).map(fromSurveyRow) });
  if (!surveyResponsesErr && isCurrent("survey_responses")) dispatch({ type: "syncSurveyResponses", surveyResponses: (surveyResponseRows || []).map(fromSurveyResponseRow) });
  if (!feedbackItemsErr && isCurrent("feedback_items")) dispatch({ type: "syncFeedbackItems", feedbackItems: (feedbackItemRows || []).map(fromFeedbackItemRow) });
  if (settingsRow && isCurrent("app_settings")) {
    dispatch({
      type: "syncSettings",
      company: settingsRow.company,
      rolePermissions: settingsRow.role_permissions,
      leaveTypeConfig: settingsRow.leave_type_config,
      tags: settingsRow.tags,
    });
  } else if (!settingsRow && !settingsErr) {
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
      if (a.patch.flightCategories) {
        const err = await reconcileTable("flight_categories", prevState.flightCategories, a.patch.flightCategories, toFlightCategoryRow);
        if (err) errors.push(err);
      }
      if (a.patch.flightActivities) {
        const err = await reconcileTable("flight_activities", prevState.flightActivities, a.patch.flightActivities, toFlightActivityRow);
        if (err) errors.push(err);
      }
      if (a.patch.professionalProfiles) {
        const err = await reconcileTable("professional_profiles", prevState.professionalProfiles, a.patch.professionalProfiles, toProfessionalProfileRow);
        if (err) errors.push(err);
      }
      if (a.patch.surveys) {
        const err = await reconcileTable("surveys", prevState.surveys, a.patch.surveys, toSurveyRow);
        if (err) errors.push(err);
      }
      if (a.patch.surveyResponses) {
        const err = await reconcileTable("survey_responses", prevState.surveyResponses, a.patch.surveyResponses, toSurveyResponseRow);
        if (err) errors.push(err);
      }
      if (a.patch.feedbackItems) {
        const err = await reconcileTable("feedback_items", prevState.feedbackItems, a.patch.feedbackItems, toFeedbackItemRow);
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
      if (a.discard || !a.entries || a.entries.length === 0) return null;
      const { error } = await supabase.from("time_entries").insert(a.entries.map(toEntryRow));
      return error?.message ?? null;
    }
    case "addAbsence": {
      const { error } = await supabase.from("absence_requests").insert(toAbsenceRow(a.absence));
      const notifErr = await insertNotification(a.absence.userId, absenceSubmittedNotification(a.absence));
      return error?.message ?? notifErr;
    }
    case "resolveAbsence": {
      const ab = prevState.absences.find((x) => x.id === a.id);
      const hist = ab ? withResolutionEvent(ab.history, a.status, a.by, a.comment) : undefined;
      const { error } = await supabase
        .from("absence_requests")
        .update({
          status: a.status,
          supervisor_comment: a.comment || null,
          resolved_by: a.by,
          resolved_at: isoDate(new Date()),
          ...(hist?.length ? { history: hist } : {}),
        })
        .eq("id", a.id);
      const notifErr = ab ? await insertNotification(ab.userId, absenceResolvedNotification(ab, a.status, a.comment)) : null;
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
      const o = prevState.overtime.find((x) => x.id === a.id);
      const hist = o ? withResolutionEvent(o.history, a.status, a.by, a.comment) : undefined;
      const { error } = await supabase
        .from("overtime_requests")
        .update({
          status: a.status,
          supervisor_comment: a.comment || null,
          resolved_by: a.by,
          resolved_at: isoDate(new Date()),
          ...(hist?.length ? { history: hist } : {}),
        })
        .eq("id", a.id);
      const notifErr = o ? await insertNotification(o.userId, overtimeResolvedNotification(o, a.status, a.comment)) : null;
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
              team: p.team || "latam",
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

            if (mappedUsers.find((u) => u.id === currentUserId)?.active === false) {
              // Dado de baja: sin acceso, aunque conserve la sesión abierta
              await supabase.auth.signOut();
              return;
            }

            if (!mappedUsers.some((u) => u.id === currentUserId)) {
              // Sin fila en profiles: rol mínimo. Nunca tomar el rol de user_metadata,
              // que el propio usuario puede cambiar con auth.updateUser({ data }).
              const meta = session.user.user_metadata || {};
              mappedUsers.push({
                id: currentUserId,
                name: meta.name || session.user.email?.split("@")[0] || "Usuario",
                email: session.user.email || "",
                password: "",
                role: "usuario",
                team: "latam",
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
    entriesFromServer = false;
    // Cada lectura se numera POR TABLA: si dos de la misma tabla quedan en vuelo a la vez, solo se
    // aplica la respuesta de la última. Antes el número era uno solo para todo, así que cualquier
    // aviso (de cualquier tabla, de cualquier persona) descartaba la lectura completa en curso; con
    // el equipo cargando horas, esa lectura (más de un minuto) no llegaba a aplicarse nunca.
    const seqs: Record<string, number> = {};
    // Cambios de registros avisados por el servidor mientras hay una lectura completa de time_entries
    // en vuelo: esa lectura puede traer datos de antes del cambio, así que se vuelven a aplicar encima.
    let entryReads = 0;
    let replay: { upsert?: TimeEntry; removeId?: ID }[] = [];
    const applyChanges = (changes: { upsert?: TimeEntry; removeId?: ID }[]) => {
      // Por cada registro vale el último aviso
      const last = new Map<ID, { upsert?: TimeEntry; removeId?: ID }>();
      for (const c of changes) last.set(c.upsert ? c.upsert.id : c.removeId!, c);
      const upserts: TimeEntry[] = [];
      const removeIds: ID[] = [];
      for (const c of last.values()) c.upsert ? upserts.push(c.upsert) : removeIds.push(c.removeId!);
      if (upserts.length || removeIds.length) dispatch({ type: "applyEntryChanges", upserts, removeIds });
    };
    const refetch = (only?: Set<string>) => {
      if (cancelled) return;
      const wanted = only ? new Set(only) : undefined;
      // Las ausencias salen de dos lecturas: van siempre juntas
      if (wanted && (wanted.has("absence_requests") || wanted.has("absences_calendar"))) {
        wanted.add("absence_requests");
        wanted.add("absences_calendar");
      }
      const mine: Record<string, number> = {};
      for (const t of wanted ?? SYNC_TABLES) mine[t] = seqs[t] = (seqs[t] ?? 0) + 1;
      const readsEntries = !wanted || wanted.has("time_entries");
      if (readsEntries) entryReads++;
      fetchEntriesAndAbsences(dispatch, localSettings, (t) => !cancelled && mine[t] === seqs[t], wanted)
        .catch((err) => console.warn("Error al leer datos de Supabase:", err))
        .finally(() => {
          if (!readsEntries) return;
          entryReads--;
          if (!cancelled && replay.length) applyChanges(replay);
          if (entryReads === 0) replay = [];
        });
    };
    // Los avisos se juntan 400 ms desde el primero y se aplican de una vez: una importación de
    // cientos de filas no dispara cientos de redibujos. (Antes se esperaba a que la ráfaga frenara;
    // con avisos seguidos de todo el equipo, no frenaba nunca.)
    const dirty = new Set<string>();
    let entryChanges: { upsert?: TimeEntry; removeId?: ID }[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      debounceTimer = undefined;
      if (cancelled) return;
      if (entryChanges.length) {
        const changes = entryChanges;
        entryChanges = [];
        if (entryReads > 0) replay.push(...changes);
        applyChanges(changes);
      }
      if (dirty.size) {
        const only = new Set(dirty);
        dirty.clear();
        refetch(only);
      }
    };
    const schedule = () => {
      if (!debounceTimer) debounceTimer = setTimeout(flush, 400);
    };
    // Otra tabla cambió: se vuelve a leer SOLO esa tabla (antes, las 18)
    const tableChanged = (table: string) => () => {
      dirty.add(table);
      schedule();
    };
    // Un registro de horas cambió: el aviso ya trae la fila, se aplica sin consultar nada
    const entryChanged = (payload: { eventType: string; new: any; old: any }) => {
      if (payload.eventType === "DELETE") {
        if (payload.old?.id) entryChanges.push({ removeId: payload.old.id });
        else dirty.add("time_entries");
      } else if (!payload.new?.id || payload.new.user_id === undefined || payload.new.date === undefined) {
        // Aviso sin la fila completa: se lee la tabla
        dirty.add("time_entries");
      } else if (!pendingEntryWrites.get(payload.new.id)) {
        entryChanges.push({ upsert: fromEntryRow(payload.new) });
      }
      schedule();
    };
    refetch();
    let subscribedOnce = false;
    const channel = supabase
      .channel("tempo-entries-absences")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, entryChanged)
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_requests" }, tableChanged("absence_requests"))
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, tableChanged("holidays"))
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, tableChanged("clients"))
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, tableChanged("projects"))
      .on("postgres_changes", { event: "*", schema: "public", table: "sub_projects" }, tableChanged("sub_projects"))
      .on("postgres_changes", { event: "*", schema: "public", table: "overtime_requests" }, tableChanged("overtime_requests"))
      .on("postgres_changes", { event: "*", schema: "public", table: "corp_events" }, tableChanged("corp_events"))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, tableChanged("app_settings"))
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, tableChanged("notifications"))
      .on("postgres_changes", { event: "*", schema: "public", table: "flight_categories" }, tableChanged("flight_categories"))
      .on("postgres_changes", { event: "*", schema: "public", table: "flight_activities" }, tableChanged("flight_activities"))
      .on("postgres_changes", { event: "*", schema: "public", table: "professional_profiles" }, tableChanged("professional_profiles"))
      .on("postgres_changes", { event: "*", schema: "public", table: "surveys" }, tableChanged("surveys"))
      .on("postgres_changes", { event: "*", schema: "public", table: "survey_responses" }, tableChanged("survey_responses"))
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_items" }, tableChanged("feedback_items"))
      // audit_log queda afuera a propósito: casi cualquier acción genera una fila ahí,
      // y traer las 300 de vuelta en cada una sería un refetch constante para poco beneficio.
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // Reconexión (se cortó internet, la pestaña estuvo dormida): pudieron perderse avisos,
        // así que se lee todo de nuevo. La primera vez ya lo hizo el refetch() de arriba.
        if (subscribedOnce) refetch();
        subscribedOnce = true;
      });
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
  // Realtime que reordena o reemplaza state.audit). ignoreDuplicates evita que
  // las filas ya existentes (p.ej. las 300 más recientes traídas al cargar la
  // página) pasen por ON CONFLICT DO UPDATE, que exige la política de UPDATE.
  const syncedAuditIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!state.authenticated) return;
    const toSync = state.audit.filter((a) => a.userId === state.currentUserId && !syncedAuditIdsRef.current.has(a.id));
    if (toSync.length === 0) return;
    for (const a of toSync) syncedAuditIdsRef.current.add(a.id);
    const rowsForLog = toSync.map(toAuditRow);
    supabase
      .from("audit_log")
      .upsert(rowsForLog, { onConflict: "id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) console.warn("Error al sincronizar auditoría:", error);
      });
  }, [state.audit, state.authenticated, state.currentUserId]);

  // Envuelve el dispatch: además de actualizar el estado local, refleja en Supabase
  // las acciones sobre registros de horas y ausencias.
  const syncedDispatch = useCallback<React.Dispatch<Action>>(
    (a) => {
      let finalAction = a;
      if (a.type === "stopTimer" && !a.discard && !a.entries) {
        const t = state.timers.find((x) => x.id === a.id);
        if (t) finalAction = { ...a, entries: buildStoppedEntries(t, state.currentUserId) };
      }
      dispatch(finalAction);
      const entryId = finalAction.type === "addEntry" || finalAction.type === "updateEntry" ? finalAction.entry.id : finalAction.type === "deleteEntry" ? finalAction.id : null;
      if (entryId) pendingEntryWrites.set(entryId, (pendingEntryWrites.get(entryId) ?? 0) + 1);
      syncActionToSupabase(finalAction, state).then((errMsg) => {
        if (entryId) {
          const left = (pendingEntryWrites.get(entryId) ?? 1) - 1;
          if (left > 0) pendingEntryWrites.set(entryId, left);
          else pendingEntryWrites.delete(entryId);
        }
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
export function overtimeClaimDeadline(monthISO: string): string {
  return addDays(addMonths(monthStart(monthISO), 4), -1);
}

/** Minutos de una ausencia de "Compensación de horas" (por horario si está
 * cargado, si no por días hábiles a jornada completa/media del usuario). */
export function compensationMinutes(state: AppState, userId: string, a: AbsenceRequest): number {
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
export function countWorkDays(from: string, to: string, workDays: number[], holidays?: Set<string>): number {
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
export function holidayDateSet(state: AppState): Set<string> {
  return new Set(state.holidays.map((h) => h.date));
}

/** Tipos de ausencia que sacan el día entero de la jornada esperada (a diferencia
 * de, por ejemplo, "Trabajo remoto" u "Horario reducido", donde igual se trabaja). */
const FULL_DAY_ABSENCE_TYPES: AbsenceType[] = [
  "Vacaciones", "Licencia médica", "Maternidad/Paternidad", "Licencia por estudio", "Día personal", "Permiso especial",
];

function fullDayOffDatesInRange(state: AppState, userId: ID, from: string, to: string): Set<string> {
  const offDays = new Set<string>();
  for (const a of state.absences) {
    if (a.userId !== userId || a.status !== "Aprobado" || !FULL_DAY_ABSENCE_TYPES.includes(a.type)) continue;
    if (a.dateTo < from || a.dateFrom > to) continue;
    let d = a.dateFrom < from ? from : a.dateFrom;
    const end = a.dateTo > to ? to : a.dateTo;
    let guard = 0;
    while (d <= end && guard < 400) {
      offDays.add(d);
      d = addDays(d, 1);
      guard++;
    }
  }
  return offDays;
}

/**
 * Minutos esperados de una persona en [from, to]: recorre día por día del
 * período, cuenta solo sus días laborales habilitados (u.workDays) y
 * descarta feriados y ausencias de día completo ya aprobadas (vacaciones,
 * licencias, etc.) — un feriado o unas vacaciones no cuentan como jornada
 * exigida. No usa un "/5" fijo: la tarifa diaria sale de sus propios días
 * laborales (podría trabajar, por ejemplo, solo 3 días por semana). La
 * usan tanto Reportes como Control de horas y la cadena de mando, para que
 * los tres midan "lo esperado" de la misma forma.
 */
export function expectedMinutesInRange(state: AppState, u: User, from: string, to: string): number {
  const holidays = holidayDateSet(state);
  const offDays = fullDayOffDatesInRange(state, u.id, from, to);
  const dailyMin = u.jornada === "media" ? 4 * 60 : (u.weeklyHours * 60) / Math.max(1, u.workDays.length);
  let expectedDays = 0;
  let d = from;
  let guard = 0;
  while (d <= to && guard < 400) {
    const dow = ((parseISO(d).getDay() + 6) % 7) + 1; // 1=Lun..7=Dom
    if (u.workDays.includes(dow) && !holidays.has(d) && !offDays.has(d)) expectedDays++;
    d = addDays(d, 1);
    guard++;
  }
  return dailyMin * expectedDays;
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
      o.type !== "Horas extra" &&
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
  const weekEnd = overtimeRange(ot.weekStart)[1];
  const overlapping = state.absences.filter(
    (a) => a.userId === ot.userId && a.status === "Aprobado" && a.dateFrom <= weekEnd && ot.weekStart <= a.dateTo,
  );
  for (const a of overlapping) {
    warnings.push(`Esa semana se superpone con una ausencia aprobada: ${a.type} (${fmtDateShort(a.dateFrom)}${a.dateFrom !== a.dateTo ? ` → ${fmtDateShort(a.dateTo)}` : ""}).`);
  }
  return warnings;
}

/** Horas extra que acompañan a una solicitud de "Horas extra" de Gestión (misma persona, fecha de carga y mes) */
export function findOvertimeFor(state: AppState, a: AbsenceRequest): OvertimeRequest | undefined {
  const c = state.overtime.filter((o) => o.userId === a.userId && o.createdAt === a.createdAt);
  // Las mensuales se vinculan solo por mes; el "único del día" queda para las semanales viejas
  return c.find((o) => monthStart(o.weekStart) === monthStart(a.dateFrom))
    ?? (c.length === 1 && !c[0].weekStart.endsWith("-01") ? c[0] : undefined);
}

/** Solicitud de Gestión que acompaña a unas horas extra */
export function findAbsenceFor(state: AppState, o: OvertimeRequest): AbsenceRequest | undefined {
  const c = state.absences.filter((a) => a.userId === o.userId && a.type === "Horas extra" && a.createdAt === o.createdAt);
  return c.find((a) => monthStart(a.dateFrom) === monthStart(o.weekStart))
    ?? (c.length === 1 && !o.weekStart.endsWith("-01") ? c[0] : undefined);
}

/** Proyectos que no cuentan para horas extra: se cargan solo para que el calendario no quede vacío. */
const NON_COMPUTABLE_PROJECTS = ["no laborable", "vacaciones"];

export function isNonComputableProject(p: Project | null | undefined): boolean {
  return !!p && NON_COMPUTABLE_PROJECTS.includes(p.name.trim().toLowerCase());
}

/** Minutos de un registro que cuentan para horas extra (0 si es de No laborable / Vacaciones) */
export function computableMinutes(state: AppState, e: TimeEntry): number {
  const p = e.projectId ? state.projects.find((x) => x.id === e.projectId) : null;
  return isNonComputableProject(p) ? 0 : e.end - e.start;
}

export interface OvertimeBreakdown {
  loadedMin: number;
  /** Cargadas fuera de No laborable y Vacaciones */
  computableMin: number;
  extraMin: number;
  /** Horas extra por proyecto, de mayor a menor */
  byProject: { projectId: ID | null; minutes: number }[];
  /** Horas extra de cada registro (id del registro → minutos) */
  perEntry: Map<string, number>;
}

/**
 * Horas extra de una persona en [from, to], día por día: se cuentan las horas cargadas desde el
 * inicio del día hasta completar la jornada diaria (8 h en jornada completa); lo que se carga
 * después de ese corte es extra y se le atribuye al proyecto del registro. Un día no laborable
 * (fin de semana, feriado o ausencia de día completo) no tiene jornada: todo lo cargado es extra.
 * No computan los registros de No laborable y Vacaciones.
 */
export function overtimeBreakdown(state: AppState, u: User, from: string, to: string): OvertimeBreakdown {
  const holidays = holidayDateSet(state);
  const offDays = fullDayOffDatesInRange(state, u.id, from, to);
  const dailyMin = Math.round(u.jornada === "media" ? 4 * 60 : (u.weeklyHours * 60) / Math.max(1, u.workDays.length));
  const mine = state.entries
    .filter((e) => e.userId === u.id && e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const perEntry = new Map<string, number>();
  const proj = new Map<ID | null, number>();
  let loadedMin = 0;
  let computableMin = 0;
  let extraMin = 0;
  let day = "";
  let cap = 0;
  let used = 0;
  for (const e of mine) {
    loadedMin += e.end - e.start;
    if (e.date !== day) {
      day = e.date;
      const dow = ((parseISO(day).getDay() + 6) % 7) + 1;
      cap = u.workDays.includes(dow) && !holidays.has(day) && !offDays.has(day) ? dailyMin : 0;
      used = 0;
    }
    const m = computableMinutes(state, e);
    if (m <= 0) continue;
    computableMin += m;
    const within = Math.max(0, Math.min(m, cap - used));
    used += within;
    const extra = m - within;
    if (extra > 0) {
      extraMin += extra;
      perEntry.set(e.id, extra);
      proj.set(e.projectId, (proj.get(e.projectId) ?? 0) + extra);
    }
  }
  const byProject = [...proj.entries()].map(([projectId, minutes]) => ({ projectId, minutes })).sort((a, b) => b.minutes - a.minutes);
  return { loadedMin, computableMin, extraMin, byProject, perEntry };
}

/**
 * Período que cubre una solicitud de horas extra: el mes completo cuando weekStart es el
 * día 1 (solicitudes mensuales), o la semana para las anteriores, que eran semanales.
 */
export function overtimeRange(weekStartISO: string): [string, string] {
  return weekStartISO.endsWith("-01") ? [weekStartISO, monthEnd(weekStartISO)] : [weekStartISO, addDays(weekStartISO, 6)];
}

/**
 * Registros de tiempo que se pisan entre sí en el calendario de la persona dentro del período
 * de la solicitud. Mientras haya alguno, las horas extra no se pueden solicitar ni aprobar.
 */
export function overtimeOverlapIssues(state: AppState, userId: string, weekStartISO: string): string[] {
  const [from, to] = overtimeRange(weekStartISO);
  const mine = state.entries.filter((e) => e.userId === userId && e.date >= from && e.date <= to);
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const e of mine.slice().sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)) {
    for (const o of overlaps(mine, e)) {
      const key = [e.id, o.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(`${fmtDateShort(e.date)}: ${minToHM(e.start)}–${minToHM(e.end)} se superpone con ${minToHM(o.start)}–${minToHM(o.end)}.`);
    }
  }
  return issues;
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
