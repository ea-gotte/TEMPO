import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { TASK_PRIORITY, TASK_STATUS } from "./constants";
import { useEnv } from "./env";
import { FieldFilterBar, FieldsModal } from "./FieldControls";
import { fieldsForProject, filterActive, matchesFilter, type FieldFilter } from "./fields";
import { defaultMilestone, type Perms } from "./logic";
import { TaskModal, type TaskDraft } from "./Modals";
import { ListView, TableView } from "./TaskViews";
import type { Task, TaskPriority, TaskStatus } from "./types";
import { useWork, workActions } from "./workStore";

type ViewKey = "lista" | "tabla";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "lista", label: "Lista" },
  { key: "tabla", label: "Tabla" },
];
const VIEW_KEY = "tempo-proyectos-vista-tareas";
const ARCHIVED_KEY = "tempo-proyectos-ver-archivadas";
const colsKey = (projectId: string) => `tempo-proyectos-columnas-${projectId}`;

function loadView(): ViewKey {
  try {
    const v = localStorage.getItem(VIEW_KEY) as ViewKey | null;
    if (v && VIEWS.some((x) => x.key === v)) return v;
  } catch { /* sin preferencia guardada */ }
  return "lista";
}

function loadCols(projectId: string): string[] | null {
  try {
    const raw = localStorage.getItem(colsKey(projectId));
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* sin preferencia guardada */ }
  return null;
}

function loadShowArchived(): boolean {
  try { return localStorage.getItem(ARCHIVED_KEY) === "1"; } catch { return false; }
}

/**
 * Tareas del proyecto. Cada tarea cuelga de un hito: la programación se sigue
 * por hitos y entregables (calendario y Kanban viven en esa pestaña), así que acá
 * solo hay dos formas de ver la misma lista. Las tareas ya finalizadas se pueden
 * archivar para dejar el listado limpio, y volver a mostrar cuando haga falta.
 */
export function TasksTab({ projectId, perms, initialDraft, onConsume }: { projectId: string; perms: Perms; initialDraft?: TaskDraft | null; onConsume?: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const [view, setViewState] = useState<ViewKey>(loadView);
  const [q, setQ] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fStatus, setFStatus] = useState<TaskStatus | "">("");
  const [fPriority, setFPriority] = useState<TaskPriority | "">("");
  const [fMilestone, setFMilestone] = useState("");
  const [mine, setMine] = useState(false);
  const [showArchived, setShowArchivedState] = useState(loadShowArchived);
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [showFields, setShowFields] = useState(false);
  const [colMenu, setColMenu] = useState(false);
  const [modal, setModal] = useState<TaskDraft | null>(initialDraft ?? null);
  const [qaName, setQaName] = useState("");
  const [qaMs, setQaMs] = useState("");
  // El borrador inicial se usa una sola vez (al llegar desde otra pestaña)
  useEffect(() => { onConsume?.(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const defs = useMemo(() => fieldsForProject(work.fields, projectId), [work.fields, projectId]);
  const [shown, setShown] = useState<string[] | null>(() => loadCols(projectId));
  // Sin preferencia guardada: se muestran los dos primeros campos
  const shownIds = shown ?? defs.slice(0, 2).map((d) => d.id);
  const columns = defs.filter((d) => shownIds.includes(d.id));
  function toggleCol(id: string) {
    const next = shownIds.includes(id) ? shownIds.filter((x) => x !== id) : [...shownIds, id];
    setShown(next);
    try { localStorage.setItem(colsKey(projectId), JSON.stringify(next)); } catch { /* ignorar */ }
  }
  function setShowArchived(v: boolean) {
    setShowArchivedState(v);
    try { localStorage.setItem(ARCHIVED_KEY, v ? "1" : "0"); } catch { /* ignorar */ }
  }

  const all = useMemo(() => work.tasks.filter((t) => t.projectId === projectId), [work.tasks, projectId]);
  const archivedCount = all.filter((t) => t.archived).length;
  const visibleAll = showArchived ? all : all.filter((t) => !t.archived);
  const milestones = work.milestones.filter((m) => m.projectId === projectId).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const assignees = Array.from(new Set(all.map((t) => t.assigneeId).filter(Boolean))) as string[];

  const tasks = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visibleAll.filter((t) => {
      if (needle && !(t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle))) return false;
      if (mine && t.assigneeId !== env.me.id) return false;
      if (fAssignee === "__none__" ? t.assigneeId : fAssignee && t.assigneeId !== fAssignee) return false;
      if (fStatus && t.status !== fStatus) return false;
      if (fPriority && t.priority !== fPriority) return false;
      if (fMilestone && t.milestoneId !== fMilestone) return false;
      for (const f of fieldFilters) {
        const d = defs.find((x) => x.id === f.fieldId);
        if (d && !matchesFilter(t, f, d)) return false;
      }
      return true;
    });
  }, [visibleAll, q, mine, fAssignee, fStatus, fPriority, fMilestone, fieldFilters, defs, env.me.id]);

  const activeFieldFilters = fieldFilters.filter((f) => { const d = defs.find((x) => x.id === f.fieldId); return d && filterActive(f, d); }).length;
  const filtersOn = Boolean(q || mine || fAssignee || fStatus || fPriority || fMilestone || activeFieldFilters);
  function clear() { setQ(""); setMine(false); setFAssignee(""); setFStatus(""); setFPriority(""); setFMilestone(""); setFieldFilters([]); }
  function setView(v: ViewKey) {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignorar */ }
  }

  // Tareas finalizadas que se pueden archivar (las que se ven con los filtros actuales)
  const archivable = tasks.filter((t) => t.status === "hecha" && !t.archived);
  function archiveDone() {
    workActions.archiveTasks(archivable.map((t) => t.id), true);
    toast(`${archivable.length} tarea${archivable.length !== 1 ? "s" : ""} archivada${archivable.length !== 1 ? "s" : ""}. Para volver a verlas, activá “Ver archivadas”.`);
  }

  // Alta rápida: nombre + hito + Enter (el resto se completa después si hace falta)
  const quickMs = qaMs || defaultMilestone(work.milestones, projectId)?.id || "";
  function quickAdd() {
    const name = qaName.trim();
    if (!name || !quickMs) return;
    workActions.addTask({ projectId, name, description: "", assigneeId: null, status: "pendiente", priority: "media", startDate: null, dueDate: null, milestoneId: quickMs, deliverableId: null, createdBy: env.me.id });
    setQaName("");
    toast("Tarea creada.");
  }

  const viewProps = {
    tasks, projectId, perms, columns, showEmpty: !filtersOn,
    onOpen: (t: Task) => setModal(t),
    onNew: (partial: Partial<Task>) => setModal({ projectId, ...partial }),
  };
  const modalAccess = modal?.id ? perms.taskAccess(modal as Task) : "full";

  return (
    <>
      <div className="pw-toolbar">
        <div className="tabs">
          {VIEWS.map((v) => <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>)}
        </div>
        <span className="grow" />
        <div style={{ position: "relative" }}>
          <button className="btn btn-secondary" onClick={() => setColMenu((v) => !v)} title="Elegir qué campos se ven en la lista y la tabla"><Icon name="sliders" size={14} /> Campos visibles</button>
          {colMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setColMenu(false)} />
              <div className="pw-colmenu">
                {defs.length === 0 && <div style={{ padding: 6, color: "var(--text-3)", fontSize: 12.5 }}>No hay campos personalizados.</div>}
                {defs.map((d) => (
                  <label key={d.id}><input type="checkbox" checked={shownIds.includes(d.id)} onChange={() => toggleCol(d.id)} /> {d.name}{d.projectId !== null && <span style={{ color: "var(--text-3)", fontSize: 11 }}> · proyecto</span>}</label>
                ))}
              </div>
            </>
          )}
        </div>
        {perms.canManage && <button className="btn btn-secondary" onClick={() => setShowFields(true)}><Icon name="settings" size={14} /> Gestionar campos</button>}
        {perms.canManage && (
          <button className="btn btn-primary" onClick={() => setModal({ projectId })}><Icon name="plus" size={15} /> Nueva tarea</button>
        )}
      </div>

      {perms.canManage && (
        milestones.length > 0 ? (
          <div className="pw-quickadd">
            <Icon name="plus" size={15} />
            <input
              className="input" placeholder="Nueva tarea rápida: escribí el nombre y Enter…" value={qaName}
              onChange={(e) => setQaName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}
            />
            <select className="select" value={quickMs} onChange={(e) => setQaMs(e.target.value)} title="Hito al que se asigna la tarea" aria-label="Hito de la tarea nueva">
              {milestones.map((m) => <option key={m.id} value={m.id}>◆ {m.name}</option>)}
            </select>
            <button className="btn btn-secondary" disabled={!qaName.trim()} onClick={quickAdd}>Agregar</button>
          </div>
        ) : (
          <div className="pw-demo-banner">Toda tarea se asigna a un hito: primero creá el primero en la pestaña “Hitos y entregables”.</div>
        )
      )}

      <div className="pw-toolbar">
        <input className="input" style={{ minWidth: 180 }} placeholder="Buscar tarea…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
          <option value="">Responsable: todos</option>
          <option value="__none__">Sin asignar</option>
          {assignees.map((id) => <option key={id} value={id}>{env.users.find((u) => u.id === id)?.name ?? id}</option>)}
        </select>
        <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as TaskStatus | "")}>
          <option value="">Estado: todos</option>
          {TASK_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="select" value={fPriority} onChange={(e) => setFPriority(e.target.value as TaskPriority | "")}>
          <option value="">Prioridad: todas</option>
          {TASK_PRIORITY.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select className="select" value={fMilestone} onChange={(e) => setFMilestone(e.target.value)}>
          <option value="">Hito: todos</option>
          {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className={`chip ${mine ? "on" : ""}`} style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} style={{ display: "none" }} /> Mis tareas
        </label>
        {filtersOn && <button className="btn btn-ghost btn-sm" onClick={clear}>Limpiar</button>}
        <span className="grow" />
        <label className={`chip ${showArchived ? "on" : ""}`} style={{ cursor: "pointer" }} title="Las archivadas están ocultas por defecto; siguen contando en el avance">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ display: "none" }} />
          <Icon name={showArchived ? "eye" : "eye-off"} size={13} /> {showArchived ? "Viendo archivadas" : "Ver archivadas"} ({archivedCount})
        </label>
        {perms.canManage && archivable.length > 0 && (
          <button className="btn btn-secondary" onClick={archiveDone} title="Oculta del listado las tareas finalizadas que ves ahora">
            <Icon name="archive" size={14} /> Archivar hechas ({archivable.length})
          </button>
        )}
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{tasks.length} de {visibleAll.length}</span>
      </div>

      <FieldFilterBar defs={defs} filters={fieldFilters} onChange={setFieldFilters} />

      {view === "lista" && <ListView {...viewProps} />}
      {view === "tabla" && <TableView {...viewProps} />}

      {modal && (
        <TaskModal
          key={modal.id ?? "new" + (modal.status ?? "") + (modal.milestoneId ?? "")}
          draft={modal}
          access={modalAccess === "none" ? "none" : modalAccess}
          canDelete={perms.canManage}
          onClose={() => setModal(null)}
        />
      )}
      {showFields && <FieldsModal projectId={projectId} defs={defs} isStaff={perms.isStaff} onClose={() => setShowFields(false)} />}
    </>
  );
}
