import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { computeFlightHours } from "../flightHours";
import { fmtDur } from "../utils";
import { Icon } from "../components/Icon";

/** El selector de a quién ver vive en Charts.tsx (compartido con el Mapa mental). */
export function FlightHours({ userId }: { userId: string }) {
  const { state } = useStore();
  const selectedUser = state.users.find((u) => u.id === userId)!;

  const result = useMemo(() => computeFlightHours(state, userId), [state, userId]);
  const [openActivity, setOpenActivity] = useState<string | null>(null);

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="label"><Icon name="activity" size={14} /> Horas de vuelo totales</div>
          <div className="value">{fmtDur(result.totalMinutes)}</div>
        </div>
        {result.categories.map((cat) => (
          <div className="card kpi" key={cat.categoryId}>
            <div className="label"><Icon name="folder" size={14} /> {cat.name}</div>
            <div className="value">{fmtDur(cat.minutes)}</div>
          </div>
        ))}
      </div>

      {result.categories.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--text-3)", padding: 40 }}>
          {selectedUser.name} todavía no tiene horas de vuelo registradas. Se acumulan automáticamente al cargar tiempo
          en proyectos que tengan una actividad asignada (Clientes y proyectos → editar proyecto).
        </div>
      ) : (
        result.categories.map((cat) => (
          <div className="card card-pad" key={cat.categoryId} style={{ marginBottom: 14 }}>
            <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {cat.name}
              <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--text)" }}>{fmtDur(cat.minutes)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {cat.activities.map((act) => {
                const open = openActivity === act.activityId;
                return (
                  <div key={act.activityId}>
                    <div
                      className="list-item"
                      style={{ cursor: "pointer" }}
                      onClick={() => setOpenActivity(open ? null : act.activityId)}
                    >
                      <Icon
                        name="chevron-right"
                        size={14}
                        style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.15s ease", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {act.name}
                        {!act.active && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)" }}>(inactiva)</span>}
                      </div>
                      <strong>{fmtDur(act.minutes)}</strong>
                    </div>
                    {open && (
                      <div style={{ padding: "2px 0 10px 32px", display: "flex", flexDirection: "column", gap: 4 }}>
                        {act.projects.map((p) => (
                          <div key={p.projectId} style={{ display: "flex", fontSize: 12.5, color: "var(--text-2)" }}>
                            <span style={{ flex: 1 }}>{p.projectName}</span>
                            <span>{fmtDur(p.minutes)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </>
  );
}
