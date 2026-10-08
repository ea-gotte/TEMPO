import React, { useEffect, useMemo, useRef, useState } from "react";
import { Empty, useToast } from "../components/ui";
import { addDays, fmtDate, monthLabel, parseISO, today } from "../utils";
import { planInfo } from "./constants";
import { useEnv } from "./env";
import { isPlanOverdue, taskProgress } from "./logic";
import { forecastSchedule, planItems } from "./schedule";
import type { Deliverable, Milestone, Task } from "./types";
import { workActions } from "./workStore";

/**
 * Gantt de la planificación: una fila por HITO, con su plazo planificado (barra
 * azul con borde) y el real o previsto (barra de abajo, que se edita arrastrando
 * sus bordes). Los entregables no tienen fila: son un punto al final del hito y
 * viajan con él cuando la barra se alarga o se acorta.
 */

export interface PlanViewProps {
  milestones: Milestone[];
  deliverables: Deliverable[];
  /** Todas las tareas del proyecto (incluidas las archivadas: cuentan para el avance) */
  tasks: Task[];
  onOpenMs: (m: Milestone) => void;
  onOpenDel: (d: Deliverable) => void;
  /** Se pueden editar las fechas reales arrastrando los bordes de la barra */
  canEdit?: boolean;
}

interface DragState { id: string; edge: "start" | "end"; x0: number; start: string; end: string; delta: number }

const DAY_W = 24;
const NAME_W = 260;
const ROW_H = 40;
const DOT = 11;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const diffDays = (a: string, b: string) => Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
const sign = (n: number) => (n > 0 ? "+" : "") + n;

/** Fechas de la barra mientras se arrastra uno de sus bordes (el otro borde no se mueve y no se cruzan). */
function dragDates(d: DragState): { start: string; end: string } {
  if (d.edge === "start") { const s = addDays(d.start, d.delta); return { start: s > d.end ? d.end : s, end: d.end }; }
  const e = addDays(d.end, d.delta);
  return { start: d.start, end: e < d.start ? d.start : e };
}

export function PlanGantt({ milestones, deliverables, tasks, onOpenMs, onOpenDel, canEdit }: PlanViewProps) {
  const env = useEnv();
  const toast = useToast();
  const now = today();
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const justDragged = useRef(false);

  // Arrastrar el borde de una barra real: cambia su fecha de inicio o de fin real
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const delta = Math.round((e.clientX - drag.x0) / DAY_W);
      setDrag((d) => (d && d.delta !== delta ? { ...d, delta } : d));
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      if (!d || d.delta === 0) return;
      const { start, end } = dragDates(d);
      const m = milestones.find((x) => x.id === d.id);
      if (!m) return;
      if (d.edge === "start") {
        workActions.updateMilestone(d.id, { actualStart: start, ...(m.status === "pendiente" ? { status: "en_curso" as const } : {}) });
        toast(`Inicio real: ${fmtDate(start)}.`);
      } else if (m.status === "cumplido") {
        workActions.updateMilestone(d.id, { actualEnd: end });
        toast(`Fin real: ${fmtDate(end)}.`);
      } else if (window.confirm(`Poner el fin real el ${fmtDate(end)} marca “${m.name}” como cumplido. ¿Seguir?`)) {
        workActions.updateMilestone(d.id, { actualStart: m.actualStart ?? start, actualEnd: end, status: "cumplido" });
        toast(`“${m.name}” cumplido el ${fmtDate(end)}.`);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = ""; document.body.style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const rows = useMemo(() => [...milestones].sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")), [milestones]);
  const fc = useMemo(() => forecastSchedule(planItems(milestones, deliverables), now), [milestones, deliverables, now]);
  const dated = rows.filter((m) => m.dueDate);
  const undated = rows.length - dated.length;
  const orphanDel = deliverables.filter((d) => !d.milestoneId || !milestones.some((m) => m.id === d.milestoneId)).length;

  const range = useMemo(() => {
    const all = [now, ...dated.flatMap((m) => {
      const f = fc.get(m.id);
      return [m.startDate, m.dueDate, f?.start, f?.end];
    })].filter(Boolean) as string[];
    const min = all.reduce((a, b) => (a < b ? a : b));
    const max = all.reduce((a, b) => (a > b ? a : b));
    const start = addDays(min, -3);
    return { start, days: diffDays(max, start) + 8 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fc]);

  useEffect(() => {
    // Arranca en lo que todavía importa: el primer plazo sin cumplir (o hoy)
    const el = scroller.current;
    const open = dated.filter((m) => m.status !== "cumplido").map((m) => m.startDate ?? m.dueDate!);
    const anchor = open.length ? open.reduce((a, b) => (a < b ? a : b)) : now;
    if (el) el.scrollLeft = Math.max(0, diffDays(anchor, range.start) * DAY_W - 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, now]);

  function goToday() {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, diffDays(now, range.start) * DAY_W - (el.clientWidth - NAME_W) * 0.4), behavior: "smooth" });
  }

  if (dated.length === 0) {
    return <div className="card card-pad"><Empty icon="calendar-days" text="Nada para graficar" sub="Los hitos necesitan una fecha (y, para ver la barra, un inicio planificado) para aparecer en el Gantt." /></div>;
  }

  const width = range.days * DAY_W;
  const X = (d: string) => diffDays(d, range.start) * DAY_W;
  const todayX = X(now) + DAY_W / 2;
  const months: { label: string; x: number }[] = [];
  for (let i = 0; i < range.days; i++) {
    const d = addDays(range.start, i);
    if (i === 0 || d.endsWith("-01")) months.push({ label: monthLabel(d), x: i * DAY_W });
  }

  const plannedEnds = rows.map((m) => m.dueDate).filter(Boolean) as string[];
  const forecastEnds = rows.map((m) => fc.get(m.id)?.end).filter(Boolean) as string[];
  const lastPlanned = plannedEnds.length ? plannedEnds.reduce((a, b) => (a > b ? a : b)) : null;
  const lastForecast = forecastEnds.length ? forecastEnds.reduce((a, b) => (a > b ? a : b)) : null;
  const endShift = lastPlanned && lastForecast ? diffDays(lastForecast, lastPlanned) : 0;

  return (
    <>
      <div className="pw-toolbar" style={{ marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={goToday}>Ir a hoy</button>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Clic en una barra o en un punto para abrirlo.</span>
        <span style={{ flex: 1 }} />
        {lastPlanned && lastForecast && (
          <span className={`pw-pill ${endShift > 0 ? "late" : "ok"}`}>
            Último hito: plan {fmtDate(lastPlanned).slice(0, 5)} → previsto {fmtDate(lastForecast).slice(0, 5)} · {endShift > 0 ? `+${endShift} d` : endShift < 0 ? `${endShift} d` : "sin desvío"}
          </span>
        )}
      </div>
      <div className="pw-gantt" ref={scroller}>
        <div className="pw-gantt-inner" style={{ width: NAME_W + width }}>
          <div className="pw-g-head">
            <div className="pw-g-name">Hito</div>
            <div className="pw-g-days" style={{ width }}>
              {months.map((m) => <span key={m.x} className="pw-g-month" style={{ left: m.x + 4 }}>{cap(m.label)}</span>)}
              {Array.from({ length: range.days }, (_, i) => {
                const d = addDays(range.start, i);
                return <span key={d} className={`pw-g-day ${d === now ? "today" : ""}`} style={{ left: i * DAY_W }}>{parseISO(d).getDate()}</span>;
              })}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div className="pw-g-today" style={{ left: NAME_W + todayX }} title="Hoy" />
            {dated.map((m) => {
              const f = fc.get(m.id)!;
              const pStart = m.startDate && m.startDate <= m.dueDate! ? m.startDate : null;
              const pEnd = m.dueDate!;
              const late = isPlanOverdue(m);
              const delayed = f.delayDays > 0;
              const color = f.done ? (delayed ? "var(--warning)" : "var(--success)") : delayed ? "var(--danger)" : planInfo(m.status).color;
              const myTasks = tasks.filter((t) => t.milestoneId === m.id);
              const pr = taskProgress(myTasks);
              const owner = env.users.find((u) => u.id === m.ownerId);
              const dels = deliverables.filter((d) => d.milestoneId === m.id).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
              const open = () => onOpenMs(m);

              const baseRs = f.start ?? pStart;
              const baseRe = f.end ?? pEnd;
              const same = baseRs === pStart && baseRe === pEnd;
              // Mientras se arrastra un borde, la barra (y los puntos de sus entregables) muestran las fechas en vivo
              const dragging = drag && drag.id === m.id ? dragDates(drag) : null;
              const rs = dragging ? dragging.start : baseRs;
              const re = dragging ? dragging.end : baseRe;
              const editable = !!canEdit && !!baseRs;
              const hasBar = !!rs && !(same && m.status === "pendiente" && !dragging);
              const startHandle = (edge: "start" | "end") => (e: React.PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (baseRs) setDrag({ id: m.id, edge, x0: e.clientX, start: baseRs, end: baseRe, delta: 0 });
              };
              const endX = X(re) + DAY_W; // borde derecho de lo real/previsto (o, si no hay, del plan)
              const dotsX = (hasBar ? endX : X(pEnd) + DAY_W) + 6;
              const title = `${m.name}\nPlanificado: ${pStart ? fmtDate(pStart) + " → " : ""}${fmtDate(pEnd)}\n${f.done ? "Real" : "Previsto"}: ${rs ? fmtDate(rs) + " → " : ""}${fmtDate(re)}${f.delayDays ? ` (${sign(f.delayDays)} d)` : ""}${owner ? "\n" + owner.name : ""}\n${pr.total ? `${pr.done}/${pr.total} tareas` : "sin tareas"}${dels.length ? `\n${dels.length} entregable${dels.length > 1 ? "s" : ""}` : ""}`;
              return (
                <div key={m.id} className="pw-g-row pw-g-group" style={{ height: ROW_H }}>
                  <div className="pw-g-name" style={{ cursor: "pointer" }} onClick={open} title="Abrir el hito">
                    <span className="t">◆ {m.name}</span>
                    {delayed && <span className={`pw-pill ${f.done ? "soon" : "late"}`} style={{ marginLeft: 6 }}>{sign(f.delayDays)} d</span>}
                  </div>
                  <div className="pw-g-track" style={{ width, height: ROW_H }}>
                    {/* Planificado */}
                    {pStart ? (
                      <div className="pw-g-plan" style={{ left: X(pStart), width: (diffDays(pEnd, pStart) + 1) * DAY_W }} title={title}>
                        {(diffDays(pEnd, pStart) + 1) * DAY_W > 112 && <span>{fmtDate(pStart).slice(0, 5)} → {fmtDate(pEnd).slice(0, 5)}</span>}
                      </div>
                    ) : <div className="pw-g-plan-pt" style={{ left: X(pEnd) + 6 }} title={title} />}
                    {/* Real o previsto: se edita arrastrando los bordes */}
                    {hasBar ? (
                      <div
                        className={`pw-g-bar ${f.done ? "" : "forecast"} ${late || (delayed && !f.done) ? "late" : ""} ${dragging ? "dragging" : ""}`}
                        style={{ left: X(rs!), width: (diffDays(re, rs!) + 1) * DAY_W, background: color, top: 22, height: 14 }}
                        title={editable ? `${title}\n\nArrastrá los bordes para cambiar el inicio o el fin reales` : title} onClick={() => { if (!justDragged.current) open(); }}
                      >
                        <span className="fill" style={{ width: `${m.status === "cumplido" ? 100 : pr.pct}%` }} />
                        {dragging ? <span>{fmtDate(rs!).slice(0, 5)} → {fmtDate(re).slice(0, 5)}</span> : (diffDays(re, rs!) + 1) * DAY_W > 90 && <span>{pr.total ? `${pr.pct}%` : ""}</span>}
                        {editable && <i className="pw-g-handle l" onPointerDown={startHandle("start")} />}
                        {editable && <i className="pw-g-handle r" onPointerDown={startHandle("end")} />}
                      </div>
                    ) : (
                      <div className="pw-g-hit" style={{ left: pStart ? X(pStart) : X(pEnd), width: pStart ? (diffDays(pEnd, pStart) + 1) * DAY_W : DAY_W }} title={title} onClick={open} />
                    )}
                    {/* Entregables: un punto cada uno, al final del hito (viajan con él) */}
                    {dels.map((d, i) => {
                      const done = d.status === "cumplido";
                      const dLate = isPlanOverdue(d);
                      const dp = taskProgress(tasks.filter((t) => t.deliverableId === d.id));
                      return (
                        <div
                          key={d.id} className={`pw-g-del ${done ? "done" : dLate ? "late" : ""}`}
                          style={{ left: dotsX + i * (DOT + 4), top: 23, width: DOT, height: DOT }}
                          title={`▣ ${d.name}\nEntrega: ${d.dueDate ? fmtDate(d.dueDate) : "sin fecha"}${done ? " (cumplido)" : dLate ? " (atrasado)" : ""}\n${dp.total ? `${dp.done}/${dp.total} tareas` : "sin tareas"}`}
                          onClick={() => onOpenDel(d)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
        Barra azul con borde = plazo planificado (con sus fechas) · barra de abajo = real (cerrado) o previsto (rayada) · ▣ = un entregable, al final de su hito · la línea azul es hoy
        {canEdit ? " · arrastrá los bordes de la barra de abajo para editar el inicio y el fin reales; los entregables se corren con el hito" : ""}
        {undated > 0 ? ` · ${undated} hito${undated > 1 ? "s" : ""} sin fecha no se muestra${undated > 1 ? "n" : ""}` : ""}
        {orphanDel > 0 ? ` · ${orphanDel} entregable${orphanDel > 1 ? "s" : ""} sin hito no se muestra${orphanDel > 1 ? "n" : ""}` : ""}.
      </div>
    </>
  );
}
