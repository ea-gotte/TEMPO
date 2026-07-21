import React, { useState } from "react";
import { useStore } from "../store";
import { Switch, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDateTime, uid } from "../utils";
import type { Role } from "../types";
import { AccountsImportPanel, ConfigImportExportPanel, ProjectsImportPanel } from "../components/ImportPanels";

const TAG_COLORS = ["#5b6cff", "#12b5a5", "#f5a524", "#f0446c", "#8b5cf6", "#0ea5e9", "#84cc16", "#f97316"];

const ROLE_LABELS: Record<Role, string> = { admin: "Administrador", supervisor: "Supervisor", usuario: "Usuario" };

export function Admin() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [c, setC] = useState(state.company);
  const [tab, setTab] = useState<"empresa" | "roles" | "licencias" | "etiquetas" | "importar" | "correos" | "auditoria">("empresa");
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [newPerm, setNewPerm] = useState<Record<Role, string>>({ admin: "", supervisor: "", usuario: "" });
  const isAdmin = state.users.find((u) => u.id === state.currentUserId)?.role === "admin";

  function addTag() {
    const name = newTag.trim();
    if (!name || state.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: "patch", patch: { tags: [...state.tags, { id: uid(), name, color: newTagColor }] } });
    dispatch({ type: "audit", action: "Etiqueta creada", detail: name });
    toast(`Etiqueta "${name}" creada.`);
    setNewTag("");
  }

  function renameTag(id: string, name: string) {
    dispatch({ type: "patch", patch: { tags: state.tags.map((t) => (t.id === id ? { ...t, name } : t)) } });
  }

  function recolorTag(id: string, color: string) {
    dispatch({ type: "patch", patch: { tags: state.tags.map((t) => (t.id === id ? { ...t, color } : t)) } });
    dispatch({ type: "audit", action: "Etiqueta modificada", detail: state.tags.find((t) => t.id === id)?.name ?? id });
  }

  function deleteTag(id: string) {
    const tag = state.tags.find((t) => t.id === id);
    dispatch({
      type: "patch",
      patch: {
        tags: state.tags.filter((t) => t.id !== id),
        // Limpia la etiqueta de los registros que la usaban
        entries: state.entries.map((e) => (e.tagIds.includes(id) ? { ...e, tagIds: e.tagIds.filter((x) => x !== id) } : e)),
      },
    });
    dispatch({ type: "audit", action: "Etiqueta eliminada", detail: tag?.name ?? id });
    toast(`Etiqueta "${tag?.name}" eliminada.`);
  }

  function togglePerm(role: Role, index: number) {
    const list = state.rolePermissions[role].map((p, i) => (i === index ? { ...p, enabled: !p.enabled } : p));
    const perm = state.rolePermissions[role][index];
    dispatch({ type: "patch", patch: { rolePermissions: { ...state.rolePermissions, [role]: list } } });
    dispatch({ type: "audit", action: `Permiso ${perm.enabled ? "deshabilitado" : "habilitado"}`, detail: `${ROLE_LABELS[role]}: ${perm.label}` });
  }

  function addPerm(role: Role) {
    const label = newPerm[role].trim();
    if (!label || state.rolePermissions[role].some((p) => p.label.toLowerCase() === label.toLowerCase())) return;
    dispatch({
      type: "patch",
      patch: { rolePermissions: { ...state.rolePermissions, [role]: [...state.rolePermissions[role], { label, enabled: true }] } },
    });
    dispatch({ type: "audit", action: "Permiso creado", detail: `${ROLE_LABELS[role]}: ${label}` });
    toast(`Permiso agregado a ${ROLE_LABELS[role]}.`);
    setNewPerm({ ...newPerm, [role]: "" });
  }

  function removePerm(role: Role, index: number) {
    const perm = state.rolePermissions[role][index];
    dispatch({
      type: "patch",
      patch: { rolePermissions: { ...state.rolePermissions, [role]: state.rolePermissions[role].filter((_, i) => i !== index) } },
    });
    dispatch({ type: "audit", action: "Permiso eliminado", detail: `${ROLE_LABELS[role]}: ${perm.label}` });
  }

  function toggleLeaveType(index: number) {
    const lt = state.leaveTypeConfig[index];
    dispatch({
      type: "patch",
      patch: { leaveTypeConfig: state.leaveTypeConfig.map((x, i) => (i === index ? { ...x, enabled: !x.enabled } : x)) },
    });
    dispatch({ type: "audit", action: `Tipo de licencia ${lt.enabled ? "deshabilitado" : "habilitado"}`, detail: lt.type });
  }

  function saveCompany() {
    dispatch({ type: "patch", patch: { company: c } });
    dispatch({ type: "audit", action: "Configuración de empresa", detail: `${c.name} · ${c.country} · ${c.timezone}` });
    toast("Configuración guardada.");
  }

  return (
    <>
      <div className="page-head">
        <h1>Administración</h1>
        <span className="spacer" />
        <div className="tabs">
          <button className={tab === "empresa" ? "active" : ""} onClick={() => setTab("empresa")}>Empresa</button>
          <button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}>Roles y permisos</button>
          <button className={tab === "licencias" ? "active" : ""} onClick={() => setTab("licencias")}>Tipos de licencia</button>
          <button className={tab === "etiquetas" ? "active" : ""} onClick={() => setTab("etiquetas")}>Etiquetas</button>
          <button className={tab === "importar" ? "active" : ""} onClick={() => setTab("importar")}>Importar datos</button>
          <button className={tab === "correos" ? "active" : ""} onClick={() => setTab("correos")}>Correos</button>
          <button className={tab === "auditoria" ? "active" : ""} onClick={() => setTab("auditoria")}>Auditoría</button>
        </div>
      </div>

      {tab === "empresa" && (
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <div className="card-title">Configuración de la empresa</div>
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            </div>
            <div className="field">
              <label>País (calendario de feriados)</label>
              <select className="select" value={c.country} onChange={(e) => setC({ ...c, country: e.target.value })}>
                {["Argentina", "Chile", "Uruguay", "México", "España", "Colombia", "Perú"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Zona horaria</label>
              <select className="select" value={c.timezone} onChange={(e) => setC({ ...c, timezone: e.target.value })}>
                {["America/Argentina/Buenos_Aires", "America/Santiago", "America/Montevideo", "America/Mexico_City", "Europe/Madrid", "America/Bogota", "America/Lima"].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Moneda</label>
              <select className="select" value={c.currency} onChange={(e) => setC({ ...c, currency: e.target.value })}>
                {["USD", "ARS", "EUR", "CLP", "UYU", "MXN"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Jornada — inicio por defecto</label>
              <input type="time" className="input" value={c.defaultDayStart} onChange={(e) => setC({ ...c, defaultDayStart: e.target.value })} />
            </div>
            <div className="field">
              <label>Jornada — fin por defecto</label>
              <input type="time" className="input" value={c.defaultDayEnd} onChange={(e) => setC({ ...c, defaultDayEnd: e.target.value })} />
            </div>
            <div className="field">
              <label>Horas semanales por defecto</label>
              <input type="number" className="input" value={c.defaultWeeklyHours} onChange={(e) => setC({ ...c, defaultWeeklyHours: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Expiración de recuperación de clave (minutos)</label>
              <input type="number" className="input" value={c.passwordResetExpireMin ?? 30} onChange={(e) => setC({ ...c, passwordResetExpireMin: Number(e.target.value) })} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={saveCompany}>Guardar cambios</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 14, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icon name="lock" size={13} style={{ marginTop: 2 }} /> <span>Autenticación: OAuth 2.0 con Google y Microsoft (configurado a nivel de organización). Arquitectura multi-tenant: los datos de cada empresa se aíslan por <code>tenant_id</code>.</span>
          </p>
        </div>
      )}

      {tab === "roles" && (
        <div className="grid-2">
          {(Object.keys(state.rolePermissions) as Role[]).map((role) => (
            <div className="card card-pad" key={role}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{ROLE_LABELS[role]}</div>
              {!isAdmin && (
                <p style={{ fontSize: 12, color: "var(--warning)", marginBottom: 8 }}>
                  Solo los administradores pueden modificar los permisos.
                </p>
              )}
              {state.rolePermissions[role].map((p, i) => (
                <div className="list-item" key={p.label} style={{ gap: 10 }}>
                  <Switch on={p.enabled} onToggle={() => isAdmin && togglePerm(role, i)} label={p.label} />
                  <span style={{ flex: 1, color: p.enabled ? "var(--text)" : "var(--text-3)" }}>{p.label}</span>
                  {isAdmin && (
                    <button className="btn btn-ghost btn-sm" onClick={() => removePerm(role, i)} aria-label={`Eliminar ${p.label}`} title="Eliminar permiso">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              ))}
              {isAdmin && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    className="input"
                    placeholder="Nuevo permiso…"
                    value={newPerm[role]}
                    onChange={(e) => setNewPerm({ ...newPerm, [role]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addPerm(role)}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => addPerm(role)} disabled={!newPerm[role].trim()}>
                    <Icon name="plus" size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "licencias" && (
        <div className="card card-pad" style={{ maxWidth: 560 }}>
          <div className="card-title">Tipos de licencia habilitados</div>
          {!isAdmin && (
            <p style={{ fontSize: 12.5, color: "var(--warning)", marginBottom: 10 }}>
              Solo los administradores pueden modificar los tipos de licencia.
            </p>
          )}
          {state.leaveTypeConfig.map((lt, i) => (
            <div className="list-item" key={lt.type} style={{ gap: 10 }}>
              <Switch on={lt.enabled} onToggle={() => isAdmin && toggleLeaveType(i)} label={lt.type} />
              <span style={{ flex: 1, color: lt.enabled ? "var(--text)" : "var(--text-3)" }}>{lt.type}</span>
              <span className={`badge ${lt.enabled ? "ok" : ""}`}>{lt.enabled ? "Activo" : "Inactivo"}</span>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 10 }}>
            Los tipos inactivos dejan de aparecer al crear una nueva solicitud de ausencia.
          </p>
        </div>
      )}

      {tab === "etiquetas" && (
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <div className="card-title">Etiquetas de las entradas de tiempo</div>
          {!isAdmin && (
            <p style={{ fontSize: 12.5, color: "var(--warning)", marginBottom: 10 }}>
              Solo los administradores pueden modificar las etiquetas.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.tags.map((g) => {
              const uses = state.entries.filter((e) => e.tagIds.includes(g.id)).length;
              return (
                <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <input
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={g.name}
                    disabled={!isAdmin}
                    onChange={(e) => renameTag(g.id, e.target.value)}
                    aria-label={`Nombre de etiqueta ${g.name}`}
                  />
                  <div style={{ display: "flex", gap: 5 }}>
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        disabled={!isAdmin}
                        onClick={() => recolorTag(g.id, c)}
                        style={{
                          width: 20, height: 20, borderRadius: "50%", background: c,
                          outline: g.color === c ? "2px solid var(--text)" : "none", outlineOffset: 2,
                          opacity: isAdmin ? 1 : 0.5,
                        }}
                        aria-label={`Color ${c} para ${g.name}`}
                      />
                    ))}
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                    {uses} registro{uses !== 1 ? "s" : ""}
                  </span>
                  {isAdmin && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteTag(g.id)} title="Eliminar etiqueta (se quita de todos los registros)">
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ maxWidth: 200 }}
                placeholder="Nueva etiqueta…"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <div style={{ display: "flex", gap: 5 }}>
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTagColor(c)}
                    style={{ width: 20, height: 20, borderRadius: "50%", background: c, outline: newTagColor === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <button className="btn btn-primary btn-sm" onClick={addTag} disabled={!newTag.trim()}><Icon name="plus" size={14} /> Agregar</button>
            </div>
          )}
        </div>
      )}

      {tab === "importar" && (
        <div>
          {!isAdmin ? (
            <div className="card card-pad">
              <p style={{ fontSize: 12.5, color: "var(--warning)" }}>Solo los administradores pueden importar datos.</p>
            </div>
          ) : (
            <>
              <AccountsImportPanel />
              <ProjectsImportPanel />
              <ConfigImportExportPanel />
            </>
          )}
        </div>
      )}

      {tab === "correos" && (
        <div className="card card-pad">
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="mail" size={14} /> Bandeja de salida — copia por correo de cada notificación
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
            Cada notificación genera automáticamente una copia por correo. En esta demo se registran acá; con backend
            se enviarían por SMTP. Podés abrir cualquiera en tu cliente de correo.
          </p>
          {state.emails.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>Todavía no se envió ningún correo.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.emails.slice(0, 40).map((m) => (
              <div key={m.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 13 }}>{m.subject}</strong>
                  <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{fmtDateTime(m.at)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", margin: "2px 0" }}>Para: {m.to}</div>
                <div style={{ fontSize: 12.5 }}>{m.body}</div>
                <a
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 4 }}
                  href={`mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`}
                >
                  <Icon name="mail" size={12} /> Abrir en cliente de correo
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "auditoria" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {state.audit.slice(0, 60).map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {fmtDateTime(a.at)}
                  </td>
                  <td>{state.users.find((u) => u.id === a.userId)?.name ?? a.userId}</td>
                  <td style={{ fontWeight: 600 }}>{a.action}</td>
                  <td style={{ color: "var(--text-2)" }}>{a.detail}</td>
                </tr>
              ))}
              {state.audit.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-3)" }}>Sin actividad registrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
