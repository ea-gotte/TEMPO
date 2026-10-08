import React, { useMemo, useState } from "react";
import { Avatar, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { TASK_PRIORITY, TASK_STATUS } from "./constants";
import { useEnv } from "./env";
import { isPlanOverdue, type Perms } from "./logic";
import { FieldValueView } from "./FieldControls";
import { fieldsForProject, hasOptions, selectedOptionIds, valueText } from "./fields";
import { DuePill, Person, PriorityPill, StatusPill, taskDue } from "./parts";
import type { FieldDef, Task, TaskStatus } from "./types";
import { useWork, workActions } from "./workStore";

export interface ViewProps {
  tasks: Task[];
  projectId: string;
  perms: Perms;
  onOpen: (t: Task) => void;
  onNew: (partial: Partial<Task>) => void;
  /** Campos personalizados elegidos para mostrarse como columnas / etiquetas */
  columns: FieldDef[];
  /** Mostrar también los hitos sin tareas (cuando no hay filtros activos) */
  showEmpty?: boolean;
  /** Clic derecho sobre una tarea: menú de opciones */
  onContext?: (e: React.MouseEvent, t: Task) => void;
  /** Mostrar las horas estimadas en las tarjetas (el tablero del sprint las usa; el Kanban de tareas no) */
  showHours?: boolean;
}

/** Archivar / restaurar una tarea ya finalizada. */
function ArchiveBtn({ t, perms }: { t: Task; perms: Perms }) {
  if (!perms.canManage || t.status !== "hecha") return null;
  return (
    <button
      className="btn btn-ghost btn-sm" title={t.archived ? "Restaurar al listado" : "Archivar: se oculta del listado y sigue contando en el avance"}
      aria-label={t.archived ? "Restaurar tarea" : "Archivar tarea"}
      onClick={(e) => { e.stopPropagation(); workActions.archiveTasks([t.id], !t.archived); }}
    >
      <Icon name="archive" size={13} />
    </button>
  );
}

/** Cadena "Hito › Entregable" de una tarea, como etiquetas chicas. */
function Links({ task }: { task: Task }) {
  const work = useWork();
  const ms = work.milestones.find((m) => m.id === task.milestoneId);
  const del = work.deliverables.find((d) => d.id === task.deliverableId);
  if (!ms && !del) return null;
  return (
    <>
      {ms && <span className="pw-tag" title={`Hito: ${ms.name}`}>◆ {ms.name}</span>}
      {del && <span className="pw-tag ghost" title={`Entregable: ${del.name}`}>▣ {del.name}</span>}
    </>
  );
}

/* ====================================================================
 * Tabla
 * ==================================================================== */
type SortKey = "name" | "assignee" | "status" | "priority" | "due" | "hours" | `f:${string}`;

export function TableView({ tasks, perms, onOpen, columns, onContext }: ViewProps) {
  const env = useEnv();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);

  const rows = useMemo(() => {
    const val = (t: Task): string | number => {
      if (sort.key.startsWith("f:")) {
        const d = columns.find((c) => c.id === sort.key.slice(2));
        const v = d ? t.custom[d.id] : null;
        return d?.type === "numero" ? (typeof v === "number" ? v : Infinity) : d ? valueText(d, v).toLowerCase() || "\uffff" : "";
      }
      switch (sort.key) {
        case "hours": return t.estimateHours ?? Infinity;
        case "name": return t.name.toLowerCase();
        case "assignee": return userOf(t.assigneeId)?.name.toLowerCase() ?? "zzz";
        case "status": return TASK_STATUS.findIndex((s) => s.key === t.status);
        case "priority": return -TASK_PRIORITY.findIndex((p) => p.key === t.priority);
        case "due": return t.dueDate ?? "9999";
        default: return "";
      }
    };
    return [...tasks].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sort, env.users, columns]);

  const th = (key: SortKey, label: string) => (
    <th key={key} className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}
      {sort.key === key && <Icon name="chevron-right" size={11} style={{ transform: sort.dir === 1 ? "rotate(-90deg)" : "rotate(90deg)", marginLeft: 4 }} />}
    </th>
  );

  if (rows.length === 0) return <div className="card card-pad"><Empty icon="clipboard" text="Sin tareas" sub="Creá la primera con “Nueva tarea” o ajustá los filtros." /></div>;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            {th("name", "Tarea")}{th("assignee", "Responsable")}{th("status", "Estado")}{th("priority", "Prioridad")}{th("due", "Vence con su hito")}{th("hours", "Horas est.")}
            {columns.map((c) => th(`f:${c.id}`, c.name))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const access = perms.taskAccess(t);
            return (
              <tr key={t.id} style={{ cursor: "pointer", opacity: t.archived ? 0.6 : 1 }} onClick={() => onOpen(t)} onContextMenu={(e) => onContext?.(e, t)}>
                <td style={{ minWidth: 240 }}>
                  <div style={{ fontWeight: 600, textDecoration: t.status === "hecha" ? "line-through" : undefined, color: t.status === "hecha" ? "var(--text-3)" : undefined }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 }}>
                    {t.archived && <span className="pw-pill"><Icon name="archive" size={10} /> Archivada</span>}
                    <Links task={t} />
                  </div>
                </td>
                <td><Person user={userOf(t.assigneeId)} /></td>
                <td onClick={(e) => e.stopPropagation()}>
                  {access === "none" ? (
                    <StatusPill status={t.status} />
                  ) : (
                    <select className="select" style={{ padding: "3px 8px", fontSize: 12.5, minWidth: 120 }} value={t.status} onChange={(e) => workActions.updateTask(t.id, { status: e.target.value as TaskStatus })}>
                      {TASK_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  )}
                </td>
                <td><PriorityPill priority={t.priority} /></td>
                <td>{taskDue(t)}</td>
                <td>{t.estimateHours != null ? `${t.estimateHours} h` : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                {columns.map((c) => <td key={c.id}><FieldValueView def={c} task={t} /></td>)}
                <td style={{ width: 36 }}><ArchiveBtn t={t} perms={perms} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ====================================================================
 * Kanban de tareas por estado (arrastrar y soltar nativo). Lo usan la pestaña
 * Tareas y el tablero del sprint (Backlog y sprints). La programación del
 * proyecto (plazos) se sigue en “Hitos y entregables”.
 * ==================================================================== */
export function KanbanView({ tasks, perms, onOpen, onNew, columns, onContext, showHours }: ViewProps & { groupFieldId?: null }) {
  const env = useEnv();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const dragged = tasks.find((t) => t.id === dragId);
  const canDrop = !!dragged && perms.taskAccess(dragged) !== "none";

  function drop(status: TaskStatus, beforeId: string | null) {
    if (dragId && canDrop) workActions.moveTask(dragId, status, beforeId);
    setDragId(null);
    setOverCol(null);
  }

  return (
    <div className="pw-kanban" style={{ gridTemplateColumns: `repeat(${TASK_STATUS.length}, minmax(240px, 1fr))` }}>
      {TASK_STATUS.map((col) => {
        const items = tasks.filter((t) => t.status === col.key).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div
            key={col.key}
            className={`pw-col ${overCol === col.key && canDrop ? "over" : ""}`}
            onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOverCol(col.key); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
            onDrop={(e) => { e.preventDefault(); drop(col.key, null); }}
          >
            <div className="pw-col-head">
              <span className="pw-dotc" style={{ background: col.color }} /> {col.label} <span className="count">{items.length}</span>
              {perms.canManage && <button className="add" title="Nueva tarea en esta columna" aria-label="Nueva tarea en esta columna" onClick={() => onNew({ status: col.key })}><Icon name="plus" size={14} /></button>}
            </div>
            {items.map((t) => {
              const access = perms.taskAccess(t);
              const u = env.users.find((x) => x.id === t.assigneeId);
              return (
                <div
                  key={t.id}
                  className={`pw-card ${dragId === t.id ? "dragging" : ""} ${access === "none" ? "readonly" : ""}`}
                  draggable={access !== "none"}
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.stopPropagation(); setOverCol(col.key); } }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(col.key, t.id); }}
                  onClick={() => onOpen(t)}
                  onContextMenu={(e) => onContext?.(e, t)}
                >
                  <div className="tags"><Links task={t} /></div>
                  <div className="title">{t.name}</div>
                  {columns.length > 0 && (
                    <div className="tags" style={{ marginBottom: 8 }}>
                      {columns.map((c) => <FieldValueView key={c.id} def={c} task={t} compact />)}
                    </div>
                  )}
                  <div className="meta">
                    <PriorityPill priority={t.priority} />
                    {showHours && t.estimateHours != null && <span className="pw-pill">{t.estimateHours} h</span>}
                    {taskDue(t)}
                    <ArchiveBtn t={t} perms={perms} />
                    <span style={{ marginLeft: "auto" }}>{u ? <Avatar name={u.name} size={22} /> : <span style={{ fontSize: 11, color: "var(--text-3)" }}>—</span>}</span>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12, padding: "14px 0" }}>Soltá una tarea acá</div>}
          </div>
        );
      })}
    </div>
  );
}
