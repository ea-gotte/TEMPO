import React, { useState } from "react";
import { useStore } from "../store";
import { Switch, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, fmtDateTime, today, uid } from "../utils";
import type { Holiday, HolidayType, Role, SurveyQuestion, SurveyQuestionType } from "../types";
import { AccountsImportPanel, ConfigImportExportPanel, ProjectsImportPanel, TimeEntriesImportPanel } from "../components/ImportPanels";

const TAG_COLORS = ["#5b6cff", "#12b5a5", "#f5a524", "#f0446c", "#8b5cf6", "#0ea5e9", "#84cc16", "#f97316"];

const ROLE_LABELS: Record<Role, string> = { admin: "Administrador", gerente: "Gerente", supervisor: "Supervisor", usuario: "Usuario" };

const HOLIDAY_TYPES: HolidayType[] = ["Feriado nacional", "Feriado provincial", "Día no laborable"];

export function Admin() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [c, setC] = useState(state.company);
  const [tab, setTab] = useState<"empresa" | "roles" | "licencias" | "etiquetas" | "horasvuelo" | "encuestas" | "feriados" | "importar" | "correos" | "auditoria">("empresa");
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [newPerm, setNewPerm] = useState<Record<Role, string>>({ admin: "", gerente: "", supervisor: "", usuario: "" });
  const [newHolidayDate, setNewHolidayDate] = useState(today());
  const [newHolidayType, setNewHolidayType] = useState<HolidayType>("Feriado nacional");
  const [newHolidayTitle, setNewHolidayTitle] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newActivityName, setNewActivityName] = useState<Record<string, string>>({});
  const [surveyTitle, setSurveyTitle] = useState("");
  const [surveyDueDate, setSurveyDueDate] = useState(today());
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const isAdmin = state.users.find((u) => u.id === state.currentUserId)?.role === "admin";

  function addHoliday() {
    const title = newHolidayTitle.trim();
    if (!title) return;
    const holiday: Holiday = { id: uid(), date: newHolidayDate, type: newHolidayType, title };
    dispatch({ type: "addHoliday", holiday });
    toast(`Feriado "${title}" agregado.`);
    setNewHolidayTitle("");
  }

  function deleteHoliday(id: string, title: string) {
    dispatch({ type: "deleteHoliday", id });
    toast(`Feriado "${title}" eliminado.`);
  }

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

  // "Horas de vuelo": el catálogo nunca borra filas (una actividad desactivada
  // conserva el historial ya cargado) — solo se agrega o se activa/desactiva.
  function addFlightCategory() {
    const name = newCategoryName.trim();
    if (!name || state.flightCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: "patch", patch: { flightCategories: [...state.flightCategories, { id: uid(), name, active: true }] } });
    dispatch({ type: "audit", action: "Categoría de horas de vuelo creada", detail: name });
    toast(`Categoría "${name}" creada.`);
    setNewCategoryName("");
  }

  function renameFlightCategory(id: string, name: string) {
    dispatch({ type: "patch", patch: { flightCategories: state.flightCategories.map((c) => (c.id === id ? { ...c, name } : c)) } });
  }

  function toggleFlightCategory(id: string) {
    const cat = state.flightCategories.find((c) => c.id === id);
    if (!cat) return;
    dispatch({ type: "patch", patch: { flightCategories: state.flightCategories.map((c) => (c.id === id ? { ...c, active: !c.active } : c)) } });
    dispatch({ type: "audit", action: `Categoría de horas de vuelo ${cat.active ? "desactivada" : "activada"}`, detail: cat.name });
  }

  function addFlightActivity(categoryId: string) {
    const name = (newActivityName[categoryId] ?? "").trim();
    if (!name || state.flightActivities.some((a) => a.categoryId === categoryId && a.name.toLowerCase() === name.toLowerCase())) return;
    dispatch({ type: "patch", patch: { flightActivities: [...state.flightActivities, { id: uid(), categoryId, name, active: true }] } });
    dispatch({ type: "audit", action: "Actividad de horas de vuelo creada", detail: name });
    toast(`Actividad "${name}" creada.`);
    setNewActivityName({ ...newActivityName, [categoryId]: "" });
  }

  function renameFlightActivity(id: string, name: string) {
    dispatch({ type: "patch", patch: { flightActivities: state.flightActivities.map((a) => (a.id === id ? { ...a, name } : a)) } });
  }

  function toggleFlightActivity(id: string) {
    const act = state.flightActivities.find((a) => a.id === id);
    if (!act) return;
    dispatch({ type: "patch", patch: { flightActivities: state.flightActivities.map((a) => (a.id === id ? { ...a, active: !a.active } : a)) } });
    dispatch({ type: "audit", action: `Actividad de horas de vuelo ${act.active ? "desactivada" : "activada"}`, detail: act.name });
  }

  // Encuestas: preguntas libres por ronda, lanzadas a mano. Al lanzar se crea
  // el evento en el calendario corporativo y se notifica a todo el equipo
  // activo (quien no la respondió sigue viendo el aviso hasta que la conteste
  // o venza, ver el efecto en Shell.tsx).
  // Armador de encuestas estilo Google Forms: cada pregunta se agrega en blanco
  // y se edita en el lugar (título, tipo, opciones si corresponde), se puede
  // reordenar y quitar antes de lanzar.
  function addSurveyQuestion() {
    setSurveyQuestions([...surveyQuestions, { id: uid(), label: "", type: "rating5" }]);
  }

  function updateSurveyQuestion(id: string, patch: Partial<SurveyQuestion>) {
    setSurveyQuestions(surveyQuestions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function removeSurveyQuestion(id: string) {
    setSurveyQuestions(surveyQuestions.filter((q) => q.id !== id));
  }

  function moveSurveyQuestion(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= surveyQuestions.length) return;
    const next = [...surveyQuestions];
    [next[index], next[target]] = [next[target], next[index]];
    setSurveyQuestions(next);
  }

  function addOption(qid: string) {
    updateSurveyQuestion(qid, { options: [...(surveyQuestions.find((q) => q.id === qid)?.options ?? []), ""] });
  }

  function updateOption(qid: string, idx: number, value: string) {
    const q = surveyQuestions.find((x) => x.id === qid);
    if (!q) return;
    const options = (q.options ?? []).map((o, i) => (i === idx ? value : o));
    updateSurveyQuestion(qid, { options });
  }

  function removeOption(qid: string, idx: number) {
    const q = surveyQuestions.find((x) => x.id === qid);
    if (!q) return;
    updateSurveyQuestion(qid, { options: (q.options ?? []).filter((_, i) => i !== idx) });
  }

  const surveyQuestionsValid =
    surveyQuestions.length > 0 &&
    surveyQuestions.every((q) => {
      if (!q.label.trim()) return false;
      if (q.type === "choice" || q.type === "checkbox") {
        return (q.options ?? []).filter((o) => o.trim()).length >= 2;
      }
      return true;
    });

  function launchSurvey() {
    const title = surveyTitle.trim();
    if (!title || !surveyDueDate || !surveyQuestionsValid) return;
    const survey = {
      id: uid(),
      title,
      questions: surveyQuestions.map((q) => ({ ...q, label: q.label.trim(), options: q.options?.map((o) => o.trim()).filter(Boolean) })),
      launchedAt: new Date().toISOString(),
      dueDate: surveyDueDate,
      createdBy: state.currentUserId,
    };
    const event = { id: uid(), date: surveyDueDate, type: "Encuesta" as const, title: `Encuesta: ${title}`, allDay: true };
    dispatch({ type: "patch", patch: { surveys: [...state.surveys, survey], corpEvents: [...state.corpEvents, event] } });
    for (const u of state.users.filter((x) => x.active)) {
      dispatch({
        type: "notify",
        n: { userId: u.id, kind: "encuesta", title: "Nueva encuesta", body: `"${title}" — respondé antes del ${fmtDate(surveyDueDate)}.` },
      });
    }
    dispatch({ type: "audit", action: "Encuesta lanzada", detail: `${title} · vence ${fmtDate(surveyDueDate)}` });
    toast(`Encuesta "${title}" lanzada.`);
    setSurveyTitle("");
    setSurveyQuestions([]);
    setSurveyDueDate(today());
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
          <button className={tab === "horasvuelo" ? "active" : ""} onClick={() => setTab("horasvuelo")}>Horas de vuelo</button>
          <button className={tab === "encuestas" ? "active" : ""} onClick={() => setTab("encuestas")}>Encuestas</button>
          <button className={tab === "feriados" ? "active" : ""} onClick={() => setTab("feriados")}>Feriados</button>
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

      {tab === "horasvuelo" && (
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
          {!isAdmin && (
            <p style={{ fontSize: 12.5, color: "var(--warning)" }}>
              Solo los administradores pueden modificar las categorías y actividades.
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            Categorías y actividades del sistema de "Horas de vuelo": la experiencia acumulada de cada persona según
            los proyectos en los que trabajó. Se asignan por proyecto en Clientes y proyectos. Desactivar una
            actividad la saca del selector para proyectos nuevos, pero no borra las horas ya acumuladas con ella.
          </p>
          {state.flightCategories.map((cat) => {
            const activities = state.flightActivities.filter((a) => a.categoryId === cat.id);
            return (
              <div key={cat.id} className="card card-pad">
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <input
                    className="input"
                    style={{ maxWidth: 240, fontWeight: 650 }}
                    value={cat.name}
                    disabled={!isAdmin}
                    onChange={(e) => renameFlightCategory(cat.id, e.target.value)}
                    aria-label={`Nombre de categoría ${cat.name}`}
                  />
                  <span className={`badge ${cat.active ? "ok" : ""}`}>{cat.active ? "Activa" : "Inactiva"}</span>
                  {isAdmin && (
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => toggleFlightCategory(cat.id)}>
                      {cat.active ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                  {activities.map((act) => (
                    <div key={act.id} className="list-item" style={{ gap: 10 }}>
                      <input
                        className="input"
                        style={{ maxWidth: 260 }}
                        value={act.name}
                        disabled={!isAdmin}
                        onChange={(e) => renameFlightActivity(act.id, e.target.value)}
                        aria-label={`Nombre de actividad ${act.name}`}
                      />
                      <span className={`badge ${act.active ? "ok" : ""}`} style={{ marginLeft: "auto" }}>
                        {act.active ? "Activa" : "Inactiva"}
                      </span>
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleFlightActivity(act.id)}>
                          {act.active ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p style={{ fontSize: 12, color: "var(--text-3)" }}>Todavía no tiene actividades.</p>
                  )}
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <input
                        className="input"
                        style={{ maxWidth: 240 }}
                        placeholder="Nueva actividad…"
                        value={newActivityName[cat.id] ?? ""}
                        onChange={(e) => setNewActivityName({ ...newActivityName, [cat.id]: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addFlightActivity(cat.id)}
                      />
                      <button className="btn btn-secondary btn-sm" onClick={() => addFlightActivity(cat.id)} disabled={!(newActivityName[cat.id] ?? "").trim()}>
                        <Icon name="plus" size={14} /> Agregar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isAdmin && (
            <div className="card card-pad" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                className="input"
                style={{ maxWidth: 240 }}
                placeholder="Nueva categoría…"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFlightCategory()}
              />
              <button className="btn btn-primary btn-sm" onClick={addFlightCategory} disabled={!newCategoryName.trim()}>
                <Icon name="plus" size={14} /> Nueva categoría
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "encuestas" && (
        <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
          {!isAdmin && (
            <p style={{ fontSize: 12.5, color: "var(--warning)" }}>Solo los administradores pueden lanzar encuestas.</p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>
            Alimentan la sección "Habilidades" del perfil profesional (autopercepción, no la experiencia real de
            proyectos). Al lanzar una encuesta se crea un evento en el Calendario corporativo con la fecha límite y
            se notifica a todo el equipo activo.
          </p>

          {isAdmin && (
            <div className="card card-pad">
              <div className="card-title">Nueva encuesta</div>
              <div className="form-grid">
                <div className="field">
                  <label>Título</label>
                  <input className="input" value={surveyTitle} onChange={(e) => setSurveyTitle(e.target.value)} placeholder="Ej. Autoevaluación 2026" />
                </div>
                <div className="field">
                  <label>Fecha límite</label>
                  <input type="date" className="input" min={today()} value={surveyDueDate} onChange={(e) => setSurveyDueDate(e.target.value)} />
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Preguntas</label>
                {surveyQuestions.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0" }}>Agregá al menos una pregunta.</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {surveyQuestions.map((q, i) => (
                    <div key={q.id} className="card card-pad" style={{ background: "var(--surface-2)" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: "var(--text-3)", fontSize: 12, minWidth: 16 }}>{i + 1}.</span>
                        <input
                          className="input" style={{ flex: 1 }} placeholder="Texto de la pregunta…"
                          value={q.label} onChange={(e) => updateSurveyQuestion(q.id, { label: e.target.value })}
                        />
                        <select
                          className="select" style={{ maxWidth: 170 }} value={q.type}
                          onChange={(e) => {
                            const type = e.target.value as SurveyQuestionType;
                            const needsOptions = type === "choice" || type === "checkbox";
                            updateSurveyQuestion(q.id, { type, options: needsOptions ? (q.options?.length ? q.options : ["", ""]) : undefined });
                          }}
                        >
                          <option value="rating5">Calificación 1 a 5</option>
                          <option value="yesno">Sí / No</option>
                          <option value="text">Texto libre</option>
                          <option value="choice">Opción múltiple (elegir 1)</option>
                          <option value="checkbox">Casillas (elegir varias)</option>
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => moveSurveyQuestion(i, -1)} disabled={i === 0} aria-label="Subir pregunta">
                          <Icon name="chevron-right" size={13} style={{ transform: "rotate(-90deg)" }} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => moveSurveyQuestion(i, 1)} disabled={i === surveyQuestions.length - 1} aria-label="Bajar pregunta">
                          <Icon name="chevron-right" size={13} style={{ transform: "rotate(90deg)" }} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeSurveyQuestion(q.id)}><Icon name="trash" size={13} /></button>
                      </div>

                      {(q.type === "choice" || q.type === "checkbox") && (
                        <div style={{ marginTop: 10, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
                          {(q.options ?? []).map((opt, oi) => (
                            <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Icon name={q.type === "choice" ? "circle-half" : "check"} size={13} style={{ color: "var(--text-3)" }} />
                              <input
                                className="input" style={{ maxWidth: 320 }} placeholder={`Opción ${oi + 1}`}
                                value={opt} onChange={(e) => updateOption(q.id, oi, e.target.value)}
                              />
                              <button className="btn btn-ghost btn-sm" onClick={() => removeOption(q.id, oi)} disabled={(q.options?.length ?? 0) <= 2}>
                                <Icon name="x" size={13} />
                              </button>
                            </div>
                          ))}
                          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => addOption(q.id)}>
                            <Icon name="plus" size={13} /> Agregar opción
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={addSurveyQuestion}>
                  <Icon name="plus" size={14} /> Agregar pregunta
                </button>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn btn-primary"
                  onClick={launchSurvey}
                  disabled={!surveyTitle.trim() || !surveyDueDate || !surveyQuestionsValid}
                >
                  <Icon name="zap" size={14} /> Lanzar encuesta
                </button>
              </div>
            </div>
          )}

          <div className="card card-pad">
            <div className="card-title">Encuestas lanzadas</div>
            {state.surveys.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no se lanzó ninguna.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...state.surveys].sort((a, b) => b.launchedAt.localeCompare(a.launchedAt)).map((s) => {
                const responses = state.surveyResponses.filter((r) => r.surveyId === s.id).length;
                const activeUsers = state.users.filter((u) => u.active).length;
                const open = s.dueDate >= today();
                return (
                  <div key={s.id} className="list-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{s.questions.length} preguntas · vence {fmtDate(s.dueDate)}</div>
                    </div>
                    <span className={`badge ${open ? "ok" : ""}`}>{open ? "Abierta" : "Cerrada"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>{responses} / {activeUsers} respondieron</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "feriados" && (
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <div className="card-title">Feriados</div>
          {!isAdmin && (
            <p style={{ fontSize: 12.5, color: "var(--warning)", marginBottom: 10 }}>
              Solo los administradores pueden agregar o eliminar feriados.
            </p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
            Estos feriados se excluyen automáticamente del cálculo de días de vacaciones y de compensación de horas,
            y se muestran en el Calendario corporativo.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.holidays
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((h) => (
                <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, minWidth: 90 }}>{fmtDate(h.date)}</span>
                  <span className="badge acc">{h.type}</span>
                  <span style={{ flex: 1 }}>{h.title}</span>
                  {isAdmin && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteHoliday(h.id, h.title)} title="Eliminar feriado">
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              ))}
            {state.holidays.length === 0 && (
              <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>Todavía no hay feriados cargados.</div>
            )}
          </div>
          {isAdmin && (
            <div className="form-grid" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Fecha</label>
                <input type="date" className="input" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select className="select" value={newHolidayType} onChange={(e) => setNewHolidayType(e.target.value as HolidayType)}>
                  {HOLIDAY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Título</label>
                <input
                  className="input"
                  placeholder="Ej: Día de la Independencia"
                  value={newHolidayTitle}
                  onChange={(e) => setNewHolidayTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHoliday()}
                />
              </div>
            </div>
          )}
          {isAdmin && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={addHoliday} disabled={!newHolidayTitle.trim()}>
                <Icon name="plus" size={14} /> Agregar feriado
              </button>
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
              <TimeEntriesImportPanel />
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
