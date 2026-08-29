import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Client, Project, ProjectStatus, SubProject } from "../types";
import { fmtDur, uid } from "../utils";
import { Avatar, Dot, Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

export const COLORS = ["#5b6cff", "#12b5a5", "#f5a524", "#f0446c", "#8b5cf6", "#0ea5e9", "#84cc16", "#f97316"];

export function Projects() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<"proyectos" | "clientes" | "etiquetas">("proyectos");
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [editClient, setEditClient] = useState<Client | "new" | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);

  const [fQuery, setFQuery] = useState("");
  const [fClient, setFClient] = useState("");
  const [fStatus, setFStatus] = useState<ProjectStatus | "">("");
  const [fMember, setFMember] = useState("");
  const [fActivity, setFActivity] = useState("");

  type SortKey = "name" | "client" | "status" | "hours" | "activity";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <Icon name="chevron-right" size={11} style={{ transform: sortDir === "asc" ? "rotate(-90deg)" : "rotate(90deg)" }} />;
  }

  const spentBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of state.entries) {
      if (!e.projectId) continue;
      m.set(e.projectId, (m.get(e.projectId) ?? 0) + (e.end - e.start));
    }
    return m;
  }, [state.entries]);

  const filtersActive = Boolean(fQuery || fClient || fStatus || fMember || fActivity);
  const filteredProjects = useMemo(
    () =>
      state.projects.filter((p) => {
        if (fQuery && !p.name.toLowerCase().includes(fQuery.trim().toLowerCase())) return false;
        if (fClient && p.clientId !== fClient) return false;
        if (fStatus && p.status !== fStatus) return false;
        if (fMember && !p.memberIds.includes(fMember)) return false;
        if (fActivity === "__none__" && p.flightActivityId) return false;
        if (fActivity && fActivity !== "__none__" && p.flightActivityId !== fActivity) return false;
        return true;
      }),
    [state.projects, fQuery, fClient, fStatus, fMember, fActivity],
  );

  const sortedProjects = useMemo(() => {
    if (!sortKey) return filteredProjects;
    const dir = sortDir === "asc" ? 1 : -1;
    const clientName = (p: Project) => state.clients.find((c) => c.id === p.clientId)?.name ?? "";
    const activityName = (p: Project) => state.flightActivities.find((a) => a.id === p.flightActivityId)?.name ?? "";
    return [...filteredProjects].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name) * dir;
        case "client": return clientName(a).localeCompare(clientName(b)) * dir;
        case "status": return a.status.localeCompare(b.status) * dir;
        case "hours": return ((spentBy.get(a.id) ?? 0) - (spentBy.get(b.id) ?? 0)) * dir;
        case "activity": return activityName(a).localeCompare(activityName(b)) * dir;
        default: return 0;
      }
    });
  }, [filteredProjects, sortKey, sortDir, state.clients, state.flightActivities, spentBy]);

  function clearFilters() {
    setFQuery("");
    setFClient("");
    setFStatus("");
    setFMember("");
    setFActivity("");
  }

  function setProjectActivity(p: Project, flightActivityId: string) {
    dispatch({
      type: "patch",
      patch: { projects: state.projects.map((x) => (x.id === p.id ? { ...x, flightActivityId: flightActivityId || null } : x)) },
    });
    const actName = state.flightActivities.find((a) => a.id === flightActivityId)?.name ?? "Sin asignar";
    dispatch({ type: "audit", action: "Actividad de horas de vuelo asignada", detail: `${p.name} → ${actName}` });
  }

  function confirmDeleteProject() {
    if (!deleteProject) return;
    dispatch({ type: "patch", patch: { projects: state.projects.filter((p) => p.id !== deleteProject.id) } });
    dispatch({ type: "audit", action: "Proyecto eliminado", detail: deleteProject.name });
    toast(`Proyecto "${deleteProject.name}" eliminado.`);
    setDeleteProject(null);
  }

  function confirmDeleteClient() {
    if (!deleteClient) return;
    dispatch({ type: "patch", patch: { clients: state.clients.filter((c) => c.id !== deleteClient.id) } });
    dispatch({ type: "audit", action: "Cliente eliminado", detail: deleteClient.name });
    toast(`Cliente "${deleteClient.name}" eliminado.`);
    setDeleteClient(null);
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
        {tab === "clientes" && <button className="btn btn-primary" onClick={() => setEditClient("new")}><Icon name="plus" size={15} /> Cliente</button>}
      </div>

      {tab === "proyectos" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <p className="page-sub" style={{ margin: 0 }}>
              {filteredProjects.length} de {state.projects.length} proyectos
            </p>
            <span style={{ flex: 1 }} />
            <div className="field" style={{ width: 180 }}>
              <select className="select" value={fMember} onChange={(e) => setFMember(e.target.value)}>
                <option value="">Equipo: todos</option>
                {state.users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            {filtersActive && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Limpiar filtros</button>
            )}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th className="th-sort" onClick={() => toggleSort("name")}>Proyecto {sortArrow("name")}</th>
                <th className="th-sort" onClick={() => toggleSort("client")}>Cliente {sortArrow("client")}</th>
                <th className="th-sort" onClick={() => toggleSort("status")}>Estado {sortArrow("status")}</th>
                <th className="th-sort" onClick={() => toggleSort("hours")}>Horas proyectadas / cargadas {sortArrow("hours")}</th>
                <th className="th-sort" onClick={() => toggleSort("activity")}>Actividad — Horas de vuelo {sortArrow("activity")}</th>
                <th>Notion</th>
                <th></th>
              </tr>
              <tr className="th-filters">
                <th>
                  <input
                    className="input"
                    placeholder="Buscar…"
                    value={fQuery}
                    onChange={(e) => setFQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th>
                  <select className="select" value={fClient} onChange={(e) => setFClient(e.target.value)} onClick={(e) => e.stopPropagation()}>
                    <option value="">Todos</option>
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </th>
                <th>
                  <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as ProjectStatus | "")} onClick={(e) => e.stopPropagation()}>
                    <option value="">Todos</option>
                    <option value="activo">Activo</option>
                    <option value="pausado">Pausado</option>
                    <option value="completado">Completado</option>
                    <option value="archivado">Archivado</option>
                  </select>
                </th>
                <th></th>
                <th>
                  <select className="select" value={fActivity} onChange={(e) => setFActivity(e.target.value)} onClick={(e) => e.stopPropagation()}>
                    <option value="">Todas</option>
                    <option value="__none__">Sin asignar</option>
                    {state.flightCategories.map((cat) => (
                      <optgroup key={cat.id} label={cat.name}>
                        {state.flightActivities.filter((a) => a.categoryId === cat.id).map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.length === 0 && (
                <tr><td colSpan={7}><Empty icon="search" text="Sin resultados" sub="Probá ajustar o limpiar los filtros." /></td></tr>
              )}
              {sortedProjects.map((p) => {
                const client = state.clients.find((c) => c.id === p.clientId);
                const spent = spentBy.get(p.id) ?? 0;
                const pct = p.budgetHours ? Math.min(100, (spent / 60 / p.budgetHours) * 100) : null;
                return (
                  <tr key={p.id} onDoubleClick={() => setEditProject(p)} style={{ cursor: "pointer" }} title="Doble clic para editar">
                    <td>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                        <Dot color={p.color} /> {p.name}
                      </div>
                      {state.subProjects.some((sp) => sp.projectId === p.id) && (
                        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                          {state.subProjects.filter((sp) => sp.projectId === p.id).length} subproyectos: {state.subProjects.filter((sp) => sp.projectId === p.id).map((sp) => sp.name).join(", ")}
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
                    <td style={{ minWidth: 190 }} onDoubleClick={(e) => e.stopPropagation()}>
                      <select
                        className="select"
                        value={p.flightActivityId ?? ""}
                        onChange={(e) => setProjectActivity(p, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="">— Sin asignar —</option>
                        {state.flightCategories.map((cat) => (
                          <optgroup key={cat.id} label={cat.name}>
                            {state.flightActivities
                              .filter((a) => a.categoryId === cat.id && (a.active || a.id === p.flightActivityId))
                              .map((a) => (
                                <option key={a.id} value={a.id}>{a.name}{a.active ? "" : " (inactiva)"}</option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td>
                      {p.notionUrl ? (
                        <a href={p.notionUrl} target="_blank" rel="noreferrer" className="badge acc" title={p.notionUrl} onClick={(e) => e.stopPropagation()}>
                          <Icon name="book" size={11} /> Abrir en Notion
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td onDoubleClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditProject(p)}><Icon name="pencil" size={13} /> Editar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteProject(p)}><Icon name="trash" size={13} /> Eliminar</button>
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>{projs.length} proyectos · {fmtDur(total)}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditClient(c)} aria-label={`Editar ${c.name}`}><Icon name="pencil" size={13} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteClient(c)} aria-label={`Eliminar ${c.name}`}><Icon name="trash" size={13} /></button>
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
      {deleteProject && (
        <Modal
          title="Eliminar proyecto"
          onClose={() => setDeleteProject(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteProject(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDeleteProject}><Icon name="trash" size={14} /> Sí, eliminar</button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>
            ¿Eliminar el proyecto <strong>{deleteProject.name}</strong>? Los registros de tiempo ya cargados con este proyecto no se borran, pero dejan de mostrar a qué proyecto pertenecían.
          </p>
        </Modal>
      )}
      {editClient && (
        <ClientModal
          client={editClient === "new" ? null : editClient}
          onClose={() => setEditClient(null)}
        />
      )}
      {deleteClient && (
        <Modal
          title="Eliminar cliente"
          onClose={() => setDeleteClient(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteClient(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDeleteClient}><Icon name="trash" size={14} /> Sí, eliminar</button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>
            ¿Eliminar el cliente <strong>{deleteClient.name}</strong>? Los proyectos asociados quedan sin cliente asignado, no se eliminan.
          </p>
        </Modal>
      )}
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
  const [flightActivityId, setFlightActivityId] = useState<string>(project?.flightActivityId ?? "");
  const [subProjects, setSubProjects] = useState<SubProject[]>(
    project ? state.subProjects.filter((sp) => sp.projectId === project.id) : [],
  );
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds ?? [state.currentUserId]);
  const [showMembers, setShowMembers] = useState(false);
  const activeUsers = state.users.filter((u) => u.active);
  const selectedMembers = memberIds.map((id) => activeUsers.find((u) => u.id === id)).filter((u): u is (typeof activeUsers)[number] => Boolean(u));

  // Si hay subproyectos, el total del proyecto se ajusta a la suma de lo pactado por etapa
  const subProjectsBudgetSum = subProjects.reduce((a, sp) => a + (sp.budgetHours ?? 0), 0);

  function save() {
    if (!name.trim()) return;
    const next: Project = {
      id: project?.id ?? uid(),
      clientId: clientId || null,
      name: name.trim(),
      color,
      status,
      budgetHours: subProjects.length > 0 ? subProjectsBudgetSum : (budgetHours ? Number(budgetHours) : null),
      memberIds,
      notionUrl: notionUrl.trim() || undefined,
      flightActivityId: flightActivityId || null,
    };
    const finalSubProjects = subProjects.map((sp) => ({ ...sp, projectId: next.id }));
    const otherSubProjects = state.subProjects.filter((sp) => sp.projectId !== next.id);
    dispatch({
      type: "patch",
      patch: {
        projects: project
          ? state.projects.map((p) => (p.id === project.id ? next : p))
          : [...state.projects, next],
        subProjects: [...otherSubProjects, ...finalSubProjects],
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
          {subProjects.length > 0 ? (
            <>
              <input className="input" value={`${subProjectsBudgetSum} h`} disabled />
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Suma de lo pactado por subproyecto.</span>
            </>
          ) : (
            <input type="number" className="input" value={budgetHours} onChange={(e) => setBudgetHours(e.target.value)} placeholder="Sin proyección" />
          )}
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
          <label>Actividad — Horas de vuelo</label>
          <select className="select" value={flightActivityId} onChange={(e) => setFlightActivityId(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {state.flightCategories
              .filter((cat) => cat.active)
              .map((cat) => {
                const acts = state.flightActivities.filter(
                  (a) => a.categoryId === cat.id && (a.active || a.id === flightActivityId),
                );
                if (acts.length === 0) return null;
                return (
                  <optgroup key={cat.id} label={cat.name}>
                    {acts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}{a.active ? "" : " (inactiva)"}</option>
                    ))}
                  </optgroup>
                );
              })}
          </select>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>Las horas cargadas en este proyecto suman experiencia a esta actividad.</span>
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
        <label>Equipo del proyecto — solo los miembros ven este proyecto</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {selectedMembers.slice(0, 8).map((u, i) => (
              <span
                key={u.id}
                style={{ marginLeft: i > 0 ? -10 : 0, border: "2px solid var(--surface)", borderRadius: "50%", position: "relative", zIndex: 8 - i }}
                title={u.name}
              >
                <Avatar name={u.name} size={30} />
              </span>
            ))}
            {selectedMembers.length > 8 && (
              <span className="badge" style={{ marginLeft: 4 }}>+{selectedMembers.length - 8}</span>
            )}
            {selectedMembers.length === 0 && (
              <span style={{ fontSize: 12.5, color: "var(--warning)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="alert" size={13} /> Sin equipo asignado
              </span>
            )}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowMembers(true)}>
            <Icon name="users" size={13} /> {memberIds.length > 0 ? "Editar miembros" : "Agregar miembros"}
          </button>
        </div>
      </div>
      <SubProjectsField subProjects={subProjects} onChange={setSubProjects} />
      {showMembers && (
        <MembersPickerModal
          users={activeUsers}
          selected={memberIds}
          onSave={setMemberIds}
          onClose={() => setShowMembers(false)}
        />
      )}
    </Modal>
  );
}

function MembersPickerModal({
  users,
  selected,
  onSave,
  onClose,
}: {
  users: { id: string; name: string; email: string; role: string }[];
  selected: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [memberIds, setMemberIds] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Modal
      title={`Miembros del proyecto · ${memberIds.length} de ${users.length}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { onSave(memberIds); onClose(); }}>Guardar</button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", display: "grid" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Buscar persona…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMemberIds(users.map((u) => u.id))}>
          Todos
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMemberIds([])}>
          Ninguno
        </button>
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 12.5 }}>Sin coincidencias.</div>
        )}
        {filtered.map((u) => {
          const on = memberIds.includes(u.id);
          return (
            <label
              key={u.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderRadius: "var(--r-sm)", cursor: "pointer", background: on ? "var(--accent-soft)" : "transparent",
                transition: "background 0.12s",
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  setMemberIds((ids) => (ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]))
                }
              />
              <Avatar name={u.name} size={30} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{u.email}</div>
              </div>
              <span className="badge" style={{ textTransform: "capitalize" }}>{u.role}</span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

function SubProjectsField({
  subProjects,
  onChange,
}: {
  subProjects: SubProject[];
  onChange: (next: SubProject[]) => void;
}) {
  const [editing, setEditing] = useState<SubProject | "new" | null>(null);

  function upsert(sp: SubProject) {
    onChange(subProjects.some((x) => x.id === sp.id) ? subProjects.map((x) => (x.id === sp.id ? sp : x)) : [...subProjects, sp]);
    setEditing(null);
  }

  function remove(id: string) {
    onChange(subProjects.filter((x) => x.id !== id));
  }

  return (
    <div className="field">
      <label>Subproyectos <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(opcional)</span></label>
      {subProjects.length === 0 && !editing && (
        <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 6 }}>Sin subproyectos.</div>
      )}
      {subProjects.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {subProjects.map((sp) => (
            <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)" }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{sp.name}</span>
              <span className={`badge ${sp.status === "activo" ? "ok" : ""}`}>{sp.status}</span>
              {sp.budgetHours != null && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sp.budgetHours} h</span>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(sp)} aria-label={`Editar ${sp.name}`}><Icon name="pencil" size={12} /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(sp.id)} aria-label={`Eliminar ${sp.name}`}><Icon name="trash" size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <SubProjectForm subProject={editing === "new" ? null : editing} onSave={upsert} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing("new")}>
          <Icon name="plus" size={13} /> Agregar subproyecto
        </button>
      )}
    </div>
  );
}

function SubProjectForm({
  subProject,
  onSave,
  onCancel,
}: {
  subProject: SubProject | null;
  onSave: (sp: SubProject) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(subProject?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(subProject?.status ?? "activo");
  const [budgetHours, setBudgetHours] = useState(subProject?.budgetHours?.toString() ?? "");

  function save() {
    if (!name.trim()) return;
    onSave({
      id: subProject?.id ?? uid(),
      projectId: subProject?.projectId ?? "",
      name: name.trim(),
      status,
      budgetHours: budgetHours ? Number(budgetHours) : null,
    });
  }

  return (
    <div style={{ border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="form-grid">
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!name.trim()}>Guardar</button>
      </div>
    </div>
  );
}

function ClientModal({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [name, setName] = useState(client?.name ?? "");
  const [color, setColor] = useState(client?.color ?? COLORS[5]);

  function save() {
    if (!name.trim()) return;
    dispatch({
      type: "patch",
      patch: {
        clients: client
          ? state.clients.map((c) => (c.id === client.id ? { ...c, name: name.trim(), color } : c))
          : [...state.clients, { id: uid(), name: name.trim(), color }],
      },
    });
    dispatch({ type: "audit", action: client ? "Cliente modificado" : "Cliente creado", detail: name.trim() });
    toast(client ? "Cliente actualizado." : "Cliente creado.");
    onClose();
  }

  return (
    <Modal
      title={client ? "Editar cliente" : "Nuevo cliente"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>{client ? "Guardar" : "Crear"}</button>
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
