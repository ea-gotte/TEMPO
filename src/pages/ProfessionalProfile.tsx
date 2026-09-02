import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import type { ProfessionalEntry, ProfessionalProfile as ProfessionalProfileData, Role } from "../types";
import { fmtDate, fmtYearsSince, today, uid } from "../utils";
import { computeSkills } from "../skills";
import { Avatar } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { SurveyModal } from "../components/SurveyModal";
import { MindMap } from "./MindMap";
import { FlightHours } from "./FlightHours";
import { OrgChart } from "./OrgChart";

const ROLE_LABELS: Record<Role, string> = { admin: "Administrador", gerente: "Gerente", supervisor: "Supervisor", usuario: "Usuario" };

const EMPTY_PROFILE = (userId: string): ProfessionalProfileData => ({
  id: userId, workExperienceSince: null, bimExperienceSince: null, education: [], courses: [],
});

export function ProfessionalProfile() {
  const { state } = useStore();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  // Mismo criterio que Reportes: usuario y supervisor solo ven lo propio;
  // admin/gerente pueden elegir a cualquier persona. Equipo España también
  // puede elegir a cualquiera (ver perfiles de terceros es justamente su
  // acceso), pero nunca edita — ni el propio ni el de nadie más.
  const isEmployee = me.role === "usuario" || me.role === "supervisor";
  const isEspana = me.team === "espana";
  const canPickOthers = !isEmployee || isEspana;
  const [userId, setUserId] = useState(me.id);
  const effectiveUserId = canPickOthers ? userId : me.id;
  const canEdit = !isEspana && (effectiveUserId === me.id || !isEmployee);

  const [tab, setTab] = useState<"formacion" | "habilidades" | "horasvuelo" | "mapa" | "organigrama">("formacion");
  const person = state.users.find((u) => u.id === effectiveUserId) ?? me;
  const supervisor = state.users.find((u) => u.id === person.supervisorId);

  return (
    <>
      <div className="page-head">
        <h1>Perfil profesional</h1>
        <span className="spacer" />
        {canPickOthers && (
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ maxWidth: 220 }}>
            {state.users.filter((u) => u.active).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === "formacion" ? "active" : ""} onClick={() => setTab("formacion")}>Formación</button>
        <button className={tab === "habilidades" ? "active" : ""} onClick={() => setTab("habilidades")}>Habilidades</button>
        <button className={tab === "horasvuelo" ? "active" : ""} onClick={() => setTab("horasvuelo")}>Horas de vuelo</button>
        <button className={tab === "mapa" ? "active" : ""} onClick={() => setTab("mapa")}>Mapa mental</button>
        <button className={tab === "organigrama" ? "active" : ""} onClick={() => setTab("organigrama")}>Organigrama</button>
      </div>

      {/* Identidad de la persona, fija arriba de las sub-pestañas para no perder de vista a quién se está viendo */}
      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Avatar name={person.name} size={44} online={person.online} />
        <div style={{ minWidth: 160 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{person.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{person.email}</div>
        </div>
        <span className="badge acc">{ROLE_LABELS[person.role]}</span>
        {supervisor && (
          <span style={{ fontSize: 12.5, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="users" size={13} /> Reporta a {supervisor.name}
          </span>
        )}
      </div>

      {tab === "formacion" && <FormacionTab userId={effectiveUserId} canEdit={canEdit} />}
      {tab === "habilidades" && <HabilidadesTab userId={effectiveUserId} isSelf={effectiveUserId === me.id} />}
      {tab === "horasvuelo" && <FlightHours userId={effectiveUserId} />}
      {tab === "mapa" && <MindMap userId={effectiveUserId} />}
      {tab === "organigrama" && <OrgChart meId={effectiveUserId} />}
    </>
  );
}

function FormacionTab({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { state, dispatch } = useStore();
  const profile = state.professionalProfiles.find((p) => p.id === userId) ?? EMPTY_PROFILE(userId);

  function save(next: ProfessionalProfileData) {
    const exists = state.professionalProfiles.some((p) => p.id === userId);
    dispatch({
      type: "patch",
      patch: {
        professionalProfiles: exists
          ? state.professionalProfiles.map((p) => (p.id === userId ? next : p))
          : [...state.professionalProfiles, next],
      },
    });
  }

  function addEntry(list: "education" | "courses") {
    const entry: ProfessionalEntry = { id: uid(), title: "" };
    save({ ...profile, [list]: [...profile[list], entry] });
  }

  function updateEntry(list: "education" | "courses", id: string, patch: Partial<ProfessionalEntry>) {
    save({ ...profile, [list]: profile[list].map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }

  function removeEntry(list: "education" | "courses", id: string) {
    save({ ...profile, [list]: profile[list].filter((e) => e.id !== id) });
  }

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="card-title">Experiencia</div>
        <ExperienceRow
          icon="briefcase" label="Experiencia laboral" since={profile.workExperienceSince} canEdit={canEdit}
          onChange={(v) => save({ ...profile, workExperienceSince: v })}
        />
        <hr style={{ border: "0.5px solid var(--border)", margin: "10px 0" }} />
        <ExperienceRow
          icon="hard-hat" label="Experiencia en BIM" since={profile.bimExperienceSince} canEdit={canEdit}
          onChange={(v) => save({ ...profile, bimExperienceSince: v })}
        />
      </div>

      <EntryList
        entries={profile.education} canEdit={canEdit} label="Formación profesional" addLabel="Agregar formación"
        onAdd={() => addEntry("education")}
        onUpdate={(id, patch) => updateEntry("education", id, patch)}
        onRemove={(id) => removeEntry("education", id)}
      />
      <EntryList
        entries={profile.courses} canEdit={canEdit} label="Formación complementaria (cursos)" addLabel="Agregar curso"
        onAdd={() => addEntry("courses")}
        onUpdate={(id, patch) => updateEntry("courses", id, patch)}
        onRemove={(id) => removeEntry("courses", id)}
      />
    </>
  );
}

function ExperienceRow({
  icon, label, since, canEdit, onChange,
}: {
  icon: IconName;
  label: string;
  since: string | null;
  canEdit: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "6px 0" }}>
      <span style={{ color: "var(--accent)" }}><Icon name={icon} size={17} /></span>
      <div style={{ flex: "1 1 160px" }}>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{since ? fmtYearsSince(since) : "Sin definir"}</div>
      </div>
      {canEdit && (
        <div className="field" style={{ gap: 3 }}>
          <label style={{ fontSize: 11 }}>Desde</label>
          <input type="date" className="input" max={today()} value={since ?? ""} onChange={(e) => onChange(e.target.value || null)} />
        </div>
      )}
    </div>
  );
}

function EntryList({
  entries, canEdit, label, addLabel, onAdd, onUpdate, onRemove,
}: {
  entries: ProfessionalEntry[];
  canEdit: boolean;
  label: string;
  addLabel: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ProfessionalEntry>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div className="card-title">{label}</div>
      {entries.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no hay nada cargado.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input" style={{ flex: "2 1 200px" }} placeholder="Título / nombre"
              value={e.title} disabled={!canEdit}
              onChange={(ev) => onUpdate(e.id, { title: ev.target.value })}
            />
            <input
              className="input" style={{ flex: "1 1 160px" }} placeholder="Institución"
              value={e.institution ?? ""} disabled={!canEdit}
              onChange={(ev) => onUpdate(e.id, { institution: ev.target.value })}
            />
            <input
              type="number" className="input" style={{ width: 100 }} placeholder="Año"
              value={e.year ?? ""} disabled={!canEdit}
              onChange={(ev) => onUpdate(e.id, { year: ev.target.value ? Number(ev.target.value) : undefined })}
            />
            {e.fileUrl && (
              <a href={e.fileUrl} target="_blank" rel="noreferrer" className="badge acc" title={e.fileUrl}>
                <Icon name="paperclip" size={11} /> Ver archivo
              </a>
            )}
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => onRemove(e.id)}><Icon name="trash" size={13} /></button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={onAdd}>
          <Icon name="plus" size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
}

function HabilidadesTab({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { state } = useStore();
  const skills = useMemo(() => computeSkills(state, userId), [state, userId]);
  const [answering, setAnswering] = useState<string | null>(null);

  const pendingSurvey = useMemo(
    () =>
      state.surveys
        .filter((s) => s.dueDate >= today() && !state.surveyResponses.some((r) => r.surveyId === s.id && r.userId === userId))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0],
    [state.surveys, state.surveyResponses, userId],
  );
  const survey = state.surveys.find((s) => s.id === answering);

  return (
    <>
      {pendingSurvey && (
        <div className="card card-pad" style={{ marginBottom: 14, borderColor: "var(--accent)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Icon name="clipboard" size={18} style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{isSelf ? "Tenés una encuesta pendiente" : "Todavía no respondió la encuesta abierta"}</strong>
            <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{pendingSurvey.title} · vence el {fmtDate(pendingSurvey.dueDate)}</div>
          </div>
          {isSelf && <button className="btn btn-primary btn-sm" onClick={() => setAnswering(pendingSurvey.id)}>Responder</button>}
        </div>
      )}

      <div className="card card-pad">
        <div className="card-title">Habilidades — autopercepción por encuesta</div>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
          Se alimenta de las respuestas a las encuestas, no de la experiencia real de proyectos (eso está en Horas de
          vuelo). Se muestra la respuesta más reciente para cada pregunta que se le hizo alguna vez.
        </p>
        {skills.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no respondió ninguna encuesta.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {skills.map((s) => (
              <div key={s.label} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{s.surveyTitle} · {fmtDate(s.submittedAt.slice(0, 10))}</div>
                </div>
                <strong>
                  {s.type === "rating5" ? `${s.value} / 5` : s.type === "yesno" ? (s.value === "si" ? "Sí" : "No") : s.value}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {survey && <SurveyModal survey={survey} onClose={() => setAnswering(null)} />}
    </>
  );
}
