import React, { useMemo, useState } from "react";
import { overtimeClaimDeadline, useStore } from "../store";
import { addDays, dayLabel, fmtDur, today, uid, weekStart } from "../utils";
import { Avatar, Empty, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { computeHoursIncidents, getDownlineIds, visibleIncidents, type HoursIncident } from "../compliance";
import { buildForest, buildLayout, teamIds, CARD_W, CARD_H } from "../orgTree";
import type { User } from "../types";

const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

export function HoursControl() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const [anchor, setAnchor] = useState(today());

  const ws = weekStart(anchor);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);
  // Las horas extra de una semana solo se pueden reclamar hasta 3 meses después de esa semana.
  const claimExpired = today() > overtimeClaimDeadline(ws);

  // El supervisor controla a toda su línea de mando (directos e indirectos,
  // a través de los supervisores que dependen de él); admin y gerente ven a
  // todo el mundo. Ver compliance.ts.
  const myDownline = useMemo(() => getDownlineIds(me.id, state.users), [state.users, me.id]);

  const rows = useMemo(() => {
    return state.users
      .filter((u) => u.active)
      .filter((u) => me.role !== "supervisor" || myDownline.has(u.id))
      .map((u) => {
        const perDay = weekDays.map((d) =>
          state.entries.filter((e) => e.userId === u.id && e.date === d).reduce((a, e) => a + (e.end - e.start), 0),
        );
        const loaded = perDay.reduce((a, b) => a + b, 0);
        const expected = u.weeklyHours * 60;
        const overtimeMin = Math.max(0, loaded - expected);
        const supervisor = state.users.find((x) => x.id === u.supervisorId);
        const otRequest = state.overtime.find((o) => o.userId === u.id && o.weekStart === ws);
        const status: "sin-carga" | "incompleto" | "ok" | "extra" =
          loaded === 0 ? "sin-carga" : overtimeMin > 0 ? "extra" : loaded >= expected * 0.95 ? "ok" : "incompleto";
        return { u, perDay, loaded, expected, overtimeMin, supervisor, otRequest, status };
      });
  }, [state.users, state.entries, state.overtime, weekDays, ws, me.id, me.role, myDownline]);

  // Incidencias de la cadena de mando: semanas ya cerradas donde alguien no
  // cargó correctamente, con su nivel de escalamiento actual. Ver compliance.ts.
  const incidents = useMemo(() => {
    const all = computeHoursIncidents(state, today());
    return visibleIncidents(all, me, state.users);
  }, [state, me]);

  if (me.role === "usuario") {
    return (
      <div className="card">
        <Empty icon="lock" text="Sección restringida" sub="El control de horas está disponible para administradores, gerentes y supervisores." />
      </div>
    );
  }

  if (me.role === "supervisor" && rows.length === 0) {
    return (
      <div className="card">
        <Empty icon="users" text="Sin equipo asignado" sub="Todavía no tenés a nadie asignado como supervisor. Pedile a un admin o gerente que te asigne personas desde Equipo." />
      </div>
    );
  }

  function sendOvertime(userId: string, minutes: number) {
    dispatch({
      type: "addOvertime",
      o: { id: uid(), userId, weekStart: ws, minutes, status: "Pendiente", createdAt: today() },
    });
    toast("Horas extra enviadas a supervisión y aprobación.");
  }

  function notifyMissing(id: string, name: string) {
    dispatch({
      type: "notify",
      n: { userId: id, kind: "falta-carga", title: "Recordatorio de carga", body: `${name}: recordá cargar tus horas de la semana del ${dayLabel(ws)}.` },
    });
    toast(`Recordatorio enviado a ${name}.`);
  }

  const summary = {
    ok: rows.filter((r) => r.status === "ok" || r.status === "extra").length,
    incompleto: rows.filter((r) => r.status === "incompleto").length,
    sinCarga: rows.filter((r) => r.status === "sin-carga").length,
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
          <div className="hint">Notificalos con el botón "Notificar"</div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Supervisor</th>
              <th>Jornada</th>
              <th>Carga diaria</th>
              <th>Cargado / esperado</th>
              <th>Estado</th>
              <th>Horas extra</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, perDay, loaded, expected, overtimeMin, supervisor, otRequest, status }) => {
              const pct = Math.min(100, (loaded / Math.max(1, expected)) * 100);
              const maxDay = Math.max(60, ...perDay);
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar name={u.name} online={u.online} />
                      <div>
                        <div style={{ fontWeight: 650 }}>{u.name}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: supervisor ? undefined : "var(--text-3)" }}>
                    {supervisor ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <Avatar name={supervisor.name} size={22} /> {supervisor.name}
                      </span>
                    ) : (
                      "—"
                    )}
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
                          <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => notifyMissing(u.id, u.name)}>
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
                      ) : claimExpired ? (
                        <div>
                          <span className="badge bad"><Icon name="flame" size={11} /> {fmtDur(overtimeMin)}</span>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }} title="Pasaron más de 3 meses de esa semana: ya no se puede reclamar.">
                            Vencida
                          </div>
                        </div>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ComplianceChart incidents={incidents} me={me} allUsers={state.users} />
    </>
  );
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", gerente: "Gerente", supervisor: "Supervisor", usuario: "Usuario" };

/**
 * Cadena de mando como organigrama: cada persona es un cuadro verde (todo
 * cargado bien). Si a alguien le falta cargar horas, su cuadro se pone rojo
 * y la línea que lo une con su supervisor sigue en rojo hacia arriba —
 * un nivel más por cada 2 días que pase sin resolverse — hasta el
 * responsable que tiene el aviso activo en este momento (marcado en ámbar).
 */
function ComplianceChart({ incidents, me, allUsers }: { incidents: HoursIncident[]; me: User; allUsers: User[] }) {
  const escalated = incidents.filter((i) => i.escalationLevel > 0 || i.fallbackToAdmins).length;
  const isAdmin = me.role === "admin";

  const roots = useMemo(() => {
    const active = allUsers.filter((u) => u.active);
    if (isAdmin || me.role === "gerente") return buildForest(active);
    const ids = teamIds(active, me.id);
    return buildForest(active.filter((u) => ids.has(u.id)));
  }, [allUsers, isAdmin, me.role, me.id]);

  const { nodes, edges, totalWidth, totalHeight } = useMemo(() => buildLayout(roots), [roots]);

  const { failingIds, onPathIds, redEdges } = useMemo(() => {
    const failing = new Set<string>();
    const onPath = new Set<string>();
    const redEdgeKeys = new Set<string>();
    for (const inc of incidents) {
      failing.add(inc.userId);
      if (inc.escalationLevel >= 0) {
        const path = [inc.userId, ...inc.chain.slice(0, inc.escalationLevel + 1)];
        for (let i = 0; i < path.length - 1; i++) {
          onPath.add(path[i + 1]);
          redEdgeKeys.add(`${path[i + 1]}|${path[i]}`); // parentId|childId
        }
      }
      if (inc.fallbackToAdmins) {
        for (const u of allUsers) if (u.role === "admin") onPath.add(u.id);
      }
    }
    return { failingIds: failing, onPathIds: onPath, redEdges: redEdgeKeys };
  }, [incidents, allUsers]);

  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Cadena de mando — incidencias de carga</h2>
      <p className="page-sub" style={{ marginTop: 0 }}>
        Semanas ya cerradas con carga incompleta o sin cargar. Se resuelven solas apenas la persona carga esas horas; si
        nadie actúa, el aviso escala automáticamente al responsable de arriba en la cadena cada 2 días.
      </p>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        <div className="card kpi">
          <span className="label"><Icon name="alert" size={14} /> Incidencias abiertas</span>
          <div className="value">{incidents.length}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="arrow-right" size={14} /> Escaladas</span>
          <div className="value">{escalated}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: "14px 18px 4px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--success)" }} /> Al día
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--danger)" }} /> No cargó sus horas
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--warning)" }} /> Tiene el aviso activo
          </span>
        </div>

        {nodes.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", padding: 30 }}>
            Todavía no hay una jerarquía definida (asigná un supervisor en Equipo).
          </div>
        ) : (
          <div style={{ overflowX: "auto", padding: "10px 18px 20px" }}>
            <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
              <svg width={totalWidth} height={totalHeight} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                {edges.map((e, i) => {
                  const midX = (e.x1 + e.x2) / 2;
                  const isRed = redEdges.has(`${e.parentId}|${e.childId}`);
                  return (
                    <path
                      key={i}
                      d={`M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2}`}
                      fill="none"
                      stroke={isRed ? "var(--danger)" : "var(--border-strong)"}
                      strokeWidth={isRed ? 2.5 : 1.5}
                    />
                  );
                })}
              </svg>
              {nodes.map((n) => {
                const status = failingIds.has(n.user.id) ? "status-red" : onPathIds.has(n.user.id) ? "status-amber" : "status-ok";
                return (
                  <div
                    key={n.user.id}
                    className={`org-card ${status}${n.user.id === me.id ? " me" : ""}`}
                    style={{ position: "absolute", left: n.x, top: n.y, width: CARD_W, height: CARD_H }}
                    title={`${n.user.name} · ${ROLE_LABEL[n.user.role] ?? n.user.role}`}
                  >
                    <Avatar name={n.user.name} size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div className="org-name">{n.user.name}</div>
                      <div className="org-role">{ROLE_LABEL[n.user.role] ?? n.user.role}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
