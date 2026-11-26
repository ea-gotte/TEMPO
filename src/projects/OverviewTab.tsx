import React, { useState } from "react";
import { Avatar, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, fmtDur, safeHttpUrl, today } from "../utils";
import { useEnv } from "./env";
import { byDue, isPlanOverdue, taskProgress, type Perms } from "./logic";
import { DocsModal, MetaModal, type TaskDraft } from "./Modals";
import { TasksTab } from "./TasksTab";
import { MeetingsTab } from "./MeetingsTab";
import { ChangesTab } from "./ChangesTab";
import { scopeStats } from "./agile";
import { Bar, DuePill, KpiCard, Person } from "./parts";
import { projectIndicators } from "./indicators";
import { HealthPill, ProjectIndicatorsCard } from "./IndicatorsPanel";
import { DEFAULT_MODE, MODE_LABEL, TASK_STATUS } from "./constants";
import type { Task } from "./types";
import { projectCode } from "./templates";
import { StructurePicker, buildStructure, structureChoiceValid, type StructureChoice } from "./StructurePicker";
import { Modal } from "../components/ui";
import { useWork, workActions } from "./workStore";

type Tab = import("./ProjectWorkspace").Tab;

/** Indicadores del proyecto (proyectado vs. real): los usan el resumen y la ficha */
function useIndicators(projectId: string) {
  const env = useEnv();
  const work = useWork();
  const project = env.projects.find((p) => p.id === projectId)!;
  const tasks = work.tasks.filter((t) => t.projectId === projectId);
  const milestones = work.milestones.filter((m) => m.projectId === projectId);
  const deliverables = work.deliverables.filter((d) => d.projectId === projectId);
  const spentMin = env.minutesByProject[projectId] ?? 0;
  return projectIndicators(project, work.meta[projectId], tasks, milestones, spentMin, today(), {
    sprints: work.sprints.filter((s) => s.projectId === projectId), changes: work.changes.filter((c) => c.projectId === projectId),
    risks: work.risks.filter((r) => r.projectId === projectId), baselines: work.baselines.filter((b) => b.projectId === projectId),
    deliverables,
  });
}

/**
 * Resumen del proyecto: solo lo que hay que mirar al entrar. Estado, cuatro números,
 * lo próximo a vencer y las tareas propias. El resto vive en sus pestañas.
 */
export function OverviewTab({ projectId, perms, go, onOpenTask }: { projectId: string; perms: Perms; go: (t: Tab) => void; onOpenTask: (t: Task) => void }) {
  const env = useEnv();
  const work = useWork();
  const project = env.projects.find((p) => p.id === projectId)!;
  const tasks = work.tasks.filter((t) => t.projectId === projectId);
  const milestones = work.milestones.filter((m) => m.projectId === projectId);
  const deliverables = work.deliverables.filter((d) => d.projectId === projectId);
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);
  const ind = useIndicators(projectId);

  const pr = taskProgress(tasks);
  // La programación se sigue por hitos y entregables: lo atrasado es lo que pasó su fecha sin cumplirse
  const planLate = milestones.filter((m) => isPlanOverdue(m)).length + deliverables.filter((d) => isPlanOverdue(d)).length;
  const mine = tasks.filter((t) => t.assigneeId === env.me.id && t.status !== "hecha").sort(byDue);
  const nextMs = milestones.filter((m) => m.status !== "cumplido").sort(byDue).slice(0, 3);
  const nextDel = deliverables.filter((d) => d.status !== "cumplido").sort(byDue).slice(0, 3);

  const spentMin = env.minutesByProject[projectId] ?? 0;
  const budget = project.budgetHours;
  const hoursPct = budget ? Math.min(100, (spentMin / 60 / budget) * 100) : null;
  const missingRoles = work.roles.filter((r) => r.active && r.required && !work.assignments.some((a) => a.projectId === projectId && a.roleKey === r.key));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 13, color: "var(--text-2)" }}>
        <HealthPill h={ind.health} />
        {missingRoles.length > 0 && perms.canManage && (
          <button className="pw-pill late" onClick={() => go("ficha")} title="Asignar los roles que faltan">
            <Icon name="alert" size={11} /> Falta asignar: {missingRoles.map((r) => r.label).join(", ")}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => go("ficha")}>Ficha, equipo e indicadores <Icon name="arrow-right" size={12} /></button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KpiCard icon="check-circle" label="Avance de tareas" value={`${pr.pct}%`} hint={`${pr.done} de ${pr.total} hechas`} />
        <KpiCard icon="alert" label="Atrasados" value={planLate} tone={planLate ? "bad" : "ok"} hint={planLate ? "hitos o entregables vencidos" : "todo al día"} />
        <KpiCard icon="calendar-days" label="Próximo hito" value={nextMs[0] ? fmtDate(nextMs[0].dueDate ?? "").slice(0, 5) || "—" : "—"} hint={nextMs[0]?.name ?? "sin hitos pendientes"} />
        <div className="card kpi">
          <span className="label"><Icon name="clock" size={14} /> Horas cargadas</span>
          <div className="value" style={hoursPct !== null && hoursPct >= 90 ? { color: "var(--danger)" } : undefined}>{fmtDur(spentMin)}</div>
          {budget ? (
            <>
              <div style={{ margin: "6px 0 4px" }}><Bar pct={hoursPct ?? 0} color={hoursPct! >= 90 ? "var(--danger)" : hoursPct! >= 70 ? "var(--warning)" : "var(--accent)"} /></div>
              <div className="hint">{Math.round(hoursPct ?? 0)}% de {budget} h proyectadas</div>
            </>
          ) : <div className="hint">sin proyección de horas</div>}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <div className="card-title">Próximos hitos y entregables</div>
          {nextMs.length + nextDel.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Nada pendiente.</div>}
          {nextMs.map((m) => (
            <div className="list-item" key={m.id}>
              <span style={{ color: isPlanOverdue(m) ? "var(--danger)" : "var(--accent)" }}>◆</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{m.name}</span>
              <Person user={userOf(m.ownerId)} size={18} />
              <DuePill date={m.dueDate} done={false} />
            </div>
          ))}
          {nextDel.map((d) => (
            <div className="list-item" key={d.id}>
              <span style={{ color: "var(--text-3)" }}>▣</span>
              <span style={{ flex: 1 }}>{d.name}</span>
              <Person user={userOf(d.ownerId)} size={18} />
              <DuePill date={d.dueDate} done={false} />
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => go("plan")}>Ver hitos y entregables <Icon name="arrow-right" size={12} /></button>
        </div>

        <div className="card card-pad">
          <div className="card-title">Mis tareas pendientes{mine.length > 0 && ` (${mine.length})`}</div>
          {mine.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>No tenés tareas pendientes acá.</div>}
          {mine.slice(0, 6).map((t) => (
            <div className="list-item" key={t.id} style={{ cursor: "pointer" }} onClick={() => onOpenTask(t)}>
              <span className="pw-dotc" style={{ background: TASK_STATUS.find((s) => s.key === t.status)!.color }} />
              <span style={{ flex: 1 }}>{t.name}</span>
              <DuePill date={t.dueDate} done={false} />
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => go("trabajo")}>Ver todas las tareas <Icon name="arrow-right" size={12} /></button>
        </div>
      </div>
    </>
  );
}

type Section = "tareas" | "reuniones" | "cambios";

/** Trabajo del proyecto: tareas, reuniones y cambios del cliente */
export function WorkTab({ projectId, perms, draft, onConsume }: { projectId: string; perms: Perms; draft: TaskDraft | null; onConsume: () => void }) {
  const work = useWork();
  const [section, setSection] = useState<Section>("tareas");
  const nTasks = work.tasks.filter((t) => t.projectId === projectId && !t.archived).length;
  const nMeetings = work.meetings.filter((m) => m.projectId === projectId).length;
  const pendingChanges = scopeStats([], work.changes.filter((c) => c.projectId === projectId)).pending;
  const sections: { key: Section; label: string }[] = [
    { key: "tareas", label: `Tareas (${nTasks})` },
    { key: "reuniones", label: `Reuniones (${nMeetings})` },
    { key: "cambios", label: `Cambios del cliente${pendingChanges ? ` (${pendingChanges} pendiente${pendingChanges > 1 ? "s" : ""})` : ""}` },
  ];
  // Una tarea abierta desde el resumen siempre se muestra en Tareas
  const current: Section = draft ? "tareas" : section;

  return (
    <div className="card card-pad">
      <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
        {sections.map((s) => (
          <button key={s.key} role="tab" aria-selected={current === s.key} className={current === s.key ? "active" : ""} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      {current === "tareas" && <TasksTab projectId={projectId} perms={perms} initialDraft={draft} onConsume={onConsume} />}
      {current === "reuniones" && <MeetingsTab projectId={projectId} perms={perms} />}
      {current === "cambios" && <ChangesTab projectId={projectId} perms={perms} />}
    </div>
  );
}

/** Ficha del proyecto: datos, documentación, roles, equipo e indicadores proyectado vs. real */
export function InfoTab({ projectId, perms, onEditProject }: { projectId: string; perms: Perms; onEditProject?: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const [editMeta, setEditMeta] = useState(false);
  const [editDocs, setEditDocs] = useState(false);
  const [infoOpen, setInfoOpen] = useState<string[]>([]);
  const [newResp, setNewResp] = useState("");
  const [adding, setAdding] = useState<{ roleKey: string; userId: string } | null>(null);
  const [newRole, setNewRole] = useState("");
  const [showNewRole, setShowNewRole] = useState(false);
  const [newManage, setNewManage] = useState(false);
  const [newApprove, setNewApprove] = useState(false);
  const [addStructure, setAddStructure] = useState(false);

  const project = env.projects.find((p) => p.id === projectId)!;
  const client = env.clients.find((c) => c.id === project.clientId);
  const meta = work.meta[projectId];
  const assignments = work.assignments.filter((a) => a.projectId === projectId);
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);
  const now = today();
  const ind = useIndicators(projectId);

  const spentMin = env.minutesByProject[projectId] ?? 0;
  const budget = project.budgetHours;
  const hoursPct = budget ? Math.min(100, (spentMin / 60 / budget) * 100) : null;
  const activeUsers = env.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div>
        {/* ---------- Ficha ---------- */}
        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Ficha del proyecto</div>
            <span style={{ flex: 1 }} />
            {perms.isStaff && onEditProject && <button className="btn btn-ghost btn-sm" onClick={onEditProject}><Icon name="pencil" size={12} /> Proyecto</button>}
            {perms.canManage && <button className="btn btn-secondary btn-sm" onClick={() => setEditMeta(true)}><Icon name="pencil" size={12} /> Editar ficha</button>}
          </div>
          <dl className="pw-kv">
            <dt>Código</dt><dd><span className="pw-code">{projectCode(project, meta) || "—"}</span></dd>
            <dt>Cliente</dt><dd>{client?.name ?? "—"}</dd>
            <dt>Estado</dt><dd><span className={`badge ${project.status === "activo" ? "ok" : project.status === "completado" ? "acc" : ""}`}>{project.status}</span></dd>
            <dt>Metodología</dt><dd>{MODE_LABEL[meta?.mode ?? DEFAULT_MODE]}</dd>
            <dt>Inicio</dt><dd>{meta?.startDate ? fmtDate(meta.startDate) : "—"}</dd>
            <dt>Fin previsto</dt><dd>{meta?.endDate ? <>{fmtDate(meta.endDate)} {project.status === "activo" && meta.endDate < now && <span className="pw-pill late"><Icon name="alert" size={11} /> vencido</span>}</> : "—"}</dd>
            <dt>Descripción</dt><dd>{meta?.description || <span style={{ color: "var(--text-3)" }}>—</span>}</dd>
            <dt>Notas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{meta?.notes || <span style={{ color: "var(--text-3)" }}>—</span>}</dd>
            <dt>Horas</dt>
            <dd>
              {budget ? (
                <>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{fmtDur(spentMin)} / {budget} h</div>
                  <Bar pct={hoursPct ?? 0} color={hoursPct! >= 90 ? "var(--danger)" : hoursPct! >= 70 ? "var(--warning)" : "var(--accent)"} />
                </>
              ) : <span style={{ color: "var(--text-3)" }}>{fmtDur(spentMin)} cargadas</span>}
            </dd>
          </dl>
        </div>

        {/* ---------- Documentación ---------- */}
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>Documentación</div>
            <span style={{ flex: 1 }} />
            {perms.canManage && <button className="btn btn-secondary btn-sm" onClick={() => setEditDocs(true)}><Icon name="pencil" size={12} /> Editar enlaces</button>}
          </div>
          <DocLink label="Carpeta en SharePoint" url={meta?.sharepointUrl} />
          <DocLink label="Carpeta en Autodesk Construction Cloud" url={meta?.accUrl} />
          {project.notionUrl && safeHttpUrl(project.notionUrl) && <DocLink label="Notion del proyecto" url={project.notionUrl} />}
        </div>

        {/* ---------- Equipo ---------- */}
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="card-title">Equipo del proyecto ({project.memberIds.length})</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {project.memberIds.length === 0 && <span style={{ color: "var(--warning)", fontSize: 13 }}>Sin equipo asignado.</span>}
            {project.memberIds.map((id) => {
              const u = userOf(id);
              return u ? <span className="pw-chip-user" key={id} style={{ padding: "2px 10px 2px 3px" }}><Avatar name={u.name} size={20} /> {u.name}</span> : null;
            })}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>La membresía se administra desde “Miembros” en la lista de proyectos.</div>
        </div>
        </div>

        {/* ---------- Roles ---------- */}
        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <div className="card-title" style={{ margin: 0 }}>Roles del proyecto</div>
            <span style={{ flex: 1 }} />
            {perms.canApprove && <button className="btn btn-ghost btn-sm" onClick={() => setShowNewRole((v) => !v)}><Icon name="plus" size={12} /> Tipo de rol</button>}
          </div>
          {showNewRole && (
            <div style={{ margin: "6px 0 8px" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="input" placeholder="Ej.: Líder de calidad" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
                <button className="btn btn-primary btn-sm" disabled={!newRole.trim()} onClick={() => { workActions.addRole(newRole, { manage: newManage, approve: newApprove, responsibilities: newResp.split("\n").map((l) => l.trim()).filter(Boolean) }); setNewRole(""); setNewResp(""); setNewManage(false); setNewApprove(false); setShowNewRole(false); }}>Agregar</button>
              </div>
              <textarea className="textarea" rows={3} style={{ marginTop: 6 }} placeholder="Responsabilidades del rol (una por línea, opcional)" value={newResp} onChange={(e) => setNewResp(e.target.value)} />
              <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12.5, color: "var(--text-2)" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={newManage} onChange={(e) => setNewManage(e.target.checked)} /> Gestiona el proyecto</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={newApprove} onChange={(e) => setNewApprove(e.target.checked)} /> Aprueba cambios</label>
              </div>
            </div>
          )}
          {work.roles.filter((r) => r.active).map((r) => {
            const list = assignments.filter((a) => a.roleKey === r.key);
            const open = adding?.roleKey === r.key;
            const showInfo = infoOpen.includes(r.key);
            return (
              <div className="pw-role-row" key={r.key}>
                <div className="pw-role-label">
                  {r.label}
                  <div style={{ fontWeight: 500, fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    {r.required ? "imprescindible" : "opcional"} · {r.approve ? "gestiona y aprueba" : r.manage ? "gestiona" : "consulta"}
                  </div>
                </div>
                <div className="pw-role-people">
                  {list.length === 0 && !open && (r.required ? <span className="pw-pill late" style={{ marginTop: 2 }}><Icon name="alert" size={11} /> Falta asignar</span> : <span style={{ color: "var(--text-3)", fontSize: 12.5, paddingTop: 3 }}>Sin asignar</span>)}
                  {list.map((a) => {
                    const u = userOf(a.userId);
                    if (!u) return null;
                    return (
                      <span className="pw-chip-user" key={a.id}>
                        <Avatar name={u.name} size={20} /> {u.name}
                        {perms.canApprove && <button title="Quitar" onClick={async () => { const err = await workActions.unassignRole(a.id); if (err) toast(err); }}><Icon name="x" size={11} /></button>}
                      </span>
                    );
                  })}
                  {perms.canApprove && !open && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setAdding({ roleKey: r.key, userId: "" })}><Icon name="plus" size={12} /></button>
                  )}
                  {open && (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <select className="select" style={{ width: 190, padding: "3px 8px", fontSize: 12.5 }} autoFocus value={adding!.userId} onChange={(e) => setAdding({ roleKey: r.key, userId: e.target.value })}>
                        <option value="">Elegir persona…</option>
                        {activeUsers.filter((u) => !list.some((a) => a.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <button className="btn btn-primary btn-sm" disabled={!adding!.userId} onClick={async () => { const err = await workActions.assignRole(projectId, adding!.userId, r.key); if (err) toast(err); setAdding(null); }}>Asignar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setAdding(null)}><Icon name="x" size={12} /></button>
                    </span>
                  )}
                </div>
                <button
                  type="button" className={`pw-info-btn ${showInfo ? "on" : ""}`} aria-expanded={showInfo} aria-label={`Responsabilidades: ${r.label}`}
                  title="Ver las responsabilidades de este rol"
                  onClick={() => setInfoOpen((cur) => (cur.includes(r.key) ? cur.filter((k) => k !== r.key) : [...cur, r.key]))}
                >
                  <Icon name="info" size={16} />
                </button>
                {showInfo && (
                  <div className="pw-role-info">
                    <div className="t">Responsabilidades · {r.label}</div>
                    {r.responsibilities?.length ? <ul>{r.responsibilities.map((x, i) => <li key={i}>{x}</li>)}</ul> : <div style={{ color: "var(--text-3)" }}>Este rol todavía no tiene responsabilidades definidas.</div>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>
            Una persona puede tener más de un rol y distintos roles en cada proyecto. El botón <Icon name="info" size={11} style={{ verticalAlign: "-2px" }} /> muestra lo que se espera de cada rol.
          </div>
        </div>
      </div>

      {perms.canManage && (
        <div className="card card-pad" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-title" style={{ margin: 0 }}>Estructura del proyecto</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
              Sumá los hitos, entregables y riesgos de la plantilla de una metodología, o copialos de otro proyecto.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddStructure(true)}><Icon name="plus" size={12} /> Plantilla o copia</button>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <ProjectIndicatorsCard ind={ind} />
      </div>

      {addStructure && <AddStructureModal projectId={projectId} onClose={() => setAddStructure(false)} />}
      {editMeta && <MetaModal projectId={projectId} meta={meta} canChangeMode={perms.canApprove} onClose={() => setEditMeta(false)} />}
      {editDocs && <DocsModal projectId={projectId} meta={meta} onClose={() => setEditDocs(false)} />}
    </>
  );
}

/** Suma al proyecto la plantilla de una metodología o la estructura de otro proyecto. No borra lo que ya hay. */
function AddStructureModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const meta = work.meta[projectId];
  const [choice, setChoice] = useState<StructureChoice>({
    source: "plantilla", mode: meta?.mode ?? DEFAULT_MODE, fromProjectId: "", includeTasks: false, startDate: meta?.startDate ?? today(),
  });
  const existing = work.milestones.filter((m) => m.projectId === projectId).length + work.deliverables.filter((d) => d.projectId === projectId).length;

  function apply() {
    const s = buildStructure(choice, work, projectId, env.me.id);
    if (!s) return;
    workActions.addStructure(s);
    toast(`Se agregaron ${s.milestones.length} hitos, ${s.deliverables.length} entregables y ${s.risks.length} riesgos.`);
    onClose();
  }

  return (
    <Modal
      title="Agregar estructura al proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!structureChoiceValid(choice)} onClick={apply}>Agregar</button>
        </>
      }
    >
      {existing > 0 && (
        <div style={{ background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
          Este proyecto ya tiene {existing} hitos y entregables. Lo nuevo se suma a lo que hay; no se borra ni se reemplaza nada.
        </div>
      )}
      <StructurePicker
        value={choice} onChange={setChoice} work={work} allowEmpty={false}
        projects={env.projects.filter((p) => p.id !== projectId)}
      />
    </Modal>
  );
}

/** Acceso directo a una carpeta de documentación; si no hay enlace, lo dice. */
function DocLink({ label, url }: { label: string; url?: string | null }) {
  const href = url ? safeHttpUrl(url) : null;
  if (!href) {
    return (
      <div className="pw-doc empty">
        <Icon name="folder" size={16} />
        <div className="txt"><div className="l">{label}</div><div className="u">Sin enlace cargado</div></div>
      </div>
    );
  }
  let shown = href;
  try { const u = new URL(href); shown = u.host + (u.pathname === "/" ? "" : u.pathname); } catch { /* se muestra completo */ }
  return (
    <a className="pw-doc" href={href} target="_blank" rel="noreferrer" title={href}>
      <Icon name="folder" size={16} />
      <div className="txt"><div className="l">{label}</div><div className="u">{shown}</div></div>
      <Icon name="external-link" size={14} />
    </a>
  );
}
