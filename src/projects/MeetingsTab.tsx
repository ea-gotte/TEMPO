import React, { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, DateField, Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, today } from "../utils";
import { useEnv } from "./env";
import { assignableUsers, type Perms } from "./logic";
import { fileToImage } from "./meetings";
import type { Meeting, MeetingImage } from "./types";
import { useWork, workActions } from "./workStore";

/**
 * Reuniones del proyecto: notas, asistentes e imágenes (pizarra, croquis,
 * capturas). Las puede ver todo el equipo; las crea y edita quien gestiona el proyecto.
 */
export function MeetingsTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Meeting | "new" | null>(null);
  const [lightbox, setLightbox] = useState<{ images: MeetingImage[]; index: number } | null>(null);

  const all = useMemo(() => work.meetings.filter((m) => m.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [work.meetings, projectId]);
  const needle = q.trim().toLowerCase();
  const shown = all.filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.notes.toLowerCase().includes(needle) || m.guests.toLowerCase().includes(needle));
  const userOf = (id: string) => env.users.find((u) => u.id === id);

  return (
    <>
      <div className="pw-toolbar">
        <input className="input" style={{ minWidth: 220 }} placeholder="Buscar en las reuniones…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{shown.length} de {all.length} reuniones</span>
        {perms.canManage && <button className="btn btn-primary" onClick={() => setEdit("new")}><Icon name="plus" size={15} /> Nueva reunión</button>}
      </div>

      {shown.length === 0 && (
        <div className="card card-pad"><Empty icon="message" text={all.length ? "Sin resultados" : "Todavía no hay reuniones"} sub={all.length ? undefined : perms.canManage ? "Registrá la primera con “Nueva reunión”: notas, asistentes e imágenes." : "Cuando se registren, las vas a ver acá."} /></div>
      )}

      {shown.map((m) => {
        const people = m.attendeeIds.map(userOf).filter(Boolean);
        return (
          <div key={m.id} className="card card-pad pw-meeting" onClick={() => setEdit(m)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="pw-plan-chip"><Icon name="calendar-days" size={12} /> {fmtDate(m.date)}</span>
              <strong style={{ fontSize: 14.5 }}>{m.title}</strong>
              <span style={{ flex: 1 }} />
              {m.images.length > 0 && <span className="pw-pill"><Icon name="image" size={11} /> {m.images.length}</span>}
              <span style={{ display: "inline-flex" }}>
                {people.slice(0, 5).map((u, i) => <span key={u!.id} style={{ marginLeft: i ? -6 : 0 }}><Avatar name={u!.name} size={22} /></span>)}
                {people.length > 5 && <span className="pw-pill" style={{ marginLeft: 4 }}>+{people.length - 5}</span>}
              </span>
            </div>
            {m.guests && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Con: {m.guests}</div>}
            {m.notes && <div className="pw-notes-prev">{m.notes}</div>}
            {m.images.length > 0 && (
              <div className="pw-thumbs" onClick={(e) => e.stopPropagation()}>
                {m.images.slice(0, 5).map((im, i) => (
                  <button key={im.id} className="pw-thumb" title={im.name} onClick={() => setLightbox({ images: m.images, index: i })}>
                    <img src={im.src} alt={im.name} />
                    {i === 4 && m.images.length > 5 && <span className="more">+{m.images.length - 4}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {edit && <MeetingModal projectId={projectId} meeting={edit === "new" ? null : edit} canEdit={perms.canManage} onClose={() => setEdit(null)} onOpenImage={(images, index) => setLightbox({ images, index })} />}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} onIndex={(index) => setLightbox({ ...lightbox, index })} />}
    </>
  );
}

function MeetingModal({
  projectId, meeting, canEdit, onClose, onOpenImage,
}: { projectId: string; meeting: Meeting | null; canEdit: boolean; onClose: () => void; onOpenImage: (images: MeetingImage[], index: number) => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const project = env.projects.find((p) => p.id === projectId);
  const { team, others } = assignableUsers(env, project, work.assignments);
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(meeting?.date ?? today());
  const [attendeeIds, setAttendeeIds] = useState<string[]>(meeting?.attendeeIds ?? []);
  const [guests, setGuests] = useState(meeting?.guests ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [images, setImages] = useState<MeetingImage[]>(meeting?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = !meeting;
  const readOnly = !canEdit;

  async function addFiles(files: File[], names?: string[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return setError("Solo se pueden subir imágenes (JPG, PNG, GIF, SVG…).");
    setBusy(true);
    setError("");
    try {
      const done = await Promise.all(imgs.map((f, i) => fileToImage(f, names?.[i])));
      setImages((cur) => [...cur, ...done]);
    } catch {
      setError("No se pudo leer alguna de las imágenes.");
    } finally {
      setBusy(false);
    }
  }

  // Pegar una captura con Ctrl+V mientras el formulario está abierto
  useEffect(() => {
    if (readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files, files.map((_, i) => `Captura pegada ${images.length + i + 1}`));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, images.length]);

  function save() {
    if (!title.trim()) return setError("Poné un título para la reunión.");
    const f = { title: title.trim(), date, attendeeIds, guests: guests.trim(), notes: notes.trim(), images };
    if (meeting) workActions.updateMeeting(meeting.id, f);
    else workActions.addMeeting({ projectId, createdBy: env.me.id, ...f });
    toast(meeting ? "Reunión actualizada." : "Reunión guardada.");
    onClose();
  }

  const people = attendeeIds.map((id) => env.users.find((u) => u.id === id)).filter(Boolean);
  const toggle = (id: string) => setAttendeeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Modal
      title={isNew ? "Nueva reunión" : readOnly ? "Reunión" : "Editar reunión"}
      onClose={onClose}
      footer={
        <>
          {!isNew && !readOnly && (
            confirmDel
              ? <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => { workActions.deleteMeeting(meeting!.id); toast("Reunión eliminada."); onClose(); }}>Confirmar eliminación</button>
              : <button className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => setConfirmDel(true)}>Eliminar</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>{readOnly ? "Cerrar" : "Cancelar"}</button>
          {!readOnly && <button className="btn btn-primary" disabled={busy} onClick={save}>{isNew ? "Guardar reunión" : "Guardar"}</button>}
        </>
      }
    >
      {readOnly ? (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="pw-plan-chip"><Icon name="calendar-days" size={12} /> {fmtDate(date)}</span>
            <strong style={{ fontSize: 15 }}>{title}</strong>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 13 }}>
            {people.map((u) => <span key={u!.id} className="pw-chip-user" style={{ padding: "2px 10px 2px 3px" }}><Avatar name={u!.name} size={20} /> {u!.name}</span>)}
            {guests && <span style={{ color: "var(--text-2)" }}>Con: {guests}</span>}
          </div>
          <div className="pw-notes-full">{notes || <span style={{ color: "var(--text-3)" }}>Sin notas.</span>}</div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <div className="field full"><label>Título</label><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Revisión de avance con el cliente" /></div>
            <div className="field"><label>Fecha</label><DateField value={date} onChange={(iso) => setDate(iso || today())} /></div>
            <div className="field"><label>Otros asistentes <span style={{ fontWeight: 500, color: "var(--text-3)" }}>cliente, terceros</span></label><input className="input" value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="Ej.: M. Herrera (cliente)" /></div>
          </div>
          <div className="field">
            <label>Asistentes del equipo</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[...team, ...others.filter((u) => attendeeIds.includes(u.id))].map((u) => (
                <label key={u.id} className={`chip ${attendeeIds.includes(u.id) ? "on" : ""}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={attendeeIds.includes(u.id)} onChange={() => toggle(u.id)} style={{ display: "none" }} /> {u.name}
                </label>
              ))}
              {team.length === 0 && <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>El proyecto todavía no tiene equipo.</span>}
            </div>
          </div>
          <div className="field">
            <label>Notas</label>
            <textarea className="textarea" rows={9} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={"Qué se habló, acuerdos y pendientes.\nEj.:\nAcuerdos\n- …\n\nPendientes\n- …"} />
          </div>
        </>
      )}

      <div className="field">
        <label>Imágenes {images.length > 0 && <span style={{ fontWeight: 500, color: "var(--text-3)" }}>({images.length})</span>}</label>
        {!readOnly && (
          <div
            className={`pw-drop ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}
          >
            <Icon name="upload" size={16} />
            <span>Arrastrá imágenes acá, <button type="button" className="link" onClick={() => fileRef.current?.click()}>elegilas del equipo</button> o pegá una captura (Ctrl+V)</span>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </div>
        )}
        {busy && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Procesando imágenes…</div>}
        {images.length > 0 && (
          <div className="pw-gallery">
            {images.map((im, i) => (
              <div key={im.id} className="pw-gal-item">
                <button type="button" onClick={() => onOpenImage(images, i)} title={im.name}><img src={im.src} alt={im.name} /></button>
                {!readOnly && <button type="button" className="rm" title="Quitar" aria-label={`Quitar ${im.name}`} onClick={() => setImages((cur) => cur.filter((x) => x.id !== im.id))}><Icon name="x" size={11} /></button>}
              </div>
            ))}
          </div>
        )}
        {images.length === 0 && readOnly && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Sin imágenes.</div>}
        {!readOnly && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>En la demo las imágenes se reducen y se guardan en este navegador (cupo total de unos 5 MB); en la plataforma real irían a un almacenamiento de archivos.</div>}
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}

function Lightbox({ images, index, onClose, onIndex }: { images: MeetingImage[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const im = images[index];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < images.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, images.length, onClose, onIndex]);
  if (!im) return null;
  return (
    <div className="pw-lightbox" onClick={onClose} role="dialog" aria-label={im.name}>
      <button className="pw-lb-close" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
      {index > 0 && <button className="pw-lb-nav l" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} aria-label="Anterior"><Icon name="arrow-left" size={20} /></button>}
      {index < images.length - 1 && <button className="pw-lb-nav r" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} aria-label="Siguiente"><Icon name="arrow-right" size={20} /></button>}
      <img src={im.src} alt={im.name} onClick={(e) => e.stopPropagation()} />
      <div className="pw-lb-cap" onClick={(e) => e.stopPropagation()}>{im.name} · {index + 1} de {images.length}</div>
    </div>
  );
}
