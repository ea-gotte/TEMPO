import React, { useMemo, useState } from "react";
import { Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { PLAN_STATUS, TASK_PRIORITY, TASK_STATUS } from "./constants";
import { useEnv } from "./env";
import { assignableUsers, defaultMilestone, type Access } from "./logic";
import { OptDate, UserSelect } from "./parts";
import { FieldInput } from "./FieldControls";
import { fieldsForProject } from "./fields";
import type { Confidence, Deliverable, FieldValue, Milestone, PlanStatus, ProjectMeta, ProjectMode, Task, TaskKind, TaskPriority, TaskStatus } from "./types";
import { fmtDate, safeHttpUrl, today } from "../utils";
import { useWork, workActions } from "./workStore";

/* ================= Tarea ================= */

export type TaskDraft = Partial<Task> & { projectId: string };

/**
 * Alta y edición de una tarea. Lo imprescindible va a la vista (nombre, hito,
 * responsable y horas); el resto queda plegado en “Más opciones” para que cargar
 * una tarea no sea agobiante. La tarea no tiene fechas propias: la programación
 * se sigue por su hito y su entregable.
 */
export function TaskModal({
  draft, access, canDelete, onClose,
}: {
  /** Tarea existente (con id) o borrador para una nueva */
  draft: TaskDraft;
  access: Access;
  canDelete: boolean;
  onClose: () => void;
}) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const isNew = !draft.id;
  const readOnly = access === "none"; // sin permiso: solo mira
  const limited = access === "status" || readOnly; // "status": solo puede cambiar el estado de su propia tarea
  const project = env.projects.find((p) => p.id === draft.projectId);
  const { team, others } = assignableUsers(env, project, work.assignments);
  const stored = draft.id ? work.tasks.find((t) => t.id === draft.id) : undefined;

  const milestones = work.milestones.filter((m) => m.projectId === draft.projectId).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const deliverables = work.deliverables.filter((d) => d.projectId === draft.projectId);

  const [name, setName] = useState(draft.name ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [assigneeId, setAssigneeId] = useState<string | null>(draft.assigneeId ?? null);
  const [status, setStatus] = useState<TaskStatus>(draft.status ?? "pendiente");
  const [priority, setPriority] = useState<TaskPriority>(draft.priority ?? "media");
  // Una tarea nueva arranca en el próximo hito sin cumplir; se puede cambiar
  const [milestoneId, setMilestoneId] = useState<string | null>(draft.milestoneId ?? (isNew && !draft.deliverableId ? defaultMilestone(work.milestones, draft.projectId)?.id ?? null : null));
  const [deliverableId, setDeliverableId] = useState<string | null>(draft.deliverableId ?? null);
  const [estimate, setEstimate] = useState<string>(draft.estimateHours != null ? String(draft.estimateHours) : "");
  const [kind, setKind] = useState<TaskKind>(draft.kind ?? "tarea");
  const [confidence, setConfidence] = useState<Confidence | "">(draft.confidence ?? "");
  const [estMin, setEstMin] = useState<string>(draft.estimateMin != null ? String(draft.estimateMin) : "");
  const [estMax, setEstMax] = useState<string>(draft.estimateMax != null ? String(draft.estimateMax) : "");
  const [sprintId, setSprintId] = useState<string | null>(draft.sprintId ?? null);
  const [custom, setCustom] = useState<Record<string, FieldValue>>(draft.custom ?? {});
  const [more, setMore] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");
  const defs = fieldsForProject(work.fields, draft.projectId);

  const sprintsOpen = work.sprints.filter((s) => s.projectId === draft.projectId && s.status !== "cerrado");
  const chosenDel = deliverables.find((d) => d.id === deliverableId);
  // Con entregable, el hito sale de él (única fuente de verdad); sin entregable se elige a mano.
  const effectiveMs = chosenDel ? chosenDel.milestoneId : milestoneId;
  const ms = milestones.find((m) => m.id === effectiveMs);
  const visibleDeliverables = useMemo(
    () => deliverables.filter((d) => !effectiveMs || d.milestoneId === effectiveMs || d.id === deliverableId),
    [deliverables, effectiveMs, deliverableId],
  );
  const planDate = chosenDel?.dueDate ?? ms?.dueDate ?? null;
  const hiddenCount = [description, ...defs.map((d) => custom[d.id])].filter((v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0) && v !== false).length;

  function changeMilestone(id: string | null) {
    setMilestoneId(id);
    // Si el entregable elegido no es de ese hito, se suelta
    if (deliverableId && deliverables.find((d) => d.id === deliverableId)?.milestoneId !== id) setDeliverableId(null);
  }

  function save() {
    if (!name.trim()) return setError("Poné un nombre para la tarea.");
    if (!limited && milestones.length === 0) return setError("Primero creá un hito en “Hitos y entregables”: toda tarea se asigna a un hito.");
    if (!limited && !effectiveMs) return setError("Elegí el hito al que pertenece la tarea.");
    const fields = {
      name: name.trim(), description: description.trim(), assigneeId, status, priority,
      milestoneId: chosenDel ? chosenDel.milestoneId : milestoneId, deliverableId,
      estimateHours: estimate.trim() === "" ? null : Math.max(0, Number(estimate)),
      estimateMin: estMin.trim() === "" ? null : Math.max(0, Number(estMin)),
      estimateMax: estMax.trim() === "" ? null : Math.max(0, Number(estMax)),
      kind, confidence: (confidence || null) as Confidence | null, sprintId,
      // Si entra a un sprint que ya está en marcha, queda registrado como alcance agregado
      sprintAddedAt: sprintId === (draft.sprintId ?? null) ? draft.sprintAddedAt ?? null : work.sprints.find((s) => s.id === sprintId)?.status === "activo" ? today() : null,
      custom,
    };
    if (isNew) {
      workActions.addTask({ projectId: draft.projectId, createdBy: env.me.id, startDate: null, dueDate: null, ...fields });
      toast("Tarea creada.");
    } else {
      workActions.updateTask(draft.id!, limited ? { status, custom } : fields);
      toast("Tarea actualizada.");
    }
    onClose();
  }

  return (
    <Modal
      title={isNew ? "Nueva tarea" : readOnly ? "Detalle de la tarea" : limited ? "Actualizar tarea" : "Editar tarea"}
      onClose={onClose}
      footer={
        <>
          {!isNew && canDelete && !limited && (
            <div style={{ marginRight: "auto", display: "flex", gap: 6 }}>
              {confirmDel ? (
                <button className="btn btn-danger" onClick={() => { workActions.deleteTask(draft.id!); toast("Tarea eliminada."); onClose(); }}>
                  Confirmar eliminación
                </button>
              ) : (
                <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirmDel(true)}>Eliminar</button>
              )}
              {stored?.archived ? (
                <button className="btn btn-ghost" onClick={() => { workActions.archiveTasks([draft.id!], false); toast("Tarea restaurada."); onClose(); }}>
                  <Icon name="archive" size={13} /> Restaurar
                </button>
              ) : stored?.status === "hecha" ? (
                <button className="btn btn-ghost" title="Se oculta del listado; sigue contando en el avance" onClick={() => { workActions.archiveTasks([draft.id!], true); toast("Tarea archivada."); onClose(); }}>
                  <Icon name="archive" size={13} /> Archivar
                </button>
              ) : null}
            </div>
          )}
          <button className="btn btn-secondary" onClick={onClose}>{readOnly ? "Cerrar" : "Cancelar"}</button>
          {!readOnly && <button className="btn btn-primary" onClick={save}>{isNew ? "Crear tarea" : "Guardar"}</button>}
        </>
      }
    >
      {readOnly && (
        <div className="pw-demo-banner" style={{ margin: 0 }}>Solo lectura: esta tarea no está asignada a vos y no gestionás el proyecto.</div>
      )}
      {access === "status" && (
        <div className="pw-demo-banner" style={{ margin: 0 }}>
          Esta tarea te está asignada: podés cambiar su estado. El resto lo edita quien gestiona el proyecto.
        </div>
      )}
      {stored?.archived && <div className="pw-demo-banner" style={{ margin: 0 }}>Esta tarea está archivada{stored.archivedAt ? ` desde el ${fmtDate(stored.archivedAt)}` : ""}. Sigue contando en el avance del proyecto.</div>}

      <div className="field">
        <label>Nombre</label>
        <input className="input" autoFocus value={name} disabled={limited} onChange={(e) => setName(e.target.value)} placeholder="¿Qué hay que hacer?" onKeyDown={(e) => { if (e.key === "Enter" && !limited) save(); }} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Hito {chosenDel && <span style={{ fontWeight: 500, color: "var(--text-3)" }}>(según el entregable)</span>}</label>
          <select className="select" value={effectiveMs ?? ""} disabled={limited || !!chosenDel} onChange={(e) => changeMilestone(e.target.value || null)}>
            <option value="">{milestones.length ? "Elegí un hito…" : "No hay hitos todavía"}</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Entregable <span style={{ fontWeight: 500, color: "var(--text-3)" }}>opcional</span></label>
          <select className="select" value={deliverableId ?? ""} disabled={limited} onChange={(e) => setDeliverableId(e.target.value || null)}>
            <option value="">Ninguno (solo el hito)</option>
            {visibleDeliverables.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Responsable</label>
          <UserSelect value={assigneeId} onChange={setAssigneeId} team={team} others={others} disabled={limited} />
        </div>
        <div className="field">
          <label>Horas estimadas</label>
          <input className="input" type="number" min={0} step={0.5} disabled={limited} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="Ej.: 16" />
        </div>
        {!isNew && (
          <div className="field">
            <label>Estado</label>
            <select className="select" value={status} disabled={readOnly} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {TASK_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
        La tarea no lleva fechas propias: vence con {chosenDel ? "su entregable" : "su hito"}{planDate ? <> (<b>{fmtDate(planDate)}</b>)</> : ""}.
      </div>

      <button type="button" className="pw-more-toggle" onClick={() => setMore((v) => !v)} aria-expanded={more}>
        <Icon name="chevron-right" size={13} style={{ transform: more ? "rotate(90deg)" : undefined, transition: "transform 0.12s" }} />
        Más opciones
        <span className="hint">descripción, prioridad, tipo, estimación en rango{defs.length ? ", campos personalizados" : ""}{!more && hiddenCount > 0 ? ` · ${hiddenCount} con datos` : ""}</span>
      </button>
      {more && (
        <div className="pw-more">
          <div className="field">
            <label>Descripción</label>
            <textarea className="textarea" rows={3} value={description} disabled={limited} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Prioridad</label>
              <select className="select" value={priority} disabled={limited} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                {TASK_PRIORITY.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo de ítem</label>
              <select className="select" disabled={limited} value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
                <option value="tarea">Tarea</option><option value="historia">Historia</option><option value="bug">Bug</option>
                <option value="spike">Spike (investigación acotada)</option><option value="cambio">Cambio del cliente</option>
              </select>
            </div>
            <div className="field">
              <label>Confianza de la estimación</label>
              <select className="select" disabled={limited} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence | "")}>
                <option value="">Sin definir</option><option value="alta">Alta (lo conocemos)</option><option value="media">Media</option><option value="baja">Baja (hay mucha incertidumbre)</option>
              </select>
            </div>
            <div className="field" />
            <div className="field">
              <label>Mínimo (h) <span style={{ fontWeight: 500, color: "var(--text-3)" }}>opcional</span></label>
              <input className="input" type="number" min={0} step={0.5} disabled={limited} value={estMin} onChange={(e) => setEstMin(e.target.value)} placeholder="se deriva de la confianza" />
            </div>
            <div className="field">
              <label>Máximo (h) <span style={{ fontWeight: 500, color: "var(--text-3)" }}>opcional</span></label>
              <input className="input" type="number" min={0} step={0.5} disabled={limited} value={estMax} onChange={(e) => setEstMax(e.target.value)} placeholder="se deriva de la confianza" />
            </div>
            {sprintsOpen.length > 0 && (
              <div className="field full">
                <label>Ubicación en la planificación</label>
                <select className="select" disabled={limited} value={sprintId ?? ""} onChange={(e) => setSprintId(e.target.value || null)}>
                  <option value="">Backlog (sin sprint)</option>
                  {sprintsOpen.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === "activo" ? " (en marcha)" : ""}</option>)}
                </select>
              </div>
            )}
          </div>
          {defs.length > 0 && (
            <>
              <div className="card-title" style={{ margin: "4px 0 0" }}>Campos personalizados</div>
              <div className="pw-cf-grid">
                {defs.map((d) => (
                  <div className="field" key={d.id} style={d.type === "multiple" ? { gridColumn: "1 / -1" } : undefined}>
                    <label>{d.name}{d.projectId !== null && <span style={{ fontWeight: 500, color: "var(--text-3)" }}> (solo este proyecto)</span>}</label>
                    <FieldInput def={d} value={custom[d.id]} disabled={readOnly} onChange={(v) => setCustom((c) => ({ ...c, [d.id]: v }))} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}

/* ================= Hito ================= */

export function MilestoneModal({ projectId, milestone, onClose }: { projectId: string; milestone: Milestone | null; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const { team, others } = assignableUsers(env, env.projects.find((p) => p.id === projectId), work.assignments);
  const [name, setName] = useState(milestone?.name ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [ownerId, setOwnerId] = useState<string | null>(milestone?.ownerId ?? null);
  const [dueDate, setDueDate] = useState<string | null>(milestone?.dueDate ?? null);
  const [status, setStatus] = useState<PlanStatus>(milestone?.status ?? "pendiente");
  const [isGate, setIsGate] = useState(!!milestone?.isGate);
  const [gateCriteria, setGateCriteria] = useState(milestone?.gateCriteria ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");

  function save() {
    if (!name.trim()) return setError("Poné un nombre para el hito.");
    const fields = { name: name.trim(), description: description.trim(), ownerId, dueDate, status, isGate, gateCriteria: isGate ? gateCriteria.trim() : "", gateDecision: isGate ? milestone?.gateDecision ?? ("pendiente" as const) : undefined };
    if (milestone) workActions.updateMilestone(milestone.id, fields);
    else workActions.addMilestone({ projectId, ...fields });
    toast(milestone ? "Hito actualizado." : "Hito creado.");
    onClose();
  }

  return (
    <Modal
      title={milestone ? "Editar hito" : "Nuevo hito"}
      onClose={onClose}
      footer={
        <>
          {milestone && (
            confirmDel ? (
              <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => { workActions.deleteMilestone(milestone.id); toast("Hito eliminado. Sus entregables y tareas quedan sin hito."); onClose(); }}>
                Confirmar eliminación
              </button>
            ) : (
              <button className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => setConfirmDel(true)}>Eliminar</button>
            )
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>{milestone ? "Guardar" : "Crear hito"}</button>
        </>
      }
    >
      <div className="field"><label>Nombre</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Descripción</label><textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="form-grid">
        <div className="field"><label>Responsable</label><UserSelect value={ownerId} onChange={setOwnerId} team={team} others={others} /></div>
        <div className="field">
          <label>Estado</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
            {PLAN_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="field full"><label>Fecha</label><OptDate value={dueDate} onChange={setDueDate} /></div>
        <div className="field full">
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={isGate} onChange={(e) => setIsGate(e.target.checked)} /> Es una puerta de decisión (se revisa lo aprendido y se decide cómo seguir)
          </label>
        </div>
        {isGate && (
          <div className="field full"><label>Criterios para seguir</label><textarea className="textarea" rows={2} value={gateCriteria} onChange={(e) => setGateCriteria(e.target.value)} placeholder="Ej.: viabilidad validada · estimación con rango acotado · presupuesto aprobado" /></div>
        )}
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}

/* ================= Entregable ================= */

export function DeliverableModal({
  projectId, deliverable, defaultMilestoneId, onClose,
}: { projectId: string; deliverable: Deliverable | null; defaultMilestoneId?: string | null; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const { team, others } = assignableUsers(env, env.projects.find((p) => p.id === projectId), work.assignments);
  const milestones = work.milestones.filter((m) => m.projectId === projectId);
  const [name, setName] = useState(deliverable?.name ?? "");
  const [description, setDescription] = useState(deliverable?.description ?? "");
  const [ownerId, setOwnerId] = useState<string | null>(deliverable?.ownerId ?? null);
  const [dueDate, setDueDate] = useState<string | null>(deliverable?.dueDate ?? null);
  const [status, setStatus] = useState<PlanStatus>(deliverable?.status ?? "pendiente");
  const [milestoneId, setMilestoneId] = useState<string | null>(deliverable?.milestoneId ?? defaultMilestoneId ?? null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");

  function save() {
    if (!name.trim()) return setError("Poné un nombre para el entregable.");
    const fields = { name: name.trim(), description: description.trim(), ownerId, dueDate, status, milestoneId };
    if (deliverable) workActions.updateDeliverable(deliverable.id, fields);
    else workActions.addDeliverable({ projectId, ...fields });
    toast(deliverable ? "Entregable actualizado." : "Entregable creado.");
    onClose();
  }

  return (
    <Modal
      title={deliverable ? "Editar entregable" : "Nuevo entregable"}
      onClose={onClose}
      footer={
        <>
          {deliverable && (
            confirmDel ? (
              <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => { workActions.deleteDeliverable(deliverable.id); toast("Entregable eliminado. Sus tareas se conservan."); onClose(); }}>
                Confirmar eliminación
              </button>
            ) : (
              <button className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => setConfirmDel(true)}>Eliminar</button>
            )
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>{deliverable ? "Guardar" : "Crear entregable"}</button>
        </>
      }
    >
      <div className="field"><label>Nombre</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Descripción</label><textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="form-grid">
        <div className="field">
          <label>Hito relacionado</label>
          <select className="select" value={milestoneId ?? ""} onChange={(e) => setMilestoneId(e.target.value || null)}>
            <option value="">Sin hito</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Responsable</label><UserSelect value={ownerId} onChange={setOwnerId} team={team} others={others} /></div>
        <div className="field">
          <label>Estado</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
            {PLAN_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="field"><label>Fecha de entrega</label><OptDate value={dueDate} onChange={setDueDate} /></div>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}

/* ================= Ficha del proyecto ================= */

export function MetaModal({ projectId, meta, onClose }: { projectId: string; meta: ProjectMeta | undefined; onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(meta?.code ?? "");
  const [startDate, setStartDate] = useState<string | null>(meta?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(meta?.endDate ?? null);
  const [description, setDescription] = useState(meta?.description ?? "");
  const [notes, setNotes] = useState(meta?.notes ?? "");
  const [mode, setMode] = useState<ProjectMode>(meta?.mode ?? "planificado");
  const [sprintWeeks, setSprintWeeks] = useState<1 | 2>(meta?.sprintWeeks ?? 2);
  const [contingency, setContingency] = useState(String(meta?.contingencyPct ?? 10));
  const [discHours, setDiscHours] = useState(meta?.discoveryHours != null ? String(meta.discoveryHours) : "");
  const [discEnd, setDiscEnd] = useState<string | null>(meta?.discoveryEnd ?? null);
  const [error, setError] = useState("");

  function save() {
    if (startDate && endDate && endDate < startDate) return setError("La fecha prevista de fin no puede ser anterior al inicio.");
    workActions.setMeta(projectId, {
      code: code.trim(), startDate, endDate, description: description.trim(), notes: notes.trim(),
      mode, sprintWeeks, contingencyPct: Math.max(0, Number(contingency) || 0),
      discoveryHours: mode === "hibrido" && discHours.trim() !== "" ? Math.max(0, Number(discHours)) : null, discoveryEnd: mode === "hibrido" ? discEnd : null,
    });
    toast("Ficha del proyecto actualizada.");
    onClose();
  }

  return (
    <Modal
      title="Editar ficha del proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="field">
        <label>Modo de gestión</label>
        <div className="pw-modes">
          {([
            ["planificado", "Planificado", "Alcance conocido: cronograma, hitos y entregables."],
            ["agil", "Ágil", "Alcance que cambia: backlog y sprints de 1–2 semanas."],
            ["hibrido", "Híbrido", "Alcance incierto: descubrimiento acotado, puerta de decisión y después sprints."],
          ] as const).map(([k, l, d]) => (
            <button key={k} type="button" className={`pw-mode ${mode === k ? "on" : ""}`} onClick={() => setMode(k)}>
              <b>{l}</b><span>{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        {mode !== "planificado" && (
          <div className="field"><label>Duración del sprint</label><select className="select" value={sprintWeeks} onChange={(e) => setSprintWeeks(Number(e.target.value) as 1 | 2)}><option value={1}>1 semana</option><option value={2}>2 semanas</option></select></div>
        )}
        <div className="field"><label>Reserva de contingencia (% de las horas proyectadas)</label><input className="input" type="number" min={0} max={100} value={contingency} onChange={(e) => setContingency(e.target.value)} /></div>
        {mode === "hibrido" && (
          <>
            <div className="field"><label>Horas del descubrimiento (tope)</label><input className="input" type="number" min={0} value={discHours} onChange={(e) => setDiscHours(e.target.value)} /></div>
            <div className="field"><label>Fecha límite del descubrimiento</label><OptDate value={discEnd} onChange={setDiscEnd} /></div>
          </>
        )}
      </div>
      <div className="form-grid">
        <div className="field"><label>Código / identificador</label><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PRY-001" /></div>
        <div className="field" />
        <div className="field"><label>Fecha de inicio</label><OptDate value={startDate} onChange={setStartDate} /></div>
        <div className="field"><label>Fecha prevista de finalización</label><OptDate value={endDate} onChange={setEndDate} /></div>
      </div>
      <div className="field"><label>Descripción</label><textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="field"><label>Notas generales</label><textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
        Los enlaces a las carpetas del proyecto (SharePoint y Autodesk Construction Cloud) se cargan desde el recuadro “Documentación”. Nombre, cliente, estado, presupuesto de horas y enlace de Notion se editan desde “Editar” en la lista de proyectos (ya existen ahí).
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}

/* ================= Documentación (carpetas del proyecto) ================= */

export function DocsModal({ projectId, meta, onClose }: { projectId: string; meta: ProjectMeta | undefined; onClose: () => void }) {
  const toast = useToast();
  const [sharepoint, setSharepoint] = useState(meta?.sharepointUrl ?? "");
  const [acc, setAcc] = useState(meta?.accUrl ?? "");
  const [error, setError] = useState("");

  function save() {
    if (sharepoint.trim() && !safeHttpUrl(sharepoint.trim())) return setError("El enlace de SharePoint debe empezar con https://");
    if (acc.trim() && !safeHttpUrl(acc.trim())) return setError("El enlace de Autodesk Construction Cloud debe empezar con https://");
    workActions.setMeta(projectId, { sharepointUrl: sharepoint.trim(), accUrl: acc.trim() });
    toast("Enlaces de documentación actualizados.");
    onClose();
  }

  return (
    <Modal
      title="Documentación del proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </>
      }
    >
      <div className="field">
        <label>Carpeta en SharePoint</label>
        <input className="input" autoFocus value={sharepoint} onChange={(e) => setSharepoint(e.target.value)} placeholder="https://empresa.sharepoint.com/sites/…" />
      </div>
      <div className="field">
        <label>Carpeta en Autodesk Construction Cloud</label>
        <input className="input" value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="https://acc.autodesk.com/docs/files/projects/…" />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>Pegá el enlace de la carpeta tal como lo da cada plataforma. Es solo un acceso directo: los archivos se quedan donde están.</div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}
