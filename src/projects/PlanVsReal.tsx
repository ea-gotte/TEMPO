import React from "react";
import { Empty } from "../components/ui";
import { fmtDate, today } from "../utils";
import { useEnv } from "./env";
import { planVsRealRows, planVsRealSummary } from "./planDeviation";
import { KpiCard } from "./parts";
import { deliverableCorrections, projectRework } from "./corrections";
import { useWork } from "./workStore";

/**
 * Vista "Plan vs real": compara la planificación esperada con la real,
 * mide los desvíos de plazos, horas y alcance, y muestra el detalle por ítem.
 */
export function PlanVsReal({ projectId }: { projectId: string }) {
  const env = useEnv();
  const work = useWork();
  const now = today();

  const project = env.projects.find((p) => p.id === projectId);
  const milestones = work.milestones.filter((m) => m.projectId === projectId);
  const deliverables = work.deliverables.filter((d) => d.projectId === projectId);
  const baselines = work.baselines.filter((b) => b.projectId === projectId);
  const tasks = work.tasks.filter((t) => t.projectId === projectId);

  if (milestones.length === 0 && deliverables.length === 0) {
    return (
      <div className="card card-pad">
        <Empty
          icon="calendar-days"
          text="Todavía no hay hitos ni entregables"
          sub="Cargá la planificación del proyecto para poder comparar lo planificado con lo real."
        />
      </div>
    );
  }

  const rows = planVsRealRows(milestones, deliverables, now);
  const realMinutes = env.minutesByProject[projectId] ?? 0;
  const summary = planVsRealSummary(
    rows,
    baselines,
    project?.budgetHours,
    realMinutes,
    tasks,
    now
  );

  const reviews = (work.reviews ?? []).filter((r) => r.projectId === projectId);
  const hasReviews = reviews.length > 0;
  const rework = hasReviews ? projectRework(projectId, tasks, deliverables, reviews) : null;

  const sign = (n: number) => (n > 0 ? "+" : "") + n;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tarjetas KPI resumen */}
      <div className="kpi-grid">
        <KpiCard
          icon="check-circle"
          label="Cumplimiento de plazos"
          value={summary.onTimePct != null ? `${summary.onTimePct}%` : "—"}
          hint={summary.onTimePct != null ? "ítems cerrados a tiempo" : "sin ítems cerrados"}
          tone={
            summary.onTimePct != null
              ? summary.onTimePct >= 80
                ? "ok"
                : summary.onTimePct < 60
                ? "bad"
                : undefined
              : undefined
          }
        />

        <KpiCard
          icon="clock"
          label="Desvío medio"
          value={summary.avgSlipDays != null ? `${sign(summary.avgSlipDays)} d` : "—"}
          hint={
            summary.provisionalAvgSlipDays != null
              ? `prov. ${sign(summary.provisionalAvgSlipDays)} d`
              : "solo ítems cerrados"
          }
          tone={summary.avgSlipDays != null ? (summary.avgSlipDays > 0 ? "bad" : "ok") : undefined}
        />

        <KpiCard
          icon="alert"
          label="Atrasados"
          value={summary.delayedCount}
          hint="hitos y entregables con atraso"
          tone={summary.delayedCount > 0 ? "bad" : "ok"}
        />

        <KpiCard
          icon="calendar"
          label="Desvío del fin (contra la base)"
          value={summary.baselineEndShiftDays != null ? `${sign(summary.baselineEndShiftDays)} d` : "—"}
          hint={
            summary.scopeGrowthHours != null
              ? `${summary.scopeGrowthHours >= 0 ? "+" : ""}${summary.scopeGrowthHours} h de alcance`
              : "sin línea base"
          }
          tone={
            summary.baselineEndShiftDays != null
              ? summary.baselineEndShiftDays > 0
                ? "bad"
                : "ok"
              : undefined
          }
        />

        <KpiCard
          icon="hourglass"
          label="Horas (reales frente a proyectadas)"
          value={`${summary.realHours} h${summary.budgetHours ? ` / ${summary.budgetHours} h` : ""}`}
          hint={
            summary.hoursVariance != null
              ? `${sign(summary.hoursVariance)} h (${summary.hoursVariancePct! > 0 ? "+" : ""}${summary.hoursVariancePct}%)`
              : "sin presupuesto"
          }
          tone={summary.hoursVariance != null ? (summary.hoursVariance > 0 ? "bad" : "ok") : undefined}
        />

        <KpiCard
          icon="trending-up"
          label="Avance real frente a esperado"
          value={`${summary.realProgressPct}%${summary.expectedProgressPct != null ? ` / ${summary.expectedProgressPct}%` : ""}`}
          hint={
            summary.gapPct != null
              ? `brecha ${sign(summary.gapPct)}% (${summary.realProgressPct >= (summary.expectedProgressPct ?? 0) ? "al día" : "demorado"})`
              : "según calendario"
          }
          tone={
            summary.gapPct != null
              ? summary.gapPct < -10
                ? "bad"
                : summary.gapPct >= 0
                ? "ok"
                : undefined
              : undefined
          }
        />

        {hasReviews && rework && (
          <>
            <KpiCard
              icon="repeat"
              label="Retrabajo"
              value={rework.reworkPct != null ? `${rework.reworkPct}%` : "—"}
              hint={rework.reworkPct != null ? "horas de corrección vs total" : "sin horas estimadas"}
              tone={
                rework.reworkPct != null
                  ? rework.reworkPct > 20
                    ? "bad"
                    : "ok"
                  : undefined
              }
            />

            <KpiCard
              icon="history"
              label="Rondas promedio"
              value={rework.avgRounds}
              hint="por entregable entregado o revisado"
              tone={rework.avgRounds > 2 ? "bad" : "ok"}
            />

            <KpiCard
              icon="check-circle"
              label="Aprobados a la primera"
              value={rework.firstPassPct != null ? `${rework.firstPassPct}%` : "—"}
              hint={rework.firstPassPct != null ? "sin revisión del cliente" : "sin entregables entregados"}
              tone={
                rework.firstPassPct != null
                  ? rework.firstPassPct >= 80
                    ? "ok"
                    : rework.firstPassPct < 50
                    ? "bad"
                    : undefined
                  : undefined
              }
            />
          </>
        )}
      </div>

      {/* Nota breve aclaratoria de horas */}
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: -4 }}>
        * Las horas reales se miden por proyecto porque el registro de horas no llega a nivel de tarea ni de entregable.
      </div>

      {/* Tabla detallada de filas Plan vs Real */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Nombre</th>
              <th>Inicio plan</th>
              <th>Fin plan</th>
              <th>Inicio real</th>
              <th>Fin real</th>
              {hasReviews && (
                <>
                  <th>Primera entrega</th>
                  <th>Rondas</th>
                </>
              )}
              <th>Desvío inicio</th>
              <th>Desvío fin</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              let pillClass = "";
              if (r.status === "Atrasado") {
                pillClass = r.isEndProvisional ? "soon" : "late";
              } else if (r.status === "A tiempo" || r.status === "Adelantado") {
                pillClass = "ok";
              }

              return (
                <tr key={`${r.type}-${r.id}`}>
                  <td>
                    <span className="pw-pill" style={{ fontSize: 11 }}>
                      {r.type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.plannedStart ? fmtDate(r.plannedStart) : <span style={{ color: "var(--text-3)" }}>—</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.plannedEnd ? fmtDate(r.plannedEnd) : <span style={{ color: "var(--text-3)" }}>—</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.actualStart ? fmtDate(r.actualStart) : <span style={{ color: "var(--text-3)" }}>—</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.actualEnd ? fmtDate(r.actualEnd) : <span style={{ color: "var(--text-3)" }}>—</span>}
                  </td>
                  {hasReviews && (
                    <>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {(() => {
                          const del = r.type === "Entregable" ? deliverables.find((d) => d.id === r.id) : null;
                          return del?.firstDeliveredAt ? fmtDate(del.firstDeliveredAt) : <span style={{ color: "var(--text-3)" }}>—</span>;
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const del = r.type === "Entregable" ? deliverables.find((d) => d.id === r.id) : null;
                          if (!del) return <span style={{ color: "var(--text-3)" }}>—</span>;
                          const stats = deliverableCorrections(del.id, tasks, reviews);
                          return stats.rounds > 0 ? stats.rounds : <span style={{ color: "var(--text-3)" }}>—</span>;
                        })()}
                      </td>
                    </>
                  )}
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.startDeviationDays != null ? (
                      <span>{sign(r.startDeviationDays)} d</span>
                    ) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.endDeviationDays != null ? (
                      <span>
                        {sign(r.endDeviationDays)} d
                        {r.isEndProvisional && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-3)",
                              marginLeft: 5,
                            }}
                          >
                            (provisional)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`pw-pill ${pillClass}`.trim()}>{r.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
