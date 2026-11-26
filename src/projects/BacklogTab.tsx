import React, { useState } from "react";
import { Avatar, Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, today } from "../utils";
import { activeSprint, backlogOf, burndown, hoursOf, isDone, sprintCapacity, sprintTasks, sumHours, velocity, type Burndown } from "./agile";
import { useEnv } from "./env";
import type { Perms } from "./logic";
import { TaskModal, type TaskDraft } from "./Modals";
import { Bar, DuePill, OptDate, Person } from "./parts";
import type { Sprint, Task } from "./types";
import { useWork, workActions } from "./workStore";

const KIND_LABEL: Record<Task["kind"], string> = { tarea: "Tarea", historia: "Historia", bug: "Bug", spike: "Spike", cambio: "Cambio", correccion: "Corrección" };
const SUMMARY: React.CSSProperties = { cursor: "pointer", fontSize: 12.5, color: "var(--text-2)", fontWeight: 600, marginTop: 10 };

export function KindTag({ kind }: { kind: Task["kind"] }) {
  return (
    <span
      className="pw-tag ghost"
      style={
        kind === "correccion"
          ? { background: "var(--accent-soft)", color: "var(--accent)" }
          : kind === "cambio"
          ? { background: "var(--warning-soft)", color: "var(--warning)" }
          : kind === "bug"
          ? { background: "var(--danger-soft)", color: "var(--danger)" }
          : kind === "spike"
          ? { background: "var(--success-soft)", color: "var(--success)" }
          : undefined
      }
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

/**
 * Backlog y sprints: el backlog es lo que no está en ningún sprint, ordenado
 * por prioridad. Un sprint compromete horas contra la capacidad real del
 * equipo (jornada, días del sprint y ausencias aprobadas).
 */
export function BacklogTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const project = env.projects.find((p) => p.id === projectId)!;
  const meta = work.meta[projectId];
  const [weeks, setWeeks] = useState<1 | 2>(meta?.sprintWeeks ?? 2);
  const [sel, setSel] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [modal, setModal] = useState<TaskDraft | null>(null);
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [quick, setQuick] = useState("");
  const isCorrectionsMode = meta?.mode === "plan_correcciones";
  const [kindFilter, setKindFilter] = useState<"todas" | "correcciones">(
    isCorrectionsMode ? "correcciones" : "todas"
  );
  const projectDeliverables = work.deliverables.filter((d) => d.projectId === projectId);
  const [quickDelId, setQuickDelId] = useState<string>("");

  const tasks = work.tasks.filter((t) => t.projectId === projectId);
  const sprints = work.sprints.filter((s) => s.projectId === projectId).sort((a, b) => a.number - b.number);
  const open = sprints.filter((s) => s.status !== "cerrado");
  const active = activeSprint(sprints);
  const current = open.find((s) => s.id === sel) ?? active ?? open[0] ?? null;
  const backlog = backlogOf(tasks);
  const vel = velocity(sprints, tasks);

  function addQuick() {
    const name = quick.trim();
    if (!name) return;
    const kind = isCorrectionsMode ? "correccion" : "historia";
    const delId = isCorrectionsMode ? (quickDelId || projectDeliverables[0]?.id || null) : null;
    workActions.addTask({
      projectId,
      name,
      description: "",
      assigneeId: null,
      status: "pendiente",
      priority: "media",
      startDate: null,
      dueDate: null,
      milestoneId: null,
      deliverableId: delId,
      createdBy: env.me.id,
      kind,
    });
    setQuick("");
  }

  const filteredBacklog = kindFilter === "correcciones" ? backlog.filter((t) => t.kind === "correccion") : backlog;

  const renderDeliverablePill = (t: Task) => {
    if (t.kind !== "correccion" || !t.deliverableId) return null;
    const del = projectDeliverables.find((d) => d.id === t.deliverableId);
    const rev = t.reviewId ? (work.reviews ?? []).find((r) => r.id === t.reviewId) : null;
    if (!del) return null;
    return (
      <span
        className="pw-pill"
        style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", whiteSpace: "nowrap" }}
        title={rev?.note || undefined}
      >
        {del.name}{rev ? ` · Ronda ${rev.round}` : ""}
      </span>
    );
  };

  return (
    <>
      <div className="pw-toolbar">
        <span className="pw-pill" title="Horas completadas por sprint (promedio de los últimos 3) y sprints que faltan para vaciar el backlog a ese ritmo">
          <Icon name="zap" size={11} /> {vel.closed.length ? `Velocidad: ${vel.avg ?? "—"} h/sprint · faltan ~${vel.sprintsLeft ?? "—"} sprints` : "Sin sprints cerrados todavía"}
        </span>
        <span className="grow" />
        {perms.canManage && (
          <>
            <select className="select" value={weeks} onChange={(e) => setWeeks(Number(e.target.value) as 1 | 2)} title="Duración del sprint nuevo">
              <option value={1}>1 semana</option>
              <option value={2}>2 semanas</option>
            </select>
            <button className="btn btn-primary" onClick={() => { const s = workActions.addSprint(projectId, weeks); setSel(s.id); toast(`${s.name} creado.`); }}>
              <Icon name="plus" size={15} /> Nuevo sprint
            </button>
          </>
        )}
      </div>

      <div className="pw-plan-grid">
          {/* ---------------- Backlog ---------------- */}
          <div className="card">
            <div className="pw-group-head" style={{ gap: 10, flexWrap: "wrap" }}>
              <span>{isCorrectionsMode ? "Correcciones y sprints" : "Backlog"}</span>
              <span className="count">{filteredBacklog.length} ítems · {sumHours(filteredBacklog)} h</span>
              <div className="tabs" style={{ fontSize: 11.5, margin: 0, padding: 0 }}>
                <button className={kindFilter === "todas" ? "active" : ""} onClick={() => setKindFilter("todas")}>Todas</button>
                <button className={kindFilter === "correcciones" ? "active" : ""} onClick={() => setKindFilter("correcciones")}>Correcciones</button>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 500, color: "var(--text-3)" }}>Arrastrá para priorizar o para llevarlo a un sprint</span>
            </div>
            {perms.canManage && (
              <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderTop: "1px solid var(--border)", alignItems: "center" }}>
                {isCorrectionsMode && projectDeliverables.length > 0 && (
                  <select
                    className="select"
                    style={{ width: "auto", maxWidth: 170, fontSize: 12.5 }}
                    value={quickDelId || projectDeliverables[0]?.id || ""}
                    onChange={(e) => setQuickDelId(e.target.value)}
                    title="Entregable de la corrección"
                  >
                    {projectDeliverables.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  className="input"
                  placeholder={isCorrectionsMode ? "Agregar corrección… (Enter)" : "Agregar al backlog… (Enter)"}
                  value={quick}
                  onChange={(e) => setQuick(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addQuick()}
                />
                <button className="btn btn-secondary" disabled={!quick.trim()} onClick={addQuick}><Icon name="plus" size={14} /></button>
              </div>
            )}
            {filteredBacklog.length === 0 && (
              <div className="card-pad">
                <Empty
                  icon="clipboard"
                  text={kindFilter === "correcciones" ? "Sin correcciones en el backlog" : "Backlog vacío"}
                  sub={kindFilter === "correcciones" ? "No hay correcciones pendientes fuera de los sprints." : "Todo está en algún sprint o terminado."}
                />
              </div>
            )}
            {filteredBacklog.map((t) => (
              <div
                key={t.id}
                className={`pw-bl-row ${dragId === t.id ? "dragging" : ""}`}
                draggable={perms.canManage}
                onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => { if (dragId && perms.canManage) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== t.id) workActions.moveInBacklog(projectId, dragId, t.id); setDragId(null); }}
                onClick={() => setModal(t)}
              >
                {perms.canManage && <span className="pw-grip" title="Arrastrar"><Icon name="menu" size={13} /></span>}
                <KindTag kind={t.kind} />
                {renderDeliverablePill(t)}
                <span className="name">{t.name}</span>
                {perms.canManage ? (
                  <input
                    className="input pw-hours" type="number" min={0} step={0.5} placeholder="h" title="Horas estimadas" value={t.estimateHours ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => workActions.updateTask(t.id, { estimateHours: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                  />
                ) : (
                  <span className="pw-pill">{t.estimateHours != null ? `${t.estimateHours} h` : "sin estimar"}</span>
                )}
                <Person user={env.users.find((u) => u.id === t.assigneeId)} size={18} />
                {perms.canManage && open.length > 0 && (
                  <select
                    className="select pw-mini-select" value="" onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { if (e.target.value) { workActions.assignToSprint(t.id, e.target.value); toast("Ítem llevado al sprint."); } }}
                  >
                    <option value="">→ Sprint</option>
                    {open.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "activo" ? " (activo)" : ""}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* ---------------- Sprint ---------------- */}
          <div>
            {open.length === 0 ? (
              <div className="card card-pad"><Empty icon="calendar-days" text="No hay sprints abiertos" sub={perms.canManage ? "Creá uno con “Nuevo sprint”." : "Todavía no se planificó ningún sprint."} /></div>
            ) : (
              <>
                <div className="tabs" style={{ marginBottom: 10 }}>
                  {open.map((s) => <button key={s.id} className={current?.id === s.id ? "active" : ""} onClick={() => setSel(s.id)}>{s.name}{s.status === "activo" ? " ●" : ""}</button>)}
                </div>
                {current && (
                  <SprintPanel
                    key={current.id} sprint={current} projectId={projectId} perms={perms} dragId={dragId} hasActive={!!active && active.id !== current.id}
                    onOpenTask={(t) => setModal(t)} onClose={() => setClosing(current)}
                  />
                )}
              </>
            )}
          </div>
      </div>

      {modal && (
        <TaskModal
          key={modal.id ?? "new" + (modal.sprintId ?? "")} draft={modal} access={modal.id ? perms.taskAccess(modal as Task) : "full"}
          canDelete={perms.canManage} onClose={() => setModal(null)}
        />
      )}
      {closing && <CloseSprintModal sprint={closing} projectId={projectId} onClose={() => setClosing(null)} />}
      {project.status === "completado" && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10 }}>El proyecto está finalizado.</div>}
    </>
  );
}

/* ====================================================================
 * Panel de un sprint: capacidad vs compromiso
 * ==================================================================== */
function SprintPanel({
  sprint, projectId, perms, dragId, hasActive, onOpenTask, onClose,
}: { sprint: Sprint; projectId: string; perms: Perms; dragId: string | null; hasActive: boolean; onOpenTask: (t: Task) => void; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const project = env.projects.find((p) => p.id === projectId)!;
  const tasks = sprintTasks(work.tasks.filter((t) => t.projectId === projectId), sprint.id);
  const cap = sprintCapacity(env, project, sprint, tasks);
  const planned = sprint.status === "planificado";
  const over = cap.pct > 100;
  const [over2, setOver2] = useState(false);

  function start() {
    if (hasActive) return toast("Ya hay un sprint en marcha: cerralo antes de iniciar otro.");
    if (over && !over2) { setOver2(true); return; }
    workActions.startSprint(sprint.id, cap.total);
    toast(`${sprint.name} iniciado con ${cap.committed} h comprometidas.`);
  }

  return (
    <div
      className="card"
      onDragOver={(e) => { if (dragId && perms.canManage && sprint.status !== "cerrado") e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (dragId && perms.canManage) { workActions.assignToSprint(dragId, sprint.id); toast(sprint.status === "activo" ? "Entró al sprint en marcha: queda registrado como alcance agregado." : "Ítem llevado al sprint."); } }}
    >
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15 }}>{sprint.name}</strong>
          <span className={`pw-pill ${sprint.status === "activo" ? "ok" : ""}`}>{sprint.status}</span>
          <span style={{ flex: 1 }} />
          {perms.canManage && planned && <button className="btn btn-primary btn-sm" onClick={start}>Iniciar sprint</button>}
          {perms.canManage && sprint.status === "activo" && <button className="btn btn-secondary btn-sm" onClick={onClose}>Cerrar sprint</button>}
          {perms.canManage && planned && <button className="btn btn-ghost btn-sm" title="Eliminar sprint" onClick={() => { workActions.deleteSprint(sprint.id); toast("Sprint eliminado; sus ítems volvieron al backlog."); }}><Icon name="trash" size={13} /></button>}
        </div>
        {over2 && over && (
          <div className="pw-demo-banner" style={{ marginTop: 8 }}>
            Estás comprometiendo {cap.committed} h contra una capacidad de {cap.total} h. ¿Iniciar igual?
            <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { workActions.startSprint(sprint.id, cap.total); setOver2(false); }}>Sí, iniciar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOver2(false)}>Revisar</button>
          </div>
        )}
        <div className="field" style={{ marginTop: 10 }}>
          <label>Objetivo del sprint</label>
          <input className="input" disabled={!perms.canManage} value={sprint.goal} onChange={(e) => workActions.updateSprint(sprint.id, { goal: e.target.value })} placeholder="¿Qué queremos lograr?" />
        </div>

        <div className="pw-mini-label" style={{ marginTop: 12 }}>Compromiso vs. capacidad</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <b style={{ fontSize: 18, color: over ? "var(--danger)" : undefined }}>{cap.committed} h</b>
          <span style={{ color: "var(--text-3)" }}>de {cap.total} h de capacidad ({cap.pct}%)</span>
          {over && <span className="pw-pill late"><Icon name="alert" size={11} /> sobrecomprometido</span>}
        </div>
        <Bar pct={Math.min(100, cap.pct)} color={over ? "var(--danger)" : cap.pct > 85 ? "var(--warning)" : "var(--accent)"} />
        {(cap.unestimated > 0 || cap.unassigned > 0) && (
          <div style={{ fontSize: 12, color: "var(--warning)", marginTop: 6 }}>
            {cap.unestimated > 0 && <>{cap.unestimated} ítem{cap.unestimated > 1 ? "s" : ""} sin estimar. </>}
            {cap.unassigned > 0 && <>{cap.unassigned} sin responsable.</>}
          </div>
        )}

        {sprint.status === "activo" && (
          <details>
            <summary style={SUMMARY}>Ver burndown</summary>
            <div style={{ marginTop: 8 }}><BurndownChart bd={burndown(sprint, tasks)} sprint={sprint} /></div>
          </details>
        )}

        <details>
          <summary style={SUMMARY}>Ajustes y capacidad por persona</summary>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div className="field"><label>Inicio</label>{planned && perms.canManage ? <OptDate value={sprint.startDate} onChange={(v) => v && workActions.updateSprint(sprint.id, { startDate: v })} /> : <div className="input" style={{ opacity: 0.7 }}>{fmtDate(sprint.startDate)}</div>}</div>
          <div className="field"><label>Fin</label>{planned && perms.canManage ? <OptDate value={sprint.endDate} onChange={(v) => v && workActions.updateSprint(sprint.id, { endDate: v })} /> : <div className="input" style={{ opacity: 0.7 }}>{fmtDate(sprint.endDate)}</div>}</div>
          <div className="field">
            <label>Foco del equipo en este proyecto: {sprint.focusPct}%</label>
            <input type="range" min={30} max={100} step={5} disabled={!perms.canManage || sprint.status === "cerrado"} value={sprint.focusPct} onChange={(e) => workActions.updateSprint(sprint.id, { focusPct: Number(e.target.value) })} />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          {cap.people.map((p) => (
            <div key={p.user.id} className="pw-load" style={{ gridTemplateColumns: "140px 1fr 110px" }}>
              <div className="pw-load-name"><Person user={p.user} size={18} /></div>
              <div className="pw-load-track"><div className="pw-load-fill" style={{ width: `${Math.min(100, p.pct)}%`, background: p.pct > 100 ? "var(--danger)" : p.pct > 85 ? "var(--warning)" : "var(--accent)" }} /></div>
              <div className="pw-load-n" style={{ color: p.pct > 100 ? "var(--danger)" : undefined }}>{p.assigned} / {p.hours} h</div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Capacidad = días laborales del sprint × jornada × foco, descontando ausencias aprobadas.</div>
        </div>
        </details>
      </div>

      <div className="pw-group-head" style={{ borderTop: "1px solid var(--border)" }}>Ítems del sprint <span className="count">{tasks.length}</span></div>
      {tasks.length === 0 && <div className="card-pad" style={{ color: "var(--text-3)", fontSize: 13 }}>Arrastrá ítems del backlog hasta acá o usá “→ Sprint”.</div>}
      {tasks.map((t) => (
        <div key={t.id} className={`pw-task-row ${isDone(t) ? "done" : ""}`} onClick={() => onOpenTask(t)}>
          <KindTag kind={t.kind} />
          {(() => {
            if (t.kind !== "correccion" || !t.deliverableId) return null;
            const del = work.deliverables.find((d) => d.id === t.deliverableId);
            const rev = t.reviewId ? (work.reviews ?? []).find((r) => r.id === t.reviewId) : null;
            if (!del) return null;
            return (
              <span
                className="pw-pill"
                style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", whiteSpace: "nowrap" }}
                title={rev?.note || undefined}
              >
                {del.name}{rev ? ` · Ronda ${rev.round}` : ""}
              </span>
            );
          })()}
          <span className="name">{t.name}</span>
          {t.sprintAddedAt && t.sprintAddedAt > sprint.startDate && <span className="pw-pill soon" title={`Entró al sprint el ${fmtDate(t.sprintAddedAt)}`}>+ agregado</span>}
          <span className="pw-pill">{t.estimateHours != null ? `${t.estimateHours} h` : "sin estimar"}</span>
          <Person user={env.users.find((u) => u.id === t.assigneeId)} size={18} />
          <DuePill date={t.dueDate} done={isDone(t)} />
          {perms.canManage && sprint.status !== "cerrado" && (
            <button className="btn btn-ghost btn-sm" title="Devolver al backlog" onClick={(e) => { e.stopPropagation(); workActions.assignToSprint(t.id, null); }}><Icon name="arrow-left" size={12} /></button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ====================================================================
 * Burndown (SVG): ideal vs real; el alcance agregado sube la curva
 * ==================================================================== */
export function BurndownChart({ bd, sprint }: { bd: Burndown; sprint: Sprint }) {
  const W = 640, H = 230, L = 42, R = 14, T = 14, B = 30;
  const n = bd.points.length - 1;
  const maxY = Math.max(1, ...bd.points.map((p) => Math.max(p.ideal, p.actual ?? 0)));
  const x = (i: number) => L + (i / Math.max(1, n)) * (W - L - R);
  const y = (v: number) => T + (1 - v / maxY) * (H - T - B);
  const ideal = bd.points.map((p, i) => `${x(i)},${y(p.ideal)}`).join(" ");
  const actualPts = bd.points.map((p, i) => (p.actual === null ? null : `${x(i)},${y(p.actual)}`)).filter(Boolean).join(" ");
  const todayIdx = bd.points.findIndex((p) => p.date === today());
  const behind = bd.remainingNow - bd.idealNow;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div className="card-title" style={{ margin: 0 }}>Burndown de {sprint.name}</div>
        <span className="pw-pill">{bd.startScope} h al inicio</span>
        {bd.addedHours > 0 && <span className="pw-pill soon">+{bd.addedHours} h de alcance agregado</span>}
        <span className={`pw-pill ${behind > 8 ? "late" : "ok"}`}>quedan {bd.remainingNow} h · ideal {bd.idealNow} h</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: 260 }} role="img" aria-label="Burndown del sprint">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(maxY * f)} y2={y(maxY * f)} stroke="var(--border)" />
            <text x={L - 6} y={y(maxY * f) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{Math.round(maxY * f)}</text>
          </g>
        ))}
        {bd.points.map((p, i) => (i % Math.ceil((n + 1) / 8) === 0 ? <text key={p.date} x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--text-3)">{p.date.slice(8)}/{p.date.slice(5, 7)}</text> : null))}
        {todayIdx >= 0 && <line x1={x(todayIdx)} x2={x(todayIdx)} y1={T} y2={H - B} stroke="var(--accent)" strokeDasharray="3 3" />}
        <polyline points={ideal} fill="none" stroke="var(--text-3)" strokeWidth="2" strokeDasharray="6 5" />
        {actualPts && <polyline points={actualPts} fill="none" stroke={behind > 8 ? "var(--danger)" : "var(--accent)"} strokeWidth="2.5" />}
        {bd.points.map((p, i) => (p.actual === null ? null : <circle key={i} cx={x(i)} cy={y(p.actual)} r="3" fill={behind > 8 ? "var(--danger)" : "var(--accent)"} />))}
      </svg>
      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Línea punteada: ritmo ideal · línea llena: trabajo que queda (horas estimadas) · línea azul vertical: hoy. Si sube, entró alcance nuevo.</div>
    </>
  );
}

/* ====================================================================
 * Cierre del sprint
 * ==================================================================== */
function CloseSprintModal({ sprint, projectId, onClose }: { sprint: Sprint; projectId: string; onClose: () => void }) {
  const work = useWork();
  const toast = useToast();
  const tasks = sprintTasks(work.tasks.filter((t) => t.projectId === projectId), sprint.id);
  const done = tasks.filter(isDone);
  const left = tasks.filter((t) => !isDone(t));
  const next = work.sprints.filter((s) => s.projectId === projectId && s.status === "planificado").sort((a, b) => a.number - b.number)[0];
  const [moveTo, setMoveTo] = useState<string>("backlog");
  const [review, setReview] = useState(sprint.reviewNotes);
  const [retro, setRetro] = useState(sprint.retroNotes);

  return (
    <Modal
      title={`Cerrar ${sprint.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { workActions.closeSprint(sprint.id, { moveTo: moveTo === "backlog" ? null : moveTo, reviewNotes: review, retroNotes: retro }); toast(`${sprint.name} cerrado. Velocidad: ${sumHours(done)} h.`); onClose(); }}>Cerrar sprint</button>
        </>
      }
    >
      <div className="kpi-grid" style={{ marginBottom: 0 }}>
        <div className="card kpi"><span className="label">Completado</span><div className="value">{sumHours(done)} h</div><div className="hint">{done.length} ítems</div></div>
        <div className="card kpi"><span className="label">Sin terminar</span><div className="value" style={{ color: left.length ? "var(--warning)" : undefined }}>{sumHours(left)} h</div><div className="hint">{left.length} ítems</div></div>
      </div>
      {left.length > 0 && (
        <div className="field">
          <label>¿Qué hacemos con lo que no se terminó?</label>
          <select className="select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="backlog">Devolverlo al backlog (se vuelve a priorizar)</option>
            {next && <option value={next.id}>Pasarlo al {next.name}</option>}
          </select>
        </div>
      )}
      <div className="field"><label>Revisión con el cliente (qué se mostró y qué dijo)</label><textarea className="textarea" rows={3} value={review} onChange={(e) => setReview(e.target.value)} /></div>
      <div className="field"><label>Retrospectiva (qué mejorar)</label><textarea className="textarea" rows={3} value={retro} onChange={(e) => setRetro(e.target.value)} /></div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>Los pedidos nuevos del cliente que salgan de la revisión se cargan en la pestaña “Cambios del cliente”.</div>
    </Modal>
  );
}

export { hoursOf };
