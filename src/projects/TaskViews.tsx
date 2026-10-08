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

export function TableView({ tasks, perms, onOpen, columns }: ViewProps) {
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
              <tr key={t.id} style={{ cursor: "pointer", opacity: t.archived ? 0.6 : 1 }} onClick={() => onOpen(t)}>
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
 * Lista (agrupable)
 * ==================================================================== */
type GroupBy = "status" | "assignee" | "milestone" | `f:${string}`;

export function ListView({ tasks, projectId, perms, onOpen, onNew, columns, showEmpty }: ViewProps) {
  const env = useEnv();
  const work = useWork();
  // Las tareas cuelgan de hitos: por defecto se ven agrupadas por hito
  const [groupBy, setGroupBy] = useState<GroupBy>("milestone");
  const groupable = fieldsForProject(work.fields, projectId).filter((d) => hasOptions(d.type));

  const groups = useMemo(() => {
    const list: { key: string; label: React.ReactNode; tasks: Task[]; newDefaults: Partial<Task> }[] = [];
    if (groupBy === "status") {
      for (const s of TASK_STATUS) list.push({ key: s.key, label: <><span className="pw-dotc" style={{ background: s.color }} /> {s.label}</>, tasks: tasks.filter((t) => t.status === s.key), newDefaults: { status: s.key } });
    } else if (groupBy === "assignee") {
      const ids = Array.from(new Set(tasks.map((t) => t.assigneeId)));
      for (const id of ids) {
        const u = env.users.find((x) => x.id === id);
        list.push({ key: id ?? "none", label: u ? <><Avatar name={u.name} size={18} /> {u.name}</> : "Sin asignar", tasks: tasks.filter((t) => t.assigneeId === id), newDefaults: { assigneeId: id } });
      }
      list.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : String(a.tasks[0] && env.users.find((u) => u.id === a.key)?.name).localeCompare(String(env.users.find((u) => u.id === b.key)?.name))));
    } else if (groupBy.startsWith("f:")) {
      const d = groupable.find((x) => x.id === groupBy.slice(2));
      if (d) {
        for (const o of d.options) {
          list.push({
            key: o.id, label: <><span className="pw-dotc" style={{ background: o.color }} /> {o.label}</>,
            tasks: tasks.filter((t) => selectedOptionIds(t, d).includes(o.id)),
            newDefaults: { custom: { [d.id]: d.type === "multiple" ? [o.id] : o.id } },
          });
        }
        list.push({ key: "none", label: "Sin valor", tasks: tasks.filter((t) => selectedOptionIds(t, d).length === 0), newDefaults: {} });
      }
    } else {
      for (const m of work.milestones.filter((x) => x.projectId === projectId && (showEmpty || tasks.some((t) => t.milestoneId === x.id))).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))) {
        list.push({
          key: m.id,
          label: <>◆ {m.name} <DuePill date={m.dueDate} done={m.status === "cumplido"} />{isPlanOverdue(m) && <span style={{ color: "var(--danger)", fontSize: 11.5, fontWeight: 650 }}>hito atrasado</span>}</>,
          tasks: tasks.filter((t) => t.milestoneId === m.id), newDefaults: { milestoneId: m.id },
        });
      }
      list.push({ key: "none", label: "Sin hito · asignalas a uno", tasks: tasks.filter((t) => !t.milestoneId || !work.milestones.some((m) => m.id === t.milestoneId)), newDefaults: {} });
    }
    return list.filter((g) => g.tasks.length > 0 || groupBy === "status" || (groupBy === "milestone" && g.key !== "none"));
  }, [tasks, groupBy, env.users, work.milestones, groupable, projectId, showEmpty]);

  // Un hito sin tareas visibles puede tener todas sus tareas archivadas: se avisa para que no parezca vacío
  const emptyMilestoneText = (milestoneId: string) => {
    const hidden = work.tasks.filter((t) => t.milestoneId === milestoneId && t.archived && !tasks.some((x) => x.id === t.id)).length;
    return hidden > 0 ? `Sin tareas a la vista: ${hidden} archivada${hidden > 1 ? "s" : ""} (activá “Ver archivadas” para verlas).` : "Sin tareas en este hito todavía.";
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "var(--text-2)" }}>
        Agrupar por
        <select className="select" style={{ width: "auto" }} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          <option value="milestone">Hito</option>
          <option value="status">Estado</option>
          <option value="assignee">Responsable</option>
          {groupable.map((d) => <option key={d.id} value={`f:${d.id}`}>{d.name}</option>)}
        </select>
      </div>
      {tasks.length === 0 ? (
        <div className="card card-pad"><Empty icon="clipboard" text="Sin tareas" sub="Creá la primera con “Nueva tarea” o ajustá los filtros." /></div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div className="pw-group-head">
                {g.label} <span className="count">{g.tasks.length}</span>
                {perms.canManage && (
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => onNew(g.newDefaults)}>
                    <Icon name="plus" size={12} />
                  </button>
                )}
              </div>
              {g.tasks.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-3)", fontSize: 12.5, borderTop: "1px solid var(--border)" }}>{groupBy === "milestone" ? emptyMilestoneText(g.key) : "Sin tareas en este estado."}</div>}
              {g.tasks.map((t) => {
                const access = perms.taskAccess(t);
                const done = t.status === "hecha";
                return (
                  <div key={t.id} className={`pw-task-row ${done ? "done" : ""} ${t.archived ? "archived" : ""}`} onClick={() => onOpen(t)}>
                    <button
                      className={`pw-check ${done ? "on" : ""}`}
                      disabled={access === "none"}
                      title={access === "none" ? "Solo lectura" : done ? "Reabrir" : "Marcar como hecha"}
                      onClick={(e) => { e.stopPropagation(); workActions.updateTask(t.id, { status: done ? "pendiente" : "hecha" }); }}
                      style={access === "none" ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    >
                      {done && <Icon name="check" size={11} strokeWidth={3} />}
                    </button>
                    <span className="name">{t.name}</span>
                    {t.archived && <span className="pw-pill"><Icon name="archive" size={10} /> Archivada</span>}
                    <span style={{ display: "flex", gap: 5 }}><Links task={t} /></span>
                    {columns.map((c) => <FieldValueView key={c.id} def={c} task={t} compact />)}
                    <PriorityPill priority={t.priority} />
                    <Person user={env.users.find((u) => u.id === t.assigneeId)} size={18} />
                    <span style={{ width: 80, textAlign: "right" }}>{taskDue(t)}</span>
                    <span style={{ width: 30 }}><ArchiveBtn t={t} perms={perms} /></span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ====================================================================
 * Tablero de tareas por estado (arrastrar y soltar nativo). Solo lo usa el
 * tablero del sprint (Backlog y sprints); el seguimiento de la programación
 * del proyecto está en el Kanban de “Hitos y entregables”.
 * ==================================================================== */
export function KanbanView({ tasks, perms, onOpen, onNew, columns }: ViewProps & { groupFieldId?: null }) {
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
                    {t.estimateHours != null && <span className="pw-pill">{t.estimateHours} h</span>}
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
