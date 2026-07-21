import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { addDays, dayLabel, fmtDate, fmtDur, today, uid, weekStart } from "../utils";
import { Avatar, Empty, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

export function HoursControl() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const [anchor, setAnchor] = useState(today());
  const notifiedRef = useRef(false);

  const ws = weekStart(anchor);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);
  const isCurrentWeek = ws === weekStart(today());

  const rows = useMemo(() => {
    return state.users
      .filter((u) => u.active)
      .map((u) => {
        const perDay = weekDays.map((d) =>
          state.entries.filter((e) => e.userId === u.id && e.date === d).reduce((a, e) => a + (e.end - e.start), 0),
        );
        const loaded = perDay.reduce((a, b) => a + b, 0);
        const expected = u.weeklyHours * 60;
        const overtimeMin = Math.max(0, loaded - expected);
        const validation = state.validations.find((v) => v.userId === u.id && v.weekStart === ws);
        const otRequest = state.overtime.find((o) => o.userId === u.id && o.weekStart === ws);
        const status: "sin-carga" | "incompleto" | "ok" | "extra" =
          loaded === 0 ? "sin-carga" : overtimeMin > 0 ? "extra" : loaded >= expected * 0.95 ? "ok" : "incompleto";
        return { u, perDay, loaded, expected, overtimeMin, validation, otRequest, status };
      });
  }, [state.users, state.entries, state.validations, state.overtime, weekDays, ws]);

  // Notificación automática: usuarios sin ninguna carga en la semana actual
  useEffect(() => {
    if (!isCurrentWeek || notifiedRef.current) return;
    notifiedRef.current = true;
    for (const r of rows) {
      if (r.status !== "sin-carga") continue;
      const body = `${r.u.name} no cargó horas en la semana del ${dayLabel(ws)}.`;
      if (state.notifications.some((n) => n.body === body)) continue;
      dispatch({ type: "notify", n: { kind: "falta-carga", title: "Sin carga de horas", body } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentWeek, ws]);

  if (me.role === "empleado") {
    return (
      <div className="card">
        <Empty icon="lock" text="Sección restringida" sub="El control de horas está disponible para administradores y supervisores." />
      </div>
    );
  }

  function validate(userId: string) {
    dispatch({
      type: "validateWeek",
      v: { id: uid(), userId, weekStart: ws, validatedBy: me.id, at: new Date().toISOString() },
    });
    toast("Semana validada.");
  }

  function sendOvertime(userId: string, minutes: number) {
    dispatch({
      type: "addOvertime",
      o: { id: uid(), userId, weekStart: ws, minutes, status: "Pendiente", createdAt: today() },
    });
    toast("Horas extra enviadas a supervisión y aprobación.");
  }

  function notifyMissing(name: string) {
    dispatch({
      type: "notify",
      n: { kind: "falta-carga", title: "Recordatorio de carga", body: `${name}: recordá cargar tus horas de la semana del ${dayLabel(ws)}.` },
    });
    toast(`Recordatorio enviado a ${name}.`);
  }

  const summary = {
    ok: rows.filter((r) => r.status === "ok" || r.status === "extra").length,
    incompleto: rows.filter((r) => r.status === "incompleto").length,
    sinCarga: rows.filter((r) => r.status === "sin-carga").length,
    validadas: rows.filter((r) => r.validation).length,
  };

  return (
    <>
      <div className="page-head">
        <h1>Control de horas</h1>
        <span className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semana anterior"><Icon name="arrow-left" size={14} /></button>
        <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(today())}>Hoy</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Semana siguiente"><Icon name="arrow-right" size={14} /></button>
      </div>
      <p className="page-sub">
        Semana del {dayLabel(ws)} al {dayLabel(addDays(ws, 6))} · la carga esperada se controla según el tipo de jornada de cada persona (completa o media).
      </p>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        <div className="card kpi">
          <span className="label"><Icon name="check-circle" size={14} /> Carga OK</span>
          <div className="value">{summary.ok}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="alert" size={14} /> Incompletos</span>
          <div className="value">{summary.incompleto}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="ban" size={14} /> Sin carga</span>
          <div className="value">{summary.sinCarga}</div>
          <div className="hint">Se les notifica automáticamente</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="check" size={14} /> Validadas</span>
          <div className="value">{summary.validadas} / {rows.length}</div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Jornada</th>
              <th>Carga diaria</th>
              <th>Cargado / esperado</th>
              <th>Estado</th>
              <th>Horas extra</th>
              <th>Validación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, perDay, loaded, expected, overtimeMin, validation, otRequest, status }) => {
              const pct = Math.min(100, (loaded / Math.max(1, expected)) * 100);
              const maxDay = Math.max(60, ...perDay);
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar name={u.name} online={u.online} />
                      <div>
                        <div style={{ fontWeight: 650 }}>{u.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                          {state.teams.find((t) => t.id === u.teamId)?.name ?? "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${u.jornada === "completa" ? "acc" : "warn"}`}>
                      {u.jornada === "completa" ? "Jornada completa" : "Media jornada"}
                    </span>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>{u.weeklyHours} h/sem</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 34 }} title={perDay.map((m, i) => `${DAY_SHORT[i]}: ${fmtDur(m)}`).join(" · ")}>
                      {perDay.map((m, i) => (
                        <div key={i} style={{ width: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div
                            style={{
                              width: 10, borderRadius: 3,
                              height: Math.max(2, (m / maxDay) * 26),
                              background: m === 0 ? "var(--surface-3)" : u.workDays.includes(i + 1) ? "var(--accent)" : "var(--warning)",
                            }}
                          />
                          <span style={{ fontSize: 9, color: "var(--text-3)" }}>{DAY_SHORT[i]}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <div style={{ fontSize: 12.5, fontFamily: "var(--mono)", marginBottom: 4 }}>
                      {fmtDur(loaded)} / {u.weeklyHours} h
                    </div>
                    <div className="progress">
                      <div style={{ width: `${pct}%`, background: status === "sin-carga" ? "var(--danger)" : status === "incompleto" ? "var(--warning)" : "var(--success)" }} />
                    </div>
                  </td>
                  <td>
                    {status === "sin-carga" && (
                      <div>
                        <span className="badge bad"><Icon name="ban" size={11} /> Sin carga</span>
                        <div>
                          <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => notifyMissing(u.name)}>
                            <Icon name="bell" size={12} /> Notificar
                          </button>
                        </div>
                      </div>
                    )}
                    {status === "incompleto" && <span className="badge warn"><Icon name="alert" size={11} /> Incompleto</span>}
                    {status === "ok" && <span className="badge ok"><Icon name="check" size={11} /> OK</span>}
                    {status === "extra" && <span className="badge ok"><Icon name="check" size={11} /> OK + extra</span>}
                  </td>
                  <td>
                    {overtimeMin > 0 ? (
                      otRequest ? (
                        <span className={`badge ${otRequest.status === "Aprobado" ? "ok" : otRequest.status === "Rechazado" ? "bad" : "warn"}`}>
                          {fmtDur(otRequest.minutes)} · {otRequest.status}
                        </span>
                      ) : (
                        <div>
                          <span className="badge warn"><Icon name="flame" size={11} /> {fmtDur(overtimeMin)}</span>
                          <div>
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => sendOvertime(u.id, overtimeMin)}>
                              <Icon name="arrow-right" size={12} /> A supervisión
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {validation ? (
                      <div>
                        <span className="badge ok"><Icon name="check" size={11} /> Validado</span>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                          {state.users.find((x) => x.id === validation.validatedBy)?.name.split(" ")[0]} ·{" "}
                          {fmtDate(validation.at.slice(0, 10))}
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-secondary btn-sm" disabled={loaded === 0} onClick={() => validate(u.id)} title={loaded === 0 ? "No hay horas cargadas para validar" : "Validar la carga de la semana"}>
                        <Icon name="check" size={13} /> Validar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
