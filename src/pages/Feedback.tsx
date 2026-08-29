import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import type { FeedbackItem, FeedbackStatus, FeedbackType } from "../types";
import { fmtDateTime, uid } from "../utils";
import { Avatar, Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

/**
 * Buzón de ideas: cualquiera reporta un error o una mejora; el registro es
 * público (lo ve todo el mundo). El admin cambia el estado y puede responder
 * — quien lo reportó recibe una notificación cuando eso pasa.
 */

const TYPE_LABELS: Record<FeedbackType, string> = { bug: "Error", mejora: "Mejora" };
const TYPE_BADGE: Record<FeedbackType, string> = { bug: "bad", mejora: "acc" };

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  implementado: "Implementado",
  futuras_versiones: "Futuras versiones",
  rechazado: "Rechazado",
};
const STATUS_BADGE: Record<FeedbackStatus, string> = {
  pendiente: "",
  en_progreso: "acc",
  implementado: "ok",
  futuras_versiones: "warn",
  rechazado: "bad",
};

export function Feedback() {
  const { state } = useStore();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const isAdmin = me.role === "admin";
  const [showNew, setShowNew] = useState(false);
  const [fType, setFType] = useState<FeedbackType | "">("");
  const [fStatus, setFStatus] = useState<FeedbackStatus | "">("");
  const [query, setQuery] = useState("");

  const items = useMemo(
    () =>
      [...state.feedbackItems]
        .filter((f) => {
          if (fType && f.type !== fType) return false;
          if (fStatus && f.status !== fStatus) return false;
          const q = query.trim().toLowerCase();
          if (q && !f.title.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.feedbackItems, fType, fStatus, query],
  );

  const filtersActive = Boolean(fType || fStatus || query);

  return (
    <>
      <div className="page-head">
        <h1>Buzón de ideas</h1>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={15} /> Reportar idea o error
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: -10, marginBottom: 16 }}>
        Registro público: lo ve todo el equipo. Reportá errores o ideas de mejora para la plataforma — el admin
        responde y actualiza el estado de cada una.
      </p>

      <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label>Buscar</label>
            <input className="input" placeholder="Título o descripción…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select className="select" value={fType} onChange={(e) => setFType(e.target.value as FeedbackType | "")}>
              <option value="">Todos</option>
              <option value="bug">Error</option>
              <option value="mejora">Mejora</option>
            </select>
          </div>
          <div className="field">
            <label>Estado</label>
            <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as FeedbackStatus | "")}>
              <option value="">Todos</option>
              {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFType(""); setFStatus(""); setQuery(""); }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card card-pad">
          <Empty icon="lightbulb" text="Sin resultados" sub="Todavía no hay ideas reportadas, o ninguna coincide con los filtros." />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((f) => (
            <FeedbackCard key={f.id} item={f} isAdmin={isAdmin} isOwn={f.userId === me.id} />
          ))}
        </div>
      )}

      {showNew && <NewFeedbackModal onClose={() => setShowNew(false)} />}
    </>
  );
}

function FeedbackCard({ item, isAdmin, isOwn }: { item: FeedbackItem; isAdmin: boolean; isOwn: boolean }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const author = state.users.find((u) => u.id === item.userId);
  const responder = item.respondedBy ? state.users.find((u) => u.id === item.respondedBy) : null;
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [response, setResponse] = useState(item.adminResponse ?? "");
  const [deleting, setDeleting] = useState(false);

  const dirty = status !== item.status || response !== (item.adminResponse ?? "");

  function saveAdmin() {
    const next: FeedbackItem = {
      ...item,
      status,
      adminResponse: response.trim() || undefined,
      respondedBy: state.currentUserId,
      respondedAt: new Date().toISOString(),
    };
    dispatch({ type: "patch", patch: { feedbackItems: state.feedbackItems.map((f) => (f.id === item.id ? next : f)) } });
    dispatch({ type: "audit", action: "Buzón de ideas — respuesta", detail: item.title });
    if (item.userId !== state.currentUserId) {
      dispatch({
        type: "notify",
        n: {
          userId: item.userId,
          kind: "feedback",
          title: "Respuesta a tu idea",
          body: `"${item.title}" ahora está: ${STATUS_LABELS[status]}.`,
        },
      });
    }
    toast("Respuesta guardada.");
  }

  function remove() {
    dispatch({ type: "patch", patch: { feedbackItems: state.feedbackItems.filter((f) => f.id !== item.id) } });
    toast("Idea eliminada.");
    setDeleting(false);
  }

  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <Avatar name={author?.name ?? "?"} size={30} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className={`badge ${TYPE_BADGE[item.type]}`}>{TYPE_LABELS[item.type]}</span>
            <strong style={{ fontSize: 14.5 }}>{item.title}</strong>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
            {author?.name ?? "—"} · {fmtDateTime(item.createdAt)}
          </div>
          <p style={{ fontSize: 13, marginTop: 8, whiteSpace: "pre-wrap" }}>{item.description}</p>
        </div>
        <span className={`badge ${STATUS_BADGE[item.status]}`}>{STATUS_LABELS[item.status]}</span>
        {isOwn && !isAdmin && item.status === "pendiente" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(true)}><Icon name="trash" size={13} /></button>
        )}
      </div>

      {item.adminResponse && !isAdmin && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--r-md)", fontSize: 12.5 }}>
          <strong>Respuesta{responder ? ` de ${responder.name}` : ""}:</strong> {item.adminResponse}
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ width: 180 }}>
            <label>Estado</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
              {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label>Respuesta</label>
            <input className="input" placeholder="Comentario para quien lo reportó…" value={response} onChange={(e) => setResponse(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={saveAdmin} disabled={!dirty}>
            <Icon name="check" size={13} /> Guardar
          </button>
        </div>
      )}

      {deleting && (
        <Modal
          title="Eliminar idea"
          onClose={() => setDeleting(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleting(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={remove}>Sí, eliminar</button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>¿Eliminar "{item.title}"? No se puede deshacer.</p>
        </Modal>
      )}
    </div>
  );
}

function NewFeedbackModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [type, setType] = useState<FeedbackType>("mejora");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function submit() {
    if (!title.trim()) return;
    const item: FeedbackItem = {
      id: uid(),
      userId: state.currentUserId,
      type,
      title: title.trim(),
      description: description.trim(),
      status: "pendiente",
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: "patch", patch: { feedbackItems: [...state.feedbackItems, item] } });
    dispatch({ type: "audit", action: "Buzón de ideas — reporte", detail: item.title });
    toast("¡Gracias! Tu idea quedó registrada.");
    onClose();
  }

  return (
    <Modal
      title="Reportar idea o error"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!title.trim()}>Enviar</button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="field">
          <label>Tipo</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={`btn btn-sm ${type === "mejora" ? "btn-primary" : "btn-secondary"}`} onClick={() => setType("mejora")}>
              <Icon name="lightbulb" size={13} /> Mejora
            </button>
            <button type="button" className={`btn btn-sm ${type === "bug" ? "btn-primary" : "btn-secondary"}`} onClick={() => setType("bug")}>
              <Icon name="alert" size={13} /> Error
            </button>
          </div>
        </div>
        <div className="field">
          <label>Título</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumen corto" autoFocus />
        </div>
        <div className="field">
          <label>Descripción</label>
          <textarea
            className="textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={type === "bug" ? "¿Qué pasó? ¿Cómo se reproduce?" : "¿Qué te gustaría que hiciera la plataforma?"}
          />
        </div>
      </div>
    </Modal>
  );
}
