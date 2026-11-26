import { projectCode } from "./templates";
import React, { useEffect, useMemo, useState } from "react";
import { Dot, Empty } from "../components/ui";
import { fmtDate, today } from "../utils";
import type { Project } from "../types";
import { EnvProvider, useEnv } from "./env";
import { byDue, isPlanOverdue, projectPerms, taskProgress } from "./logic";
import { Bar, DuePill, KpiCard, Person } from "./parts";
import { diffDays } from "./schedule";
import type { Deliverable, Milestone, ProjectMeta, Task, WorkEnv } from "./types";
import { useWork, workActions } from "./workStore";
import { DemoBanner } from "./ProjectWorkspace";
import { canSeePortfolioAnalytics } from "./visibility";
import { IndicatorsPanel } from "./IndicatorsPanel";
import { AllocationPanel } from "./AllocationPanel";
import { PortfolioGantt, TeamWorkload } from "./PortfolioViews";
import "./projects.css";

const SEED_LIMIT = 8;

export type HealthLevel = "rojo" | "ambar" | "verde" | "gris";

export interface ProjectHealth {
  level: HealthLevel;
  reason: string | null;
}

export function levelColor(level: HealthLevel): string {
  switch (level) {
    case "rojo":
      return "var(--danger)";
    case "ambar":
      return "var(--warning)";
    case "verde":
      return "var(--success)";
    case "gris":
      return "var(--text-3)";
  }
}

/** Semáforo de un proyecto: rojo (en riesgo), ámbar (con alertas), verde (en marcha) o gris (pausado/finalizado). */
export function projectHealth(
  p: Project,
  meta: ProjectMeta | undefined,
  milestones: Milestone[],
  deliverables: Deliverable[],
  tasks: Task[],
  spentMinutes: number,
  now = today(),
): ProjectHealth {
  if (p.status === "pausado" || p.status === "completado") {
    return { level: "gris", reason: null };
  }

  if (meta?.endDate && meta.endDate < now) {
    return { level: "rojo", reason: "Fin previsto vencido" };
  }

  const lateMilestones = milestones.filter((m) => isPlanOverdue(m, now));
  if (lateMilestones.length > 0) {
    const count = lateMilestones.length;
    return { level: "rojo", reason: count === 1 ? "1 hito vencido" : `${count} hitos vencidos` };
  }

  const spentHours = spentMinutes / 60;
  if (p.budgetHours && p.budgetHours > 0 && spentHours > p.budgetHours) {
    return { level: "rojo", reason: "Horas por encima del presupuesto" };
  }


  const lateDeliverables = deliverables.filter((d) => isPlanOverdue(d, now));
  if (lateDeliverables.length > 0) {
    const count = lateDeliverables.length;
    return { level: "ambar", reason: count === 1 ? "1 entregable vencido" : `${count} entregables vencidos` };
  }

  const progress = taskProgress(tasks);
  if (progress.pct < 70) {
    const upcomingMs = milestones
      .filter((m) => m.status !== "cumplido" && !!m.dueDate && m.dueDate >= now)
      .sort(byDue)[0];
    if (upcomingMs?.dueDate) {
      const days = diffDays(upcomingMs.dueDate, now);
      if (days >= 0 && days <= 7) {
        const daysText = days === 1 ? "1 día" : `${days} días`;
        return { level: "ambar", reason: `Hito vence en ${daysText}` };
      }
    }
  }

  if (p.budgetHours && p.budgetHours > 0) {
    const consumedPct = (spentHours / p.budgetHours) * 100;
    if (consumedPct > progress.pct + 15) {
      return { level: "ambar", reason: "Horas por delante del avance" };
    }
  }

  return { level: "verde", reason: null };
}

export function GeneralPanel({ env, onOpen, view, onViewChange }: { env: WorkEnv; onOpen: (projectId: string) => void; view?: string; onViewChange?: (view: string) => void }) {
  return (
    <EnvProvider value={env}>
      <GeneralPanelInner onOpen={onOpen} viewParam={view} onViewChange={onViewChange} />
    </EnvProvider>
  );
}

type View = "estado" | "cronograma" | "equipo" | "asignacion" | "indicadores";
const VIEWS: { key: View; label: string }[] = [
  { key: "cronograma", label: "Cronograma" },
  { key: "equipo", label: "Ocupación del equipo" },
  { key: "asignacion", label: "Asignación" },
  { key: "estado", label: "Estado" },
  { key: "indicadores", label: "Indicadores" },
];

const LEVEL_RANK: Record<HealthLevel, number> = {
  rojo: 0,
  ambar: 1,
  verde: 2,
  gris: 3,
};

function GeneralPanelInner({ onOpen, viewParam, onViewChange }: { onOpen: (projectId: string) => void; viewParam?: string; onViewChange?: (view: string) => void }) {
  const env = useEnv();
  const work = useWork();
  const now = today();
  const [fHealth, setFHealth] = useState<"todos" | "rojo" | "ambar" | "verde">("todos");
  const [q, setQ] = useState("");
  const [viewState, setViewState] = useState<string>("cronograma");
  const view = viewParam ?? viewState;
  const setView = (v: string) => {
    setViewState(v);
    onViewChange?.(v);
  };
  const canSeeAnalytics = canSeePortfolioAnalytics(env.me.role);
  const allowedViews = canSeeAnalytics ? VIEWS : VIEWS.filter((v) => v.key === "cronograma");
  // Una vista oculta para este rol, o que no existe en la URL, cae en el cronograma
  const effectiveView: View = allowedViews.find((v) => v.key === view)?.key ?? "cronograma";

  // Datos de ejemplo para los primeros proyectos (solo en la demo)
  useEffect(() => {
    env.projects
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.status !== "archivado")
      .slice(0, SEED_LIMIT)
      .filter(({ p }) => !work.seeded[p.id])
      .forEach(({ p, i }) => workActions.ensureSeed(p, i));
  }, [env.projects, work.seeded]);

  const visible = useMemo(
    () => env.projects.filter((p) => p.status !== "archivado" && projectPerms(env, work, p.id).canView),
    [env, work],
  );

  const ids = useMemo(() => new Set(visible.map((p) => p.id)), [visible]);
  const tasks = useMemo(() => work.tasks.filter((t) => ids.has(t.projectId)), [work.tasks, ids]);
  const milestones = useMemo(() => work.milestones.filter((m) => ids.has(m.projectId)), [work.milestones, ids]);
  const deliverables = useMemo(() => work.deliverables.filter((d) => ids.has(d.projectId)), [work.deliverables, ids]);

  const healthMap = useMemo(() => {
    const map = new Map<string, ProjectHealth>();
    for (const p of visible) {
      const pTasks = tasks.filter((t) => t.projectId === p.id);
      const pMilestones = milestones.filter((m) => m.projectId === p.id);
      const pDeliverables = deliverables.filter((d) => d.projectId === p.id);
      const spent = env.minutesByProject[p.id] ?? 0;
      const h = projectHealth(p, work.meta[p.id], pMilestones, pDeliverables, pTasks, spent, now);
      map.set(p.id, h);
    }
    return map;
  }, [visible, tasks, milestones, deliverables, env.minutesByProject, work.meta, now]);

  const redCount = useMemo(() => visible.filter((p) => healthMap.get(p.id)?.level === "rojo").length, [visible, healthMap]);
  const amberCount = useMemo(() => visible.filter((p) => healthMap.get(p.id)?.level === "ambar").length, [visible, healthMap]);
  const greenCount = useMemo(() => visible.filter((p) => healthMap.get(p.id)?.level === "verde").length, [visible, healthMap]);
  const grayCount = useMemo(() => visible.filter((p) => healthMap.get(p.id)?.level === "gris").length, [visible, healthMap]);

  const filtered = useMemo(() => {
    return visible.filter((p) => {
      const h = healthMap.get(p.id);
      if (fHealth !== "todos" && h?.level !== fHealth) return false;
      if (q.trim() && !p.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [visible, healthMap, fHealth, q]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const hA = healthMap.get(a.id);
      const hB = healthMap.get(b.id);
      const rankA = hA ? LEVEL_RANK[hA.level] : 99;
      const rankB = hB ? LEVEL_RANK[hB.level] : 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, healthMap]);

  if (visible.length === 0) {
    return (
      <div className="card card-pad">
        <Empty icon="folder" text="Sin proyectos para mostrar" />
      </div>
    );
  }

  return (
    <>
      <DemoBanner />
      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {allowedViews.map((v) => (
          <button key={v.key} role="tab" aria-selected={effectiveView === v.key} className={effectiveView === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>
      {effectiveView === "cronograma" && <PortfolioGantt onOpen={onOpen} />}
      {effectiveView === "equipo" && <TeamWorkload projectIds={ids} />}
      {effectiveView === "asignacion" && <AllocationPanel projectIds={ids} />}
      {effectiveView === "indicadores" && <IndicatorsPanel onOpen={onOpen} />}
      {effectiveView === "estado" && (<>
      <div className="kpi-grid">
        <KpiCard
          icon="alert"
          label="En riesgo"
          value={redCount}
          tone={redCount > 0 ? "bad" : undefined}
        />
        <KpiCard
          icon="flame"
          label="Con alertas"
          value={amberCount}
        />
        <KpiCard
          icon="check-circle"
          label="En marcha"
          value={greenCount}
          tone="ok"
        />
        <KpiCard
          icon="briefcase"
          label="Pausados / finalizados"
          value={grayCount}
        />
      </div>

      <div className="pw-toolbar">
        <input
          className="input"
          style={{ minWidth: 200 }}
          placeholder="Buscar proyecto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={`chip ${fHealth === "todos" ? "on" : ""}`}
          onClick={() => setFHealth("todos")}
          style={{ cursor: "pointer" }}
        >
          Todos
        </button>
        <button
          type="button"
          className={`chip ${fHealth === "rojo" ? "on" : ""}`}
          onClick={() => setFHealth("rojo")}
          style={{ cursor: "pointer" }}
        >
          En riesgo
        </button>
        <button
          type="button"
          className={`chip ${fHealth === "ambar" ? "on" : ""}`}
          onClick={() => setFHealth("ambar")}
          style={{ cursor: "pointer" }}
        >
          Con alertas
        </button>
        <button
          type="button"
          className={`chip ${fHealth === "verde" ? "on" : ""}`}
          onClick={() => setFHealth("verde")}
          style={{ cursor: "pointer" }}
        >
          En marcha
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {sorted.length === 0 && (
          <div className="card card-pad" style={{ gridColumn: "1 / -1" }}>
            <Empty icon="search" text="Sin resultados" sub="Probá ajustar o limpiar los filtros." />
          </div>
        )}
        {sorted.map((p) => {
          const health = healthMap.get(p.id) ?? { level: "verde", reason: null };
          const pTasks = tasks.filter((t) => t.projectId === p.id);
          const pr = taskProgress(pTasks);
          const pMilestones = milestones.filter((m) => m.projectId === p.id);
          const nextMs = pMilestones.filter((m) => m.status !== "cumplido").sort(byDue)[0];
          const pmAssignment = work.assignments.find((a) => a.projectId === p.id && a.roleKey === "lider_proyecto");
          const pmUser = pmAssignment ? env.users.find((u) => u.id === pmAssignment.userId) : null;
          const client = env.clients.find((c) => c.id === p.clientId);
          const code = projectCode(p, work.meta[p.id]);
          const subText = code ? `${code} · ${client?.name ?? "Sin cliente"}` : (client?.name ?? "Sin cliente");

          const hasBudget = p.budgetHours != null && p.budgetHours > 0;
          const spentMinutes = env.minutesByProject[p.id] ?? 0;
          const spentHours = spentMinutes / 60;
          const spentFmt = Number.isInteger(spentHours) ? spentHours : Math.round(spentHours * 10) / 10;
          const hoursPct = hasBudget ? Math.round((spentHours / p.budgetHours!) * 100) : 0;
          const hoursColor =
            hoursPct > 100
              ? "var(--danger)"
              : hoursPct > pr.pct + 15
              ? "var(--warning)"
              : undefined;

          const badgeLabel =
            health.level === "rojo"
              ? "En riesgo"
              : health.level === "ambar"
              ? "Con alertas"
              : health.level === "verde"
              ? "En marcha"
              : p.status === "completado"
              ? "Finalizado"
              : "Pausado";

          return (
            <div
              key={p.id}
              className="card card-pad"
              style={{
                cursor: "pointer",
                borderLeft: `4px solid ${levelColor(health.level)}`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
              onClick={() => onOpen(p.id)}
            >
              {/* Línea 1 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, fontWeight: 700 }}>
                  <Dot color={p.color} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>
                    {p.name}
                  </span>
                </div>
                <span
                  className={`pw-pill ${
                    health.level === "rojo"
                      ? "late"
                      : health.level === "ambar"
                      ? "soon"
                      : health.level === "verde"
                      ? "ok"
                      : ""
                  }`}
                  style={{ flexShrink: 0 }}
                >
                  {badgeLabel}
                </span>
              </div>

              {/* Línea 2 */}
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: -4 }}>
                {subText}
              </div>

              {/* Project Manager */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Person user={pmUser} size={18} />
              </div>

              {/* Avance */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 12 }}>{pr.pct}% avance</div>
                <Bar pct={pr.pct} />
              </div>

              {/* Horas */}
              {hasBudget ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 12 }}>
                    {spentFmt} h de {p.budgetHours} h ({hoursPct}%)
                  </div>
                  <Bar pct={Math.min(100, hoursPct)} color={hoursColor} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Sin presupuesto de horas
                </div>
              )}

              {/* Próximo hito */}
              <div style={{ fontSize: 12 }}>
                {nextMs ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                    <span
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                      title={nextMs.name}
                    >
                      ◆ {nextMs.name}
                    </span>
                    <DuePill date={nextMs.dueDate} done={false} />
                  </div>
                ) : (
                  <span style={{ color: "var(--text-3)" }}>—</span>
                )}
              </div>

              {/* Motivo (solo si rojo o ámbar) */}
              {(health.level === "rojo" || health.level === "ambar") && health.reason && (
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: levelColor(health.level),
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={health.reason}
                >
                  {health.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 14 }}>
        Fecha de hoy: {fmtDate(now)} · clic en una tarjeta para abrir el proyecto.
      </div>
      </>)}
    </>
  );
}