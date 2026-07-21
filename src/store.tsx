import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { AppState, TimeEntry, RunningTimer, AbsenceRequest, Notification, WeekValidation, OvertimeRequest, EmailRecord } from "./types";
import { seedState } from "./data";
import { isoDate, uid } from "./utils";

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
  | { type: "stopTimer"; id: string; discard?: boolean }
  | { type: "addAbsence"; absence: AbsenceRequest }
  | { type: "resolveAbsence"; id: string; status: "Aprobado" | "Rechazado"; comment: string; by: string }
  | { type: "validateWeek"; v: WeekValidation }
  | { type: "addOvertime"; o: OvertimeRequest }
  | { type: "resolveOvertime"; id: string; status: "Aprobado" | "Rechazado"; comment: string; by: string }
  | { type: "notify"; n: Omit<Notification, "id" | "read" | "date"> }
  | { type: "markNotifsRead" }
  | { type: "audit"; action: string; detail: string };

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
      const now = new Date();
      const started = new Date(t.startedAt);
      const sameDay = isoDate(started);
      const startMin = started.getHours() * 60 + started.getMinutes();
      const endMinRaw = isoDate(now) === sameDay ? now.getHours() * 60 + now.getMinutes() : 24 * 60 - 1;
      const endMin = Math.max(endMinRaw, startMin + 1);
      const entry: TimeEntry = {
        id: uid(),
        userId: s.currentUserId,
        projectId: t.projectId,
        taskId: t.taskId,
        description: t.description,
        tagIds: t.tagIds,
        date: sameDay,
        start: startMin,
        end: endMin,
        billable: t.billable,
      };
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
  }
}

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.users && parsed.entries) {
        // Migración de estados guardados con versiones anteriores del esquema
        return {
          ...parsed,
          validations: parsed.validations ?? [],
          overtime: parsed.overtime ?? [],
          emails: parsed.emails ?? [],
          authenticated: parsed.authenticated ?? false,
          users: parsed.users.map((u) => ({
            ...u,
            jornada: u.jornada ?? ((u.weeklyHours ?? 40) >= 35 ? ("completa" as const) : ("media" as const)),
            password: u.password ?? (u.role === "admin" ? "admin123" : `${u.name.split(" ")[0].toLowerCase()}123`),
            hireDate: u.hireDate ?? "2024-01-01",
            // Versiones anteriores guardaban el cumpleaños como "MM-DD"
            birthday: u.birthday && u.birthday.length === 5 ? `1990-${u.birthday}` : (u.birthday ?? "1990-01-01"),
          })),
          projects: parsed.projects.map((p) => ({
            ...p,
            memberIds: p.memberIds ?? parsed.users.map((u) => u.id),
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
  return seedState();
}

const StoreCtx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    const id = setTimeout(() => localStorage.setItem(LS_KEY, JSON.stringify(state)), 300);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore fuera de StoreProvider");
  return ctx;
}

/**
 * Horas extra disponibles: aprobadas por el supervisor Y cuya semana
 * fue validada por el admin en Control de horas.
 */
export function validatedOvertimeMin(state: AppState, userId: string): number {
  return state.overtime
    .filter(
      (o) =>
        o.userId === userId &&
        o.status === "Aprobado" &&
        state.validations.some((v) => v.userId === userId && v.weekStart === o.weekStart),
    )
    .reduce((a, o) => a + o.minutes, 0);
}

/** Proyectos visibles para un usuario: admin/supervisor ven todo; empleados solo donde son miembros */
export function visibleProjects(state: AppState, userId: string) {
  const u = state.users.find((x) => x.id === userId);
  if (!u || u.role !== "empleado") return state.projects;
  return state.projects.filter((p) => p.memberIds.includes(userId));
}

/** Días hábiles del usuario dentro de un rango de fechas (inclusive) */
function countWorkDays(from: string, to: string, workDays: number[]): number {
  let count = 0;
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  let guard = 0;
  while (d <= end && guard < 400) {
    const dow = ((d.getDay() + 6) % 7) + 1; // 1=Lun..7=Dom
    if (workDays.includes(dow)) count++;
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return count;
}

export interface VacationInfo {
  monthsWorked: number;
  accruing: boolean; // primer año: acumula 1 día/mes hasta 10
  entitled: number; // días laborables del período vigente
  used: number; // días hábiles de vacaciones aprobadas en el período
  available: number;
  expiration: string; // vencimiento del período (próximo aniversario)
  daysToExpire: number;
}

/**
 * Contabilidad de vacaciones por antigüedad:
 * - Persona nueva (<12 meses): 1 día laborable por mes trabajado, hasta 10.
 * - Desde el año: 10 días laborables por cada año.
 * - Vencimiento: el aniversario de ingreso siguiente; se notifica desde 3 meses antes.
 */
export function vacationInfo(state: AppState, userId: string, todayISO: string): VacationInfo {
  const u = state.users.find((x) => x.id === userId)!;
  const hire = new Date(u.hireDate + "T00:00:00");
  const now = new Date(todayISO + "T00:00:00");

  let monthsWorked = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
  if (now.getDate() < hire.getDate()) monthsWorked--;
  monthsWorked = Math.max(0, monthsWorked);

  const accruing = monthsWorked < 12;
  const entitled = accruing ? Math.min(monthsWorked, 10) : 10;

  // Período vigente: desde el último aniversario (o el ingreso) hasta el próximo aniversario
  const yearsDone = Math.floor(monthsWorked / 12);
  const periodStart = new Date(hire);
  periodStart.setFullYear(hire.getFullYear() + yearsDone);
  const periodEnd = new Date(hire);
  periodEnd.setFullYear(hire.getFullYear() + yearsDone + 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const used = state.absences
    .filter(
      (a) =>
        a.userId === userId &&
        a.type === "Vacaciones" &&
        a.status === "Aprobado" &&
        a.dateFrom >= fmt(periodStart) &&
        a.dateFrom < fmt(periodEnd),
    )
    .reduce((acc, a) => acc + countWorkDays(a.dateFrom, a.dateTo, u.workDays), 0);

  const expiration = fmt(periodEnd);
  const daysToExpire = Math.round((periodEnd.getTime() - now.getTime()) / 86400000);

  return { monthsWorked, accruing, entitled, used, available: Math.max(0, entitled - used), expiration, daysToExpire };
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
