import React, { Suspense, lazy, useEffect, useState } from "react";
import { Dot, Empty, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { MODE_LABEL } from "./constants";
import { EnvProvider, useEnv } from "./env";
import { isProjectLate, projectPerms } from "./logic";
import { OverviewTab } from "./OverviewTab";
import { PlanTab } from "./PlanTab";
import { BacklogTab } from "./BacklogTab";
import { DiscoveryTab, RisksTab } from "./Uncertainty";
import type { ProjectMode, WorkEnv } from "./types";
import { useWork, workActions } from "./workStore";
import { clearAllBoards } from "./board/boardStore";
import { BoardBoundary } from "./board/BoardBoundary";
import "./projects.css";

// El tablero carga Fabric.js: se descarga recién al abrir la pestaña
const BoardTab = lazy(() => import("./board/BoardTab"));

export type Tab = "resumen" | "plan" | "backlog" | "riesgos" | "descubrimiento" | "tablero";


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
  const toast = useToast();
  const [tabState, setTabState] = useState<Tab>("resumen");
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
          { key: "plan", label: "Hitos y entregables" },
          { key: "backlog", label: "Correcciones y sprints" },
          { key: "riesgos", label: `Riesgos (${nRisks})` },
          { key: "tablero", label: "Tablero" },
        ]
      : [
          { key: "resumen", label: "Resumen" },
          ...(mode === "hibrido" ? [{ key: "descubrimiento" as Tab, label: "Descubrimiento" }] : []),
          ...(mode !== "planificado" ? [{ key: "backlog" as Tab, label: "Backlog y sprints" }] : []),
          // La programación se sigue por hitos y entregables en todos los modos; las tareas cuelgan de un hito
          { key: "plan", label: "Hitos y entregables" },
          { key: "riesgos", label: `Riesgos (${nRisks})` },
          { key: "tablero", label: "Tablero" },
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
      <div className="pw-head">
        <h1><Dot color={project.color} /> {project.name}</h1>
        {meta?.code && <span className="pw-code">{meta.code}</span>}
        <span className={`badge ${project.status === "activo" ? "ok" : project.status === "completado" ? "acc" : ""}`}>{project.status}</span>
        {perms.canApprove ? (
          <select
            className="select"
            style={{ width: "auto", padding: "3px 8px", fontSize: 12 }}
            title="Metodología de gestión del proyecto"
            aria-label="Metodología de gestión del proyecto"
            value={mode}
            onChange={async (e) => {
              const next = e.target.value as ProjectMode;
              const err = await (env.changeProjectMode ?? workActions.setProjectMode)(projectId, next);
              toast(err ?? `Metodología del proyecto: ${MODE_LABEL[next]}.`);
            }}
          >
            {(Object.keys(MODE_LABEL) as ProjectMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        ) : (
          <span className="pw-pill" title="Metodología de gestión del proyecto">{MODE_LABEL[mode]}</span>
        )}
        {late && <span className="pw-pill late"><Icon name="alert" size={11} /> Atrasado</span>}
        <span style={{ flex: 1 }} />
        {perms.isStaff && onEditProject && <button className="btn btn-secondary btn-sm" onClick={onEditProject}><Icon name="pencil" size={12} /> Editar proyecto</button>}
      </div>
      <div className="pw-sub">
        <span>{client?.name ?? "Sin cliente"}</span>
        {meta?.startDate && meta?.endDate && <span>{fmtDate(meta.startDate)} → {fmtDate(meta.endDate)}</span>}
        {!perms.canManage && <span className="pw-pill"><Icon name="eye" size={11} /> Participás en modo consulta{work.tasks.some((t) => t.projectId === projectId && t.assigneeId === env.me.id) ? " (podés actualizar tus tareas)" : ""}</span>}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map((t) => <button key={t.key} className={current === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {current === "resumen" && <OverviewTab projectId={projectId} perms={perms} go={setTab} />}
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

