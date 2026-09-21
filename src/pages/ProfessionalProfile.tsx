import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type { ProfessionalEntry, ProfessionalProfile as ProfessionalProfileData, Role } from "../types";
import { fmtDate, fmtYearsSince, today, uid } from "../utils";
import { computeSkills } from "../skills";
import { Avatar, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { SurveyModal } from "../components/SurveyModal";
import { MindMap } from "./MindMap";
import { FlightHours } from "./FlightHours";
import { OrgChart } from "./OrgChart";
import { supabase } from "../supabase";

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
            {state.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
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

const CERT_BUCKET = "certificados";
// PENDIENTE: la subida directa de PDF a Supabase Storage está construida pero
// apagada. Para activarla hay que correr sql/…phase24 (límite de 2 MB en el
// bucket) y decidir si se mantiene junto al enlace de OneDrive.
const PDF_UPLOAD_ENABLED: boolean = false;
// Límites pensados para el plan gratuito de Supabase (1 GB de Storage en total):
// 2 MB por PDF alcanza para un certificado digital o un escaneo comprimido, y
// 15 MB por persona (≈ 7 escaneos o decenas de certificados digitales) evita que
// alguien solo se coma el cupo de todos. El de 2 MB también lo exige el bucket.
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PER_PERSON_BYTES = 15 * 1024 * 1024;

/** Devuelve la URL normalizada si es http(s); null si no es un enlace válido.
 * Evita guardar/renderizar esquemas como javascript: en un href. */
function safeHttpUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Instrucciones para adjuntar un certificado mediante enlace (mientras no haya subida automática). */
function LinkHowTo() {
  return (
    <div style={{ fontSize: 12, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
      <strong>Cómo adjuntar un certificado</strong>
      <ol style={{ margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
        <li>Subí el PDF a la carpeta llamada “Certificados-Personales” de OneDrive.</li>
        <li>Clic derecho, luego Compartir, luego Copiar vínculo, y elegí “Cualquier persona”.</li>
        <li>Pegalo en “Vincular enlace”.</li>
      </ol>
    </div>
  );
}

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
}

function FormacionTab({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { state, dispatch } = useStore();
  // Las subidas de PDF terminan de forma asíncrona: siempre se parte del estado
  // más reciente (no del de cuando arrancó la subida) para no pisar lo que la
  // persona haya escrito mientras tanto.
  const latest = useRef(state);
  latest.current = state;
  const profile = state.professionalProfiles.find((p) => p.id === userId) ?? EMPTY_PROFILE(userId);
  const usedBytes = [...profile.education, ...profile.courses].reduce((sum, e) => sum + (e.fileSize ?? 0), 0);

  function current(): ProfessionalProfileData {
    return latest.current.professionalProfiles.find((p) => p.id === userId) ?? EMPTY_PROFILE(userId);
  }

  function save(next: ProfessionalProfileData) {
    const all = latest.current.professionalProfiles;
    const exists = all.some((p) => p.id === userId);
    dispatch({
      type: "patch",
      patch: { professionalProfiles: exists ? all.map((p) => (p.id === userId ? next : p)) : [...all, next] },
    });
  }

  function addEntry(list: "education" | "courses") {
    const cur = current();
    const entry: ProfessionalEntry = { id: uid(), title: "" };
    save({ ...cur, [list]: [...cur[list], entry] });
  }

  function updateEntry(list: "education" | "courses", id: string, patch: Partial<ProfessionalEntry>) {
    const cur = current();
    save({ ...cur, [list]: cur[list].map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }

  function removeEntry(list: "education" | "courses", id: string) {
    const cur = current();
    const gone = cur[list].find((e) => e.id === id);
    if (gone?.filePath) void supabase.storage.from(CERT_BUCKET).remove([gone.filePath]);
    save({ ...cur, [list]: cur[list].filter((e) => e.id !== id) });
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
        userId={userId} usedBytes={usedBytes} entries={profile.education} canEdit={canEdit} label="Formación profesional" addLabel="Agregar formación"
        onAdd={() => addEntry("education")}
        onUpdate={(id, patch) => updateEntry("education", id, patch)}
        onRemove={(id) => removeEntry("education", id)}
      />
      <EntryList
        userId={userId} usedBytes={usedBytes} entries={profile.courses} canEdit={canEdit} label="Formación complementaria (cursos)" addLabel="Agregar curso"
        onAdd={() => addEntry("courses")}
        onUpdate={(id, patch) => updateEntry("courses", id, patch)}
        onRemove={(id) => removeEntry("courses", id)}
      />
      {canEdit && (
        <div style={{ marginBottom: 8 }}><LinkHowTo /></div>
      )}
      {canEdit && PDF_UPLOAD_ENABLED && (
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: -4 }}>
          Certificados en PDF adjuntos: {fmtMB(usedBytes)} de {fmtMB(MAX_PER_PERSON_BYTES)} · máximo {fmtMB(MAX_PDF_BYTES)} por archivo.
        </p>
      )}
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

/** Año válido para ordenar; cualquier otra cosa se considera "sin año". */
function validYear(y: number | undefined): y is number {
  return typeof y === "number" && y >= 1900 && y <= 2100;
}

function EntryList({
  userId, usedBytes, entries, canEdit, label, addLabel, onAdd, onUpdate, onRemove,
}: {
  userId: string;
  usedBytes: number;
  entries: ProfessionalEntry[];
  canEdit: boolean;
  label: string;
  addLabel: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ProfessionalEntry>) => void;
  onRemove: (id: string) => void;
}) {
  // Orden cronológico automático por año. Lo que todavía no tiene año queda al
  // final (así una fila recién agregada no salta de lugar mientras se completa).
  const [newestFirst, setNewestFirst] = useState(true);
  const sorted = useMemo(() => {
    const withIdx = entries.map((e, i) => ({ e, i }));
    withIdx.sort((a, b) => {
      const ya = validYear(a.e.year), yb = validYear(b.e.year);
      if (ya && yb && a.e.year !== b.e.year) return newestFirst ? b.e.year! - a.e.year! : a.e.year! - b.e.year!;
      if (ya !== yb) return ya ? -1 : 1;
      return a.i - b.i;
    });
    return withIdx.map((x) => x.e);
  }, [entries, newestFirst]);

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div className="card-title" style={{ margin: 0 }}>{label}</div>
        <span className="spacer" />
        {entries.length > 1 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setNewestFirst((v) => !v)}
            title="Las filas se ordenan solas por año; acá se elige el sentido"
          >
            <Icon name="clock" size={13} /> {newestFirst ? "Más recientes primero" : "Más antiguos primero"}
          </button>
        )}
      </div>
      {entries.length === 0 && <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no hay nada cargado.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((e) => (
          <EntryRow key={e.id} userId={userId} usedBytes={usedBytes} entry={e} canEdit={canEdit} onUpdate={onUpdate} onRemove={onRemove} />
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

function EntryRow({
  userId, usedBytes, entry: e, canEdit, onUpdate, onRemove,
}: {
  userId: string;
  usedBytes: number;
  entry: ProfessionalEntry;
  canEdit: boolean;
  onUpdate: (id: string, patch: Partial<ProfessionalEntry>) => void;
  onRemove: (id: string) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // El año se confirma al salir del campo (no en cada tecla): si no, al escribir
  // "2019" la fila saltaría de lugar con el "2" y se perdería el foco.
  const [yearDraft, setYearDraft] = useState(e.year != null ? String(e.year) : "");
  useEffect(() => setYearDraft(e.year != null ? String(e.year) : ""), [e.year]);

  function commitYear() {
    const raw = yearDraft.trim();
    if (raw === "") {
      if (e.year != null) onUpdate(e.id, { year: undefined });
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) {
      toast("Ingresá un año válido (por ejemplo 2019).");
      setYearDraft(e.year != null ? String(e.year) : "");
      return;
    }
    if (n !== e.year) onUpdate(e.id, { year: n });
  }

  async function onPickFile(list: FileList | null) {
    const f = list?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast("El certificado debe ser un archivo PDF.");
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      toast(`El PDF pesa ${fmtMB(f.size)} y el máximo es ${fmtMB(MAX_PDF_BYTES)}. Probá comprimirlo (por ejemplo con iLovePDF) o escanearlo en menor resolución.`);
      return;
    }
    // Si se está reemplazando un PDF, el anterior libera su lugar en el cupo.
    if (usedBytes - (e.fileSize ?? 0) + f.size > MAX_PER_PERSON_BYTES) {
      toast(`Se superaría el cupo de ${fmtMB(MAX_PER_PERSON_BYTES)} de certificados por persona (ya hay ${fmtMB(usedBytes)}). Quitá o reemplazá algún PDF más pesado.`);
      return;
    }
    setBusy(true);
    const path = `${userId}/${e.id}-${Date.now()}.pdf`;
    const { error } = await supabase.storage.from(CERT_BUCKET).upload(path, f, { contentType: "application/pdf" });
    if (error) {
      setBusy(false);
      toast(`No se pudo subir el PDF: ${error.message}`);
      return;
    }
    const oldPath = e.filePath;
    onUpdate(e.id, { filePath: path, fileName: f.name, fileSize: f.size });
    if (oldPath) void supabase.storage.from(CERT_BUCKET).remove([oldPath]);
    setBusy(false);
    toast("Certificado adjuntado.");
  }

  async function openFile() {
    if (!e.filePath) return;
    // Se abre la pestaña de inmediato (dentro del clic) para que el navegador no
    // la bloquee como ventana emergente, y después se le carga el enlace firmado.
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(CERT_BUCKET).createSignedUrl(e.filePath, 120);
    if (error || !data?.signedUrl) {
      w?.close();
      toast("No se pudo abrir el PDF. Puede que ya no exista o que no tengas acceso.");
      return;
    }
    if (w) w.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  function detachFile() {
    if (!e.filePath) return;
    void supabase.storage.from(CERT_BUCKET).remove([e.filePath]);
    onUpdate(e.id, { filePath: undefined, fileName: undefined, fileSize: undefined });
  }

  // Enlace externo (OneDrive / SharePoint): se guarda en fileUrl, el mismo campo
  // que usan los enlaces importados, y se confirma al salir del campo o con Enter.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState(e.fileUrl ?? "");
  const linkCancelled = useRef(false);

  function openLinkEditor() {
    linkCancelled.current = false;
    setLinkDraft(e.fileUrl ?? "");
    setLinkOpen(true);
  }

  function commitLink() {
    if (linkCancelled.current) return;
    const raw = linkDraft.trim();
    if (raw === "") {
      if (e.fileUrl) onUpdate(e.id, { fileUrl: undefined });
      setLinkOpen(false);
      return;
    }
    const url = safeHttpUrl(raw);
    if (!url) {
      toast("El enlace no es válido. Pegá la dirección completa (empieza con https://).");
      return;
    }
    if (url !== e.fileUrl) onUpdate(e.id, { fileUrl: url });
    setLinkOpen(false);
  }

  const linkHref = e.fileUrl ? safeHttpUrl(e.fileUrl) : null;
  const shownName = e.fileName ? (e.fileName.length > 22 ? `${e.fileName.slice(0, 20)}…` : e.fileName) : "Certificado (PDF)";

  return (
    <div>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
        value={yearDraft} disabled={!canEdit}
        onChange={(ev) => setYearDraft(ev.target.value)}
        onBlur={commitYear}
        onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
      />
      {linkHref && (
        <a href={linkHref} target="_blank" rel="noreferrer" className="badge acc" title={linkHref}>
          <Icon name="paperclip" size={11} /> Ver archivo
        </a>
      )}
      {e.filePath && (
        <button className="badge acc" style={{ cursor: "pointer", border: 0 }} onClick={openFile} title={e.fileName ?? "Certificado (PDF)"}>
          <Icon name="paperclip" size={11} /> {shownName}
        </button>
      )}
      {canEdit && (
        <>
          {PDF_UPLOAD_ENABLED && (
            <>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(ev) => onPickFile(ev.target.files)} />
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()} title={`Adjuntar el certificado en PDF (máx. ${fmtMB(MAX_PDF_BYTES)})`}>
            <Icon name="upload" size={13} /> {busy ? "Subiendo…" : e.filePath ? "Reemplazar PDF" : "Adjuntar PDF"}
          </button>
          {e.filePath && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={detachFile} title="Quitar el PDF adjunto">
              <Icon name="cross" size={13} />
            </button>
          )}
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={openLinkEditor} title="Vincular el certificado con un enlace de OneDrive o SharePoint">
            <Icon name="share-2" size={13} /> {e.fileUrl ? "Editar enlace" : "Vincular enlace"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(e.id)} title="Eliminar esta fila"><Icon name="trash" size={13} /></button>
        </>
      )}
    </div>
    {canEdit && linkOpen && (
      <div style={{ marginTop: 6 }}>
        <input
          className="input" autoFocus style={{ width: "100%" }}
          placeholder="Pegá el enlace de OneDrive / SharePoint (dejalo vacío para quitarlo)"
          value={linkDraft}
          onChange={(ev) => setLinkDraft(ev.target.value)}
          onBlur={commitLink}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
            if (ev.key === "Escape") { linkCancelled.current = true; setLinkOpen(false); }
          }}
        />
        <div style={{ marginTop: 6 }}><LinkHowTo /></div>
      </div>
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
