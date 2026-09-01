import React, { useMemo, useState } from "react";
import { useStore, visibleProjects, holidayDateSet } from "../store";
import { addDays, addMonths, fmtDate, downloadFile, fmtDur, toCSV, today, weekStart } from "../utils";
import { HBarChart, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import type { AbsenceType, User } from "../types";

type Period = "semana" | "mes" | "personalizado";

/** Tipos de ausencia que sacan el día entero de la jornada esperada (a diferencia
 * de, por ejemplo, "Trabajo remoto" u "Horario reducido", donde igual se trabaja). */
const FULL_DAY_ABSENCE_TYPES: AbsenceType[] = [
  "Vacaciones", "Licencia médica", "Maternidad/Paternidad", "Licencia por estudio", "Día personal", "Permiso especial",
];

/**
 * Minutos esperados de una persona en [from, to]: recorre día por día del
 * período, cuenta solo sus días laborales habilitados (u.workDays) y
 * descarta feriados y ausencias de día completo ya aprobadas (vacaciones,
 * licencias, etc.) — un feriado o unas vacaciones no cuentan como jornada
 * exigida. No usa un "/5" fijo: la tarifa diaria sale de sus propios días
 * laborales (podría trabajar, por ejemplo, solo 3 días por semana).
 */
function expectedMinutesInRange(u: User, from: string, to: string, holidays: Set<string>, absences: { userId: string; type: AbsenceType; status: string; dateFrom: string; dateTo: string }[]): number {
  const offDays = new Set<string>();
  for (const a of absences) {
    if (a.userId !== u.id || a.status !== "Aprobado" || !FULL_DAY_ABSENCE_TYPES.includes(a.type)) continue;
    if (a.dateTo < from || a.dateFrom > to) continue;
    let d = a.dateFrom < from ? from : a.dateFrom;
    const end = a.dateTo > to ? to : a.dateTo;
    let guard = 0;
    while (d <= end && guard < 400) {
      offDays.add(d);
      d = addDays(d, 1);
      guard++;
    }
  }

  const dailyMin = u.jornada === "media" ? 4 * 60 : (u.weeklyHours * 60) / Math.max(1, u.workDays.length);
  let expectedDays = 0;
  let d = from;
  let guard = 0;
  while (d <= to && guard < 400) {
    const dow = ((new Date(d + "T00:00:00").getDay() + 6) % 7) + 1; // 1=Lun..7=Dom
    if (u.workDays.includes(dow) && !holidays.has(d) && !offDays.has(d)) expectedDays++;
    d = addDays(d, 1);
    guard++;
  }
  return dailyMin * expectedDays;
}

export function Reports() {
  const { state } = useStore();
  const toast = useToast();
  const t = today();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  // El supervisor ve reportes propios como un empleado; su vista de equipo vive
  // en Control de horas, no acá.
  const isEmployee = me.role === "usuario" || me.role === "supervisor";
  const [period, setPeriod] = useState<Period>("semana");
  // Ancla de navegación para semana/mes (las flechitas la mueven); "personalizado"
  // usa sus propios campos Desde/Hasta y no depende de esto.
  const [anchor, setAnchor] = useState(t);
  const [from, setFrom] = useState(weekStart(t));
  const [to, setTo] = useState(addDays(weekStart(t), 6));
  const [userFilterRaw, setUserFilter] = useState("");
  // Los usuarios solo ven sus propios datos
  const userFilter = isEmployee ? me.id : userFilterRaw;
  const [projectFilter, setProjectFilter] = useState("");
  const [subProjectFilter, setSubProjectFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const [rFrom, rTo] = useMemo((): [string, string] => {
    if (period === "semana") return [weekStart(anchor), addDays(weekStart(anchor), 6)];
    if (period === "mes") {
      const monthStart = anchor.slice(0, 8) + "01";
      return [monthStart, addDays(addMonths(monthStart, 1), -1)];
    }
    return [from, to];
  }, [period, from, to, anchor]);

  function shiftAnchor(n: number) {
    setAnchor((a) => (period === "mes" ? addMonths(a, n) : addDays(a, n * 7)));
  }

  const filtered = useMemo(
    () =>
      state.entries.filter((e) => {
        if (e.date < rFrom || e.date > rTo) return false;
        if (userFilter && e.userId !== userFilter) return false;
        if (projectFilter && e.projectId !== projectFilter) return false;
        if (subProjectFilter && e.subProjectId !== subProjectFilter) return false;
        if (clientFilter) {
          const p = state.projects.find((x) => x.id === e.projectId);
          if (p?.clientId !== clientFilter) return false;
        }
        return true;
      }),
    [state.entries, state.projects, rFrom, rTo, userFilter, projectFilter, subProjectFilter, clientFilter],
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

  const holidays = useMemo(() => holidayDateSet(state), [state.holidays]);

  const byUser = state.users
    .map((u) => {
      const userEntries = filtered.filter((e) => e.userId === u.id);
      const mins = sum(userEntries);
      // "Días con carga" es solo informativo: cuántas fechas distintas tienen
      // algo cargado (puede incluir un fin de semana con horas extra). La
      // jornada esperada (para extra/utilización) NO sale de acá — sale del
      // calendario real del período, ver expectedMinutesInRange.
      const days = new Set(userEntries.map((e) => e.date)).size;
      const expected = expectedMinutesInRange(u, rFrom, rTo, holidays, state.absences);
      return { u, mins, days, overtime: Math.max(0, mins - expected), util: expected ? Math.min(150, Math.round((mins / expected) * 100)) : 0 };
    })
    .filter((x) => x.mins > 0)
    .sort((a, b) => b.mins - a.mins);

  const absencesInRange = state.absences.filter((a) => a.dateFrom <= rTo && a.dateTo >= rFrom);

  function exportCSV() {
    const rows: (string | number)[][] = [
      ["Fecha", "Persona", "Cliente", "Proyecto", "Subproyecto", "Descripción", "Inicio", "Fin", "Horas"],
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
          state.subProjects.find((sp) => sp.id === e.subProjectId)?.name ?? "",
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
        <button className="btn btn-secondary" onClick={exportCSV}><Icon name="download" size={14} /> CSV / Excel</button>
        <button className="btn btn-secondary" onClick={() => { window.print(); }}><Icon name="printer" size={14} /> PDF</button>
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
          {(period === "semana" || period === "mes") && (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => shiftAnchor(-1)} aria-label={period === "mes" ? "Mes anterior" : "Semana anterior"}>
                <Icon name="arrow-left" size={14} />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(t)}>Hoy</button>
              <button className="btn btn-secondary btn-sm" onClick={() => shiftAnchor(1)} aria-label={period === "mes" ? "Mes siguiente" : "Semana siguiente"}>
                <Icon name="arrow-right" size={14} />
              </button>
            </div>
          )}
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
            <select className="select" value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setSubProjectFilter(""); }}>
              <option value="">Todos</option>
              {visibleProjects(state, state.currentUserId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {projectFilter && state.subProjects.some((sp) => sp.projectId === projectFilter) && (
            <div className="field">
              <label>Subproyecto</label>
              <select className="select" value={subProjectFilter} onChange={(e) => setSubProjectFilter(e.target.value)}>
                <option value="">Todos</option>
                {state.subProjects.filter((sp) => sp.projectId === projectFilter).map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <p className="page-sub" style={{ margin: "0 0 14px" }}>
        Período: {fmtDate(rFrom)} → {fmtDate(rTo)} · {filtered.length} registros
      </p>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
        <div className="card kpi">
          <span className="label"><Icon name="timer" size={14} /> Total de horas</span>
          <div className="value">{fmtDur(total)}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="dashboard" size={14} /> Registros</span>
          <div className="value">{filtered.length}</div>
          <div className="hint">{new Set(filtered.map((e) => e.date)).size} días con carga</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="sun" size={14} /> Ausencias en el período</span>
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
        <div className="card-title" style={{ padding: "14px 16px 0" }}>Horas por usuario — balance, extras y utilización</div>
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
