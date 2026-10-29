import React, { useEffect, useMemo, useState } from "react";
import { useStore, visibleProjects, expectedMinutesInRange, overtimeBreakdown, computableMinutes } from "../store";
import { addDays, addMonths, fmtDate, downloadFile, fmtDur, toCSV, today, weekStart } from "../utils";
import { HBarChart, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { downloadProjectHoursXlsx } from "../projectHoursReport";

type Period = "semana" | "mes" | "personalizado";

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
  const [projectXlsx, setProjectXlsx] = useState(false);

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

  const byUser = state.users
    .map((u) => {
      const userEntries = filtered.filter((e) => e.userId === u.id);
      const mins = sum(userEntries);
      // "Días con carga" es solo informativo: cuántas fechas distintas tienen
      // algo cargado (puede incluir un fin de semana con horas extra). La
      // jornada esperada (para extra/utilización) NO sale de acá — sale del
      // calendario real del período, ver expectedMinutesInRange.
      const days = new Set(userEntries.map((e) => e.date)).size;
      const expected = expectedMinutesInRange(state, u, rFrom, rTo);
      // Si el período no tiene ningún día laboral (p. ej. se filtró solo un fin
      // de semana), no hay nada "esperado": lo cargado ahí es todo extra, no
      // un faltante — nunca debe leerse como "debajo".
      // Extra: se cuenta cada día hasta completar la jornada y No laborable / Vacaciones
      // no computan (ver overtimeBreakdown); con filtros, solo lo que cae en los registros filtrados.
      const bd = overtimeBreakdown(state, u, rFrom, rTo);
      const overtime = userEntries.reduce((a, e) => a + (bd.perEntry.get(e.id) ?? 0), 0);
      const computable = userEntries.reduce((a, e) => a + computableMinutes(state, e), 0);
      const util = expected > 0 ? Math.min(150, Math.round((computable / expected) * 100)) : computable > 0 ? 150 : 0;
      return { u, mins, days, overtime, util };
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
        {!isEmployee && <button className="btn btn-secondary" onClick={() => setProjectXlsx(true)}><Icon name="download" size={14} /> Excel por proyecto</button>}
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
                {[...state.users].sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (baja)"}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Cliente</label>
            <select className="select" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">Todos</option>
              {[...state.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Proyecto</label>
            <select className="select" value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setSubProjectFilter(""); }}>
              <option value="">Todos</option>
              {[...visibleProjects(state, state.currentUserId)].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {projectFilter && state.subProjects.some((sp) => sp.projectId === projectFilter) && (
            <div className="field">
              <label>Subproyecto</label>
              <select className="select" value={subProjectFilter} onChange={(e) => setSubProjectFilter(e.target.value)}>
                <option value="">Todos</option>
                {state.subProjects.filter((sp) => sp.projectId === projectFilter).sort((a, b) => a.name.localeCompare(b.name)).map((sp) => (
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
      {projectXlsx && (
        <ProjectXlsxModal
          initialProject={projectFilter} initialFrom={rFrom} initialTo={rTo}
          onClose={() => setProjectXlsx(false)}
        />
      )}
    </>
  );
}

/** Excel de un proyecto: una hoja por mes con las horas de cada persona. */
function ProjectXlsxModal({ initialProject, initialFrom, initialTo, onClose }: { initialProject: string; initialFrom: string; initialTo: string; onClose: () => void }) {
  const { state } = useStore();
  const toast = useToast();
  const [projectId, setProjectId] = useState(initialProject);
  const [from, setFrom] = useState(initialFrom.slice(0, 8) + "01");
  const [to, setTo] = useState(initialTo);
  const [busy, setBusy] = useState(false);
  const project = state.projects.find((p) => p.id === projectId);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
  const members = useMemo(() => state.users.filter((u) => project?.memberIds.includes(u.id)).sort(byName), [state.users, project]);
  // Quienes cargaron horas al proyecto en el plazo sin ser integrantes
  const others = useMemo(() => {
    const ids = new Set(state.entries.filter((e) => e.projectId === projectId && e.date >= from && e.date <= to).map((e) => e.userId));
    return state.users.filter((u) => ids.has(u.id) && !project?.memberIds.includes(u.id)).sort(byName);
  }, [state.entries, state.users, project, projectId, from, to]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const memberKey = members.map((u) => u.id).join(",");
  useEffect(() => { setSelected(new Set(memberKey ? memberKey.split(",") : [])); }, [memberKey]);
  const candidates = [...members, ...others];
  const toggle = (id: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chosen = candidates.filter((u) => selected.has(u.id)).map((u) => u.id);
  const months = from && to && from <= to ? (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1 : 0;
  const error = !projectId ? "Elegí un proyecto." : !from || !to ? "Completá las fechas." : from > to ? "La fecha de inicio es posterior a la de fin." : months > 24 ? "El plazo puede abarcar hasta 24 meses." : chosen.length === 0 ? "Elegí al menos una persona." : "";

  async function generate() {
    if (error) return;
    setBusy(true);
    try {
      const file = await downloadProjectHoursXlsx(state, projectId, from, to, chosen);
      toast(`Excel generado: ${file}`);
      onClose();
    } catch {
      toast("No se pudo generar el Excel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Excel de horas por proyecto"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!!error || busy} onClick={generate}><Icon name="download" size={14} /> {busy ? "Generando…" : "Descargar Excel"}</button>
        </>
      }
    >
      <div className="field">
        <label>Proyecto</label>
        <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Elegir proyecto…</option>
          {[...state.projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.status !== "activo" ? ` (${p.status})` : ""}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Desde</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Hasta</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {projectId && (
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Personas ({chosen.length} de {candidates.length})
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(candidates.map((u) => u.id)))}>Todas</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Ninguna</button>
          </label>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
            {candidates.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>El proyecto no tiene integrantes ni horas cargadas en el plazo.</div>}
            {members.length > 0 && <div style={{ fontSize: 11, fontWeight: 650, color: "var(--text-3)", textTransform: "uppercase", margin: "2px 0 4px" }}>Integrantes del proyecto</div>}
            {members.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /> {u.name}{!u.active ? " (inactivo)" : ""}
              </label>
            ))}
            {others.length > 0 && <div style={{ fontSize: 11, fontWeight: 650, color: "var(--text-3)", textTransform: "uppercase", margin: "8px 0 4px" }}>Cargaron horas sin ser integrantes</div>}
            {others.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /> {u.name}{!u.active ? " (inactivo)" : ""}
              </label>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        Una hoja Resumen y una por mes{months > 0 ? ` (${months} hoja${months > 1 ? "s" : ""} de mes)` : ""}, con una fila por cada persona elegida: horas cargadas al proyecto, extra, recuperadas y netas.
      </div>
      <ul style={{ fontSize: 12, color: "var(--text-3)", margin: "8px 0 0", paddingLeft: 18 }}>
        <li><b>Extra</b>: total de la persona (todos sus proyectos), cada día se cuentan las horas hasta completar la jornada y el resto es extra; No laborable y Vacaciones no computan.</li>
        <li><b>Recuperadas</b>: total de la persona, compensaciones de horas aprobadas que empiezan en el mes.</li>
        <li><b>Netas</b>: extra − recuperadas.</li>
      </ul>
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{error}</div>}
    </Modal>
  );
}
