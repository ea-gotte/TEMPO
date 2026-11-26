import React, { Suspense, lazy, useEffect, useState } from "react";
import { Dot, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { EnvProvider, useEnv } from "./env";
import { isProjectLate, projectPerms } from "./logic";
import { InfoTab, OverviewTab, WorkTab } from "./OverviewTab";
import type { TaskDraft } from "./Modals";
import { PlanTab } from "./PlanTab";
import { BacklogTab } from "./BacklogTab";
import { DiscoveryTab, RisksTab } from "./Uncertainty";
import type { WorkEnv } from "./types";
import { useWork, workActions } from "./workStore";
import { clearAllBoards } from "./board/boardStore";
import { BoardBoundary } from "./board/BoardBoundary";
import "./projects.css";

// El tablero carga Fabric.js: se descarga recién al abrir la pestaña
const BoardTab = lazy(() => import("./board/BoardTab"));

export type Tab = "resumen" | "trabajo" | "plan" | "backlog" | "riesgos" | "descubrimiento" | "tablero" | "ficha";


export function DemoBanner() {
  return (
    <div className="pw-demo-banner">
      <b>Demo</b>
      <span>Gestión de proyectos en prueba: las tareas, hitos, sprints y tableros se guardan solo en este navegador. Los roles por proyecto y la asignación mensual sí se comparten con el equipo.</span>
      <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en la demo, incluidos los tableros.")) { workActions.resetDemo(); void clearAllBoards(); } }}>
        Restablecer datos de ejemplo
      </button>
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

  useEffect(() => {
    if (project && !seeded) workActions.ensureSeed(project, index);
  }, [project, seeded, index]);

  if (!project) return <Empty icon="folder" text="El proyecto ya no existe" />;
  if (!seeded) return null;

  const perms = projectPerms(env, work, projectId);
  const meta = work.meta[projectId];
  const client = env.clients.find((c) => c.id === project.clientId);
  const late = isProjectLate(project, meta, work.milestones.filter((m) => m.projectId === projectId));
  const mode = meta?.mode ?? "planificado";
  const nRisks = work.risks.filter((r) => r.projectId === projectId && r.status === "abierto").length;
  const tabs: { key: Tab; label: string }[] =
    mode === "plan_correcciones"
      ? [
          { key: "resumen", label: "Resumen" },
          { key: "trabajo", label: "Trabajo" },
          { key: "plan", label: "Hitos y entregables" },
          { key: "backlog", label: "Correcciones y sprints" },
          { key: "riesgos", label: nRisks ? `Riesgos (${nRisks})` : "Riesgos" },
          { key: "tablero", label: "Tablero" },
          { key: "ficha", label: "Ficha" },
        ]
      : [
          { key: "resumen", label: "Resumen" },
          { key: "trabajo", label: "Trabajo" },
          ...(mode === "hibrido" ? [{ key: "descubrimiento" as Tab, label: "Descubrimiento" }] : []),
          ...(mode !== "planificado" ? [{ key: "backlog" as Tab, label: "Backlog y sprints" }] : []),
          // La programación se sigue por hitos y entregables en todos los modos; las tareas cuelgan de un hito
          { key: "plan", label: "Hitos y entregables" },
          { key: "riesgos", label: nRisks ? `Riesgos (${nRisks})` : "Riesgos" },
          { key: "tablero", label: "Tablero" },
          { key: "ficha", label: "Ficha" },
        ];
  const current: Tab = tabs.some((t) => t.key === tab) ? tab : "resumen";

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
      <DemoBanner />
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 8 }}><Icon name="arrow-left" size={13} /> Proyectos</button>
      {/* Cabecera mínima: nombre, estado y fechas. La metodología y la edición viven en la pestaña Ficha */}
      <div className="pw-head">
        <h1><Dot color={project.color} /> {project.name}</h1>
        {meta?.code && <span className="pw-code">{meta.code}</span>}
        <span className={`badge ${project.status === "activo" ? "ok" : project.status === "completado" ? "acc" : ""}`}>{project.status}</span>
        {late && <span className="pw-pill late"><Icon name="alert" size={11} /> Atrasado</span>}
      </div>
      <div className="pw-sub">
        <span>{client?.name ?? "Sin cliente"}</span>
        {meta?.startDate && meta?.endDate && <span>{fmtDate(meta.startDate)} → {fmtDate(meta.endDate)}</span>}
        {!perms.canManage && <span className="pw-pill"><Icon name="eye" size={11} /> Participás en modo consulta{work.tasks.some((t) => t.projectId === projectId && t.assigneeId === env.me.id) ? " (podés actualizar tus tareas)" : ""}</span>}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map((t) => <button key={t.key} className={current === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {current === "resumen" && <OverviewTab projectId={projectId} perms={perms} go={setTab} onOpenTask={(t) => { setTaskDraft(t); setTab("trabajo"); }} />}
      {current === "trabajo" && <WorkTab projectId={projectId} perms={perms} draft={taskDraft} onConsume={() => setTaskDraft(null)} />}
      {current === "ficha" && <InfoTab projectId={projectId} perms={perms} onEditProject={onEditProject} />}
      {current === "descubrimiento" && <DiscoveryTab projectId={projectId} perms={perms} />}
      {current === "backlog" && <BacklogTab projectId={projectId} perms={perms} />}
      {current === "plan" && <PlanTab projectId={projectId} perms={perms} onNavigateTab={setTab} />}
      {current === "riesgos" && <RisksTab projectId={projectId} perms={perms} />}
      {current === "tablero" && (
        <BoardBoundary key={projectId}>
          <Suspense fallback={<div className="card card-pad">Cargando el tablero…</div>}>
            <BoardTab projectId={projectId} fileLabel={meta?.code || project.name} />
          </Suspense>
        </BoardBoundary>
      )}
    </>
  );
}

