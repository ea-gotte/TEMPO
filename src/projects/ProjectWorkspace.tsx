import React, { useEffect, useState } from "react";
import { Dot, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { EnvProvider, useEnv } from "./env";
import { isProjectLate, projectPerms } from "./logic";
import type { TaskDraft } from "./Modals";
import { OverviewTab } from "./OverviewTab";
import { PlanTab } from "./PlanTab";
import { BacklogTab } from "./BacklogTab";
import { ChangesTab } from "./ChangesTab";
import { DiscoveryTab, RisksTab } from "./Uncertainty";
import { scopeStats } from "./agile";
import { TasksTab } from "./TasksTab";
import type { Task, WorkEnv } from "./types";
import { useWork, workActions } from "./workStore";
import "./projects.css";

export type Tab = "resumen" | "tareas" | "plan" | "backlog" | "cambios" | "riesgos" | "descubrimiento";

const MODE_LABEL = { planificado: "Planificado", agil: "Ágil", hibrido: "Híbrido" } as const;

export function DemoBanner() {
  return (
    <div className="pw-demo-banner">
      <b>Demo</b>
      <span>Gestión de proyectos en prueba: las tareas, hitos y roles se guardan solo en este navegador y no se envían a la base de datos.</span>
      <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en la demo.")) workActions.resetDemo(); }}>
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
  env, projectId, onBack, onEditProject,
}: { env: WorkEnv; projectId: string; onBack: () => void; onEditProject?: () => void }) {
  return (
    <EnvProvider value={env}>
      <Workspace projectId={projectId} onBack={onBack} onEditProject={onEditProject} />
    </EnvProvider>
  );
}

function Workspace({ projectId, onBack, onEditProject }: { projectId: string; onBack: () => void; onEditProject?: () => void }) {
  const env = useEnv();
  const work = useWork();
  const [tab, setTab] = useState<Tab>("resumen");
  const [draft, setDraft] = useState<TaskDraft | null>(null);

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
  const nTasks = work.tasks.filter((t) => t.projectId === projectId && !t.archived).length;
  const mode = meta?.mode ?? "planificado";
  const pending = scopeStats([], work.changes.filter((c) => c.projectId === projectId)).pending;
  const nRisks = work.risks.filter((r) => r.projectId === projectId && r.status === "abierto").length;
  const tabs: { key: Tab; label: string }[] = [
    { key: "resumen", label: "Resumen" },
    ...(mode === "hibrido" ? [{ key: "descubrimiento" as Tab, label: "Descubrimiento" }] : []),
    ...(mode !== "planificado" ? [{ key: "backlog" as Tab, label: "Backlog y sprints" }] : []),
    // La programación se sigue por hitos y entregables en todos los modos; las tareas cuelgan de un hito
    { key: "plan", label: "Hitos y entregables" },
    { key: "tareas", label: `Tareas (${nTasks})` },
    { key: "cambios", label: `Cambios del cliente${pending ? ` (${pending})` : ""}` },
    { key: "riesgos", label: `Riesgos (${nRisks})` },
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
        <span className="pw-pill" title="Modo de gestión del proyecto">{MODE_LABEL[mode]}</span>
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

      {current === "resumen" && <OverviewTab projectId={projectId} perms={perms} go={setTab} openTask={(t: Task) => { setDraft(t); setTab("tareas"); }} />}
      {current === "descubrimiento" && <DiscoveryTab projectId={projectId} perms={perms} />}
      {current === "backlog" && <BacklogTab projectId={projectId} perms={perms} />}
      {current === "tareas" && <TasksTab projectId={projectId} perms={perms} initialDraft={draft} onConsume={() => setDraft(null)} />}
      {current === "plan" && <PlanTab projectId={projectId} perms={perms} />}
      {current === "cambios" && <ChangesTab projectId={projectId} perms={perms} />}
      {current === "riesgos" && <RisksTab projectId={projectId} perms={perms} />}
    </>
  );
}

