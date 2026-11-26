import React, { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Dot, Empty, useToast } from "../components/ui";
import type { Project } from "../types";
import { downloadFile, fmtDur, toCSV, today } from "../utils";
import {
  addMonths,
  allocationIndicator,
  allocationRows,
  monthLabel,
  monthOf,
  personTotals,
  type AllocationRow,
} from "./allocation";
import { useAllocations } from "./allocationStore";
import { useEnv } from "./env";
import { KpiCard, Person } from "./parts";
import { useWork } from "./workStore";

interface AllocationPanelProps {
  projectIds: Set<string>;
}

export function AllocationPanel({ projectIds }: AllocationPanelProps) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();

  const currentMonth = useMemo(() => monthOf(today()), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [projectFilter, setProjectFilter] = useState<string>("todos");

  const fromMonth = useMemo(() => addMonths(selectedMonth, -5), [selectedMonth]);
  const toMonth = selectedMonth;

  const { allocations, hours, loading, error, missingSchema, setPct } = useAllocations(fromMonth, toMonth);

  const canEdit = env.me.role === "admin" || env.me.role === "gerente" || env.me.role === "supervisor";

  // Proyectos visibles según los permitidos
  const visibleProjects = useMemo(
    () => env.projects.filter((p) => projectIds.has(p.id)),
    [env.projects, projectIds],
  );

  const filteredProjects = useMemo(() => {
    if (projectFilter === "todos") return visibleProjects;
    return visibleProjects.filter((p) => p.id === projectFilter);
  }, [visibleProjects, projectFilter]);

  // Asignaciones y horas de los proyectos visibles en el rango
  const visibleAllocations = useMemo(
    () => allocations.filter((a) => projectIds.has(a.projectId)),
    [allocations, projectIds],
  );
  const visibleHours = useMemo(
    () => hours.filter((h) => projectIds.has(h.projectId)),
    [hours, projectIds],
  );

  // Filas del mes seleccionado para los proyectos visibles
  const selectedRows = useMemo(
    () => allocationRows(visibleAllocations, visibleHours, selectedMonth, currentMonth),
    [visibleAllocations, visibleHours, selectedMonth, currentMonth],
  );

  // Totales de todas las personas sobre los proyectos que el usuario puede ver
  const totals = useMemo(() => personTotals(selectedRows), [selectedRows]);
  const overassignedCount = useMemo(
    () => Object.values(totals).filter((p) => p.sobreasignada).length,
    [totals],
  );

  // Filas según filtro activo para el cálculo del indicador del mes
  const indicatorRows = useMemo(() => {
    if (projectFilter === "todos") return selectedRows;
    return selectedRows.filter((r) => r.projectId === projectFilter);
  }, [selectedRows, projectFilter]);

  const indicator = useMemo(() => allocationIndicator(indicatorRows), [indicatorRows]);

  // Tendencia de los 6 meses
  const trendMonths = useMemo(() => {
    const list: string[] = [];
    for (let i = -5; i <= 0; i++) {
      list.push(addMonths(selectedMonth, i));
    }
    return list;
  }, [selectedMonth]);

  const trendData = useMemo(() => {
    return trendMonths.map((m) => {
      const rowsM = allocationRows(visibleAllocations, visibleHours, m, currentMonth);
      const filteredM = projectFilter === "todos" ? rowsM : rowsM.filter((r) => r.projectId === projectFilter);
      const indM = allocationIndicator(filteredM);
      const totalMinutes = filteredM.reduce((sum, r) => sum + r.minutes, 0);
      return {
        month: m,
        cumplimiento: indM.cumplimiento,
        desvioMedio: indM.desvioMedio,
        totalMinutes,
        unplannedCount: indM.unplannedCount,
        parcial: m === currentMonth,
        future: m > currentMonth,
      };
    });
  }, [trendMonths, visibleAllocations, visibleHours, currentMonth, projectFilter]);

  // Obtiene las personas relevantes para un proyecto en el mes seleccionado
  const getProjectPeopleIds = (project: Project): string[] => {
    const set = new Set<string>();
    project.memberIds.forEach((id) => set.add(id));
    work.assignments.filter((a) => a.projectId === project.id).forEach((a) => set.add(a.userId));
    allocations
      .filter((a) => a.projectId === project.id && monthOf(a.month) === selectedMonth)
      .forEach((a) => set.add(a.userId));
    hours
      .filter((h) => h.projectId === project.id && monthOf(h.month) === selectedMonth && h.minutes > 0)
      .forEach((h) => set.add(h.userId));

    return Array.from(set).sort((a, b) => {
      const uA = env.users.find((u) => u.id === a)?.name ?? a;
      const uB = env.users.find((u) => u.id === b)?.name ?? b;
      return uA.localeCompare(uB);
    });
  };

  const handleExportCSV = () => {
    const headers = ["Proyecto", "Persona", "Email", "Teórico %", "Real %", "Horas reales", "Desvío pp", "Planificada"];
    const csvData: (string | number)[][] = [headers];

    for (const p of filteredProjects) {
      const pPeopleIds = getProjectPeopleIds(p);
      for (const userId of pPeopleIds) {
        const user = env.users.find((u) => u.id === userId);
        const row = selectedRows.find((r) => r.projectId === p.id && r.userId === userId);
        const teorico = row ? row.teorico : 0;
        const real = row && row.real !== null ? `${row.real}%` : "";
        const realHours = row ? (row.minutes / 60).toFixed(1) : "0.0";
        const desvio = row && row.desvio !== null ? row.desvio : "";
        const planificada = row && row.teorico > 0 ? "Sí" : "No";

        csvData.push([
          p.name,
          user?.name ?? userId,
          user?.email ?? "",
          teorico,
          real,
          realHours,
          desvio,
          planificada,
        ]);
      }
    }

    downloadFile(`asignacion_${selectedMonth}.csv`, toCSV(csvData));
  };

  if (missingSchema) {
    return (
      <div className="card card-pad" style={{ marginTop: 14 }}>
        <Empty
          icon="alert"
          text="Falta correr la fase 36 en Supabase"
          sub="Ejecutá sql/supabase_schema_phase36_roles_y_asignacion_proyecto.sql en Supabase para habilitar las tablas y funciones de asignación mensual."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card card-pad" style={{ marginTop: 14 }}>
        <Empty icon="alert" text="Error al cargar asignaciones" sub={error} />
      </div>
    );
  }

  const isCurrent = selectedMonth === currentMonth;
  const isFuture = selectedMonth > currentMonth;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
      {/* Barra superior de controles */}
      <div className="card card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}
            title="Mes anterior"
          >
            <Icon name="arrow-left" size={14} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 15, minWidth: 150, textAlign: "center" }}>
            {monthLabel(selectedMonth)}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
            title="Mes siguiente"
          >
            <Icon name="arrow-right" size={14} />
          </button>
          {selectedMonth !== currentMonth && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11.5 }}
              onClick={() => setSelectedMonth(currentMonth)}
            >
              Mes actual
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            className="select"
            style={{ minWidth: 200, fontSize: 13 }}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="todos">Todos los proyectos ({visibleProjects.length})</option>
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
            <Icon name="download" size={13} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="kpi-grid">
        <KpiCard
          icon="check-circle"
          label="Cumplimiento"
          value={indicator.cumplimiento !== null ? `${Math.round(indicator.cumplimiento)}%` : "—"}
          hint={isCurrent ? "mes en curso" : isFuture ? "mes futuro" : undefined}
          tone={indicator.cumplimiento !== null ? (indicator.cumplimiento >= 80 ? "ok" : indicator.cumplimiento < 60 ? "bad" : undefined) : undefined}
        />
        <KpiCard
          icon="alert"
          label="Desvío medio"
          value={indicator.desvioMedio !== null ? `${indicator.desvioMedio} pp` : "—"}
          hint={indicator.desvioMedio !== null ? "desvío absoluto ponderado" : undefined}
          tone={indicator.desvioMedio !== null ? (indicator.desvioMedio > 20 ? "bad" : indicator.desvioMedio <= 10 ? "ok" : undefined) : undefined}
        />
        <KpiCard
          icon="flame"
          label="Sobreasignadas"
          value={overassignedCount}
          hint={overassignedCount > 0 ? `${overassignedCount} persona${overassignedCount > 1 ? "s" : ""} superan el 100%` : "todas dentro del 100%"}
          tone={overassignedCount > 0 ? "bad" : "ok"}
        />
        <KpiCard
          icon="clock"
          label="Horas no planificadas"
          value={fmtDur(indicator.unplannedMinutes)}
          hint={`${indicator.unplannedCount} fila${indicator.unplannedCount === 1 ? "" : "s"} sin teórico`}
          tone={indicator.unplannedCount > 0 ? "bad" : "ok"}
        />
      </div>

      {/* Tablas por proyecto */}
      {filteredProjects.length === 0 ? (
        <div className="card card-pad">
          <Empty icon="info" text="No hay proyectos para mostrar" />
        </div>
      ) : (
        filteredProjects.map((p) => {
          const peopleIds = getProjectPeopleIds(p);
          return (
            <div className="card card-pad" key={p.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Dot color={p.color} />
                <span className="card-title" style={{ margin: 0 }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>
                  {peopleIds.length} persona{peopleIds.length !== 1 ? "s" : ""}
                </span>
              </div>

              {peopleIds.length === 0 ? (
                <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
                  Sin personas asignadas ni horas registradas en este proyecto.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Persona</th>
                        <th style={{ width: 120, textAlign: "right" }}>Teórico</th>
                        <th style={{ width: 90, textAlign: "right" }}>Real %</th>
                        <th style={{ width: 110, textAlign: "right" }}>Horas reales</th>
                        <th style={{ width: 100, textAlign: "right" }}>Desvío</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peopleIds.map((userId) => {
                        const user = env.users.find((u) => u.id === userId);
                        const row: AllocationRow | undefined = selectedRows.find(
                          (r) => r.projectId === p.id && r.userId === userId,
                        );
                        const isOverassigned = totals[userId]?.sobreasignada;
                        const totalPct = totals[userId]?.teorico ?? 0;

                        const teoricoVal = row ? row.teorico : null;
                        const desvioVal = row ? row.desvio : null;
                        const absDesvio = desvioVal !== null ? Math.abs(desvioVal) : 0;
                        const desvioColor =
                          desvioVal === null
                            ? undefined
                            : absDesvio > 20
                            ? "var(--danger)"
                            : absDesvio > 10
                            ? "var(--warning)"
                            : undefined;

                        return (
                          <tr key={userId}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <Person user={user} size={20} />
                                {isOverassigned && (
                                  <span
                                    className="pw-pill late"
                                    title={`Sobreasignada: suma ${totalPct}% de asignación total en el mes`}
                                    style={{ fontSize: 11 }}
                                  >
                                    Sobreasignada ({totalPct}%)
                                  </span>
                                )}
                                {row?.unplanned && (
                                  <span className="badge" style={{ fontSize: 11 }}>
                                    No planificada
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <TheoreticalInput
                                value={teoricoVal}
                                canEdit={canEdit}
                                onSave={async (val) => {
                                  const err = await setPct(p.id, userId, selectedMonth, val);
                                  if (err) toast(err);
                                }}
                              />
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {isFuture ? "—" : row && row.real !== null ? `${row.real}%` : "0%"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {isFuture ? "—" : fmtDur(row?.minutes ?? 0)}
                            </td>
                            <td style={{ textAlign: "right", color: desvioColor, fontWeight: absDesvio > 10 ? 600 : undefined }}>
                              {isFuture || desvioVal === null ? "—" : `${desvioVal > 0 ? `+${desvioVal}` : desvioVal} pp`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Tendencia últimos 6 meses */}
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 12 }}>
          Tendencia de cumplimiento (últimos 6 meses)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Mes</th>
                <th style={{ textAlign: "right" }}>Cumplimiento</th>
                <th style={{ textAlign: "right" }}>Desvío medio</th>
                <th style={{ textAlign: "right" }}>Horas reales</th>
                <th style={{ textAlign: "right" }}>Filas no planificadas</th>
              </tr>
            </thead>
            <tbody>
              {trendData.map((t) => (
                <tr
                  key={t.month}
                  style={t.month === selectedMonth ? { fontWeight: 600, background: "var(--hover-bg, rgba(0,0,0,0.02))" } : undefined}
                >
                  <td style={{ textAlign: "left" }}>
                    {monthLabel(t.month)}
                    {t.parcial && (
                      <span className="pw-pill" style={{ marginLeft: 6, fontSize: 11 }}>
                        en curso
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {t.cumplimiento !== null ? `${Math.round(t.cumplimiento)}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {t.desvioMedio !== null ? `${t.desvioMedio} pp` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>{fmtDur(t.totalMinutes)}</td>
                  <td style={{ textAlign: "right" }}>{t.unplannedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nota breve explicativa */}
      <div style={{ fontSize: 12, color: "var(--text-3)", padding: "0 4px" }}>
        Un supervisor solo ve y edita los proyectos donde participa; la asignación total de una persona se calcula con los proyectos que podés ver.
      </div>
    </div>
  );
}

/**
 * Input para edición de porcentaje teórico.
 * Guarda al salir o al presionar Enter; vacío borra la asignación; fuera de 0-100 avisa y revierte.
 */
function TheoreticalInput({
  value,
  canEdit,
  onSave,
}: {
  value: number | null;
  canEdit: boolean;
  onSave: (val: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string>(value !== null ? String(value) : "");
  const toast = useToast();

  React.useEffect(() => {
    setDraft(value !== null ? String(value) : "");
  }, [value]);

  const commitValue = async () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value !== null) {
        await onSave(null);
      }
      return;
    }

    const num = Number(trimmed);
    if (isNaN(num) || num < 0 || num > 100) {
      setDraft(value !== null ? String(value) : "");
      toast("La asignación teórica debe estar entre 0% y 100%");
      return;
    }

    if (num !== value) {
      await onSave(num);
    }
  };

  if (!canEdit) {
    return <span>{value !== null ? `${value}%` : "—"}</span>;
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
      <input
        className="input"
        type="number"
        min={0}
        max={100}
        step="any"
        style={{ width: 62, padding: "2px 6px", textAlign: "right", fontSize: 12.5 }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          void commitValue();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>%</span>
    </div>
  );
}
