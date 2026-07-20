import React, { useMemo, useState } from "react";
import { useStore, visibleProjects } from "../store";
import { addDays, dayLabel, downloadFile, fmtDur, toCSV, today, weekStart } from "../utils";
import { HBarChart, useToast } from "../components/ui";

type Period = "semana" | "mes" | "personalizado";

export function Reports() {
  const { state } = useStore();
  const toast = useToast();
  const t = today();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const isEmployee = me.role === "empleado";
  const [period, setPeriod] = useState<Period>("semana");
  const [from, setFrom] = useState(weekStart(t));
  const [to, setTo] = useState(addDays(weekStart(t), 6));
  const [userFilterRaw, setUserFilter] = useState("");
  // Los empleados solo ven sus propios datos
  const userFilter = isEmployee ? me.id : userFilterRaw;
  const [projectFilter, setProjectFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const [rFrom, rTo] = useMemo((): [string, string] => {
    if (period === "semana") return [weekStart(t), addDays(weekStart(t), 6)];
    if (period === "mes") return [t.slice(0, 8) + "01", t];
    return [from, to];
  }, [period, from, to, t]);

  const filtered = useMemo(
    () =>
      state.entries.filter((e) => {
        if (e.date < rFrom || e.date > rTo) return false;
        if (userFilter && e.userId !== userFilter) return false;
        if (projectFilter && e.projectId !== projectFilter) return false;
        if (clientFilter) {
          const p = state.projects.find((x) => x.id === e.projectId);
          if (p?.clientId !== clientFilter) return false;
        }
        return true;
      }),
    [state.entries, state.projects, rFrom, rTo, userFilter, projectFilter, clientFilter],
  );

  const sum = (list: typeof filtered) => list.reduce((a, e) => a + (e.end - e.start), 0);
  const total = sum(filtered);

  const byProject = state.projects
    .map((p) => ({ name: p.name, color: p.color, value: sum(filtered.filter((e) => e.projectId === p.id)) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const byClient = state.clients
    .map((c) => ({
      name: c.name,
      color: c.color,
      value: sum(filtered.filter((e) => state.projects.find((p) => p.id === e.projectId)?.clientId === c.id)),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const byUser = state.users
    .map((u) => {
      const mins = sum(filtered.filter((e) => e.userId === u.id));
      const days = new Set(filtered.filter((e) => e.userId === u.id).map((e) => e.date)).size;
      const expected = (u.weeklyHours / 5) * 60 * Math.max(days, 1);
      return { u, mins, days, overtime: Math.max(0, mins - expected), util: expected ? Math.min(150, Math.round((mins / expected) * 100)) : 0 };
    })
    .filter((x) => x.mins > 0)
    .sort((a, b) => b.mins - a.mins);

  const absencesInRange = state.absences.filter((a) => a.dateFrom <= rTo && a.dateTo >= rFrom);

  function exportCSV() {
    const rows: (string | number)[][] = [
      ["Fecha", "Persona", "Cliente", "Proyecto", "Tarea", "Descripción", "Inicio", "Fin", "Horas"],
      ...filtered.map((e) => {
        const p = state.projects.find((x) => x.id === e.projectId);
        const c = state.clients.find((x) => x.id === p?.clientId);
        const u = state.users.find((x) => x.id === e.userId);
        const hrs = (e.end - e.start) / 60;
        return [
          e.date,
          u?.name ?? "",
          c?.name ?? "",
          p?.name ?? "",
          p?.tasks.find((tk) => tk.id === e.taskId)?.name ?? "",
          e.description,
          `${Math.floor(e.start / 60)}:${String(e.start % 60).padStart(2, "0")}`,
          `${Math.floor(e.end / 60)}:${String(e.end % 60).padStart(2, "0")}`,
          hrs.toFixed(2).replace(".", ","),
        ];
      }),
    ];
    downloadFile(`reporte-horas_${rFrom}_${rTo}.csv`, toCSV(rows));
    toast("CSV exportado (compatible con Excel).");
  }

  return (
    <>
      <div className="page-head">
        <h1>Reportes</h1>
        <span className="spacer" />
        <button className="btn btn-secondary" onClick={exportCSV}>⬇ CSV / Excel</button>
        <button className="btn btn-secondary" onClick={() => { window.print(); }}>🖨 PDF</button>
      </div>

      <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="tabs">
            {(["semana", "mes", "personalizado"] as Period[]).map((p) => (
              <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)} style={{ textTransform: "capitalize" }}>
                {p}
              </button>
            ))}
          </div>
          {period === "personalizado" && (
            <>
              <div className="field">
                <label>Desde</label>
                <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label>Hasta</label>
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {!isEmployee && (
            <div className="field">
              <label>Persona</label>
              <select className="select" value={userFilterRaw} onChange={(e) => setUserFilter(e.target.value)}>
                <option value="">Todas</option>
                {state.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Cliente</label>
            <select className="select" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">Todos</option>
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Proyecto</label>
            <select className="select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">Todos</option>
              {visibleProjects(state, state.currentUserId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="page-sub" style={{ margin: "0 0 14px" }}>
        Período: {dayLabel(rFrom)} → {dayLabel(rTo)} · {filtered.length} registros
      </p>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        <div className="card kpi">
          <span className="label">⏱️ Total de horas</span>
          <div className="value">{fmtDur(total)}</div>
        </div>
        <div className="card kpi">
          <span className="label">📊 Registros</span>
          <div className="value">{filtered.length}</div>
          <div className="hint">{new Set(filtered.map((e) => e.date)).size} días con carga</div>
        </div>
        <div className="card kpi">
          <span className="label">🌴 Ausencias en el período</span>
          <div className="value">{absencesInRange.length}</div>
          <div className="hint">{absencesInRange.filter((a) => a.status === "Pendiente").length} pendientes</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <div className="card-title">Horas por proyecto</div>
          <HBarChart data={byProject} fmt={fmtDur} />
        </div>
        <div className="card card-pad">
          <div className="card-title">Horas por cliente</div>
          <HBarChart data={byClient} fmt={fmtDur} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, overflowX: "auto" }}>
        <div className="card-title" style={{ padding: "14px 16px 0" }}>Horas por empleado — balance, extras y utilización</div>
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Horas</th>
              <th>Días con carga</th>
              <th>Horas extra</th>
              <th>Utilización</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {byUser.map(({ u, mins, days, overtime, util }) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td style={{ fontFamily: "var(--mono)" }}>{fmtDur(mins)}</td>
                <td>{days}</td>
                <td style={{ fontFamily: "var(--mono)", color: overtime > 0 ? "var(--warning)" : "var(--text-3)" }}>
                  {overtime > 0 ? fmtDur(overtime) : "—"}
                </td>
                <td style={{ minWidth: 140 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div className="progress" style={{ flex: 1 }}>
                      <div style={{ width: `${Math.min(100, util)}%`, background: util > 110 ? "var(--danger)" : util < 60 ? "var(--warning)" : "var(--success)" }} />
                    </div>
                    <span style={{ fontSize: 12, fontFamily: "var(--mono)" }}>{util}%</span>
                  </div>
                </td>
                <td>
                  {util >= 95 && util <= 110 ? (
                    <span className="badge ok">Al día</span>
                  ) : util > 110 ? (
                    <span className="badge bad">Exceso</span>
                  ) : (
                    <span className="badge warn">Debajo</span>
                  )}
                </td>
              </tr>
            ))}
            {byUser.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-3)" }}>Sin datos en el período seleccionado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
