import { compensationMinutes, countWorkDays, holidayDateSet, overtimeBalance, overtimeBreakdown, vacationInfo } from "./store";
import type { AppState, User } from "./types";
import { addDays, addMonths, monthLabel, today } from "./utils";

/** Saldos de una persona: vacaciones y horas extra (días a favor) en un período y al cierre del período. */
export interface BalanceRow {
  user: User;
  /** Minutos de una jornada: para pasar horas a días */
  dailyMin: number;
  vacEntitled: number;
  /** Días usados del período de vacaciones vigente al cierre */
  vacUsed: number;
  vacAvailable: number;
  vacExpires: string;
  /** Días hábiles de vacaciones aprobadas que caen dentro del período */
  vacTaken: number;
  /** Días hábiles de vacaciones pendientes de aprobar dentro del período */
  vacPending: number;
  /** Horas extra y días a favor aprobados cuyo período empieza dentro del rango */
  otApprovedMin: number;
  /** Compensaciones de horas aprobadas que empiezan dentro del rango */
  otRecoveredMin: number;
  /** Horas extra que da el calendario en el período (cada día, lo que pasa de la jornada) */
  otDetectedMin: number;
  /** Del calendario, todo lo que todavía no está aprobado: en revisión + sin enviar */
  otPendingMin: number;
  /** Enviadas a Recursos Humanos y sin resolver (pendientes o devueltas para corregir) */
  otInReviewMin: number;
  /** Detectadas en el calendario que nadie envió todavía */
  otNotSentMin: number;
  otReturnedMin: number;
  /** Saldo disponible (sin vencer) al cierre del período */
  otBalanceMin: number;
  otExpiredMin: number;
}

export function dailyMinutes(u: User): number {
  return u.jornada === "media" ? 4 * 60 : Math.round((u.weeklyHours * 60) / Math.max(1, u.workDays.length));
}

/**
 * Vacaciones y horas extra de cada persona en [from, to]. Los saldos son al cierre del período
 * (o a hoy, si el período termina en el futuro): solo cuentan las horas extra y compensaciones
 * anteriores a esa fecha.
 */
export function balanceRows(state: AppState, from: string, to: string, users: User[]): BalanceRow[] {
  const asOf = to < today() ? to : today();
  const holidays = holidayDateSet(state);
  const inRange = (d: string) => d >= from && d <= to;

  return users
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((u) => {
      const workDays = u.jornada === "media" ? [1, 2, 3, 4, 5] : u.workDays;
      const clippedDays = (dateFrom: string, dateTo: string) => {
        const a = dateFrom > from ? dateFrom : from;
        const b = dateTo < to ? dateTo : to;
        return a > b ? 0 : countWorkDays(a, b, workDays, holidays);
      };
      const vacations = state.absences.filter((a) => a.userId === u.id && a.type === "Vacaciones" && a.dateFrom <= to && a.dateTo >= from);
      const overtime = state.overtime.filter((o) => o.userId === u.id && inRange(o.weekStart));
      const sumMin = (status: string) => overtime.filter((o) => o.status === status).reduce((acc, o) => acc + o.minutes, 0);
      // Lo que da el calendario contra lo ya aprobado de esas horas (el saldo cargado a mano no sale del calendario)
      const detected = overtimeBreakdown(state, u, from, to).extraMin;
      const approvedFromCalendar = overtime.filter((o) => o.status === "Aprobado" && o.kind !== "saldo").reduce((acc, o) => acc + o.minutes, 0);
      const inReview = sumMin("Pendiente") + sumMin("Devuelto");
      const pending = Math.max(0, detected - approvedFromCalendar);

      // Saldo al cierre: solo lo aprobado y lo recuperado hasta esa fecha
      const upToAsOf: AppState = {
        ...state,
        overtime: state.overtime.filter((o) => o.userId === u.id && o.weekStart <= asOf),
        absences: state.absences.filter((a) => a.userId === u.id && a.dateFrom <= asOf),
      };
      const bal = overtimeBalance(upToAsOf, u.id, asOf);
      const vac = vacationInfo(state, u.id, asOf);

      return {
        user: u,
        dailyMin: dailyMinutes(u),
        vacEntitled: vac.entitled,
        vacUsed: vac.used,
        vacAvailable: vac.available,
        vacExpires: vac.expiration,
        vacTaken: vacations.filter((a) => a.status === "Aprobado").reduce((acc, a) => acc + clippedDays(a.dateFrom, a.dateTo), 0),
        vacPending: vacations.filter((a) => a.status === "Pendiente").reduce((acc, a) => acc + clippedDays(a.dateFrom, a.dateTo), 0),
        otApprovedMin: sumMin("Aprobado"),
        otRecoveredMin: state.absences
          .filter((a) => a.userId === u.id && a.type === "Compensación de horas" && a.status === "Aprobado" && inRange(a.dateFrom))
          .reduce((acc, a) => acc + compensationMinutes(state, u.id, a), 0),
        otDetectedMin: detected,
        otPendingMin: pending,
        otInReviewMin: Math.min(inReview, pending),
        otNotSentMin: Math.max(0, pending - inReview),
        otReturnedMin: sumMin("Devuelto"),
        otBalanceMin: bal.availableMin,
        otExpiredMin: bal.expiredMin,
      };
    });
}

const h = (min: number) => Math.round((min / 60) * 100) / 100;
const days = (min: number, dailyMin: number) => (dailyMin > 0 ? Math.round((min / dailyMin) * 10) / 10 : 0);
const ddmmyyyy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const HEADER = [
  "Persona", "Equipo", "Jornada (h/día)",
  "Vacaciones: corresponden", "Vacaciones: usadas", "Vacaciones: disponibles", "Vacaciones: vencen",
  "Vacaciones tomadas en el período (días)", "Vacaciones pendientes de aprobar (días)",
  "Horas extra aprobadas en el período (h)",
  "Saldo a favor al cierre (h)", "Saldo a favor al cierre (días)",
  "Extra según calendario (h)", "Pendientes de validar (h)", "  · en revisión (h)", "  · sin enviar (h)",
  "Devueltas para corregir (h)", "Vencidas sin usar (h)",
];

const toRow = (r: BalanceRow) => [
  r.user.name, r.user.team === "espana" ? "España" : "LATAM", h(r.dailyMin),
  r.vacEntitled, r.vacUsed, r.vacAvailable, ddmmyyyy(r.vacExpires),
  r.vacTaken, r.vacPending,
  h(r.otApprovedMin),
  h(r.otBalanceMin), days(r.otBalanceMin, r.dailyMin),
  h(r.otDetectedMin), h(r.otPendingMin), h(r.otInReviewMin), h(r.otNotSentMin),
  h(r.otReturnedMin), h(r.otExpiredMin),
];

/** Excel de saldos: una hoja con el período completo y otra con el detalle mes por mes. */
export function buildBalanceWorkbook(XLSX: typeof import("xlsx"), state: AppState, from: string, to: string, users: User[]) {
  const notes = [
    ["Saldos (vacaciones y días a favor) al cierre del período, o a hoy si el período todavía no terminó."],
    ["Vacaciones: 10 días hábiles por período anual desde la fecha de ingreso; vencen en el aniversario."],
    ["Horas extra y días a favor: aprobados que empiezan en el período; el saldo descuenta las compensaciones y lo vencido (1 año)."],
    ["Pendientes de validar: las horas extra del calendario (cada día, lo que pasa de la jornada) que todavía no están aprobadas, enviadas a revisión o no."],
  ];
  const summary: (string | number)[][] = [
    [`Vacaciones y horas extra · ${ddmmyyyy(from)} al ${ddmmyyyy(to)}`],
    ...notes,
    [],
    HEADER,
    ...balanceRows(state, from, to, users).map(toRow),
  ];

  const monthly: (string | number)[][] = [["Mes", ...HEADER]];
  for (let m = from.slice(0, 7) + "-01"; m <= to; m = addMonths(m, 1)) {
    const mEnd = addDays(addMonths(m, 1), -1);
    const label = monthLabel(m);
    for (const r of balanceRows(state, m < from ? from : m, mEnd > to ? to : mEnd, users)) {
      monthly.push([label.charAt(0).toUpperCase() + label.slice(1), ...toRow(r)]);
    }
  }

  const wb = XLSX.utils.book_new();
  const widths = [28, 9, 9, 12, 11, 12, 12, 16, 16, 16, 14, 14, 14, 14, 14, 14, 14, 12];
  const add = (name: string, aoa: (string | number)[][], cols: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("Resumen del período", summary, widths);
  add("Por mes", monthly, [16, ...widths]);
  return { wb, file: `vacaciones-y-horas-extra_${from}_${to}.xlsx` };
}

export async function downloadBalanceXlsx(state: AppState, from: string, to: string, users: User[]): Promise<string> {
  const XLSX = await import("xlsx");
  const { wb, file } = buildBalanceWorkbook(XLSX, state, from, to, users);
  XLSX.writeFile(wb, file);
  return file;
}
