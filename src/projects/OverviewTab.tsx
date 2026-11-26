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
import { clearAllBoards } from "./board/boardStore";

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
 * Resumen del proyecto: entra en una pantalla. Una línea de estado, tres números y una sola
 * lista con lo próximo a vencer (hitos, entregables y las tareas propias).
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
  const now = today();

  const pr = taskProgress(tasks);
  // La programación se sigue por hitos y entregables: lo atrasado es lo que pasó su fecha sin cumplirse
  const planLate = milestones.filter((m) => isPlanOverdue(m)).length + deliverables.filter((d) => isPlanOverdue(d)).length;
  const missingRoles = work.roles.filter((r) => r.active && r.required && !work.assignments.some((a) => a.projectId === projectId && a.roleKey === r.key));
  const highRisks = work.risks.filter((r) => r.projectId === projectId && r.status === "abierto" && r.probability * r.impact >= 6).length;

  const spentMin = env.minutesByProject[projectId] ?? 0;
  const budget = project.budgetHours;
  const hoursPct = budget ? Math.min(100, (spentMin / 60 / budget) * 100) : null;

  // Una sola lista por fecha: hitos, entregables y las tareas propias sin terminar
  type Due = { key: string; kind: "hito" | "entregable" | "tarea"; name: string; dueDate: string | null; ownerId: string | null; open: () => void };
  const dues: Due[] = [
    ...milestones.filter((m) => m.status !== "cumplido").map((m): Due => ({ key: m.id, kind: "hito", name: m.name, dueDate: m.dueDate, ownerId: m.ownerId, open: () => go("plan") })),
    ...deliverables.filter((d) => d.status !== "cumplido").map((d): Due => ({ key: d.id, kind: "entregable", name: d.name, dueDate: d.dueDate, ownerId: d.ownerId, open: () => go("plan") })),
    ...tasks.filter((t) => t.assigneeId === env.me.id && t.status !== "hecha" && !t.archived).map((t): Due => ({ key: t.id, kind: "tarea", name: t.name, dueDate: t.dueDate, ownerId: t.assigneeId, open: () => onOpenTask(t) })),
  ].sort(byDue);
  const next = dues.find((d) => d.kind !== "tarea" && d.dueDate) ?? null;
  const daysTo = next?.dueDate ? Math.round((new Date(next.dueDate + "T00:00:00").getTime() - new Date(now + "T00:00:00").getTime()) / 86400000) : null;
  const SHOWN = 8;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
        <HealthPill h={ind.health} />
        {planLate > 0 && <button className="pw-pill late" onClick={() => go("plan")}><Icon name="alert" size={11} /> {planLate} vencido{planLate !== 1 ? "s" : ""}</button>}
        {highRisks > 0 && <button className="pw-pill soon" onClick={() => go("riesgos")}>{highRisks} riesgo{highRisks !== 1 ? "s" : ""} alto{highRisks !== 1 ? "s" : ""}</button>}
        {missingRoles.length > 0 && perms.canManage && (
          <button className="pw-pill late" onClick={() => go("ficha")} title="Asignar los roles que faltan">
            Falta asignar: {missingRoles.map((r) => r.label).join(", ")}
          </button>
        )}
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <KpiCard icon="check-circle" label="Avance" value={`${pr.pct}%`} hint={`${pr.done} de ${pr.total} tareas hechas`} />
        <div className="card kpi">
          <span className="label"><Icon name="clock" size={14} /> Horas</span>
          <div className="value" style={hoursPct !== null && hoursPct >= 90 ? { color: "var(--danger)" } : undefined}>{fmtDur(spentMin)}</div>
          {budget ? (
            <>
              <div style={{ margin: "6px 0 4px" }}><Bar pct={hoursPct ?? 0} color={hoursPct! >= 90 ? "var(--danger)" : hoursPct! >= 70 ? "var(--warning)" : "var(--accent)"} /></div>
              <div className="hint">{Math.round(hoursPct ?? 0)}% de {budget} h proyectadas</div>
            </>
          ) : <div className="hint">sin horas proyectadas</div>}
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="calendar-days" size={14} /> Próximo vencimiento</span>
          <div className="value" style={daysTo !== null && daysTo < 0 ? { color: "var(--danger)" } : undefined}>{next?.dueDate ? fmtDate(next.dueDate).slice(0, 5) : "—"}</div>
          <div className="hint">
            {next ? <>{next.name} · {daysTo === 0 ? "hoy" : daysTo! > 0 ? `en ${daysTo} día${daysTo !== 1 ? "s" : ""}` : `vencido hace ${-daysTo!} día${daysTo !== -1 ? "s" : ""}`}</> : "nada pendiente"}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div className="card-title" style={{ margin: 0 }}>Próximos vencimientos</div>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => go("plan")}>Plan <Icon name="arrow-right" size={12} /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => go("trabajo")}>Tareas <Icon name="arrow-right" size={12} /></button>
        </div>
        {dues.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>Nada pendiente.</div>}
        {dues.slice(0, SHOWN).map((d) => (
          <button className="pw-due-row" key={d.key} onClick={d.open} title={d.kind === "tarea" ? "Abrir la tarea" : "Ver en el plan"}>
            <span className="kind" style={{ color: d.kind === "hito" ? "var(--accent)" : "var(--text-3)" }}>{d.kind === "hito" ? "◆" : d.kind === "entregable" ? "▣" : "●"}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: d.kind === "hito" ? 600 : 400 }}>{d.name}</span>
            {d.kind === "tarea" ? <span className="badge acc">mía</span> : <Person user={userOf(d.ownerId)} size={18} />}
            <DuePill date={d.dueDate} done={false} />
          </button>
        ))}
        {dues.length > SHOWN && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>y {dues.length - SHOWN} más en Plan y Tareas.</div>}
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 10 }}>◆ hito · ▣ entregable · ● tarea tuya</div>
      </div>
    </>
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
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <div className="card-title" style={{ margin: 0 }}>Carpetas del proyecto</div>
            <span style={{ flex: 1 }} />
            {perms.canManage && <button className="btn btn-ghost btn-sm" onClick={() => setEditDocs(true)} title="Editar enlaces" aria-label="Editar enlaces"><Icon name="pencil" size={13} /></button>}
          </div>
          <div className="pw-docs">
            <DocLink label="SharePoint" url={meta?.sharepointUrl} onAdd={perms.canManage ? () => setEditDocs(true) : undefined} />
            <DocLink label="Autodesk Construction Cloud" url={meta?.accUrl} onAdd={perms.canManage ? () => setEditDocs(true) : undefined} />
            {project.notionUrl && safeHttpUrl(project.notionUrl) && <DocLink label="Notion" url={project.notionUrl} />}
          </div>
        </div>

        </div>

        <div>
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

      <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>Demo: tareas, hitos, sprints y tableros se guardan solo en este navegador.</span>
        <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en la demo, incluidos los tableros.")) { workActions.resetDemo(); void clearAllBoards(); } }}>
          Restablecer datos de ejemplo
        </button>
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

/** Una carpeta del proyecto en una línea: nombre, dirección y acceso; si falta el enlace, ofrece cargarlo. */
function DocLink({ label, url, onAdd }: { label: string; url?: string | null; onAdd?: () => void }) {
  const href = url ? safeHttpUrl(url) : null;
  if (!href) {
    return (
      <div className="pw-doc-row none">
        <Icon name="folder" size={15} />
        <span className="l">{label}</span>
        <span className="u">Sin enlace</span>
        {onAdd && <button className="btn btn-ghost btn-sm" onClick={onAdd}><Icon name="plus" size={12} /> Agregar</button>}
      </div>
    );
  }
  let shown = href;
  try { const u = new URL(href); shown = u.host + (u.pathname === "/" ? "" : u.pathname); } catch { /* se muestra completo */ }
  return (
    <a className="pw-doc-row" href={href} target="_blank" rel="noreferrer" title={href}>
      <Icon name="folder" size={15} />
      <span className="l">{label}</span>
      <span className="u">{shown}</span>
      <Icon name="external-link" size={13} />
    </a>
  );
}
