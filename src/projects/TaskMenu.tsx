import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { TASK_STATUS } from "./constants";
import { useEnv } from "./env";
import type { Perms } from "./logic";
import type { Task } from "./types";
import { useWork, workActions } from "./workStore";

/**
 * Menú de clic derecho sobre una tarea: editar, duplicar, asignarme, cambiar el
 * estado, mover a otro hito, archivar y eliminar. Lo que se ofrece depende del
 * permiso sobre esa tarea (quien solo puede actualizar la suya ve solo el estado).
 */
export function useTaskMenu({ perms, onEdit }: { perms: Perms; onEdit: (t: Task) => void }) {
  const [at, setAt] = useState<{ x: number; y: number; task: Task } | null>(null);
  const open = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();
    setAt({ x: e.clientX, y: e.clientY, task });
  };
  const element = at ? <TaskMenu key={at.task.id + at.x + at.y} at={at} perms={perms} onEdit={onEdit} onClose={() => setAt(null)} /> : null;
  return { open, element };
}

function TaskMenu({ at, perms, onEdit, onClose }: { at: { x: number; y: number; task: Task }; perms: Perms; onEdit: (t: Task) => void; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });

  // La tarea puede haber cambiado desde que se abrió el menú: se lee la vigente
  const t = work.tasks.find((x) => x.id === at.task.id) ?? at.task;
  const access = perms.taskAccess(t);
  const milestones = work.milestones.filter((m) => m.projectId === t.projectId).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));

  // Que no se salga de la pantalla
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at.x, at.y]);

  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", key); };
  }, [onClose]);

  const run = (fn: () => void) => () => { fn(); onClose(); };

  function duplicate() {
    workActions.addTask({
      projectId: t.projectId, name: `${t.name} (copia)`, description: t.description, assigneeId: t.assigneeId, status: "pendiente", priority: t.priority,
      startDate: null, dueDate: null, milestoneId: t.milestoneId, deliverableId: t.deliverableId, createdBy: env.me.id,
      kind: t.kind, estimateHours: t.estimateHours, estimateMin: t.estimateMin, estimateMax: t.estimateMax, confidence: t.confidence, custom: { ...t.custom },
    });
    toast("Tarea duplicada.");
  }

  const item = (label: React.ReactNode, onClick: () => void, opts: { checked?: boolean; danger?: boolean; disabled?: boolean; title?: string; icon?: React.ComponentProps<typeof Icon>["name"] } = {}) => (
    <button key={String(label) + (opts.checked ? "*" : "")} role="menuitem" className={`pw-ctx-item ${opts.danger ? "danger" : ""}`} disabled={opts.disabled} title={opts.title} onClick={run(onClick)}>
      <span className="ic">{opts.checked ? <Icon name="check" size={13} strokeWidth={3} /> : opts.icon ? <Icon name={opts.icon} size={13} /> : null}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <div className="pw-ctx-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={ref} className="pw-ctx" role="menu" style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
        <div className="pw-ctx-title" title={t.name}>{t.name}</div>
        {item(access === "full" ? "Editar…" : access === "status" ? "Actualizar…" : "Ver detalle", () => onEdit(t), { icon: access === "none" ? "eye" : "pencil" })}
        {access === "full" && item("Duplicar", duplicate, { icon: "copy" })}
        {access === "full" && t.assigneeId !== env.me.id && item("Asignarme", () => { workActions.updateTask(t.id, { assigneeId: env.me.id }); toast("Tarea asignada a vos."); }, { icon: "user" })}

        {access !== "none" && (
          <>
            <div className="pw-ctx-sep" />
            <div className="pw-ctx-head">Estado</div>
            {TASK_STATUS.map((s) => item(s.label, () => workActions.updateTask(t.id, { status: s.key }), { checked: t.status === s.key }))}
          </>
        )}

        {access === "full" && milestones.length > 1 && (
          <>
            <div className="pw-ctx-sep" />
            <div className="pw-ctx-head">Mover al hito</div>
            {milestones.map((m) => item(`◆ ${m.name}`, () => {
              // Al cambiar de hito, el entregable deja de valer (era de otro hito)
              workActions.updateTask(t.id, { milestoneId: m.id, deliverableId: null });
              toast(`Tarea movida a “${m.name}”.`);
            }, { checked: t.milestoneId === m.id && !t.deliverableId }))}
          </>
        )}

        {access === "full" && (
          <>
            <div className="pw-ctx-sep" />
            {t.archived
              ? item("Restaurar", () => { workActions.archiveTasks([t.id], false); toast("Tarea restaurada."); }, { icon: "archive" })
              : item("Archivar", () => { workActions.archiveTasks([t.id], true); toast("Tarea archivada."); }, { icon: "archive", disabled: t.status !== "hecha", title: t.status !== "hecha" ? "Solo se archivan tareas ya hechas" : undefined })}
            {item("Eliminar…", () => {
              if (window.confirm(`¿Eliminar la tarea “${t.name}”? No se puede deshacer.`)) { workActions.deleteTask(t.id); toast("Tarea eliminada."); }
            }, { danger: true, icon: "trash" })}
          </>
        )}
      </div>
    </>
  );
}
