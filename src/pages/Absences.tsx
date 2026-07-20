import React, { useMemo, useState } from "react";
import { useStore, validatedOvertimeMin, vacationInfo } from "../store";
import type { AbsenceRequest, AbsenceType } from "../types";
import { dayLabel, fmtDur, parseISO, today, uid } from "../utils";
import { Avatar, Empty, Modal, useToast } from "../components/ui";

const TYPES: AbsenceType[] = [
  "Vacaciones",
  "Día personal",
  "Licencia médica",
  "Salida médica",
  "Licencia por estudio",
  "Maternidad/Paternidad",
  "Trabajo remoto",
  "Permiso especial",
  "Medio día",
  "Horario reducido",
  "Compensación de horas",
];

const TYPE_ICON: Record<AbsenceType, string> = {
  Vacaciones: "🌴",
  "Día personal": "🏠",
  "Licencia médica": "🤒",
  "Salida médica": "🏥",
  "Licencia por estudio": "📚",
  "Maternidad/Paternidad": "👶",
  "Trabajo remoto": "💻",
  "Permiso especial": "📋",
  "Medio día": "🌗",
  "Horario reducido": "⏳",
  "Compensación de horas": "⚖️",
};

function StatusBadge({ s }: { s: AbsenceRequest["status"] }) {
  const cls = s === "Aprobado" ? "ok" : s === "Rechazado" ? "bad" : "warn";
  return <span className={`badge ${cls}`}>{s}</span>;
}

export function Absences() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const canApprove = me.role !== "empleado";
  const [tab, setTab] = useState<"mias" | "aprobar" | "extra" | "registro">("mias");
  const [showNew, setShowNew] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveOtId, setResolveOtId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const mine = state.absences.filter((a) => a.userId === me.id);
  const toApprove = state.absences.filter((a) => a.status === "Pendiente" && a.userId !== me.id);
  const otPending = state.overtime.filter((o) => o.status === "Pendiente" && o.userId !== me.id);
  const myOvertime = state.overtime.filter((o) => o.userId === me.id);
  // Solo cuentan las horas extra aprobadas Y con la semana validada por el admin
  const myOtApproved = validatedOvertimeMin(state, me.id);
  const dailyMin = (me.weeklyHours * 60) / Math.max(1, me.workDays.length);
  const otDays = Math.floor(myOtApproved / dailyMin);

  const vac = vacationInfo(state, me.id, today());

  const list = tab === "mias" ? mine : toApprove;

  function resolve(status: "Aprobado" | "Rechazado") {
    if (!resolveId) return;
    dispatch({ type: "resolveAbsence", id: resolveId, status, comment, by: me.id });
    toast(`Solicitud ${status.toLowerCase()}.`);
    setResolveId(null);
    setComment("");
  }

  function resolveOt(status: "Aprobado" | "Rechazado") {
    if (!resolveOtId) return;
    dispatch({ type: "resolveOvertime", id: resolveOtId, status, comment, by: me.id });
    toast(`Horas extra ${status.toLowerCase()}s.`);
    setResolveOtId(null);
    setComment("");
  }

  return (
    <>
      <div className="page-head">
        <h1>Gestión</h1>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>＋ Nueva solicitud</button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <div className="card kpi">
          <span className="label">🌴 Vacaciones disponibles</span>
          <div className="value">{vac.available} días</div>
          <div className="hint">
            {vac.used} usados de {vac.entitled}
            {vac.accruing && " · acumulando 1 día/mes"}
          </div>
          <div className="hint" style={vac.daysToExpire <= 90 ? { color: "var(--warning)", fontWeight: 600 } : undefined}>
            {vac.daysToExpire <= 90 ? "⌛ " : ""}Vencen el {dayLabel(vac.expiration)}
          </div>
        </div>
        <div className="card kpi">
          <span className="label">⚖️ Días por horas extra</span>
          <div className="value">{otDays} día{otDays !== 1 ? "s" : ""}</div>
          <div className="hint">{fmtDur(myOtApproved)} validadas por el admin y aprobadas</div>
        </div>
        <div className="card kpi">
          <span className="label">📩 Mis solicitudes</span>
          <div className="value">{mine.length}</div>
          <div className="hint">{mine.filter((a) => a.status === "Pendiente").length} pendientes</div>
        </div>
        {canApprove && (
          <div className="card kpi">
            <span className="label">✅ Por aprobar</span>
            <div className="value">{toApprove.length}</div>
            <div className="hint">Solicitudes de tu equipo</div>
          </div>
        )}
      </div>

      <div className="tabs no-print" style={{ marginBottom: 14 }}>
        <button className={tab === "mias" ? "active" : ""} onClick={() => setTab("mias")}>Mis solicitudes</button>
        {canApprove && (
          <button className={tab === "aprobar" ? "active" : ""} onClick={() => setTab("aprobar")}>
            Por aprobar {toApprove.length > 0 && `(${toApprove.length})`}
          </button>
        )}
        <button className={tab === "extra" ? "active" : ""} onClick={() => setTab("extra")}>
          Horas extra {canApprove && otPending.length > 0 && `(${otPending.length})`}
        </button>
        <button className={tab === "registro" ? "active" : ""} onClick={() => setTab("registro")}>Registro</button>
      </div>

      {tab === "registro" && <RequestLog />}

      {tab === "extra" && (
        <>
          <div className="card card-pad" style={{ marginBottom: 14 }}>
            <div className="card-title">⚖️ Mi saldo de horas extra</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtDur(myOtApproved)}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>≈ {otDays} día{otDays !== 1 ? "s" : ""} disponibles para recuperar</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", flex: 1, minWidth: 240 }}>
                Las horas extra se detectan por semana en <strong>Control de horas</strong>, se informan y pasan a supervisión.
                Solo cuentan en el saldo cuando el supervisor las aprueba <strong>y</strong> el admin validó esa semana.
                Se recuperan solicitando una ausencia del tipo <strong>Compensación de horas</strong>.
              </div>
              {myOtApproved > 0 && (
                <button className="btn btn-primary" onClick={() => setShowNew(true)}>Recuperar horas</button>
              )}
            </div>
          </div>
          <div className="card">
            {[...(canApprove ? otPending : []), ...myOvertime].length === 0 && (
              <Empty icon="🔥" text="Sin horas extra registradas" sub="Cuando una semana supere la jornada, el administrador las enviará a supervisión desde Control de horas." />
            )}
            {[...(canApprove ? otPending : []), ...myOvertime].map((o) => {
              const u = state.users.find((x) => x.id === o.userId);
              const isMineOt = o.userId === me.id;
              return (
                <div key={o.id} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22 }}>🔥</span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{fmtDur(o.minutes)} extra</strong>
                      <StatusBadge s={o.status} />
                      {!isMineOt && u && (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)" }}>
                          <Avatar name={u.name} size={20} /> {u.name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
                      Semana del {dayLabel(o.weekStart)} · informado el {dayLabel(o.createdAt)}
                      {o.status !== "Pendiente" && o.resolvedBy && (
                        <>
                          {" · "}
                          {o.status === "Aprobado" ? "✅" : "❌"} {o.status.toLowerCase()} por{" "}
                          <strong>{state.users.find((x) => x.id === o.resolvedBy)?.name ?? "?"}</strong>
                          {o.resolvedAt && ` el ${dayLabel(o.resolvedAt)}`}
                        </>
                      )}
                    </div>
                    {o.supervisorComment && (
                      <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-2)", background: "var(--surface-2)", padding: "6px 10px", borderRadius: 8 }}>
                        💬 <strong>{state.users.find((x) => x.id === o.resolvedBy)?.name ?? "Supervisor"}:</strong> {o.supervisorComment}
                      </div>
                    )}
                  </div>
                  {canApprove && !isMineOt && o.status === "Pendiente" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setResolveOtId(o.id)}>Revisar</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {(tab === "mias" || tab === "aprobar") && (
      <div className="card">
        {list.length === 0 && <Empty icon="🌴" text="Sin solicitudes" sub={tab === "mias" ? "Creá una nueva solicitud de ausencia." : "No hay solicitudes pendientes de aprobación."} />}
        {list
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((a) => {
            const u = state.users.find((x) => x.id === a.userId);
            return (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ fontSize: 22 }}>{TYPE_ICON[a.type]}</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{a.type}</strong>
                    <StatusBadge s={a.status} />
                    {tab === "aprobar" && u && (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)" }}>
                        <Avatar name={u.name} size={20} /> {u.name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
                    {dayLabel(a.dateFrom)}
                    {a.dateFrom !== a.dateTo && ` → ${dayLabel(a.dateTo)}`}
                    {a.timeFrom && ` · ${a.timeFrom}–${a.timeTo}`}
                  </div>
                  {/* Trazabilidad de la solicitud */}
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>📩 Solicitado por <strong>{u?.name ?? "?"}</strong> · {dayLabel(a.createdAt)}</span>
                    {a.status !== "Pendiente" && a.resolvedBy && (
                      <span>
                        {a.status === "Aprobado" ? "✅" : "❌"} {a.status} por{" "}
                        <strong>{state.users.find((x) => x.id === a.resolvedBy)?.name ?? "?"}</strong>
                        {a.resolvedAt && ` · ${dayLabel(a.resolvedAt)}`}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{a.reason}</div>
                  {a.attachments.length > 0 && (
                    <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {a.attachments.map((f) => (
                        <span key={f} className="badge">📎 {f}</span>
                      ))}
                    </div>
                  )}
                  {a.supervisorComment && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-2)", background: "var(--surface-2)", padding: "6px 10px", borderRadius: 8 }}>
                      💬 <strong>{state.users.find((x) => x.id === a.resolvedBy)?.name ?? "Supervisor"}:</strong> {a.supervisorComment}
                    </div>
                  )}
                </div>
                {tab === "aprobar" && a.status === "Pendiente" && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setResolveId(a.id)}>Revisar</button>
                )}
              </div>
            );
          })}
      </div>
      )}

      {showNew && <NewAbsence onClose={() => setShowNew(false)} initialType={tab === "extra" ? "Compensación de horas" : undefined} />}

      {resolveId && (
        <Modal
          title="Revisar solicitud"
          onClose={() => setResolveId(null)}
          footer={
            <>
              <button className="btn btn-danger" onClick={() => resolve("Rechazado")}>Rechazar</button>
              <button className="btn btn-primary" onClick={() => resolve("Aprobado")}>Aprobar</button>
            </>
          }
        >
          <div className="field">
            <label>Comentario del supervisor</label>
            <textarea className="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario opcional para el solicitante…" />
          </div>
        </Modal>
      )}

      {resolveOtId && (
        <Modal
          title="Revisar horas extra"
          onClose={() => setResolveOtId(null)}
          footer={
            <>
              <button className="btn btn-danger" onClick={() => resolveOt("Rechazado")}>Rechazar</button>
              <button className="btn btn-primary" onClick={() => resolveOt("Aprobado")}>Aprobar</button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>
            Al aprobar, las horas quedan disponibles para que la persona las recupere mediante una solicitud de <strong>Compensación de horas</strong>.
          </p>
          <div className="field">
            <label>Comentario del supervisor</label>
            <textarea className="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario opcional…" />
          </div>
        </Modal>
      )}
    </>
  );
}

/** Registro cronológico de solicitudes: quién solicitó, quién resolvió y cuándo */
function RequestLog() {
  const { state } = useStore();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const canSeeAll = me.role !== "empleado";
  const name = (id?: string | null) => state.users.find((x) => x.id === id)?.name ?? "—";

  type Ev = { at: string; icon: string; what: string; who: string; status: string };
  const events: Ev[] = [];

  for (const a of state.absences) {
    if (!canSeeAll && a.userId !== me.id) continue;
    events.push({
      at: a.createdAt, icon: "📩",
      what: `Solicitud de ${a.type} (${dayLabel(a.dateFrom)}${a.dateFrom !== a.dateTo ? ` → ${dayLabel(a.dateTo)}` : ""})`,
      who: name(a.userId), status: "Solicitado",
    });
    if (a.status !== "Pendiente" && a.resolvedBy) {
      events.push({
        at: a.resolvedAt ?? a.createdAt, icon: a.status === "Aprobado" ? "✅" : "❌",
        what: `${a.type} de ${name(a.userId)}${a.supervisorComment ? ` — "${a.supervisorComment}"` : ""}`,
        who: name(a.resolvedBy), status: a.status,
      });
    }
  }
  for (const o of state.overtime) {
    if (!canSeeAll && o.userId !== me.id) continue;
    events.push({
      at: o.createdAt, icon: "🔥",
      what: `Horas extra informadas: ${fmtDur(o.minutes)} (semana del ${dayLabel(o.weekStart)})`,
      who: name(o.userId), status: "Informado",
    });
    if (o.status !== "Pendiente" && o.resolvedBy) {
      events.push({
        at: o.resolvedAt ?? o.createdAt, icon: o.status === "Aprobado" ? "✅" : "❌",
        what: `Horas extra de ${name(o.userId)} (${fmtDur(o.minutes)})${o.supervisorComment ? ` — "${o.supervisorComment}"` : ""}`,
        who: name(o.resolvedBy), status: o.status,
      });
    }
  }
  for (const v of state.validations) {
    if (!canSeeAll && v.userId !== me.id) continue;
    events.push({
      at: v.at.slice(0, 10), icon: "🖋️",
      what: `Carga de horas validada: ${name(v.userId)} (semana del ${dayLabel(v.weekStart)})`,
      who: name(v.validatedBy), status: "Validado",
    });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {events.length === 0 && <Empty icon="📜" text="Sin movimientos registrados" sub="Acá vas a ver el historial de solicitudes, aprobaciones y validaciones." />}
      {events.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Realizado por</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap", fontFamily: "var(--mono)", fontSize: 12 }}>{dayLabel(e.at)}</td>
                <td>{e.icon} {e.what}</td>
                <td style={{ fontWeight: 600 }}>{e.who}</td>
                <td>
                  <span className={`badge ${e.status === "Aprobado" || e.status === "Validado" ? "ok" : e.status === "Rechazado" ? "bad" : "acc"}`}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewAbsence({ onClose, initialType }: { onClose: () => void; initialType?: AbsenceType }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [type, setType] = useState<AbsenceType>(initialType ?? "Vacaciones");
  const otBalance = validatedOvertimeMin(state, state.currentUserId);
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<string[]>([]);

  const partial = ["Salida médica", "Medio día", "Horario reducido", "Compensación de horas"].includes(type);
  const valid = dateTo >= dateFrom && reason.trim().length > 0;

  function submit() {
    if (!valid) return;
    dispatch({
      type: "addAbsence",
      absence: {
        id: uid(),
        userId: state.currentUserId,
        type,
        dateFrom,
        dateTo,
        timeFrom: partial ? timeFrom || undefined : undefined,
        timeTo: partial ? timeTo || undefined : undefined,
        reason: reason.trim(),
        attachments: files,
        status: "Pendiente",
        createdAt: today(),
      },
    });
    toast("Solicitud enviada. Tu supervisor la revisará.");
    onClose();
  }

  return (
    <Modal
      title="Nueva solicitud de ausencia"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid}>Enviar solicitud</button>
        </>
      }
    >
      <div className="field">
        <label>Tipo de ausencia</label>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_ICON[t]} {t}</option>
          ))}
        </select>
      </div>
      {type === "Compensación de horas" && (
        <div style={{ fontSize: 12.5, background: otBalance > 0 ? "var(--success-soft)" : "var(--warning-soft)", color: otBalance > 0 ? "var(--success)" : "var(--warning)", padding: "8px 12px", borderRadius: 8, fontWeight: 600 }}>
          {otBalance > 0
            ? `⚖️ Tenés ${fmtDur(otBalance)} extra aprobadas disponibles para recuperar.`
            : "⚠️ No tenés horas extra aprobadas. La solicitud puede ser rechazada."}
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label>Desde</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value); }} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" className="input" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {partial && (
          <>
            <div className="field">
              <label>Hora inicio</label>
              <input type="time" className="input" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>Hora fin</label>
              <input type="time" className="input" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div className="field">
        <label>Motivo</label>
        <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contanos brevemente el motivo…" />
      </div>
      <div className="field">
        <label>Adjuntos (certificados, comprobantes)</label>
        <input
          type="file"
          className="input"
          multiple
          onChange={(e) => setFiles([...(e.target.files ?? [])].map((f) => f.name))}
        />
        {files.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {files.map((f) => (
              <span className="badge" key={f}>📎 {f}</span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
