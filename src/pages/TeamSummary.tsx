import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { computeFlightHours } from "../flightHours";
import { computeSkills, type SkillEntry } from "../skills";
import { fmtDur, fmtYearsSince } from "../utils";
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
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: -10, marginBottom: 16 }}>
        Cruza la experiencia real por proyecto (Horas de vuelo) con la autopercepción de las encuestas (Habilidades),
        para evaluar aptitudes y asignar la tarea más indicada según experiencia.
      </p>

      <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label>Buscar persona</label>
            <input className="input" placeholder="Nombre…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="field">
            <label>Actividad</label>
            <select className="select" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
              <option value="">Todas</option>
              {activityColumns.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 140 }}>
            <label>Horas mínimas</label>
            <input
              type="number" className="input" placeholder="Ej. 500" value={minHours}
              onChange={(e) => setMinHours(e.target.value)} disabled={!activityFilter}
            />
          </div>
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
    </>
  );
}
