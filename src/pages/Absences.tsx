import React, { useState } from "react";
import { useStore, validatedOvertimeMin, vacationInfo } from "../store";
import type { AbsenceRequest, AbsenceType, Attachment } from "../types";
import { fmtDate, fmtDur, today, uid } from "../utils";
import { Avatar, Empty, Modal, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";

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
  "Horas extra",
];

const TYPE_ICON: Record<AbsenceType, IconName> = {
  Vacaciones: "sun",
  "Día personal": "home",
  "Licencia médica": "thermometer",
  "Salida médica": "cross",
  "Licencia por estudio": "graduation",
  "Maternidad/Paternidad": "baby",
  "Trabajo remoto": "laptop",
  "Permiso especial": "clipboard",
  "Medio día": "circle-half",
  "Horario reducido": "hourglass",
  "Compensación de horas": "scale",
  "Horas extra": "flame",
};

function StatusBadge({ s }: { s: AbsenceRequest["status"] }) {
  const cls = s === "Aprobado" ? "ok" : s === "Rechazado" ? "bad" : "warn";
  return <span className={`badge ${cls}`}>{s}</span>;
}

/** Convierte un data URL en Blob para poder verlo/descargarlo de forma confiable */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function AttachmentChip({ f }: { f: Attachment }) {
  const withBlobUrl = (fn: (url: string) => void) => {
    if (!f.url) return;
    const url = URL.createObjectURL(dataUrlToBlob(f.url));
    fn(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const view = () => withBlobUrl((url) => window.open(url, "_blank", "noopener"));
  const download = () =>
    withBlobUrl((url) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

  return (
    <span className="badge" style={{ gap: 6 }} title={f.url ? f.name : "Archivo de demostración (sin contenido cargado)"}>
      <Icon name="paperclip" size={12} /> {f.name}
      {f.size != null && <span style={{ color: "var(--text-3)" }}>({(f.size / 1024 / 1024).toFixed(1)} MB)</span>}
      {f.url && (
        <>
          <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={view} aria-label="Ver" title="Ver">
            <Icon name="eye" size={12} />
          </button>
          <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={download} aria-label="Descargar" title="Descargar">
            <Icon name="download" size={12} />
          </button>
        </>
      )}
    </span>
  );
}

export function Absences() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const canApprove = me.role !== "empleado";
  const [tab, setTab] = useState<"mias" | "aprobar" | "extra" | "registro">("mias");
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<AbsenceRequest | null>(null);
  const [comment, setComment] = useState("");

  const mine = state.absences.filter((a) => a.userId === me.id);
  const toApprove = state.absences.filter((a) => a.status === "Pendiente" && a.userId !== me.id);
  const otPending = state.overtime.filter((o) => o.status === "Pendiente" && o.userId !== me.id);
  const myOvertime = state.overtime.filter((o) => o.userId === me.id);
  const myOtApproved = validatedOvertimeMin(state, me.id);
  const dailyMin = (me.weeklyHours * 60) / Math.max(1, me.workDays.length);
  const otDays = Math.floor(myOtApproved / dailyMin);
  const [resolveOtId, setResolveOtId] = useState<string | null>(null);

  const vac = vacationInfo(state, me.id, today());
  const list = tab === "mias" ? mine : toApprove;

  function resolve(status: "Aprobado" | "Rechazado") {
    if (!detail) return;
    dispatch({ type: "resolveAbsence", id: detail.id, status, comment, by: me.id });
    if (detail.type === "Horas extra") {
      const matchingOt = state.overtime.find((o) => o.userId === detail.userId && o.createdAt === detail.createdAt);
      if (matchingOt) {
        dispatch({ type: "resolveOvertime", id: matchingOt.id, status, comment, by: me.id });
      }
    }
    toast(`Solicitud ${status.toLowerCase()}.`);
    setDetail(null);
    setComment("");
  }

  function resolveOt(status: "Aprobado" | "Rechazado") {
    if (!resolveOtId) return;
    const ot = state.overtime.find((x) => x.id === resolveOtId);
    dispatch({ type: "resolveOvertime", id: resolveOtId, status, comment, by: me.id });
    if (ot) {
      const matchingAbs = state.absences.find((a) => a.userId === ot.userId && a.type === "Horas extra" && a.createdAt === ot.createdAt);
      if (matchingAbs) {
        dispatch({ type: "resolveAbsence", id: matchingAbs.id, status, comment, by: me.id });
      }
    }
    toast(`Horas extra ${status.toLowerCase()}s.`);
    setResolveOtId(null);
    setComment("");
  }

  return (
    <>
      <div className="page-head">
        <h1>Gestión</h1>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={15} /> Nueva solicitud
        </button>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <div className="card kpi">
          <span className="label"><Icon name="sun" size={14} /> Vacaciones disponibles</span>
          <div className="value">{vac.available} días</div>
          <div className="hint">
            {vac.used} usados de {vac.entitled}
          </div>
          <div className="hint" style={vac.daysToExpire <= 90 ? { color: "var(--warning)", fontWeight: 600 } : undefined}>
            Vencen el {fmtDate(vac.expiration)}
          </div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="scale" size={14} /> Días por horas extra</span>
          <div className="value">{otDays} día{otDays !== 1 ? "s" : ""}</div>
          <div className="hint">{fmtDur(myOtApproved)} validadas por el admin y aprobadas</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="mail" size={14} /> Mis solicitudes</span>
          <div className="value">{mine.length}</div>
          <div className="hint">{mine.filter((a) => a.status === "Pendiente").length} pendientes</div>
        </div>
        {canApprove && (
          <div className="card kpi">
            <span className="label"><Icon name="check-circle" size={14} /> Por aprobar</span>
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
            <div className="card-title"><Icon name="scale" size={14} /> Mi saldo de horas extra</div>
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
              <Empty icon="flame" text="Sin horas extra registradas" sub="Cuando una semana supere la jornada, el administrador las enviará a supervisión desde Control de horas." />
            )}
            {[...(canApprove ? otPending : []), ...myOvertime].map((o) => {
              const u = state.users.find((x) => x.id === o.userId);
              const isMineOt = o.userId === me.id;
              return (
                <div key={o.id} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: "var(--warning)" }}><Icon name="flame" size={20} /></span>
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
                      Semana del {fmtDate(o.weekStart)} · informado el {fmtDate(o.createdAt)}
                      {o.status !== "Pendiente" && o.resolvedBy && (
                        <> · {o.status.toLowerCase()} por <strong>{state.users.find((x) => x.id === o.resolvedBy)?.name ?? "?"}</strong>
                          {o.resolvedAt && ` el ${fmtDate(o.resolvedAt)}`}</>
                      )}
                    </div>
                    {o.supervisorComment && (
                      <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-2)", background: "var(--surface-2)", padding: "6px 10px", borderRadius: 8, display: "flex", gap: 6 }}>
                        <Icon name="message" size={14} /> <span><strong>{state.users.find((x) => x.id === o.resolvedBy)?.name ?? "Supervisor"}:</strong> {o.supervisorComment}</span>
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
        {list.length === 0 && <Empty icon="sun" text="Sin solicitudes" sub={tab === "mias" ? "Creá una nueva solicitud de ausencia." : "No hay solicitudes pendientes de aprobación."} />}
        {list
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((a) => {
            const u = state.users.find((x) => x.id === a.userId);
            return (
              <button
                key={a.id}
                onClick={() => { setDetail(a); setComment(""); }}
                style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap", width: "100%", textAlign: "left", background: "none" }}
                className="request-row"
              >
                <span style={{ color: "var(--accent)" }}><Icon name={TYPE_ICON[a.type]} size={20} /></span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{a.type}</strong>
                    <StatusBadge s={a.status} />
                    {tab === "aprobar" && u && (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--text-2)" }}>
                        <Avatar name={u.name} size={20} /> {u.name}
                      </span>
                    )}
                    {a.attachments.length > 0 && (
                      <span className="badge"><Icon name="paperclip" size={11} /> {a.attachments.length}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>
                    {fmtDate(a.dateFrom)}
                    {a.dateFrom !== a.dateTo && ` → ${fmtDate(a.dateTo)}`}
                    {a.timeFrom && ` · ${a.timeFrom}–${a.timeTo}`}
                  </div>
                </div>
                <span style={{ color: "var(--text-3)" }}><Icon name="chevron-right" size={16} /></span>
              </button>
            );
          })}
      </div>
      )}

      {showNew && <NewAbsence onClose={() => setShowNew(false)} initialType={tab === "extra" ? "Compensación de horas" : undefined} />}

      {detail && (
        <RequestDetail
          request={detail}
          canApprove={canApprove && detail.userId !== me.id && detail.status === "Pendiente"}
          comment={comment}
          setComment={setComment}
          onResolve={resolve}
          onClose={() => setDetail(null)}
        />
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

/** Detalle completo de una solicitud, con adjuntos y (para supervisores) acciones de aprobación */
function RequestDetail({
  request: a,
  canApprove,
  comment,
  setComment,
  onResolve,
  onClose,
}: {
  request: AbsenceRequest;
  canApprove: boolean;
  comment: string;
  setComment: (s: string) => void;
  onResolve: (s: "Aprobado" | "Rechazado") => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const u = state.users.find((x) => x.id === a.userId);
  const resolver = state.users.find((x) => x.id === a.resolvedBy);
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 130, flexShrink: 0, color: "var(--text-3)", fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13.5, flex: 1 }}>{children}</span>
    </div>
  );

  return (
    <Modal
      title="Detalle de la solicitud"
      onClose={onClose}
      footer={
        canApprove ? (
          <>
            <button className="btn btn-danger" onClick={() => onResolve("Rechazado")}>Rechazar</button>
            <button className="btn btn-primary" onClick={() => onResolve("Aprobado")}>Aprobar</button>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        )
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ color: "var(--accent)" }}><Icon name={TYPE_ICON[a.type]} size={24} /></span>
        <strong style={{ fontSize: 16 }}>{a.type}</strong>
        <StatusBadge s={a.status} />
      </div>
      <div>
        <Row label="Solicitante">
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Avatar name={u?.name ?? "?"} size={22} /> {u?.name ?? "—"}
          </span>
        </Row>
        <Row label="Fechas">
          {fmtDate(a.dateFrom)}
          {a.dateFrom !== a.dateTo && ` → ${fmtDate(a.dateTo)}`}
        </Row>
        {(a.timeFrom || a.timeTo) && <Row label="Horario">{a.timeFrom || "—"} – {a.timeTo || "—"}</Row>}
        <Row label="Solicitado el">{fmtDate(a.createdAt)}</Row>
        <Row label="Motivo">{a.reason ? a.reason : <em style={{ color: "var(--text-3)" }}>Sin especificar</em>}</Row>
        <Row label="Adjuntos">
          {a.attachments.length === 0 ? (
            <em style={{ color: "var(--text-3)" }}>Sin adjuntos</em>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {a.attachments.map((f, i) => (
                <AttachmentChip key={i} f={f} />
              ))}
            </div>
          )}
        </Row>
        {a.status !== "Pendiente" && (
          <Row label={a.status === "Aprobado" ? "Aprobado por" : "Rechazado por"}>
            {resolver?.name ?? "—"}{a.resolvedAt && ` · ${fmtDate(a.resolvedAt)}`}
          </Row>
        )}
        {a.supervisorComment && <Row label="Comentario">{a.supervisorComment}</Row>}
      </div>
      {canApprove && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>Comentario del supervisor (opcional)</label>
          <textarea className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario para el solicitante…" />
        </div>
      )}
    </Modal>
  );
}

/** Registro cronológico de solicitudes: quién solicitó, quién resolvió y cuándo */
function RequestLog() {
  const { state } = useStore();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const canSeeAll = me.role !== "empleado";
  const name = (id?: string | null) => state.users.find((x) => x.id === id)?.name ?? "—";

  type Ev = { at: string; icon: IconName; color: string; what: string; who: string; status: string };
  const events: Ev[] = [];

  for (const a of state.absences) {
    if (!canSeeAll && a.userId !== me.id) continue;
    events.push({
      at: a.createdAt, icon: "mail", color: "var(--accent)",
      what: `Solicitud de ${a.type} (${fmtDate(a.dateFrom)}${a.dateFrom !== a.dateTo ? ` → ${fmtDate(a.dateTo)}` : ""})`,
      who: name(a.userId), status: "Solicitado",
    });
    if (a.status !== "Pendiente" && a.resolvedBy) {
      events.push({
        at: a.resolvedAt ?? a.createdAt, icon: a.status === "Aprobado" ? "check-circle" : "x-circle",
        color: a.status === "Aprobado" ? "var(--success)" : "var(--danger)",
        what: `${a.type} de ${name(a.userId)}${a.supervisorComment ? ` — "${a.supervisorComment}"` : ""}`,
        who: name(a.resolvedBy), status: a.status,
      });
    }
  }
  for (const o of state.overtime) {
    if (!canSeeAll && o.userId !== me.id) continue;
    events.push({
      at: o.createdAt, icon: "flame", color: "var(--warning)",
      what: `Horas extra informadas: ${fmtDur(o.minutes)} (semana del ${fmtDate(o.weekStart)})`,
      who: name(o.userId), status: "Informado",
    });
    if (o.status !== "Pendiente" && o.resolvedBy) {
      events.push({
        at: o.resolvedAt ?? o.createdAt, icon: o.status === "Aprobado" ? "check-circle" : "x-circle",
        color: o.status === "Aprobado" ? "var(--success)" : "var(--danger)",
        what: `Horas extra de ${name(o.userId)} (${fmtDur(o.minutes)})${o.supervisorComment ? ` — "${o.supervisorComment}"` : ""}`,
        who: name(o.resolvedBy), status: o.status,
      });
    }
  }
  for (const v of state.validations) {
    if (!canSeeAll && v.userId !== me.id) continue;
    events.push({
      at: v.at.slice(0, 10), icon: "check-circle", color: "var(--success)",
      what: `Carga de horas validada: ${name(v.userId)} (semana del ${fmtDate(v.weekStart)})`,
      who: name(v.validatedBy), status: "Validado",
    });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {events.length === 0 && <Empty icon="history" text="Sin movimientos registrados" sub="Acá vas a ver el historial de solicitudes, aprobaciones y validaciones." />}
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
                <td style={{ whiteSpace: "nowrap", fontFamily: "var(--mono)", fontSize: 12 }}>{fmtDate(e.at)}</td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: e.color }}><Icon name={e.icon} size={15} /></span> {e.what}
                  </span>
                </td>
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
  const [files, setFiles] = useState<Attachment[]>([]);

  const partial = ["Salida médica", "Medio día", "Horario reducido", "Compensación de horas", "Horas extra"].includes(type);
  // Cambio 6: solo el tipo y la fecha son obligatorios; el resto es opcional
  const valid = Boolean(type) && Boolean(dateFrom) && dateTo >= dateFrom;

  // Solo se listan los tipos habilitados en Administración (el tipo inicial forzado siempre se incluye)
  const enabledTypes = state.leaveTypeConfig.filter((t) => t.enabled).map((t) => t.type);
  const availableTypes = TYPES.filter((t) => enabledTypes.includes(t) || t === initialType);

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB por archivo

  function onFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list];
    const tooBig = picked.filter((f) => f.size > MAX_BYTES);
    if (tooBig.length > 0) {
      toast(`Cada archivo debe pesar 10 MB o menos. Excede: ${tooBig.map((f) => f.name).join(", ")}.`);
    }
    const ok = picked.filter((f) => f.size <= MAX_BYTES);
    Promise.all(
      ok.map(
        (f) =>
          new Promise<Attachment>((res) => {
            const reader = new FileReader();
            reader.onload = () => res({ name: f.name, url: reader.result as string, size: f.size });
            reader.onerror = () => res({ name: f.name });
            reader.readAsDataURL(f);
          }),
      ),
    ).then(setFiles);
  }

  function submit() {
    if (!valid) return;
    const created = today();

    if (type === "Horas extra") {
      let minutes = 0;
      if (timeFrom && timeTo) {
        const [h1, m1] = timeFrom.split(":").map(Number);
        const [h2, m2] = timeTo.split(":").map(Number);
        minutes = Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
      }
      if (minutes === 0) {
        const u = state.users.find((x) => x.id === state.currentUserId);
        minutes = u ? Math.round((u.weeklyHours * 60) / Math.max(1, u.workDays.length)) : 8 * 60;
      }
      dispatch({
        type: "addOvertime",
        o: {
          id: uid(),
          userId: state.currentUserId,
          weekStart: dateFrom,
          minutes,
          status: "Pendiente",
          createdAt: created,
          supervisorComment: reason.trim() || undefined,
        },
      });
    }

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
        createdAt: created,
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
        <label>Tipo de ausencia <span style={{ color: "var(--danger)" }}>*</span></label>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
          {availableTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {type === "Compensación de horas" && (
        <div style={{ fontSize: 12.5, background: otBalance > 0 ? "var(--success-soft)" : "var(--warning-soft)", color: otBalance > 0 ? "var(--success)" : "var(--warning)", padding: "8px 12px", borderRadius: 8, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name={otBalance > 0 ? "scale" : "alert"} size={14} />
          {otBalance > 0
            ? `Tenés ${fmtDur(otBalance)} extra aprobadas disponibles para recuperar.`
            : "No tenés horas extra aprobadas. La solicitud puede ser rechazada."}
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label>Desde <span style={{ color: "var(--danger)" }}>*</span></label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value); }} />
        </div>
        <div className="field">
          <label>Hasta <span style={{ color: "var(--danger)" }}>*</span></label>
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
        <label>Motivo <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(opcional)</span></label>
        <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contanos brevemente el motivo…" />
      </div>
      <div className="field">
        <label>Adjuntos <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(opcional — certificados, comprobantes · máx. 10 MB por archivo)</span></label>
        <input type="file" className="input" multiple onChange={(e) => onFiles(e.target.files)} />
        {files.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {files.map((f, i) => (
              <AttachmentChip key={i} f={f} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
