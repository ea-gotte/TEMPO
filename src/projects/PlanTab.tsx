import React, { useState } from "react";
import { Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { PLAN_STATUS, statusInfo } from "./constants";
import { useEnv } from "./env";
import { isPlanOverdue, taskProgress, type Perms } from "./logic";
import { DeliverableModal, MilestoneModal, TaskModal, type TaskDraft } from "./Modals";
import { Bar, DuePill, Person } from "./parts";
import { PlanCalendar, PlanKanban } from "./PlanViews";
import type { Deliverable, Milestone, PlanStatus, Task } from "./types";
import { useWork, workActions } from "./workStore";

type PlanView = "lista" | "kanban" | "calendario";
const PLAN_VIEWS: { key: PlanView; label: string }[] = [
  { key: "lista", label: "Lista" },
  { key: "kanban", label: "Kanban" },
  { key: "calendario", label: "Calendario" },
];
const PLAN_VIEW_KEY = "tempo-proyectos-vista-plan";

function loadPlanView(): PlanView {
  try {
    const v = localStorage.getItem(PLAN_VIEW_KEY) as PlanView | null;
    if (v && PLAN_VIEWS.some((x) => x.key === v)) return v;
  } catch { /* sin preferencia guardada */ }
  return "lista";
}

/**
 * Hitos y entregables: el esqueleto de planificación del proyecto y donde se
 * sigue la programación (lista, Kanban y calendario). Cada hito agrupa entregables
 * y tareas; el avance sale de las tareas (no se carga a mano).
 */
export function PlanTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const [view, setViewState] = useState<PlanView>(loadPlanView);
  function setView(v: PlanView) {
    setViewState(v);
    try { localStorage.setItem(PLAN_VIEW_KEY, v); } catch { /* ignorar */ }
  }
  const [msModal, setMsModal] = useState<Milestone | "new" | null>(null);
  const [delModal, setDelModal] = useState<{ d: Deliverable | null; milestoneId?: string | null } | null>(null);
  const [taskModal, setTaskModal] = useState<TaskDraft | null>(null);

  const milestones = work.milestones.filter((m) => m.projectId === projectId).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const deliverables = work.deliverables.filter((d) => d.projectId === projectId);
  const tasks = work.tasks.filter((t) => t.projectId === projectId);
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);

  const planSelect = (value: PlanStatus, onChange: (s: PlanStatus) => void) =>
    perms.canManage ? (
      <select className="select" style={{ width: "auto", padding: "3px 8px", fontSize: 12.5 }} value={value} onChange={(e) => onChange(e.target.value as PlanStatus)}>
        {PLAN_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    ) : (
      <span className="pw-pill">{PLAN_STATUS.find((s) => s.key === value)?.label}</span>
    );

  function MiniTasks({ list }: { list: Task[] }) {
    const archived = list.filter((t) => t.archived).length;
    return (
      <>
        {list.filter((t) => !t.archived).map((t) => (
          <div key={t.id} className="pw-mini-task" onClick={() => setTaskModal(t)}>
            <span className="pw-dotc" style={{ background: statusInfo(t.status).color }} />
            <span className="n" style={{ textDecoration: t.status === "hecha" ? "line-through" : undefined, color: t.status === "hecha" ? "var(--text-3)" : undefined }}>{t.name}</span>
            <Person user={userOf(t.assigneeId)} size={16} />
            <DuePill date={t.dueDate} done={t.status === "hecha"} />
          </div>
        ))}
        {archived > 0 && <div style={{ fontSize: 11.5, color: "var(--text-3)", padding: "2px 0 0 18px" }}><Icon name="archive" size={11} /> {archived} tarea{archived > 1 ? "s" : ""} archivada{archived > 1 ? "s" : ""} (siguen contando en el avance)</div>}
      </>
    );
  }

  function DeliverableBlock({ d }: { d: Deliverable }) {
    const ts = tasks.filter((t) => t.deliverableId === d.id);
    const pr = taskProgress(ts);
    return (
      <div className="pw-del">
        <div className="pw-del-head">
          <span style={{ color: "var(--text-3)" }}>▣</span>
          <span className="name">{d.name}</span>
          <Person user={userOf(d.ownerId)} size={18} />
          <DuePill date={d.dueDate} done={d.status === "cumplido"} />
          {planSelect(d.status, (s) => workActions.updateDeliverable(d.id, { status: s }))}
          <div style={{ width: 90 }} title={`${pr.done} de ${pr.total} tareas hechas`}><Bar pct={pr.pct} /></div>
          <span style={{ fontSize: 11.5, color: "var(--text-3)", width: 54 }}>{pr.done}/{pr.total} tareas</span>
          {perms.canManage && (
            <>
              <button className="btn btn-ghost btn-sm" title="Nueva tarea en este entregable" onClick={() => setTaskModal({ projectId, deliverableId: d.id, milestoneId: d.milestoneId })}><Icon name="plus" size={13} /></button>
              <button className="btn btn-ghost btn-sm" title="Editar entregable" onClick={() => setDelModal({ d })}><Icon name="pencil" size={13} /></button>
            </>
          )}
        </div>
        <MiniTasks list={ts} />
      </div>
    );
  }

  const orphanDeliverables = deliverables.filter((d) => !d.milestoneId || !milestones.some((m) => m.id === d.milestoneId));
  const looseTasks = tasks.filter((t) => !t.milestoneId && !t.deliverableId);
  const viewProps = {
    milestones, deliverables, tasks, perms,
    onOpenMs: (m: Milestone) => setMsModal(m),
    onOpenDel: (d: Deliverable) => setDelModal({ d }),
  };

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
        {perms.canManage && (
          <>
            <button className="btn btn-secondary" onClick={() => setDelModal({ d: null })}><Icon name="plus" size={15} /> Entregable</button>
            <button className="btn btn-primary" onClick={() => setMsModal("new")}><Icon name="plus" size={15} /> Hito</button>
          </>
        )}
      </div>

      {view === "kanban" && <PlanKanban {...viewProps} />}
      {view === "calendario" && <PlanCalendar {...viewProps} />}

      {view === "lista" && (<>
      {milestones.length === 0 && orphanDeliverables.length === 0 && (
        <div className="card card-pad"><Empty icon="calendar-days" text="Todavía no hay hitos ni entregables" sub="Empezá por el primer hito del proyecto." /></div>
      )}

      {milestones.map((m) => {
        const ds = deliverables.filter((d) => d.milestoneId === m.id);
        const ts = tasks.filter((t) => t.milestoneId === m.id);
        const direct = ts.filter((t) => !t.deliverableId);
        const pr = taskProgress(ts);
        const late = isPlanOverdue(m);
        return (
          <div key={m.id} className="card pw-ms" style={late ? { borderColor: "var(--danger)" } : undefined}>
            <div className="pw-ms-head">
              <span className="pw-ms-diamond" style={{ background: m.status === "cumplido" ? "var(--success)" : late ? "var(--danger)" : "var(--accent)" }} />
              <span className="name">{m.name}</span>
              {late && <span className="pw-pill late"><Icon name="alert" size={11} /> Atrasado</span>}
              <span style={{ flex: 1 }} />
              <Person user={userOf(m.ownerId)} size={18} />
              <DuePill date={m.dueDate} done={m.status === "cumplido"} />
              {planSelect(m.status, (s) => workActions.updateMilestone(m.id, { status: s }))}
              <div style={{ width: 110 }}><Bar pct={pr.pct} /></div>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 650, width: 36 }}>{pr.pct}%</span>
              {perms.canManage && (
                <>
                  <button className="btn btn-ghost btn-sm" title="Nueva tarea en este hito" onClick={() => setTaskModal({ projectId, milestoneId: m.id })}><Icon name="plus" size={13} /> Tarea</button>
                  <button className="btn btn-ghost btn-sm" title="Nuevo entregable en este hito" onClick={() => setDelModal({ d: null, milestoneId: m.id })}><Icon name="plus" size={13} /> Entregable</button>
                  <button className="btn btn-ghost btn-sm" title="Editar hito" aria-label="Editar hito" onClick={() => setMsModal(m)}><Icon name="pencil" size={13} /></button>
                </>
              )}
            </div>
            {m.description && <div style={{ padding: "0 16px 10px 37px", color: "var(--text-2)", fontSize: 12.5 }}>{m.description}</div>}
            {ds.map((d) => <DeliverableBlock key={d.id} d={d} />)}
            {direct.length > 0 && (
              <div className="pw-del">
                <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-3)", marginBottom: 2 }}>Tareas del hito (sin entregable)</div>
                <MiniTasks list={direct} />
              </div>
            )}
            {ds.length === 0 && direct.length === 0 && <div className="pw-del" style={{ color: "var(--text-3)", fontSize: 12.5 }}>Sin entregables ni tareas todavía.</div>}
          </div>
        );
      })}

      {orphanDeliverables.length > 0 && (
        <div className="card pw-ms">
          <div className="pw-ms-head"><span className="name" style={{ color: "var(--text-2)" }}>Entregables sin hito</span></div>
          {orphanDeliverables.map((d) => <DeliverableBlock key={d.id} d={d} />)}
        </div>
      )}

      {looseTasks.length > 0 && (
        <div className="card pw-ms">
          <div className="pw-ms-head"><span className="name" style={{ color: "var(--danger)" }}>Tareas sin hito</span><span style={{ fontSize: 12, color: "var(--text-3)" }}>toda tarea tiene que estar asignada a un hito: abrila y elegí uno</span></div>
          <div className="pw-del"><MiniTasks list={looseTasks} /></div>
        </div>
      )}
      </>)}

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
