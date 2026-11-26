import { DEFAULT_MODE } from "./constants";
import React, { Suspense, lazy, useEffect, useState } from "react";
import { Dot, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { EnvProvider, useEnv } from "./env";
import { projectCode } from "./templates";
import { isProjectLate, projectPerms } from "./logic";
import { InfoTab, OverviewTab } from "./OverviewTab";
import { TasksTab } from "./TasksTab";
import { MeetingsTab } from "./MeetingsTab";
import { ChangesTab } from "./ChangesTab";
import { scopeStats } from "./agile";
import type { TaskDraft } from "./Modals";
import { PlanTab } from "./PlanTab";
import { BacklogTab } from "./BacklogTab";
import { DiscoveryTab, RisksTab } from "./Uncertainty";
import type { WorkEnv } from "./types";
import { useWork, workActions, useLocalLeftovers, useWorkShared } from "./workStore";
import { clearAllBoards } from "./board/boardStore";
import { BoardBoundary } from "./board/BoardBoundary";
import "./projects.css";

// El tablero carga Fabric.js: se descarga recién al abrir la pestaña
const BoardTab = lazy(() => import("./board/BoardTab"));

/** Vistas del proyecto. Se agrupan en cuatro pestañas (ver GROUP_OF); el tablero se abre desde la cabecera. */
export type Tab = "resumen" | "plan" | "riesgos" | "descubrimiento" | "trabajo" | "backlog" | "reuniones" | "cambios" | "ficha" | "tablero";

type Group = "resumen" | "plan" | "trabajo" | "ficha" | "tablero";
const GROUP_OF: Record<Tab, Group> = {
  resumen: "resumen", plan: "plan", riesgos: "plan", descubrimiento: "plan",
  trabajo: "trabajo", backlog: "trabajo", reuniones: "trabajo", cambios: "trabajo",
  ficha: "ficha", tablero: "tablero",
};


export function DemoBanner() {
  const env = useEnv();
  const shared = useWorkShared();
  const left = useLocalLeftovers();
  // Ya se comparte con el equipo: no es una demo. Solo se avisa si este navegador tenía algo cargado de antes.
  if (shared) {
    if (!left) return null;
    const parts = [
      left.tasks ? `${left.tasks} tarea${left.tasks !== 1 ? "s" : ""}` : "",
      left.plan ? `${left.plan} hito${left.plan !== 1 ? "s" : ""} o entregable${left.plan !== 1 ? "s" : ""}` : "",
      left.other ? `${left.other} elemento${left.other !== 1 ? "s" : ""} más` : "",
    ].filter(Boolean).join(", ");
    return (
      <div className="pw-demo-banner">
        <b>Datos de este navegador</b>
        <span>Antes de que Proyectos se compartiera con el equipo, acá habías cargado {parts}. Podés subirlos para que los vean todos o descartarlos.</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm("¿Descartar lo que estaba guardado solo en este navegador? No se puede deshacer.")) workActions.discardLeftovers(); }}>Descartar</button>
          <button className="btn btn-primary btn-sm" onClick={() => workActions.uploadLeftovers(env.projects.map((p) => p.id))}>Subirlos</button>
        </span>
      </div>
    );
  }
  return (
    <div className="pw-demo-banner">
      <b>Demo</b>
      <span>Gestión de proyectos en prueba: las tareas, hitos, sprints y tableros se guardan solo en este navegador. Los roles por proyecto y la asignación mensual sí se comparten con el equipo.</span>
      {env.examples && <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en la demo, incluidos los tableros.")) { workActions.resetDemo(); void clearAllBoards(); } }}>
        Restablecer datos de ejemplo
      </button>}
    </div>
  );
}

/**
 * Espacio de trabajo de UN proyecto: ficha y roles, tareas (5 vistas) e
 * hitos/entregables. El proyecto ES el espacio de trabajo; no hay otra entidad.
 */
export function ProjectWorkspace({
  env, projectId, onBack, onEditProject, tab, onTabChange,
}: { env: WorkEnv; projectId: string; onBack: () => void; onEditProject?: () => void; tab?: string; onTabChange?: (tab: Tab) => void }) {
  return (
    <EnvProvider value={env}>
      <Workspace projectId={projectId} onBack={onBack} onEditProject={onEditProject} tabParam={tab} onTabChange={onTabChange} />
    </EnvProvider>
  );
}

function Workspace({ projectId, onBack, onEditProject, tabParam, onTabChange }: { projectId: string; onBack: () => void; onEditProject?: () => void; tabParam?: string; onTabChange?: (tab: Tab) => void }) {
  const env = useEnv();
  const work = useWork();
  const [tabState, setTabState] = useState<Tab>("resumen");
  // Tarea elegida en el resumen: se abre en la pestaña Trabajo
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const tab = (tabParam as Tab | undefined) ?? tabState;
  const setTab = (t: Tab) => {
    setTabState(t);
    onTabChange?.(t);
  };

  const project = env.projects.find((p) => p.id === projectId);
  const index = Math.max(0, env.projects.findIndex((p) => p.id === projectId));
  const seeded = !!work.seeded[projectId];
  const shared = useWorkShared();

  useEffect(() => {
    if (!project || seeded) return;
    if (env.examples) workActions.ensureSeed(project, index);
    else workActions.ensureProjects([project]);
  }, [project, seeded, index, env.examples]);

  if (!project) return <Empty icon="folder" text="El proyecto ya no existe" />;
  if (!seeded) return null;

  const perms = projectPerms(env, work, projectId);
  const meta = work.meta[projectId];
  const code = projectCode(project, meta);
  const client = env.clients.find((c) => c.id === project.clientId);
  const late = isProjectLate(project, meta, work.milestones.filter((m) => m.projectId === projectId));
  const mode = meta?.mode ?? DEFAULT_MODE;
  const nRisks = work.risks.filter((r) => r.projectId === projectId && r.status === "abierto").length;
  const nTasks = work.tasks.filter((t) => t.projectId === projectId && !t.archived).length;
  const nMeetings = work.meetings.filter((m) => m.projectId === projectId).length;
  const pendingChanges = scopeStats([], work.changes.filter((c) => c.projectId === projectId)).pending;

  // Cuatro pestañas; Plan y Trabajo agrupan sus vistas
  const groups: { key: Group; label: string; first: Tab }[] = [
    { key: "resumen", label: "Resumen", first: "resumen" },
    { key: "plan", label: "Plan", first: "plan" },
    { key: "trabajo", label: "Trabajo", first: "trabajo" },
    { key: "ficha", label: "Ficha", first: "ficha" },
  ];
  const views: Record<Group, { key: Tab; label: string }[]> = {
    resumen: [], ficha: [], tablero: [],
    plan: [
      // La programación se sigue por hitos y entregables en todos los modos; las tareas cuelgan de un hito
      { key: "plan", label: "Hitos y entregables" },
      { key: "riesgos", label: nRisks ? `Riesgos (${nRisks})` : "Riesgos" },
      ...(mode === "hibrido" ? [{ key: "descubrimiento" as Tab, label: "Descubrimiento" }] : []),
    ],
    trabajo: [
      { key: "trabajo", label: `Tareas (${nTasks})` },
      ...(mode !== "planificado" ? [{ key: "backlog" as Tab, label: mode === "plan_correcciones" ? "Correcciones y sprints" : "Backlog y sprints" }] : []),
      { key: "reuniones", label: `Reuniones (${nMeetings})` },
      { key: "cambios", label: pendingChanges ? `Cambios del cliente (${pendingChanges})` : "Cambios del cliente" },
    ],
  };
  const valid = (t: Tab) => t === "resumen" || t === "ficha" || t === "tablero" || views[GROUP_OF[t]]?.some((v) => v.key === t);
  const current: Tab = tab in GROUP_OF && valid(tab) ? tab : "resumen";
  const group = GROUP_OF[current];

  if (!perms.canView) {
    return (
      <>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 10 }}><Icon name="arrow-left" size={13} /> Proyectos</button>
        <div className="card card-pad"><Empty icon="lock" text="No tenés acceso a este proyecto" sub="Solo ven el espacio de trabajo quienes participan del proyecto." /></div>
      </>
    );
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 8 }}><Icon name="arrow-left" size={13} /> Proyectos</button>
      {/* Cabecera mínima: nombre, estado y fechas. La metodología y la edición viven en la pestaña Ficha */}
      <div className="pw-head">
        <h1><Dot color={project.color} /> {project.name}</h1>
        {code && <span className="pw-code">{code}</span>}
        <span className={`badge ${project.status === "activo" ? "ok" : project.status === "completado" ? "acc" : ""}`}>{project.status}</span>
        {late && <span className="pw-pill late"><Icon name="alert" size={11} /> Atrasado</span>}
        {!shared && <span className="pw-pill" title="Gestión de proyectos en prueba: tareas, hitos, sprints y tableros se guardan solo en este navegador. Los roles y la asignación mensual sí se comparten con el equipo.">Demo</span>}
        <span style={{ flex: 1 }} />
        <button className={`btn btn-sm ${current === "tablero" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(current === "tablero" ? "resumen" : "tablero")}>
          <Icon name="image" size={13} /> {current === "tablero" ? "Cerrar tablero" : "Tablero"}
        </button>
      </div>
      <div className="pw-sub">
        <span>{client?.name ?? "Sin cliente"}</span>
        {meta?.startDate && meta?.endDate && <span>{fmtDate(meta.startDate)} → {fmtDate(meta.endDate)}</span>}
        {!perms.canManage && <span className="pw-pill"><Icon name="eye" size={11} /> Participás en modo consulta{work.tasks.some((t) => t.projectId === projectId && t.assigneeId === env.me.id) ? " (podés actualizar tus tareas)" : ""}</span>}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {groups.map((g) => <button key={g.key} className={group === g.key ? "active" : ""} onClick={() => setTab(g.first)}>{g.label}</button>)}
      </div>
      {views[group].length > 1 && (
        <div className="pw-views" role="tablist">
          {views[group].map((v) => <button key={v.key} role="tab" aria-selected={current === v.key} className={current === v.key ? "active" : ""} onClick={() => setTab(v.key)}>{v.label}</button>)}
        </div>
      )}

      {current === "resumen" && <OverviewTab projectId={projectId} perms={perms} go={setTab} onOpenTask={(t) => { setTaskDraft(t); setTab("trabajo"); }} />}
      {current === "trabajo" && <div className="card card-pad"><TasksTab projectId={projectId} perms={perms} initialDraft={taskDraft} onConsume={() => setTaskDraft(null)} /></div>}
      {current === "reuniones" && <div className="card card-pad"><MeetingsTab projectId={projectId} perms={perms} /></div>}
      {current === "cambios" && <div className="card card-pad"><ChangesTab projectId={projectId} perms={perms} /></div>}
      {current === "ficha" && <InfoTab projectId={projectId} perms={perms} onEditProject={onEditProject} />}
      {current === "descubrimiento" && <DiscoveryTab projectId={projectId} perms={perms} />}
      {current === "backlog" && <BacklogTab projectId={projectId} perms={perms} />}
      {current === "plan" && <PlanTab projectId={projectId} perms={perms} onNavigateTab={setTab} />}
      {current === "riesgos" && <RisksTab projectId={projectId} perms={perms} />}
      {current === "tablero" && (
        <BoardBoundary key={projectId}>
          <Suspense fallback={<div className="card card-pad">Cargando el tablero…</div>}>
            <BoardTab projectId={projectId} fileLabel={code || project.name} />
          </Suspense>
        </BoardBoundary>
      )}
    </>
  );
}

