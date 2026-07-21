import React, { useMemo, useState } from "react";
import { useStore, overlaps, visibleProjects } from "../store";
import type { TimeEntry } from "../types";
import { hmToMin, minToHM, today, uid } from "../utils";
import { Modal, useToast } from "./ui";
import { Icon } from "./Icon";

export function EntryModal({
  initial,
  onClose,
}: {
  initial?: Partial<TimeEntry>;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const isEdit = Boolean(initial?.id);
  const myProjects = visibleProjects(state, state.currentUserId);

  const [projectId, setProjectId] = useState<string>(initial?.projectId ?? myProjects[0]?.id ?? "");
  const [taskId, setTaskId] = useState<string>(initial?.taskId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [start, setStart] = useState(minToHM(initial?.start ?? 9 * 60));
  const [end, setEnd] = useState(minToHM(initial?.end ?? 10 * 60));
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [recurring, setRecurring] = useState<TimeEntry["recurring"]>(initial?.recurring ?? null);

  const project = state.projects.find((p) => p.id === projectId);
  const tasks = project?.tasks ?? [];

  const candidate: TimeEntry = useMemo(
    () => ({
      id: initial?.id ?? uid(),
      userId: initial?.userId ?? state.currentUserId,
      projectId: projectId || null,
      taskId: taskId || null,
      description,
      tagIds,
      date,
      start: hmToMin(start),
      end: hmToMin(end),
      // Facturable se hereda de la configuración del proyecto
      billable: project?.billable ?? false,
      favorite,
      recurring,
    }),
    [initial, state.currentUserId, projectId, taskId, description, tagIds, date, start, end, project, favorite, recurring],
  );

  const conflict = overlaps(state.entries, candidate);
  const invalid = candidate.end <= candidate.start;

  function save() {
    if (invalid) return;
    if (isEdit) {
      dispatch({ type: "updateEntry", entry: candidate });
      toast("Registro actualizado.");
    } else {
      dispatch({ type: "addEntry", entry: candidate });
      toast("Registro creado.");
    }
    onClose();
  }

  return (
    <Modal
      title={isEdit ? "Editar registro" : "Nuevo registro"}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <button
              className="btn btn-danger"
              onClick={() => {
                dispatch({ type: "deleteEntry", id: candidate.id });
                toast("Registro eliminado.");
                onClose();
              }}
            >
              Eliminar
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={invalid}>
            {isEdit ? "Guardar" : "Crear registro"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Descripción</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿En qué trabajaste?" autoFocus />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Proyecto</label>
          <select className="select" value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
            {myProjects.filter((p) => p.status === "activo" || p.id === projectId).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tarea</label>
          <select className="select" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">— Sin tarea —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Fecha</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Etiquetas</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
            {state.tags.map((g) => (
              <button
                key={g.id}
                className={`chip ${tagIds.includes(g.id) ? "on" : ""}`}
                onClick={() => setTagIds((ids) => (ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
              >
                <span className="swatch" style={{ background: g.color, width: 7, height: 7, borderRadius: "50%" }} />
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Hora inicio</label>
          <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>Hora fin</label>
          <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Favorito
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
          Recurrente:
          <select
            className="select"
            style={{ width: "auto", padding: "3px 8px" }}
            value={recurring ?? ""}
            onChange={(e) => setRecurring((e.target.value || null) as TimeEntry["recurring"])}
          >
            <option value="">No</option>
            <option value="diario">Diario</option>
            <option value="semanal">Semanal</option>
          </select>
        </label>
      </div>
      {invalid && <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600 }}>La hora de fin debe ser posterior a la de inicio.</div>}
      {!invalid && conflict.length > 0 && (
        <div style={{ color: "var(--warning)", fontSize: 12.5, fontWeight: 600 }}>
          <Icon name="alert" size={13} /> Se solapa con {conflict.length} registro{conflict.length > 1 ? "s" : ""} existente{conflict.length > 1 ? "s" : ""} (
          {conflict.map((c) => c.description || "sin descripción").join(", ")}).
        </div>
      )}
    </Modal>
  );
}
