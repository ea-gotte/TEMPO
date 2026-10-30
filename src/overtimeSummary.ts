import { computableMinutes, expectedMinutesInRange, findAbsenceFor, overtimeBreakdown, overtimeRange } from "./store";
import { pdfDataUrl, PDF_H, type PdfOp } from "./simplePdf";
import type { AppState, ID, OvertimeRequest } from "./types";
import { addDays, fmtDate, fmtDateTime, fmtDur, today } from "./utils";

export interface OvertimeStep { title: string; who: string; at: string; note?: string; done: boolean; bad?: boolean; /** devuelta con observaciones */ warn?: boolean }

export interface OvertimeSummary {
  issued: string;
  company: string;
  person: string;
  supervisor: string;
  jornada: string;
  period: string;
  status: string;
  /** Horas totales y extra por proyecto (solo proyectos computables) */
  rows: { projectId: ID | null; name: string; totalMin: number; extraMin: number }[];
  totalMin: number;
  extraMin: number;
  expectedMin: number;
  /** Cargadas en No laborable / Vacaciones: no computan */
  nonComputableMin: number;
  /** Etapas de la aprobación: se completan a medida que avanza la solicitud (ver OvertimeTraceModal) */
  steps: OvertimeStep[];
  absence?: string;
}

/** Datos del informe de horas extra de un mes (o semana, en las solicitudes viejas), a partir de los registros actuales. */
export function buildOvertimeSummary(state: AppState, ot: OvertimeRequest): OvertimeSummary {
  const u = state.users.find((x) => x.id === ot.userId);
  const name = (id?: string | null) => state.users.find((x) => x.id === id)?.name ?? "—";
  const [from, to] = overtimeRange(ot.weekStart);
  const bd = u ? overtimeBreakdown(state, u, from, to) : null;
  const projectName = (id: ID | null) => state.projects.find((p) => p.id === id)?.name ?? "Sin proyecto";

  const totals = new Map<ID | null, number>();
  for (const e of state.entries) {
    if (e.userId !== ot.userId || e.date < from || e.date > to) continue;
    const m = computableMinutes(state, e);
    if (m > 0) totals.set(e.projectId, (totals.get(e.projectId) ?? 0) + m);
  }
  const extras = new Map((bd?.byProject ?? []).map((p) => [p.projectId, p.minutes]));
  const rows = [...totals.entries()]
    .map(([projectId, totalMin]) => ({ projectId, name: projectName(projectId), totalMin, extraMin: extras.get(projectId) ?? 0 }))
    .sort((a, b) => b.totalMin - a.totalMin);

  const period = from.endsWith("-01") && to > from
    ? new Date(from + "T00:00:00").toLocaleDateString("es", { month: "long", year: "numeric" })
    : `${fmtDate(from)} al ${fmtDate(to)}`;
  const abs = findAbsenceFor(state, ot);

  // Etapas: la solicitud, cada vuelta de observaciones y respuestas (historial), la decisión y el cómputo
  const events = ot.history ?? [];
  const TITLES = {
    Devuelta: "Devuelta con observaciones",
    Reenviada: "Respuesta y reenvío de la persona",
    Aprobada: "Aprobada por Recursos Humanos",
    Rechazada: "Rechazada por Recursos Humanos",
  } as const;
  const decision: OvertimeStep = {
    title: "Revisión de Recursos Humanos",
    who: ot.status === "Pendiente" ? "Pendiente de revisión" : name(ot.resolvedBy),
    at: ot.resolvedAt ? fmtDate(ot.resolvedAt) : "",
    note: ot.status === "Pendiente" ? undefined : ot.supervisorComment,
    done: ot.status !== "Pendiente",
    bad: ot.status === "Rechazado",
    warn: ot.status === "Devuelto",
  };
  const lastEvent = events[events.length - 1];
  const review: OvertimeStep[] = events.length === 0
    ? [decision]
    : [
        ...events.map((e): OvertimeStep => ({
          title: TITLES[e.action], who: name(e.by), at: fmtDateTime(e.at), note: e.comment,
          done: true, bad: e.action === "Rechazada", warn: e.action === "Devuelta",
        })),
        ...(ot.status === "Pendiente" ? [{ title: "Revisión de Recursos Humanos", who: "Pendiente de revisión", at: "", done: false }] : []),
        ...(ot.status === "Devuelto" ? [{ title: "Corrección de la persona", who: "Esperando que corrija y reenvíe", at: "", done: false }] : []),
        ...((ot.status === "Aprobado" || ot.status === "Rechazado") && lastEvent.action !== "Aprobada" && lastEvent.action !== "Rechazada" ? [decision] : []),
      ];
  const steps: OvertimeStep[] = [
    { title: "Solicitud generada por el usuario", who: name(ot.userId), at: fmtDate(ot.createdAt), done: true },
    ...review,
    {
      title: "Cómputo en el saldo del usuario",
      who: ot.status === "Aprobado" ? `${fmtDur(ot.minutes)} acreditadas` : ot.status === "Rechazado" ? "No se acreditan horas" : ot.status === "Devuelto" ? "Esperando que la persona corrija y reenvíe" : "Pendiente",
      at: ot.status === "Aprobado" ? `Vencen el ${fmtDate(addDays(ot.weekStart, 365))}` : "",
      done: ot.status === "Aprobado",
      bad: ot.status === "Rechazado",
    },
  ];

  return {
    issued: fmtDate(today()),
    company: state.company.name,
    person: u?.name ?? "—",
    supervisor: name(u?.supervisorId),
    jornada: u ? `${u.jornada === "media" ? "Media" : "Completa"} · ${u.weeklyHours} h/sem` : "—",
    period: period.charAt(0).toUpperCase() + period.slice(1),
    status: ot.status,
    rows,
    totalMin: bd?.computableMin ?? 0,
    extraMin: bd?.extraMin ?? 0,
    expectedMin: u ? expectedMinutesInRange(state, u, from, to) : 0,
    nonComputableMin: (bd?.loadedMin ?? 0) - (bd?.computableMin ?? 0),
    absence: abs ? `${abs.type}, ${fmtDate(abs.dateFrom)} al ${fmtDate(abs.dateTo)}` : undefined,
    steps,
  };
}

/** Informe simple en PDF: horas totales y horas extra por proyecto, más el estado de la aprobación. */
export function overtimePdfDataUrl(sum: OvertimeSummary): string {
  const pages: PdfOp[][] = [[]];
  let ops = pages[0];
  let y = PDF_H - 56;
  const L = 50;
  const R = 545;
  const next = () => { ops = []; pages.push(ops); y = PDF_H - 56; };
  const text = (x: number, s: string, size = 10, bold = false, gray = 0) => ops.push({ t: "text", x, y, s, size, bold, gray });
  const rule = (w = 0.6) => ops.push({ t: "line", x1: L, y1: y, x2: R, y2: y, w });
  const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  text(L, sum.company.toUpperCase(), 8, false, 0.4);
  y -= 22;
  text(L, "Informe de horas extra", 18, true);
  text(R - 130, `Emitido el ${sum.issued}`, 8, false, 0.4);
  y -= 10; rule(1.4); y -= 20;

  for (const [k, v] of [["Persona", sum.person], ["Supervisor", sum.supervisor], ["Período", sum.period]]) {
    text(L, k, 10, false, 0.4);
    text(L + 90, v, 10, true);
    y -= 16;
  }
  y -= 10;

  text(L, "Proyecto", 8.5, true); text(390, "Horas totales", 8.5, true); text(480, "Horas extra", 8.5, true);
  y -= 6; rule(1); y -= 15;
  if (sum.rows.length === 0) { text(L, "Sin horas computables en el período.", 10, false, 0.4); y -= 16; }
  for (const r of sum.rows) {
    if (y < 120) next();
    text(L, cut(r.name, 60), 10); text(390, fmtDur(r.totalMin), 10); text(480, r.extraMin ? fmtDur(r.extraMin) : "—", 10, r.extraMin > 0);
    y -= 5; rule(0.3); y -= 13;
  }
  text(L, "Total", 10, true); text(390, fmtDur(sum.totalMin), 10, true); text(480, fmtDur(sum.extraMin), 10, true);
  y -= 18;
  if (sum.nonComputableMin > 0) {
    text(L, `No computables (No laborable / Vacaciones): ${fmtDur(sum.nonComputableMin)}`, 8.5, false, 0.4);
    y -= 14;
  }
  text(L, "Cada día se cuentan las horas hasta completar la jornada; el resto es extra del proyecto en que se cargó.", 8, false, 0.4);
  return pdfDataUrl(pages);
}
