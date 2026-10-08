import React, { useState } from "react";
import { Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, today } from "../utils";
import { PLAN_STATUS } from "./constants";
import { useEnv } from "./env";
import { isPlanOverdue, taskProgress, type Perms } from "./logic";
import { DeliverableModal, MilestoneModal, TaskModal, type TaskDraft } from "./Modals";
import { Bar, DuePill, Person, StatusPill } from "./parts";
import { PlanGantt } from "./PlanViews";
import { useTaskMenu } from "./TaskMenu";
import { diffDays, forecastSchedule, planItems } from "./schedule";
import type { Deliverable, Milestone, PlanStatus, Task } from "./types";
import { useWork, workActions } from "./workStore";

type PlanView = "tabla" | "gantt";
const PLAN_VIEWS: { key: PlanView; label: string }[] = [
  { key: "tabla", label: "Tabla" },
  { key: "gantt", label: "Gantt" },
];
const PLAN_VIEW_KEY = "tempo-proyectos-vista-plan-v2";

function loadPlanView(): PlanView {
  try {
    const v = localStorage.getItem(PLAN_VIEW_KEY) as PlanView | null;
    if (v && PLAN_VIEWS.some((x) => x.key === v)) return v;
  } catch { /* sin preferencia guardada */ }
  return "tabla";
}

/**
 * Hitos y entregables: el esqueleto de planificación del proyecto y donde se
 * sigue la programación. Una tabla (con hitos y entregables que se expanden hasta
 * sus tareas, contraídos por defecto) y un Gantt con sus plazos. El avance sale de
 * las tareas; nadie lo carga a mano.
 */
export function PlanTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const [view, setViewState] = useState<PlanView>(loadPlanView);
  const [open, setOpen] = useState<Set<string>>(() => new Set()); // todo contraído por defecto
  const [msModal, setMsModal] = useState<Milestone | "new" | null>(null);
  const [delModal, setDelModal] = useState<{ d: Deliverable | null; milestoneId?: string | null } | null>(null);
  const [taskModal, setTaskModal] = useState<TaskDraft | null>(null);
  const taskMenu = useTaskMenu({ perms, onEdit: (t) => setTaskModal(t) });

  function setView(v: PlanView) {
    setViewState(v);
    try { localStorage.setItem(PLAN_VIEW_KEY, v); } catch { /* ignorar */ }
  }

  const milestones = work.milestones.filter((m) => m.projectId === projectId).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const deliverables = work.deliverables.filter((d) => d.projectId === projectId);
  const tasks = work.tasks.filter((t) => t.projectId === projectId);
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);
  const visibleTasks = (list: Task[]) => list.filter((t) => !t.archived).sort((a, b) => a.sortOrder - b.sortOrder);

  // Plan contra real: fechas previstas tras propagar los atrasos por las dependencias
  const fc = forecastSchedule(planItems(milestones, deliverables));
  const sign = (n: number) => (n > 0 ? "+" : "") + n;
  const short = (d: string | null | undefined) => (d ? fmtDate(d).slice(0, 5) : "—");

  /** Fechas reales (o previstas si todavía está abierto) */
  const realCell = (x: Milestone | Deliverable) => {
    const f = fc.get(x.id);
    if (!f) return <td />;
    if (f.done) return <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>{x.actualStart ? short(x.actualStart) + " → " : ""}{short(f.end)}</td>;
    const moved = f.end && x.dueDate && f.end !== x.dueDate;
    return (
      <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
        {x.actualStart ? <span style={{ color: "var(--text-3)" }}>desde {short(x.actualStart)} </span> : null}
        {moved ? <span style={{ color: "var(--danger)", fontWeight: 600 }} title="Fin previsto, con los atrasos y las dependencias">prev. {short(f.end)}</span> : x.actualStart ? null : <span style={{ color: "var(--text-3)" }}>—</span>}
      </td>
    );
  };
  /** Desvío del fin contra el plan: real si ya cerró, previsto si no */
  const desvioCell = (x: Milestone | Deliverable) => {
    const f = fc.get(x.id);
    if (!f || !x.dueDate || !f.end) return <td />;
    if (f.done) {
      return <td>{f.delayDays > 0 ? <span className="pw-pill soon" title="Cerró después de lo planificado">{sign(f.delayDays)} d</span> : <span className="pw-pill ok" title="Cerró en plazo">{f.delayDays < 0 ? `${f.delayDays} d` : "a tiempo"}</span>}</td>;
    }
    return <td>{f.delayDays > 0 ? <span className="pw-pill late" title={f.viaDeps ? `Se corre ${f.inheritedDays} d por un predecesor atrasado` : "Atraso propio"}>{sign(f.delayDays)} d{f.viaDeps ? " ↳" : ""}</span> : <span style={{ color: "var(--text-3)", fontSize: 12 }}>en plazo</span>}</td>;
  };

  const orphanDeliverables = deliverables.filter((d) => !d.milestoneId || !milestones.some((m) => m.id === d.milestoneId));
  const looseTasks = tasks.filter((t) => (!t.milestoneId || !milestones.some((m) => m.id === t.milestoneId)) && !t.deliverableId);

  /* ---- expandir / contraer ---- */
  const toggle = (key: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandable = [
    ...milestones.map((m) => "m:" + m.id), ...deliverables.map((d) => "d:" + d.id),
    ...(orphanDeliverables.length ? ["od"] : []), ...(looseTasks.length ? ["lt"] : []),
  ];
  const allOpen = expandable.length > 0 && expandable.every((k) => open.has(k));

  const planSelect = (value: PlanStatus, onChange: (s: PlanStatus) => void) =>
    perms.canManage ? (
      <select className="select" style={{ width: "auto", padding: "3px 8px", fontSize: 12.5 }} value={value} onChange={(e) => onChange(e.target.value as PlanStatus)} onClick={(e) => e.stopPropagation()}>
        {PLAN_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    ) : (
      <span className="pw-pill">{PLAN_STATUS.find((s) => s.key === value)?.label}</span>
    );

  const chev = (k: string, hasChildren: boolean) =>
    hasChildren ? (
      <button className="pw-chev" aria-expanded={open.has(k)} aria-label={open.has(k) ? "Contraer" : "Expandir"} onClick={(e) => { e.stopPropagation(); toggle(k); }}>
        <Icon name="chevron-right" size={14} style={{ transform: open.has(k) ? "rotate(90deg)" : undefined, transition: "transform 0.12s" }} />
      </button>
    ) : <span className="pw-chev" />;

  const plazo = (x: { startDate?: string | null; dueDate: string | null; status: PlanStatus }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {x.startDate && x.dueDate && <span className="pw-plan-chip"><Icon name="calendar-days" size={12} /> {fmtDate(x.startDate).slice(0, 5)} → {fmtDate(x.dueDate).slice(0, 5)}</span>}
      {!(x.startDate && x.dueDate) && <DuePill date={x.dueDate} done={x.status === "cumplido"} />}
      {x.startDate && x.dueDate && x.status !== "cumplido" && x.dueDate < today() && <span className="pw-pill late" title="Venció la fecha planificada"><Icon name="alert" size={11} /></span>}
    </span>
  );

  const progressCell = (pr: { done: number; total: number; pct: number }, showPct: boolean) => (
    <td style={{ minWidth: 150 }}>
      <span title={`${pr.done} de ${pr.total} tareas hechas`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 80 }}><Bar pct={pr.pct} /></span>
        {showPct && <span style={{ fontSize: 12, fontWeight: 650 }}>{pr.pct}%</span>}
        <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{pr.done}/{pr.total}</span>
      </span>
    </td>
  );

  const taskRows = (list: Task[], indent: number) =>
    visibleTasks(list).map((t) => (
      <tr key={t.id} className="pw-tr-task" style={{ cursor: "pointer" }} onClick={() => setTaskModal(t)} onContextMenu={(e) => taskMenu.open(e, t)}>
        <td style={{ paddingLeft: 12 + indent * 24 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="pw-chev" />
            <span style={{ textDecoration: t.status === "hecha" ? "line-through" : undefined, color: t.status === "hecha" ? "var(--text-3)" : undefined }}>{t.name}</span>
          </span>
        </td>
        <td><Person user={userOf(t.assigneeId)} size={18} /></td>
        <td>{plazo({ dueDate: t.dueDate, status: t.status === "hecha" ? "cumplido" : "pendiente" })}</td>
        <td /><td />
        <td><StatusPill status={t.status} /></td>
        <td style={{ fontSize: 12, color: "var(--text-3)" }}>{t.estimateHours != null ? `${t.estimateHours} h` : "—"}</td>
        <td />
      </tr>
    ));

  const deliverableRows = (d: Deliverable, indent: number) => {
    const ts = tasks.filter((t) => t.deliverableId === d.id);
    const k = "d:" + d.id;
    return (
      <React.Fragment key={d.id}>
        <tr className="pw-tr-del" style={{ cursor: "pointer" }} onClick={() => setDelModal({ d })}>
          <td style={{ paddingLeft: 12 + indent * 24 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {chev(k, ts.length > 0)}
              <span style={{ color: "var(--text-3)" }}>▣</span><span style={{ fontWeight: 600 }}>{d.name}</span>
            </span>
          </td>
          <td><Person user={userOf(d.ownerId)} size={18} /></td>
          <td>{plazo(d)}</td>
          {realCell(d)}
          {desvioCell(d)}
          <td>{planSelect(d.status, (s) => workActions.updateDeliverable(d.id, { status: s }))}</td>
          {progressCell(taskProgress(ts), false)}
          <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
            {perms.canManage && <button className="btn btn-ghost btn-sm" title="Nueva tarea en este entregable" onClick={() => setTaskModal({ projectId, deliverableId: d.id, milestoneId: d.milestoneId })}><Icon name="plus" size={13} /> Tarea</button>}
          </td>
        </tr>
        {open.has(k) && taskRows(ts, indent + 1)}
      </React.Fragment>
    );
  };

  const nothing = milestones.length === 0 && orphanDeliverables.length === 0;

  return (
    <>
      <div className="pw-toolbar">
        <div className="tabs">
          {PLAN_VIEWS.map((v) => <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>)}
        </div>
        <span className="page-sub" style={{ margin: 0 }}>
          {milestones.length} hito{milestones.length !== 1 ? "s" : ""} · {deliverables.length} entregable{deliverables.length !== 1 ? "s" : ""} · cada tarea cuelga de un hito y el avance sale de las tareas
        </span>
        <span className="grow" />
        {view === "tabla" && expandable.length > 0 && (
          <button className="btn btn-secondary" onClick={() => setOpen(allOpen ? new Set() : new Set(expandable))}>
            <Icon name="chevron-right" size={13} style={{ transform: allOpen ? "rotate(90deg)" : undefined }} /> {allOpen ? "Contraer todo" : "Expandir todo"}
          </button>
        )}
        {perms.canManage && (
          <>
            <button className="btn btn-secondary" onClick={() => setDelModal({ d: null })}><Icon name="plus" size={15} /> Entregable</button>
            <button className="btn btn-primary" onClick={() => setMsModal("new")}><Icon name="plus" size={15} /> Hito</button>
          </>
        )}
      </div>

      {nothing && <div className="card card-pad"><Empty icon="calendar-days" text="Todavía no hay hitos ni entregables" sub="Empezá por el primer hito del proyecto." /></div>}

      {view === "gantt" && !nothing && (
        <PlanGantt milestones={milestones} deliverables={deliverables} tasks={tasks} onOpenMs={(m) => setMsModal(m)} onOpenDel={(d) => setDelModal({ d })} canEdit={perms.canManage} />
      )}

      {view === "tabla" && !nothing && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table pw-plan-table">
            <thead>
              <tr><th>Hito / entregable / tarea</th><th>Responsable</th><th>Plan</th><th>Real / previsto</th><th>Desvío</th><th>Estado</th><th>Avance</th><th /></tr>
            </thead>
            <tbody>
              {milestones.map((m) => {
                const ds = deliverables.filter((d) => d.milestoneId === m.id).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
                const ts = tasks.filter((t) => t.milestoneId === m.id);
                const direct = ts.filter((t) => !t.deliverableId);
                const late = isPlanOverdue(m);
                const archived = ts.filter((t) => t.archived).length;
                const k = "m:" + m.id;
                return (
                  <React.Fragment key={m.id}>
                    <tr className="pw-tr-ms" style={{ cursor: "pointer" }} onClick={() => setMsModal(m)}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {chev(k, ds.length + direct.length > 0)}
                          <span className="pw-ms-diamond" style={{ background: m.status === "cumplido" ? "var(--success)" : late ? "var(--danger)" : "var(--accent)" }} />
                          <span>{m.name}</span>
                          {m.isGate && <span className="pw-pill">Puerta de decisión</span>}
                          {late && <span className="pw-pill late"><Icon name="alert" size={11} /> Atrasado</span>}
                          {archived > 0 && <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-3)" }}>· {archived} archivada{archived > 1 ? "s" : ""}</span>}
                        </span>
                      </td>
                      <td><Person user={userOf(m.ownerId)} size={18} /></td>
                      <td>{plazo(m)}</td>
                      {realCell(m)}
                      {desvioCell(m)}
                      <td>{planSelect(m.status, (s) => workActions.updateMilestone(m.id, { status: s }))}</td>
                      {progressCell(taskProgress(ts), true)}
                      <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                        {perms.canManage && (
                          <>
                            <button className="btn btn-ghost btn-sm" title="Nueva tarea en este hito" onClick={() => setTaskModal({ projectId, milestoneId: m.id })}><Icon name="plus" size={13} /> Tarea</button>
                            <button className="btn btn-ghost btn-sm" title="Nuevo entregable en este hito" onClick={() => setDelModal({ d: null, milestoneId: m.id })}><Icon name="plus" size={13} /> Entregable</button>
                          </>
                        )}
                      </td>
                    </tr>
                    {open.has(k) && (
                      <>
                        {ds.map((d) => deliverableRows(d, 1))}
                        {taskRows(direct, 1)}
                      </>
                    )}
                  </React.Fragment>
                );
              })}

              {orphanDeliverables.length > 0 && (
                <>
                  <tr className="pw-tr-ms" style={{ cursor: "pointer" }} onClick={() => toggle("od")}>
                    <td colSpan={8}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{chev("od", true)}<span style={{ color: "var(--text-2)" }}>Entregables sin hito</span></span></td>
                  </tr>
                  {open.has("od") && orphanDeliverables.map((d) => deliverableRows(d, 1))}
                </>
              )}

              {looseTasks.length > 0 && (
                <>
                  <tr className="pw-tr-ms" style={{ cursor: "pointer" }} onClick={() => toggle("lt")}>
                    <td colSpan={8}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{chev("lt", true)}<span style={{ color: "var(--danger)" }}>Tareas sin hito</span><span style={{ fontWeight: 500, fontSize: 12, color: "var(--text-3)" }}>toda tarea tiene que estar asignada a un hito: abrila y elegí uno</span></span></td>
                  </tr>
                  {open.has("lt") && taskRows(looseTasks, 1)}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {taskMenu.element}
      {msModal && <MilestoneModal projectId={projectId} milestone={msModal === "new" ? null : msModal} onClose={() => setMsModal(null)} />}
      {delModal && <DeliverableModal projectId={projectId} deliverable={delModal.d} defaultMilestoneId={delModal.milestoneId} onClose={() => setDelModal(null)} />}
      {taskModal && (
        <TaskModal
          key={taskModal.id ?? "new"}
          draft={taskModal}
          access={taskModal.id ? perms.taskAccess(taskModal as Task) : "full"}
          canDelete={perms.canManage}
          onClose={() => setTaskModal(null)}
        />
      )}
    </>
  );
}
