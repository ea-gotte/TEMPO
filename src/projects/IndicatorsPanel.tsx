import React, { useMemo, useState } from "react";
import { Dot, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, today } from "../utils";
import { TASK_PRIORITY, TASK_STATUS } from "./constants";
import { useEnv } from "./env";
import { globalFields, matchesFilter, selectedOptionIds, hasOptions, NO_VALUE, type FieldFilter } from "./fields";
import { bucketize, indicatorsCsv, portfolio, type Bucket, type Health, type ProjectIndicators } from "./indicators";
import { KpiCard, Person } from "./parts";
import { useWork } from "./workStore";
import "./projects.css";

export const MODE_LABEL = { planificado: "Planificado", agil: "Ágil", hibrido: "Híbrido" } as const;

export const HEALTH: Record<Health, { label: string; color: string }> = {
  ok: { label: "Bien", color: "var(--success)" },
  warn: { label: "Atención", color: "var(--warning)" },
  bad: { label: "Crítico", color: "var(--danger)" },
};

export function HealthPill({ h }: { h: Health }) {
  return (
    <span className={`pw-pill ${h === "ok" ? "ok" : h === "warn" ? "soon" : "late"}`}>
      <span className="pw-dotc" style={{ background: HEALTH[h].color }} /> {HEALTH[h].label}
    </span>
  );
}

/** Días de desvío con signo y color: + es tarde (rojo), ≤ 0 es a tiempo. */
export function Variance({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: "var(--text-3)" }}>—</span>;
  const cls = days > 7 ? "late" : days > 0 ? "soon" : "ok";
  return <span className={`pw-pill ${cls}`}>{days > 0 ? `+${days} d` : days === 0 ? "en fecha" : `${days} d`}</span>;
}

/** Barra “proyectado vs real”: el trazo es lo real; la marca vertical, lo proyectado. */
export function PlanVsReal({ real, plan, unit, over }: { real: number; plan: number | null; unit: string; over?: boolean }) {
  const top = Math.max(real, plan ?? 0, 1);
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 12, marginBottom: 3 }}>
        <b>{Math.round(real * 10) / 10}</b>{plan !== null && <span style={{ color: "var(--text-3)" }}> / {plan} {unit}</span>}
      </div>
      <div className="pw-pvr">
        <div className="pw-pvr-fill" style={{ width: `${(real / top) * 100}%`, background: over ? "var(--danger)" : "var(--accent)" }} />
        {plan !== null && <div className="pw-pvr-mark" style={{ left: `${(plan / top) * 100}%` }} title={`Proyectado: ${plan} ${unit}`} />}
      </div>
    </div>
  );
}

/** Avance real contra el esperado a la fecha. */
export function ProgressVsExpected({ real, expected }: { real: number; expected: number | null }) {
  const behind = expected !== null && real - expected <= -15;
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 12, marginBottom: 3 }}>
        <b>{real}%</b>{expected !== null && <span style={{ color: behind ? "var(--danger)" : "var(--text-3)" }}> · esperado {expected}%</span>}
      </div>
      <div className="pw-pvr">
        <div className="pw-pvr-fill" style={{ width: `${real}%`, background: behind ? "var(--warning)" : real >= 100 ? "var(--success)" : "var(--accent)" }} />
        {expected !== null && <div className="pw-pvr-mark" style={{ left: `${expected}%` }} title={`Esperado a la fecha: ${expected}%`} />}
      </div>
    </div>
  );
}

type Dim = "status" | "priority" | `f:${string}`;

export function IndicatorsPanel({ onOpen }: { onOpen: (projectId: string) => void }) {
  const env = useEnv();
  const work = useWork();
  const now = today();
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<"" | "activo" | "pausado" | "completado">("");
  const [fFieldId, setFFieldId] = useState("");
  const [fOptions, setFOptions] = useState<string[]>([]);
  const [dim, setDim] = useState<Dim>("status");
  const [sortKey, setSortKey] = useState<"name" | "health" | "variance" | "hours">("health");

  const gFields = globalFields(work.fields);
  const fField = gFields.find((f) => f.id === fFieldId) ?? null;
  const fieldFilter: FieldFilter | null = fField && fOptions.length ? { fieldId: fField.id, optionIds: fOptions } : null;

  const pf = useMemo(
    () => portfolio(env, work, { clientId, status, taskFilter: fieldFilter && fField ? (t) => matchesFilter(t, fieldFilter, fField) : undefined }, now),
    [env, work, clientId, status, fieldFilter, fField, now],
  );
  const t = pf.totals;

  const rows = useMemo(() => {
    const rank = { bad: 0, warn: 1, ok: 2 } as const;
    return [...pf.rows].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.project.name.localeCompare(b.project.name);
        case "variance": return (b.schedule.varianceDays ?? -999) - (a.schedule.varianceDays ?? -999);
        case "hours": return (b.hours.consumedPct ?? -1) - (a.hours.consumedPct ?? -1);
        default: return rank[a.health] - rank[b.health] || b.critical.length - a.critical.length;
      }
    });
  }, [pf.rows, sortKey]);

  const buckets: Bucket[] = useMemo(() => {
    if (dim === "status") return bucketize(pf.tasks, TASK_STATUS.map((s) => ({ key: s.key, label: s.label, color: s.color, has: (x) => x.status === s.key })), now);
    if (dim === "priority") return bucketize(pf.tasks, TASK_PRIORITY.map((p) => ({ key: p.key, label: p.label, color: p.color, has: (x) => x.priority === p.key })), now);
    const d = gFields.find((f) => `f:${f.id}` === dim);
    if (!d || !hasOptions(d.type)) return [];
    return bucketize(pf.tasks, [
      ...d.options.map((o) => ({ key: o.id, label: o.label, color: o.color, has: (x: (typeof pf.tasks)[number]) => selectedOptionIds(x, d).includes(o.id) })),
      { key: NO_VALUE, label: "Sin valor", color: "var(--text-3)", has: (x: (typeof pf.tasks)[number]) => selectedOptionIds(x, d).length === 0 },
    ], now);
  }, [pf.tasks, dim, gFields, now]);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.total));
  const nameOf = (id: string) => env.projects.find((p) => p.id === id)?.name ?? id;
  const clientName = (id: string | null) => env.clients.find((c) => c.id === id)?.name ?? "";

  function exportCsv() {
    const blob = new Blob(["﻿" + indicatorsCsv(pf.rows, clientName)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `indicadores-proyectos-${now}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (pf.rows.length === 0 && !clientId && !status) {
    return <div className="card card-pad"><Empty icon="trending-up" text="Todavía no hay datos para calcular indicadores" sub="Abrí algún proyecto o volvé al resumen para cargar los datos de ejemplo." /></div>;
  }

  return (
    <>
      {/* ---------- Filtros ---------- */}
      <div className="pw-toolbar">
        <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Cliente: todos</option>
          {[...env.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Estado: todos</option>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
          <option value="completado">Finalizados</option>
        </select>
        <select className="select" value={fFieldId} onChange={(e) => { setFFieldId(e.target.value); setFOptions([]); }}>
          <option value="">Filtrar tareas por campo…</option>
          {gFields.filter((f) => hasOptions(f.type)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {fField && fField.options.map((o) => (
          <button key={o.id} className={`chip ${fOptions.includes(o.id) ? "on" : ""}`} onClick={() => setFOptions((cur) => (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id]))}>
            <span className="pw-dotc" style={{ background: o.color }} /> {o.label}
          </button>
        ))}
        <span className="grow" />
        <button className="btn btn-secondary" onClick={exportCsv}><Icon name="download" size={14} /> Exportar CSV</button>
      </div>
      {fieldFilter && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>El filtro por campo recorta las métricas de tareas; las horas cargadas siguen siendo las del proyecto completo.</div>}

      {/* ---------- KPIs ---------- */}
      <div className="kpi-grid">
        <KpiCard icon="check-circle" label="Avance de tareas" value={`${t.pct}%`} hint={`${t.done} de ${t.tasks} hechas`} />
        <KpiCard icon="clock" label="Cerradas a tiempo" value={t.onTimePct === null ? "—" : `${t.onTimePct}%`} hint={t.avgDelayDays ? `atraso medio ${t.avgDelayDays} d` : "de las tareas ya cerradas"} tone={t.onTimePct !== null && t.onTimePct < 70 ? "bad" : undefined} />
        <KpiCard icon="calendar-days" label="Desvío medio de plazo" value={t.avgVarianceDays === null ? "—" : `${t.avgVarianceDays > 0 ? "+" : ""}${t.avgVarianceDays} d`} hint={`${t.behindSchedule} proyecto${t.behindSchedule !== 1 ? "s" : ""} terminarían tarde`} tone={t.avgVarianceDays !== null && t.avgVarianceDays > 0 ? "bad" : "ok"} />
        <KpiCard icon="briefcase" label="Horas cargadas" value={`${Math.round(t.logged)} h`} hint={t.budget ? `${Math.round((t.logged / t.budget) * 100)}% de las ${Math.round(t.budget)} h proyectadas` : "sin horas proyectadas"} />
        <KpiCard icon="trending-up" label="Horas finales estimadas" value={`${t.eac} h`} hint={t.budget ? `${t.eac >= t.budget ? "+" : ""}${Math.round(((t.eac - t.budget) / t.budget) * 100)}% sobre lo proyectado` : undefined} tone={t.budget && (t.eac - t.budget) / t.budget > 0.1 ? "bad" : "ok"} />
        <KpiCard icon="flame" label="Con sobreconsumo" value={t.overBudget} tone={t.overBudget ? "bad" : "ok"} hint="proyectos que superan o superarían lo proyectado" />
        <KpiCard icon="alert" label="Tareas atrasadas" value={t.overdue} tone={t.overdue ? "bad" : "ok"} hint={`${t.projects} proyectos en el análisis`} />
        <KpiCard icon="users" label="Personas sobrecargadas" value={t.overloaded} tone={t.overloaded ? "bad" : "ok"} hint="más horas que su capacidad (14 d)" />
      </div>

      <div className="kpi-grid">
        <KpiCard icon="hourglass" label="Cambios sin decidir" value={t.pendingChanges} tone={t.pendingChanges ? "bad" : "ok"} hint="solicitudes del cliente en espera" />
        <KpiCard icon="flame" label="Horas absorbidas" value={`${t.absorbedHours} h`} hint="cambios aprobados sin facturar aparte" tone={t.absorbedHours ? "bad" : undefined} />
        <KpiCard icon="trending-up" label="Crecimiento de alcance" value={t.avgScopeGrowth === null ? "—" : `${t.avgScopeGrowth > 0 ? "+" : ""}${t.avgScopeGrowth}%`} hint="promedio sobre el plan original" tone={t.avgScopeGrowth !== null && t.avgScopeGrowth >= 20 ? "bad" : undefined} />
        <KpiCard icon="alert" label="Riesgos altos abiertos" value={t.highRisks} tone={t.highRisks ? "bad" : "ok"} hint={t.lowMaturity ? `${t.lowMaturity} híbrido${t.lowMaturity > 1 ? "s" : ""} con plan poco maduro` : "riesgos, supuestos y desconocidos"} />
      </div>

      {/* ---------- Proyectado vs real ---------- */}
      <div className="pw-section-title" style={{ marginTop: 4 }}>
        Proyectado vs. real por proyecto
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 500, fontSize: 12, color: "var(--text-3)" }}>Ordenar por</span>
        <select className="select" style={{ width: "auto", padding: "2px 8px", fontSize: 12.5 }} value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
          <option value="health">Salud</option>
          <option value="variance">Desvío de plazo</option>
          <option value="hours">Consumo de horas</option>
          <option value="name">Nombre</option>
        </select>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Proyecto</th><th>Salud</th><th>Fin planificado</th><th>Fin real / pronóstico</th><th>Desvío</th>
              <th>Horas reales / proyectadas</th><th>Horas finales est.</th><th>Avance real vs esperado</th><th>A tiempo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9}><Empty icon="search" text="Sin proyectos con esos filtros" /></td></tr>}
            {rows.map((r) => (
              <tr key={r.project.id} style={{ cursor: "pointer" }} onClick={() => onOpen(r.project.id)}>
                <td style={{ minWidth: 200 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><Dot color={r.project.color} /> {r.project.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginLeft: 16 }}>{clientName(r.project.clientId)} · {r.project.status} · {MODE_LABEL[r.mode]}</div>
                </td>
                <td><HealthPill h={r.health} /></td>
                <td>{r.schedule.plannedEnd ? fmtDate(r.schedule.plannedEnd) : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                <td>
                  {r.schedule.actualEnd ? <>{fmtDate(r.schedule.actualEnd)} <span style={{ fontSize: 11, color: "var(--text-3)" }}>real</span></>
                    : r.schedule.forecastEnd ? <>{fmtDate(r.schedule.forecastEnd)} <span style={{ fontSize: 11, color: "var(--text-3)" }}>pronóst.</span></> : <span style={{ color: "var(--text-3)" }}>—</span>}
                </td>
                <td><Variance days={r.schedule.varianceDays} /></td>
                <td><PlanVsReal real={r.hours.logged} plan={r.hours.budget} unit="h" over={(r.hours.consumedPct ?? 0) > 100} /></td>
                <td>
                  {r.hours.eac !== null ? (
                    <>
                      <b>{r.hours.eac} h</b>
                      {r.hours.eacVariancePct !== null && <span className={`pw-pill ${r.hours.eacVariancePct > 15 ? "late" : r.hours.eacVariancePct > 0 ? "soon" : "ok"}`} style={{ marginLeft: 6 }}>{r.hours.eacVariancePct > 0 ? "+" : ""}{r.hours.eacVariancePct}%</span>}
                    </>
                  ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                </td>
                <td><ProgressVsExpected real={r.schedule.realPct} expected={r.schedule.expectedPct} /></td>
                <td>{r.tasks.onTimePct === null ? <span style={{ color: "var(--text-3)" }}>—</span> : <span className={`pw-pill ${r.tasks.onTimePct >= 80 ? "ok" : r.tasks.onTimePct >= 60 ? "soon" : "late"}`}>{r.tasks.onTimePct}%</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>
        La marca vertical de cada barra es lo proyectado / esperado. “Horas finales est.” proyecta las horas totales si se sigue al ritmo actual de consumo contra avance.
      </div>

      <div className="pw-section-title">Alcance, cambios e incertidumbre por proyecto</div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Proyecto</th><th>Modo</th><th>Alcance original → actual</th><th>Cambios del cliente</th><th>Horas absorbidas</th><th>Fin original → actual</th><th>Riesgos altos</th><th>Madurez del plan</th><th>Ritmo</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.project.id} style={{ cursor: "pointer" }} onClick={() => onOpen(r.project.id)}>
                <td style={{ minWidth: 180 }}><div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><Dot color={r.project.color} /> {r.project.name}</div></td>
                <td><span className="pw-pill">{MODE_LABEL[r.mode]}</span></td>
                <td>
                  {r.scope.baselineHours === null ? <span style={{ color: "var(--text-3)" }}>—</span> : (
                    <>{r.scope.baselineHours} → <b>{r.scope.currentHours} h</b> {r.scope.growthPct ? <span className={`pw-pill ${r.scope.growthPct >= 20 ? "late" : r.scope.growthPct >= 10 ? "soon" : ""}`}>+{r.scope.growthPct}%</span> : null}</>
                  )}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {r.scope.total === 0 ? <span style={{ color: "var(--text-3)" }}>—</span> : <>{r.scope.approved} aprob. · {r.scope.rejected} rech. · {r.scope.deferred} dif.{r.scope.pending > 0 && <span className="pw-pill late" style={{ marginLeft: 6 }}>{r.scope.pending} pend.</span>}</>}
                </td>
                <td>{r.scope.absorbedHours ? <b style={{ color: "var(--danger)" }}>{r.scope.absorbedHours} h</b> : <span style={{ color: "var(--text-3)" }}>0</span>}</td>
                <td style={{ fontSize: 12.5 }}>
                  {r.scope.originalEnd ? <>{fmtDate(r.scope.originalEnd).slice(0, 5)} → <b>{r.scope.currentEnd ? fmtDate(r.scope.currentEnd).slice(0, 5) : "—"}</b>{r.scope.endShiftDays ? <span className="pw-pill soon" style={{ marginLeft: 6 }}>+{r.scope.endShiftDays} d</span> : null}</> : <span style={{ color: "var(--text-3)" }}>—</span>}
                </td>
                <td>{r.uncertainty.highRisksOpen ? <span className="pw-pill late">{r.uncertainty.highRisksOpen}</span> : <span style={{ color: "var(--text-3)" }}>0</span>}</td>
                <td>{r.uncertainty.maturityPct === null ? <span style={{ color: "var(--text-3)" }}>—</span> : <span className={`pw-pill ${r.uncertainty.maturityPct >= 70 ? "ok" : r.uncertainty.maturityPct >= 40 ? "soon" : "late"}`}>{r.uncertainty.maturityPct}%</span>}</td>
                <td style={{ fontSize: 12.5 }}>{r.agile.velocityAvg !== null ? <>{r.agile.velocityAvg} h/sprint{r.agile.sprintsLeft !== null && <span style={{ color: "var(--text-3)" }}> · ~{r.agile.sprintsLeft} sprints</span>}</> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
        {/* ---------- Distribución ---------- */}
        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div className="card-title" style={{ margin: 0 }}>Cantidad de tareas por</div>
            <select className="select" style={{ width: "auto", marginLeft: 8, padding: "2px 8px", fontSize: 12.5 }} value={dim} onChange={(e) => setDim(e.target.value as Dim)}>
              <option value="status">Estado</option>
              <option value="priority">Prioridad</option>
              {gFields.filter((f) => hasOptions(f.type)).map((f) => <option key={f.id} value={`f:${f.id}`}>{f.name}</option>)}
            </select>
          </div>
          {buckets.every((b) => b.total === 0) && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Sin tareas.</div>}
          {buckets.filter((b) => b.total > 0).map((b) => (
            <div key={b.key} className="pw-bucket">
              <div className="pw-bucket-name"><span className="pw-dotc" style={{ background: b.color }} /> {b.label}</div>
              <div className="pw-bucket-track" style={{ width: `${(b.total / maxBucket) * 100}%` }}>
                <span style={{ width: `${(b.done / b.total) * 100}%`, background: "var(--success)" }} title={`${b.done} hechas`} />
                <span style={{ width: `${(b.overdue / b.total) * 100}%`, background: "var(--danger)" }} title={`${b.overdue} atrasadas`} />
              </div>
              <div className="pw-bucket-n">{b.total} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{dim !== "status" ? `· ${Math.round((b.done / b.total) * 100)}% hechas` : ""}{b.overdue ? ` · ${b.overdue} atras.` : ""}</span></div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>Verde: hechas · rojo: atrasadas · el resto: abiertas en plazo.</div>
        </div>

        {/* ---------- Sobrecarga de personas ---------- */}
        <div className="card card-pad">
          <div className="card-title">Sobrecarga de personas (próximos 14 días)</div>
          {pf.people.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Sin tareas abiertas asignadas.</div>}
          {pf.people.slice(0, 9).map((p) => {
            const over = p.pct > 100;
            return (
              <div key={p.user.id} className="pw-load">
                <div className="pw-load-name"><Person user={p.user} size={18} /></div>
                <div className="pw-load-track">
                  <div className="pw-load-fill" style={{ width: `${Math.min(100, p.pct)}%`, background: over ? "var(--danger)" : p.pct > 80 ? "var(--warning)" : "var(--accent)" }} />
                  {over && <div className="pw-load-extra" style={{ width: `${Math.min(40, p.pct - 100) }%` }} />}
                </div>
                <div className="pw-load-n" style={{ color: over ? "var(--danger)" : undefined }}>{p.hours} / {p.capacity} h</div>
              </div>
            );
          })}
          {pf.people.length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>
              Horas estimadas de las tareas abiertas que vencen en 14 días (o ya vencidas) contra la jornada semanal. {pf.people.some((p) => p.unestimated) && "Hay tareas sin horas estimadas: la carga real puede ser mayor."}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Puntos críticos ---------- */}
      <div className="pw-section-title">Puntos críticos <span className="pw-pill late">{pf.critical.filter((c) => c.severity === "alta").length} altos</span><span className="pw-pill soon">{pf.critical.filter((c) => c.severity === "media").length} medios</span></div>
      <div className="card" style={{ overflow: "hidden" }}>
        {pf.critical.length === 0 && <div className="card-pad" style={{ color: "var(--success)", fontSize: 13 }}>Sin puntos críticos con estos filtros.</div>}
        {pf.critical.slice(0, 14).map((c, i) => (
          <div key={i} className="pw-task-row" onClick={() => onOpen(c.projectId)}>
            <span className={`pw-pill ${c.severity === "alta" ? "late" : "soon"}`} style={{ width: 52, justifyContent: "center" }}>{c.severity === "alta" ? "Alta" : "Media"}</span>
            <span style={{ fontWeight: 600, minWidth: 180 }}>{nameOf(c.projectId)}</span>
            <span className="name" style={{ fontWeight: 450, color: "var(--text-2)" }}>{c.text}</span>
            <Icon name="chevron-right" size={13} />
          </div>
        ))}
        {pf.critical.length > 14 && <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>y {pf.critical.length - 14} más… (abrí el proyecto para ver el detalle)</div>}
      </div>
    </>
  );
}

/** Tarjeta de indicadores de UN proyecto (ficha). */
export function ProjectIndicatorsCard({ ind, onOpenCritical }: { ind: ProjectIndicators; onOpenCritical?: () => void }) {
  const s = ind.schedule, h = ind.hours, tk = ind.tasks, m = ind.milestones;
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>Indicadores: proyectado vs. real</div>
        <HealthPill h={ind.health} />
      </div>
      <div className="grid-2" style={{ gap: 18, alignItems: "start" }}>
        <div>
          <dl className="pw-kv" style={{ gridTemplateColumns: "140px 1fr", rowGap: 9 }}>
            <dt>Fin planificado</dt><dd>{s.plannedEnd ? fmtDate(s.plannedEnd) : "—"}</dd>
            <dt>{s.actualEnd ? "Fin real" : "Fin pronosticado"}</dt><dd>{(s.actualEnd ?? s.forecastEnd) ? fmtDate((s.actualEnd ?? s.forecastEnd)!) : "—"} <Variance days={s.varianceDays} /></dd>
            <dt>Cerradas a tiempo</dt><dd>{tk.onTimePct === null ? "—" : `${tk.onTimePct}%`}{tk.avgDelayDays ? <span style={{ color: "var(--text-3)", fontSize: 12 }}> · atraso medio {tk.avgDelayDays} d</span> : null}</dd>
            <dt>Hitos cumplidos</dt><dd>{m.met} de {m.total}{m.overdue ? <span className="pw-pill late" style={{ marginLeft: 6 }}>{m.overdue} vencido{m.overdue > 1 ? "s" : ""}</span> : null}{m.avgSlipDays !== null && <span style={{ color: "var(--text-3)", fontSize: 12 }}> · desvío medio {m.avgSlipDays > 0 ? "+" : ""}{m.avgSlipDays} d</span>}</dd>
            <dt>Tareas</dt><dd>{tk.done} hechas · {tk.open} abiertas · {tk.overdue} atrasadas</dd>
          </dl>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="pw-mini-label">Horas reales vs. proyectadas</div>
            <PlanVsReal real={h.logged} plan={h.budget} unit="h" over={(h.consumedPct ?? 0) > 100} />
            {h.eac !== null && h.budget && <div style={{ fontSize: 12, color: h.eacVariancePct! > 15 ? "var(--danger)" : "var(--text-2)", marginTop: 3 }}>Final estimado: <b>{h.eac} h</b> ({h.eacVariancePct! > 0 ? "+" : ""}{h.eacVariancePct}% sobre lo proyectado)</div>}
          </div>
          <div>
            <div className="pw-mini-label">Avance real vs. esperado a la fecha</div>
            <ProgressVsExpected real={s.realPct} expected={s.expectedPct} />
          </div>
        </div>
      </div>
      {(ind.scope.total > 0 || ind.mode !== "planificado") && (
        <div className="pw-method-strip">
          {ind.scope.total > 0 && (
            <div>
              <div className="pw-mini-label">Estabilidad del alcance</div>
              <div style={{ fontSize: 13 }}>
                {ind.scope.growthPct !== null ? <b style={{ color: ind.scope.growthPct >= 20 ? "var(--danger)" : undefined }}>{ind.scope.growthPct > 0 ? "+" : ""}{ind.scope.growthPct}%</b> : "—"} sobre el plan original
                <span style={{ color: "var(--text-3)" }}> · {ind.scope.absorbedHours} h absorbidas · {ind.scope.approved} aprobados, {ind.scope.pending} pendientes, {ind.scope.rejected} rechazados</span>
                {ind.scope.late > 0 && <span className="pw-pill soon" style={{ marginLeft: 6 }}>{ind.scope.late} entró en pleno sprint</span>}
              </div>
            </div>
          )}
          {ind.mode !== "planificado" && (
            <div>
              <div className="pw-mini-label">Ritmo del equipo</div>
              <div style={{ fontSize: 13 }}>
                {ind.agile.velocityAvg !== null ? <><b>{ind.agile.velocityAvg} h</b> por sprint</> : "Sin sprints cerrados"}
                {ind.agile.sprintsLeft !== null && <span style={{ color: "var(--text-3)" }}> · el backlog ({ind.agile.backlogHours} h) llevaría ~{ind.agile.sprintsLeft} sprints</span>}
                {ind.agile.active && <span style={{ color: ind.agile.active.remaining - ind.agile.active.ideal > 8 ? "var(--danger)" : "var(--text-3)" }}> · {ind.agile.active.name}: quedan {ind.agile.active.remaining} h (ideal {ind.agile.active.ideal} h)</span>}
              </div>
            </div>
          )}
          {ind.uncertainty.range && (ind.mode === "hibrido" || ind.uncertainty.maturityPct !== null) && (
            <div>
              <div className="pw-mini-label">Incertidumbre</div>
              <div style={{ fontSize: 13 }}>
                Horas finales entre <b>{ind.uncertainty.range.min}</b> y <b>{ind.uncertainty.range.max} h</b> (probable {ind.uncertainty.range.prob} h)
                <span style={{ color: "var(--text-3)" }}> · madurez del plan {ind.uncertainty.maturityPct ?? "—"}%{ind.uncertainty.reserveUsedPct !== null ? ` · reserva al ${ind.uncertainty.reserveUsedPct}%` : ""}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {ind.critical.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="pw-mini-label">Puntos críticos</div>
          {ind.critical.map((c, i) => (
            <div key={i} className="list-item" style={{ cursor: onOpenCritical ? "pointer" : undefined }} onClick={onOpenCritical}>
              <span className={`pw-pill ${c.severity === "alta" ? "late" : "soon"}`} style={{ width: 52, justifyContent: "center" }}>{c.severity === "alta" ? "Alta" : "Media"}</span>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 12, color: "var(--success)", fontSize: 13 }}>Sin puntos críticos.</div>
      )}
    </div>
  );
}
