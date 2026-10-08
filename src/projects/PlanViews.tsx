import React, { useState } from "react";
import { Avatar, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { addDays, addMonths, monthLabel, parseISO, today, weekStart } from "../utils";
import { PLAN_STATUS, planInfo } from "./constants";
import { useEnv } from "./env";
import { isPlanOverdue, taskProgress, type Perms } from "./logic";
import { Bar, DuePill } from "./parts";
import type { Deliverable, Milestone, PlanStatus, Task } from "./types";
import { workActions } from "./workStore";

/**
 * Vistas de seguimiento de la programación: Kanban y calendario de HITOS y
 * ENTREGABLES. Las tareas no se programan por separado: cuelgan de un hito, y su
 * avance alimenta el de cada tarjeta.
 */

export interface PlanViewProps {
  milestones: Milestone[];
  deliverables: Deliverable[];
  /** Todas las tareas del proyecto (incluidas las archivadas: cuentan para el avance) */
  tasks: Task[];
  perms: Perms;
  onOpenMs: (m: Milestone) => void;
  onOpenDel: (d: Deliverable) => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ====================================================================
 * Kanban: columnas por estado (pendiente / en curso / cumplido)
 * ==================================================================== */
type Item =
  | { kind: "m"; id: string; name: string; ownerId: string | null; dueDate: string | null; status: PlanStatus; ref: Milestone; gate: boolean }
  | { kind: "d"; id: string; name: string; ownerId: string | null; dueDate: string | null; status: PlanStatus; ref: Deliverable; parent: string | null };

export function PlanKanban({ milestones, deliverables, tasks, perms, onOpenMs, onOpenDel }: PlanViewProps) {
  const env = useEnv();
  const toast = useToast();
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<PlanStatus | null>(null);
  const [showMs, setShowMs] = useState(true);
  const [showDel, setShowDel] = useState(true);

  const items: Item[] = [
    ...(showMs ? milestones.map((m): Item => ({ kind: "m", id: m.id, name: m.name, ownerId: m.ownerId, dueDate: m.dueDate, status: m.status, ref: m, gate: !!m.isGate })) : []),
    ...(showDel ? deliverables.map((d): Item => ({ kind: "d", id: d.id, name: d.name, ownerId: d.ownerId, dueDate: d.dueDate, status: d.status, ref: d, parent: milestones.find((m) => m.id === d.milestoneId)?.name ?? null })) : []),
  ];
  const key = (i: Item) => i.kind + i.id;
  const tasksOf = (i: Item) => (i.kind === "m" ? tasks.filter((t) => t.milestoneId === i.id) : tasks.filter((t) => t.deliverableId === i.id));

  function drop(status: PlanStatus) {
    const it = items.find((i) => key(i) === dragKey);
    setDragKey(null);
    setOverCol(null);
    if (!it || !perms.canManage || it.status === status) return;
    if (it.kind === "m") workActions.updateMilestone(it.id, { status });
    else workActions.updateDeliverable(it.id, { status });
    const open = tasksOf(it).filter((t) => t.status !== "hecha").length;
    if (status === "cumplido" && open > 0) toast(`Marcado como cumplido, pero todavía tiene ${open} tarea${open > 1 ? "s" : ""} sin terminar.`);
  }

  return (
    <>
      <div className="pw-toolbar">
        <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>Mostrar</span>
        <label className={`chip ${showMs ? "on" : ""}`} style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={showMs} onChange={(e) => setShowMs(e.target.checked)} style={{ display: "none" }} /> ◆ Hitos
        </label>
        <label className={`chip ${showDel ? "on" : ""}`} style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={showDel} onChange={(e) => setShowDel(e.target.checked)} style={{ display: "none" }} /> ▣ Entregables
        </label>
        <span className="grow" />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{perms.canManage ? "Arrastrá una tarjeta para cambiar su estado. " : ""}El avance sale de las tareas de cada uno.</span>
      </div>
      <div className="pw-kanban" style={{ gridTemplateColumns: "repeat(3, minmax(250px, 1fr))" }}>
        {PLAN_STATUS.map((col) => {
          const list = items.filter((i) => i.status === col.key).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
          return (
            <div
              key={col.key}
              className={`pw-col ${overCol === col.key && perms.canManage ? "over" : ""}`}
              onDragOver={(e) => { if (perms.canManage && dragKey) { e.preventDefault(); setOverCol(col.key); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={(e) => { e.preventDefault(); drop(col.key); }}
            >
              <div className="pw-col-head"><span className="pw-dotc" style={{ background: col.color }} /> {col.label} <span className="count">{list.length}</span></div>
              {list.map((it) => {
                const pr = taskProgress(tasksOf(it));
                const late = isPlanOverdue(it);
                const owner = env.users.find((u) => u.id === it.ownerId);
                return (
                  <div
                    key={key(it)}
                    className={`pw-card ${dragKey === key(it) ? "dragging" : ""} ${!perms.canManage ? "readonly" : ""}`}
                    style={late ? { borderColor: "var(--danger)" } : undefined}
                    draggable={perms.canManage}
                    onDragStart={(e) => { setDragKey(key(it)); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key(it)); }}
                    onDragEnd={() => { setDragKey(null); setOverCol(null); }}
                    onClick={() => (it.kind === "m" ? onOpenMs(it.ref) : onOpenDel(it.ref))}
                  >
                    <div className="tags">
                      <span className={`pw-tag ${it.kind === "d" ? "ghost" : ""}`}>{it.kind === "m" ? (it.gate ? "◆ Puerta de decisión" : "◆ Hito") : "▣ Entregable"}</span>
                      {it.kind === "d" && it.parent && <span className="pw-tag ghost" title={`Hito: ${it.parent}`}>◆ {it.parent}</span>}
                    </div>
                    <div className="title">{it.name}</div>
                    <div style={{ marginBottom: 8 }}>
                      <Bar pct={pr.pct} />
                      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>{pr.total ? `${pr.done}/${pr.total} tareas hechas · ${pr.pct}%` : "Sin tareas asignadas"}</div>
                    </div>
                    <div className="meta">
                      <DuePill date={it.dueDate} done={it.status === "cumplido"} />
                      {late && <span className="pw-pill late"><Icon name="alert" size={11} /> Atrasado</span>}
                      <span style={{ marginLeft: "auto" }}>{owner ? <Avatar name={owner.name} size={22} /> : <span style={{ fontSize: 11, color: "var(--text-3)" }}>—</span>}</span>
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12, padding: "14px 0" }}>{perms.canManage ? "Soltá una tarjeta acá" : "Nada en este estado"}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ====================================================================
 * Calendario (mes): hitos y entregables por su fecha
 * ==================================================================== */
export function PlanCalendar({ milestones, deliverables, onOpenMs, onOpenDel }: PlanViewProps) {
  const [cursor, setCursor] = useState(() => today().slice(0, 8) + "01");
  const now = today();
  const gridStart = weekStart(cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = parseISO(cursor).getMonth();
  const noDate = milestones.filter((m) => !m.dueDate).length + deliverables.filter((d) => !d.dueDate).length;

  return (
    <>
      <div className="pw-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Mes anterior"><Icon name="arrow-left" size={13} /></button>
        <button className="btn btn-secondary btn-sm" onClick={() => setCursor(now.slice(0, 8) + "01")}>Hoy</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Mes siguiente"><Icon name="arrow-right" size={13} /></button>
        <strong style={{ marginLeft: 6 }}>{cap(monthLabel(cursor))}</strong>
        <span className="grow" />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          ◆ hito (relleno) · ▣ entregable (borde) · borde rojo = atrasado{noDate > 0 ? ` · ${noDate} sin fecha no se muestran` : ""}
        </span>
      </div>
      <div className="pw-cal-head">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="month-grid">
        {days.map((d) => {
          const dim = parseISO(d).getMonth() !== month;
          return (
            <div key={d} className={`month-cell ${dim ? "dim" : ""}`}>
              <span className={`num ${d === now ? "today" : ""}`}>{parseISO(d).getDate()}</span>
              {milestones.filter((m) => m.dueDate === d).map((m) => (
                <button key={m.id} className={`pw-cal-chip ${isPlanOverdue(m) ? "late" : ""}`} style={{ background: planInfo(m.status).color }} title={`Hito: ${m.name}`} onClick={() => onOpenMs(m)}>
                  ◆ {m.name}
                </button>
              ))}
              {deliverables.filter((x) => x.dueDate === d).map((x) => (
                <button key={x.id} className={`pw-cal-chip ms ${isPlanOverdue(x) ? "late" : ""}`} title={`Entregable: ${x.name}`} onClick={() => onOpenDel(x)}>
                  ▣ {x.name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
