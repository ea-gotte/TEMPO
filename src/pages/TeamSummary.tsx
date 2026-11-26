import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { computeFlightHours } from "../flightHours";
import { computeSkills, type SkillEntry } from "../skills";
import { addMonths, fmtDur, fmtYearsSince, monthLabel, today } from "../utils";
import { staffMatrix } from "../staffMatrix";
import { Avatar, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import type { Role } from "../types";

/**
 * Resumen del equipo para admin/gerente: cruza en una sola tabla la
 * experiencia real por actividad (Horas de vuelo) con la autopercepción
 * (Habilidades) y la formación, para poder evaluar aptitudes y asignar la
 * tarea más indicada según experiencia. No agrega ningún dato nuevo — todo
 * se deriva de lo que ya existe en Perfil profesional.
 */

const ROLE_LABELS: Record<Role, string> = { admin: "Administrador", gerente: "Gerente", supervisor: "Supervisor", usuario: "Usuario" };

function formatSkill(s: SkillEntry): string {
  if (s.type === "rating5") return `${s.label}: ${s.value}/5`;
  if (s.type === "yesno") return `${s.label}: ${s.value === "si" ? "Sí" : "No"}`;
  return `${s.label}: ${s.value}`;
}

type SortKey = "name" | "workExp" | "bimExp" | string; // string = activityId

export function TeamSummary() {
  const { state } = useStore();
  const [view, setView] = useState<"experiencia" | "proyectos">("experiencia");
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [minHours, setMinHours] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(
    () =>
      state.users
        .filter((u) => u.active)
        .map((u) => ({
          user: u,
          flight: computeFlightHours(state, u.id),
          skills: computeSkills(state, u.id),
          profile: state.professionalProfiles.find((p) => p.id === u.id) ?? null,
        })),
    [state],
  );

  // Columnas: una por actividad que tenga horas de vuelo en ALGUIEN del equipo
  // (no todo el catálogo — evita columnas siempre vacías).
  const activityColumns = useMemo(() => {
    const map = new Map<string, { name: string; categoryName: string }>();
    for (const r of rows) {
      for (const cat of r.flight.categories) {
        for (const act of cat.activities) {
          if (!map.has(act.activityId)) map.set(act.activityId, { name: act.name, categoryName: cat.name });
        }
      }
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name));
  }, [rows]);

  function minutesFor(r: (typeof rows)[number], activityId: string): number {
    for (const cat of r.flight.categories) {
      for (const act of cat.activities) {
        if (act.activityId === activityId) return act.minutes;
      }
    }
    return 0;
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <Icon name="chevron-right" size={11} style={{ transform: sortDir === "asc" ? "rotate(-90deg)" : "rotate(90deg)" }} />;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = minHours ? Number(minHours) * 60 : 0;
    return rows.filter((r) => {
      if (q && !r.user.name.toLowerCase().includes(q)) return false;
      if (activityFilter && minutesFor(r, activityFilter) < min) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, activityFilter, minHours]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    // Ordenar por duración real (ms transcurridos desde la fecha), no por el
    // texto de la fecha — comparar strings da un orden incorrecto. Sin fecha
    // cargada siempre queda al final, en cualquier dirección.
    const expMs = (since: string | null | undefined) => (since ? Date.now() - new Date(since).getTime() : -Infinity);
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.user.name.localeCompare(b.user.name) * dir;
      if (sortKey === "workExp") return (expMs(a.profile?.workExperienceSince) - expMs(b.profile?.workExperienceSince)) * dir;
      if (sortKey === "bimExp") return (expMs(a.profile?.bimExperienceSince) - expMs(b.profile?.bimExperienceSince)) * dir;
      return (minutesFor(a, sortKey) - minutesFor(b, sortKey)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  return (
    <>
      <div className="page-head">
        <h1>Resumen de personal</h1>
        <span className="spacer" />
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={view === "experiencia"} className={view === "experiencia" ? "active" : ""} onClick={() => setView("experiencia")}>Experiencia</button>
          <button role="tab" aria-selected={view === "proyectos"} className={view === "proyectos" ? "active" : ""} onClick={() => setView("proyectos")}>Horas por proyecto</button>
        </div>
      </div>
      {view === "proyectos" ? <ProjectHoursMatrix /> : <>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: -10, marginBottom: 16 }}>
        Cruza la experiencia real por proyecto (Horas de vuelo) con la autopercepción de las encuestas (Habilidades),
        para evaluar aptitudes y asignar la tarea más indicada según experiencia.
      </p>

      <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 200px" }}>
            <span className="field-lbl">Buscar persona</span>
            <input className="input" placeholder="Nombre…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-lbl">Actividad</span>
            <select className="select" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
              <option value="">Todas</option>
              {activityColumns.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 140 }}>
            <span className="field-lbl">Horas mínimas</span>
            <input
              type="number" className="input" placeholder="Ej. 500" value={minHours}
              onChange={(e) => setMinHours(e.target.value)} disabled={!activityFilter}
            />
          </label>
          {(query || activityFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setQuery(""); setActivityFilter(""); setMinHours(""); }}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {activityColumns.length === 0 ? (
        <div className="card card-pad">
          <Empty icon="star" text="Todavía no hay horas de vuelo cargadas" sub="Asigná una actividad a los proyectos para que empiece a acumularse experiencia." />
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th className="th-sort" onClick={() => toggleSort("name")}>Persona {sortArrow("name")}</th>
                <th className="th-sort" onClick={() => toggleSort("workExp")}>Exp. laboral {sortArrow("workExp")}</th>
                <th className="th-sort" onClick={() => toggleSort("bimExp")}>Exp. BIM {sortArrow("bimExp")}</th>
                {activityColumns.map((a) => (
                  <th key={a.id} className="th-sort" onClick={() => toggleSort(a.id)} title={a.categoryName}>
                    <div style={{ fontSize: 9.5, color: "var(--text-3)", textTransform: "none", letterSpacing: 0 }}>{a.categoryName}</div>
                    {a.name.replace(/^.*?-\s*/, "")} {sortArrow(a.id)}
                  </th>
                ))}
                <th>Habilidades (encuesta)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={4 + activityColumns.length}><Empty icon="search" text="Sin resultados" sub="Probá ajustar los filtros." /></td></tr>
              )}
              {sorted.map((r) => (
                <tr key={r.user.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={r.user.name} size={26} online={r.user.online} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.user.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{ROLE_LABELS[r.user.role]}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {r.profile?.workExperienceSince ? fmtYearsSince(r.profile.workExperienceSince) : "—"}
                  </td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {r.profile?.bimExperienceSince ? fmtYearsSince(r.profile.bimExperienceSince) : "—"}
                  </td>
                  {activityColumns.map((a) => {
                    const mins = minutesFor(r, a.id);
                    return (
                      <td key={a.id} style={{ fontSize: 12.5, color: mins > 0 ? "var(--text)" : "var(--text-3)", whiteSpace: "nowrap" }}>
                        {mins > 0 ? fmtDur(mins) : "—"}
                      </td>
                    );
                  })}
                  <td style={{ fontSize: 12, color: "var(--text-2)", maxWidth: 260 }}>
                    {r.skills.length === 0 ? (
                      <span style={{ color: "var(--text-3)" }}>Sin encuestas respondidas</span>
                    ) : (
                      r.skills.slice(0, 4).map(formatSkill).join(" · ") + (r.skills.length > 4 ? ` · +${r.skills.length - 4} más` : "")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </>
  );
}

/** Horas en decimales, sin ceros de más: la celda de la matriz es angosta */
const hoursShort = (min: number) => (min / 60).toLocaleString("es", { maximumFractionDigits: 1 });

/**
 * Matriz del mes: una fila por persona y una columna por proyecto con horas ese mes.
 * Los encabezados van en vertical para que entren muchos proyectos sin desplazarse.
 */
function ProjectHoursMatrix() {
  const { state } = useStore();
  const [month, setMonth] = useState(today().slice(0, 7) + "-01");
  const [query, setQuery] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);

  const users = useMemo(() => state.users.filter((u) => u.active), [state.users]);
  const m = useMemo(() => staffMatrix(state.entries, users, state.projects, month.slice(0, 7)), [state.entries, users, state.projects, month]);
  const q = query.trim().toLowerCase();
  const rows = m.rows.filter((r) => (!q || r.user.name.toLowerCase().includes(q)) && (!hideEmpty || r.totalMin > 0));
  const label = monthLabel(month);
  const shade = (min: number) => (m.maxCellMin > 0 ? Math.round(8 + (min / m.maxCellMin) * 42) : 0);

  return (
    <>
      <div className="card card-pad no-print" style={{ marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior"><Icon name="arrow-left" size={14} /></button>
          <strong style={{ textTransform: "capitalize", minWidth: 140, textAlign: "center" }}>{label}</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente"><Icon name="arrow-right" size={14} /></button>
        </div>
        <input className="input" style={{ width: 220 }} placeholder="Buscar persona…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Ocultar personas sin horas
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{m.projects.length} proyectos · {fmtDur(m.totalMin)} en el mes</span>
      </div>

      {m.projects.length === 0 ? (
        <div className="card card-pad"><Empty icon="clock" text="Sin horas cargadas en el mes" sub="Probá con otro mes." /></div>
      ) : (
        <div className="card" style={{ overflow: "auto", maxHeight: "calc(100vh - 250px)" }}>
          <table className="table matrix">
            <thead>
              <tr>
                <th className="m-person">Persona</th>
                <th className="m-total">Total</th>
                {m.projects.map((p) => (
                  <th key={p.id ?? "none"} className="vcol" title={`${p.name} · ${fmtDur(p.totalMin)}`}>
                    <div><span className="m-dot" style={{ background: p.color }} />{p.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={2 + m.projects.length}><Empty icon="search" text="Sin resultados" /></td></tr>}
              {rows.map((r) => (
                <tr key={r.user.id}>
                  <td className="m-person">{r.user.name}</td>
                  <td className="m-total">{r.totalMin > 0 ? hoursShort(r.totalMin) : "—"}</td>
                  {m.projects.map((p) => {
                    const min = r.byProject.get(p.id) ?? 0;
                    return (
                      <td
                        key={p.id ?? "none"} className="m-cell"
                        title={min > 0 ? `${r.user.name} · ${p.name}: ${fmtDur(min)}` : undefined}
                        style={min > 0 ? { background: `color-mix(in srgb, var(--accent) ${shade(min)}%, transparent)` } : undefined}
                      >
                        {min > 0 ? hoursShort(min) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="m-person">Total del mes</td>
                <td className="m-total">{hoursShort(m.totalMin)}</td>
                {m.projects.map((p) => <td key={p.id ?? "none"} className="m-cell">{hoursShort(p.totalMin)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
        Horas cargadas en {label}, en decimales (7,5 = 7 h 30 m). El color es más intenso donde hay más horas; pasá el cursor por una celda para ver el detalle.
      </p>
    </>
  );
}
