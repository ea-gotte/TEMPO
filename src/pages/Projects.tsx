import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Project, ProjectStatus } from "../types";
import { fmtDur, uid } from "../utils";
import { Avatar, Dot, Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

export const COLORS = ["#5b6cff", "#12b5a5", "#f5a524", "#f0446c", "#8b5cf6", "#0ea5e9", "#84cc16", "#f97316"];

export function Projects() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<"proyectos" | "clientes" | "etiquetas">("proyectos");
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);
  const [newClient, setNewClient] = useState(false);

  const [fQuery, setFQuery] = useState("");
  const [fClient, setFClient] = useState("");
  const [fStatus, setFStatus] = useState<ProjectStatus | "">("");
  const [fMember, setFMember] = useState("");

  const spentBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of state.entries) {
      if (!e.projectId) continue;
      m.set(e.projectId, (m.get(e.projectId) ?? 0) + (e.end - e.start));
    }
    return m;
  }, [state.entries]);

  const filtersActive = Boolean(fQuery || fClient || fStatus || fMember);
  const filteredProjects = useMemo(
    () =>
      state.projects.filter((p) => {
        if (fQuery && !p.name.toLowerCase().includes(fQuery.trim().toLowerCase())) return false;
        if (fClient && p.clientId !== fClient) return false;
        if (fStatus && p.status !== fStatus) return false;
        if (fMember && !p.memberIds.includes(fMember)) return false;
        return true;
      }),
    [state.projects, fQuery, fClient, fStatus, fMember],
  );

  function clearFilters() {
    setFQuery("");
    setFClient("");
    setFStatus("");
    setFMember("");
  }

  return (
    <>
      <div className="page-head">
        <h1>Clientes y proyectos</h1>
        <span className="spacer" />
        <div className="tabs">
          {(["proyectos", "clientes", "etiquetas"] as const).map((v) => (
            <button key={v} className={tab === v ? "active" : ""} onClick={() => setTab(v)} style={{ textTransform: "capitalize" }}>
              {v}
            </button>
          ))}
        </div>
        {tab === "proyectos" && <button className="btn btn-primary" onClick={() => setEditProject("new")}><Icon name="plus" size={15} /> Proyecto</button>}
        {tab === "clientes" && <button className="btn btn-primary" onClick={() => setNewClient(true)}><Icon name="plus" size={15} /> Cliente</button>}
      </div>

      {tab === "proyectos" && (
        <>
          <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label>Buscar</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", display: "grid" }}>
                    <Icon name="search" size={14} />
                  </span>
                  <input
                    className="input"
                    style={{ paddingLeft: 30 }}
                    placeholder="Nombre del proyecto…"
                    value={fQuery}
                    onChange={(e) => setFQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Cliente</label>
                <select className="select" value={fClient} onChange={(e) => setFClient(e.target.value)}>
                  <option value="">Todos</option>
                  {state.clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Estado</label>
                <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as ProjectStatus | "")}>
                  <option value="">Todos</option>
                  <option value="activo">Activo</option>
                  <option value="pausado">Pausado</option>
                  <option value="completado">Completado</option>
                  <option value="archivado">Archivado</option>
                </select>
              </div>
              <div className="field">
                <label>Persona</label>
                <select className="select" value={fMember} onChange={(e) => setFMember(e.target.value)}>
                  <option value="">Todas</option>
                  {state.users.filter((u) => u.active).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              {filtersActive && (
                <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Limpiar filtros</button>
              )}
            </div>
          </div>
          <p className="page-sub" style={{ margin: "0 0 10px" }}>
            {filteredProjects.length} de {state.projects.length} proyectos
          </p>
          <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Horas proyectadas / cargadas</th>
                <th>Notion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 && (
                <tr><td colSpan={6}><Empty icon="search" text="Sin resultados" sub="Probá ajustar o limpiar los filtros." /></td></tr>
              )}
              {filteredProjects.map((p) => {
                const client = state.clients.find((c) => c.id === p.clientId);
                const spent = spentBy.get(p.id) ?? 0;
                const pct = p.budgetHours ? Math.min(100, (spent / 60 / p.budgetHours) * 100) : null;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                        <Dot color={p.color} /> {p.name}
                      </div>
                      {p.tasks.length > 0 && (
                        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                          {p.tasks.length} tareas: {p.tasks.map((t) => t.name).join(", ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
                        {p.memberIds.map((id) => {
                          const u = state.users.find((x) => x.id === id);
                          return u ? <Avatar key={id} name={u.name} size={20} /> : null;
                        })}
                        {p.memberIds.length === 0 && (
                          <span style={{ fontSize: 11, color: "var(--warning)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="alert" size={11} /> Sin equipo asignado</span>
                        )}
                      </div>
                    </td>
                    <td>{client?.name ?? "—"}</td>
                    <td>
                      <span className={`badge ${p.status === "activo" ? "ok" : p.status === "completado" ? "acc" : ""}`}>{p.status}</span>
                    </td>
                    <td style={{ minWidth: 150 }}>
                      {p.budgetHours ? (
                        <>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>
                            {fmtDur(spent)} / {p.budgetHours} h
                            {pct !== null && pct >= 90 && <span className="overlap-flag"> <Icon name="alert" size={11} /></span>}
                          </div>
                          <div className="progress">
                            <div style={{ width: `${pct}%`, background: pct! >= 90 ? "var(--danger)" : pct! >= 70 ? "var(--warning)" : "var(--accent)" }} />
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>Sin proyección · {fmtDur(spent)} cargadas</span>
                      )}
                    </td>
                    <td>
                      {p.notionUrl ? (
                        <a href={p.notionUrl} target="_blank" rel="noreferrer" className="badge acc" title={p.notionUrl}>
                          <Icon name="book" size={11} /> Abrir en Notion
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditProject(p)}><Icon name="pencil" size={13} /> Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {tab === "clientes" && (
        <div className="grid-2">
          {state.clients.map((c) => {
            const projs = state.projects.filter((p) => p.clientId === c.id);
            const total = projs.reduce((a, p) => a + (spentBy.get(p.id) ?? 0), 0);
            return (
              <div className="card card-pad" key={c.id}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: c.color, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700 }}>
                    {c.name[0]}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>{projs.length} proyectos · {fmtDur(total)}</div>
                  </div>
                </div>
                {projs.map((p) => (
                  <div className="list-item" key={p.id}>
                    <Dot color={p.color} />
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-2)" }}>{fmtDur(spentBy.get(p.id) ?? 0)}</span>
                  </div>
                ))}
                {projs.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>Sin proyectos.</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === "etiquetas" && (
        <div className="card card-pad">
          <div className="card-title">Etiquetas disponibles</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state.tags.map((g) => (
              <span className="chip" key={g.id}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
                {g.name}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 12 }}>
            Las etiquetas se aplican a los registros de tiempo desde el formulario de carga.
          </p>
        </div>
      )}

      {editProject && (
        <ProjectModal
          project={editProject === "new" ? null : editProject}
          onClose={() => setEditProject(null)}
        />
      )}
      {newClient && <ClientModal onClose={() => setNewClient(false)} />}
    </>
  );
}

function ProjectModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [name, setName] = useState(project?.name ?? "");
  const [clientId, setClientId] = useState(project?.clientId ?? state.clients[0]?.id ?? "");
  const [color, setColor] = useState(project?.color ?? COLORS[0]);
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "activo");
  const [budgetHours, setBudgetHours] = useState<string>(project?.budgetHours?.toString() ?? "");
  const [notionUrl, setNotionUrl] = useState(project?.notionUrl ?? "");
  const [tasksText, setTasksText] = useState(project?.tasks.map((t) => t.name).join("\n") ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds ?? [state.currentUserId]);
  const [memberQuery, setMemberQuery] = useState("");
  const activeUsers = state.users.filter((u) => u.active);
  const filteredUsers = activeUsers.filter(
    (u) => u.name.toLowerCase().includes(memberQuery.toLowerCase()) || u.email.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  function save() {
    if (!name.trim()) return;
    const tasks = tasksText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n, i) => project?.tasks[i]?.name === n ? project.tasks[i] : { id: uid(), name: n });
    const next: Project = {
      id: project?.id ?? uid(),
      clientId: clientId || null,
      name: name.trim(),
      color,
      status,
      billable: project?.billable ?? false,
      hourlyRate: project?.hourlyRate ?? 0,
      costRate: project?.costRate ?? 0,
      budgetHours: budgetHours ? Number(budgetHours) : null,
      tasks,
      memberIds,
      notionUrl: notionUrl.trim() || undefined,
    };
    dispatch({
      type: "patch",
      patch: {
        projects: project
          ? state.projects.map((p) => (p.id === project.id ? next : p))
          : [...state.projects, next],
      },
    });
    dispatch({ type: "audit", action: project ? "Proyecto modificado" : "Proyecto creado", detail: next.name });
    toast(project ? "Proyecto actualizado." : "Proyecto creado.");
    onClose();
  }

  return (
    <Modal
      title={project ? "Editar proyecto" : "Nuevo proyecto"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>Guardar</button>
        </>
      }
    >
      <div className="field">
        <label>Nombre</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Cliente</label>
          <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {state.clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estado</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="completado">Completado</option>
            <option value="archivado">Archivado</option>
          </select>
        </div>
        <div className="field">
          <label>Horas proyectadas</label>
          <input type="number" className="input" value={budgetHours} onChange={(e) => setBudgetHours(e.target.value)} placeholder="Sin proyección" />
        </div>
        <div className="field">
          <label>Link a Notion</label>
          <input
            type="url"
            className="input"
            value={notionUrl}
            onChange={(e) => setNotionUrl(e.target.value)}
            placeholder="https://notion.so/…"
          />
        </div>
        <div className="field">
          <label>Color</label>
          <div style={{ display: "flex", gap: 6, paddingTop: 4 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: c,
                  outline: color === c ? "2px solid var(--text)" : "none", outlineOffset: 2,
                }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label>
          Equipo del proyecto — solo los miembros ven este proyecto
          <span style={{ color: "var(--text-3)", fontWeight: 400 }}> · {memberIds.length} de {activeUsers.length} seleccionados</span>
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", display: "grid" }}>
              <Icon name="search" size={14} />
            </span>
            <input
              className="input"
              style={{ paddingLeft: 30 }}
              placeholder="Buscar persona…"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMemberIds(activeUsers.map((u) => u.id))}>
            Todos
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMemberIds([])}>
            Ninguno
          </button>
        </div>
        <div
          style={{
            maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)", padding: 4, display: "flex", flexDirection: "column",
          }}
        >
          {filteredUsers.length === 0 && (
            <div style={{ padding: 10, color: "var(--text-3)", fontSize: 12.5 }}>Sin coincidencias.</div>
          )}
          {filteredUsers.map((u) => {
            const on = memberIds.includes(u.id);
            return (
              <label
                key={u.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 8px",
                  borderRadius: "var(--r-sm)", cursor: "pointer", background: on ? "var(--accent-soft)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setMemberIds((ids) => (ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]))
                  }
                />
                <Avatar name={u.name} size={24} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{u.email}</div>
                </div>
                <span className="badge" style={{ textTransform: "capitalize" }}>{u.role}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>Tareas (una por línea, opcional)</label>
        <textarea className="textarea" rows={3} value={tasksText} onChange={(e) => setTasksText(e.target.value)} />
      </div>
    </Modal>
  );
}

function ClientModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[5]);

  function save() {
    if (!name.trim()) return;
    dispatch({ type: "patch", patch: { clients: [...state.clients, { id: uid(), name: name.trim(), color }] } });
    dispatch({ type: "audit", action: "Cliente creado", detail: name.trim() });
    toast("Cliente creado.");
    onClose();
  }

  return (
    <Modal
      title="Nuevo cliente"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>Crear</button>
        </>
      }
    >
      <div className="field">
        <label>Nombre</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Color</label>
        <div style={{ display: "flex", gap: 6 }}>
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: "50%", background: c, outline: color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }} aria-label={`Color ${c}`} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
