import React, { useEffect, useMemo, useRef } from "react";
import { Empty } from "../components/ui";
import { addDays, fmtDate, monthLabel, parseISO, today } from "../utils";
import { planInfo } from "./constants";
import { useEnv } from "./env";
import { isPlanOverdue, taskProgress } from "./logic";
import type { Deliverable, Milestone, Task } from "./types";

/**
 * Gantt de hitos y entregables: la programación del proyecto se sigue solo por
 * ellos. Cada barra va del inicio al fin de su plazo; el relleno claro es el
 * avance de sus tareas. Sin fecha de inicio se marca solo la fecha de fin.
 */

export interface PlanViewProps {
  milestones: Milestone[];
  deliverables: Deliverable[];
  /** Todas las tareas del proyecto (incluidas las archivadas: cuentan para el avance) */
  tasks: Task[];
  onOpenMs: (m: Milestone) => void;
  onOpenDel: (d: Deliverable) => void;
}

const DAY_W = 24;
const NAME_W = 260;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const diffDays = (a: string, b: string) => Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);

type Row =
  | { key: string; kind: "m"; item: Milestone }
  | { key: string; kind: "d"; item: Deliverable; indent: boolean };

export function PlanGantt({ milestones, deliverables, tasks, onOpenMs, onOpenDel }: PlanViewProps) {
  const env = useEnv();
  const now = today();
  const scroller = useRef<HTMLDivElement>(null);

  const sortedMs = useMemo(() => [...milestones].sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")), [milestones]);
  const rows = useMemo(() => {
    const list: Row[] = [];
    for (const m of sortedMs) {
      list.push({ key: "m" + m.id, kind: "m", item: m });
      deliverables.filter((d) => d.milestoneId === m.id).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))
        .forEach((d) => list.push({ key: "d" + d.id, kind: "d", item: d, indent: true }));
    }
    deliverables.filter((d) => !d.milestoneId || !milestones.some((m) => m.id === d.milestoneId))
      .forEach((d) => list.push({ key: "d" + d.id, kind: "d", item: d, indent: false }));
    return list;
  }, [sortedMs, deliverables, milestones]);

  const dated = rows.filter((r) => r.item.dueDate);
  const undated = rows.length - dated.length;

  const range = useMemo(() => {
    const all = [now, ...dated.flatMap((r) => [r.item.startDate, r.item.dueDate])].filter(Boolean) as string[];
    const min = all.reduce((a, b) => (a < b ? a : b));
    const max = all.reduce((a, b) => (a > b ? a : b));
    const start = addDays(min, -3);
    return { start, days: diffDays(max, start) + 8 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    // Arranca en lo que todavía importa: el primer plazo sin cumplir (o hoy)
    const el = scroller.current;
    const open = dated.filter((r) => r.item.status !== "cumplido").map((r) => r.item.startDate ?? r.item.dueDate!);
    const anchor = open.length ? open.reduce((a, b) => (a < b ? a : b)) : now;
    if (el) el.scrollLeft = Math.max(0, diffDays(anchor, range.start) * DAY_W - 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, now]);

  function goToday() {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, diffDays(now, range.start) * DAY_W - (el.clientWidth - NAME_W) * 0.4), behavior: "smooth" });
  }

  if (dated.length === 0) {
    return <div className="card card-pad"><Empty icon="calendar-days" text="Nada para graficar" sub="Los hitos y entregables necesitan una fecha (y, para ver la barra, un inicio del plazo) para aparecer en el Gantt." /></div>;
  }

  const width = range.days * DAY_W;
  const todayX = diffDays(now, range.start) * DAY_W + DAY_W / 2;
  const months: { label: string; x: number }[] = [];
  for (let i = 0; i < range.days; i++) {
    const d = addDays(range.start, i);
    if (i === 0 || d.endsWith("-01")) months.push({ label: monthLabel(d), x: i * DAY_W });
  }

  return (
    <>
      <div className="pw-toolbar" style={{ marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={goToday}>Ir a hoy</button>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Desplazá horizontalmente para recorrer el calendario del proyecto. Clic en una barra para abrirla.</span>
      </div>
      <div className="pw-gantt" ref={scroller}>
        <div className="pw-gantt-inner" style={{ width: NAME_W + width }}>
          <div className="pw-g-head">
            <div className="pw-g-name">Hito / entregable</div>
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
            {dated.map((r) => {
              const it = r.item;
              const isMs = r.kind === "m";
              const end = it.dueDate!;
              const start = it.startDate && it.startDate <= end ? it.startDate : null;
              const late = isPlanOverdue(it);
              const color = late ? "var(--danger)" : planInfo(it.status).color === "var(--text-3)" ? "var(--text-3)" : planInfo(it.status).color;
              const pr = taskProgress(isMs ? tasks.filter((t) => t.milestoneId === it.id) : tasks.filter((t) => t.deliverableId === it.id));
              const owner = env.users.find((u) => u.id === it.ownerId);
              const open = () => (isMs ? onOpenMs(it as Milestone) : onOpenDel(it as Deliverable));
              const title = `${it.name} · ${start ? fmtDate(start) + " → " : ""}${fmtDate(end)}${owner ? " · " + owner.name : ""} · ${pr.total ? `${pr.done}/${pr.total} tareas` : "sin tareas"}`;
              const left = diffDays(start ?? end, range.start) * DAY_W;
              const w = (diffDays(end, start ?? end) + 1) * DAY_W;
              return (
                <div key={r.key} className={`pw-g-row ${isMs ? "pw-g-group" : ""}`}>
                  <div className="pw-g-name" style={{ cursor: "pointer", paddingLeft: !isMs && (r as { indent?: boolean }).indent ? 26 : 12 }} onClick={open}>
                    <span className="t" title={it.name}>{isMs ? "◆" : "▣"} {it.name}</span>
                  </div>
                  <div className="pw-g-track" style={{ width }}>
                    {start ? (
                      <div className={`pw-g-bar ${late ? "late" : ""}`} style={{ left, width: w, background: color }} title={title} onClick={open}>
                        <span className="fill" style={{ width: `${it.status === "cumplido" ? 100 : pr.pct}%` }} />
                        {w > 90 && <span>{pr.total ? `${pr.pct}%` : ""}</span>}
                      </div>
                    ) : (
                      <div className="pw-g-diamond" title={title} style={{ left: left + 4, background: color }} onClick={open} />
                    )}
                    {start && isMs && <div className="pw-g-diamond" title={title} style={{ left: left + w - 12, background: color, border: "2px solid var(--surface)" }} onClick={open} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
        La línea azul es hoy · el relleno claro es el avance de las tareas · borde o color rojo = atrasado · ◆ hito, ▣ entregable
        {undated > 0 ? ` · ${undated} sin fecha no se muestran` : ""}. Si falta el inicio del plazo, se marca solo la fecha.
      </div>
    </>
  );
}
