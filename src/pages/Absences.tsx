import React, { useState } from "react";
import { useStore, validatedOvertimeMin, overtimeBalance, vacationInfo, absenceWarnings, overtimeWarnings, overtimeOverlapIssues, overtimeClaimDeadline, overtimeRange, overtimeBreakdown, expectedMinutesInRange, findOvertimeFor, findAbsenceFor } from "../store";
import { OvertimeReportModal, OvertimeTraceModal } from "../components/OvertimeReport";
import { buildOvertimeSummary, overtimePdfDataUrl } from "../overtimeSummary";
import type { AbsenceRequest, AbsenceType, Attachment, OvertimeRequest, RequestEvent } from "../types";
import { ATTACHMENT_ACCEPT, addMonths, attachmentMime, fmtDate, fmtDateTime, fmtDur, monthEnd, monthStart, today, uid } from "../utils";
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
  const cls = s === "Aprobado" ? "ok" : s === "Rechazado" ? "bad" : s === "Devuelto" ? "acc" : "warn";
  return <span className={`badge ${cls}`}>{s}</span>;
}

/** Convierte un data URL en Blob con el tipo indicado. El tipo lo decide la app
 * (attachmentMime), nunca el que declara el propio archivo. */
function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function AttachmentChip({ f }: { f: Attachment }) {
  // null = tipo no permitido (HTML, SVG...): se puede descargar, pero no abrir.
  const viewMime = f.url ? attachmentMime(f.name, f.url) : null;

  const withBlobUrl = (mime: string, fn: (url: string) => void) => {
    if (!f.url) return;
    const url = URL.createObjectURL(dataUrlToBlob(f.url, mime));
    fn(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const view = () => {
    if (viewMime) withBlobUrl(viewMime, (url) => window.open(url, "_blank", "noopener"));
  };
  const download = () =>
    withBlobUrl("application/octet-stream", (url) => {
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
      {f.size != null && <span style={{ color: "var(--text-3)" }}>({f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`})</span>}
      {f.url && (
        <>
          {viewMime && (
            <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={view} aria-label="Ver" title="Ver">
              <Icon name="eye" size={12} />
            </button>
          )}
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
  // El supervisor ya no aprueba ni edita solicitudes: solo controla y valida horas
  // desde Control de horas. Aprobar/gestionar solicitudes queda para admin/gerente.
  const canApprove = me.role === "admin" || me.role === "gerente";
  const canManage = me.role === "admin" || me.role === "gerente";
  // Equipo España: acceso de consulta — canSeePage ya solo deja llegar acá a
  // un gerente de España (para aprobar). No carga solicitudes propias ni
  // informa horas extra propias en esta plataforma.
  const isEspana = me.team === "espana";
  const [tab, setTab] = useState<"mias" | "aprobar" | "todas" | "extra" | "registro">(isEspana ? "aprobar" : "mias");
  const [fPerson, setFPerson] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState<AbsenceRequest | null>(null);
  const [comment, setComment] = useState("");
  const [editAbsence, setEditAbsence] = useState<AbsenceRequest | null>(null);
  const [deleteAbsenceReq, setDeleteAbsenceReq] = useState<AbsenceRequest | null>(null);
  const [deleteOtReq, setDeleteOtReq] = useState<OvertimeRequest | null>(null);
  const [reportOt, setReportOt] = useState<OvertimeRequest | null>(null);
  const [resubmitOt, setResubmitOt] = useState<OvertimeRequest | null>(null);

  const mine = state.absences.filter((a) => a.userId === me.id);
  const toApprove = state.absences.filter((a) => a.status === "Pendiente" && a.userId !== me.id);
  const otPending = state.overtime.filter((o) => o.status === "Pendiente" && o.userId !== me.id);
  const myOvertime = state.overtime.filter((o) => o.userId === me.id);
  const myOtBalance = overtimeBalance(state, me.id);
  const myOtApproved = myOtBalance.availableMin;
  const dailyMin = me.jornada === "media" ? 4 * 60 : (me.weeklyHours * 60) / Math.max(1, me.workDays.length);
  const otDaysRaw = myOtApproved / dailyMin;
  const otDays = Math.trunc(otDaysRaw * 100) / 100;
  const [resolveOtId, setResolveOtId] = useState<string | null>(null);

  const vac = vacationInfo(state, me.id, today());
  const all = state.absences.filter(
    (a) => (!fPerson || a.userId === fPerson) && (!fType || a.type === fType) && (!fStatus || a.status === fStatus),
  );
  const list = tab === "mias" ? mine : tab === "todas" ? all : toApprove;

  function resolve(status: "Aprobado" | "Rechazado" | "Devuelto") {
    if (!detail) return;
    if (status === "Devuelto" && !comment.trim()) {
      toast("Para devolverla, escribí qué hay que corregir en el comentario.");
      return;
    }
    if (status === "Aprobado" && detail.type === "Horas extra" && overtimeOverlapIssues(state, detail.userId, monthStart(detail.dateFrom)).length > 0) {
      toast("Hay horas superpuestas en el calendario: hay que corregirlas antes de aprobar.");
      return;
    }
    dispatch({ type: "resolveAbsence", id: detail.id, status, comment, by: me.id });
    if (detail.type === "Horas extra") {
      const matchingOt = findOvertimeFor(state, detail);
      if (matchingOt) {
        dispatch({ type: "resolveOvertime", id: matchingOt.id, status, comment, by: me.id });
      }
    }
    toast(status === "Devuelto" ? "Solicitud devuelta a la persona con tu comentario." : `Solicitud ${status.toLowerCase()}.`);
    setDetail(null);
    setComment("");
  }

  function resolveOt(status: "Aprobado" | "Rechazado" | "Devuelto") {
    if (!resolveOtId) return;
    if (status === "Devuelto" && !comment.trim()) {
      toast("Para devolverla, escribí qué hay que corregir en el comentario.");
      return;
    }
    const ot = state.overtime.find((x) => x.id === resolveOtId);
    if (status === "Aprobado" && ot && overtimeOverlapIssues(state, ot.userId, ot.weekStart).length > 0) {
      toast("Hay horas superpuestas en el calendario: hay que corregirlas antes de aprobar.");
      return;
    }
    dispatch({ type: "resolveOvertime", id: resolveOtId, status, comment, by: me.id });
    if (ot) {
      const matchingAbs = findAbsenceFor(state, ot);
      if (matchingAbs) {
        dispatch({ type: "resolveAbsence", id: matchingAbs.id, status, comment, by: me.id });
      }
    }
    toast(status === "Devuelto" ? "Horas extra devueltas a la persona con tu comentario." : `Horas extra ${status.toLowerCase()}s.`);
    setResolveOtId(null);
    setComment("");
  }

  function confirmDeleteAbsence() {
    if (!deleteAbsenceReq) return;
    dispatch({ type: "deleteAbsence", id: deleteAbsenceReq.id });
    if (deleteAbsenceReq.type === "Horas extra") {
      const ot = findOvertimeFor(state, deleteAbsenceReq);
      if (ot) dispatch({ type: "deleteOvertime", id: ot.id });
    }
    toast("Solicitud eliminada.");
    setDeleteAbsenceReq(null);
  }

  function confirmDeleteOt() {
    if (!deleteOtReq) return;
    dispatch({ type: "deleteOvertime", id: deleteOtReq.id });
    toast("Horas extra eliminadas.");
    setDeleteOtReq(null);
  }

  return (
    <>
      <div className="page-head">
        <h1>Gestión</h1>
        <span className="spacer" />
        {!isEspana && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={15} /> Nueva solicitud
          </button>
        )}
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
          {myOtBalance.nextExpiration && (
            <div className="hint" style={myOtBalance.expiringSoonMin > 0 ? { color: "var(--warning)", fontWeight: 600 } : undefined}>
              Empiezan a vencer el {fmtDate(myOtBalance.nextExpiration)}
            </div>
          )}
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
        {!isEspana && <button className={tab === "mias" ? "active" : ""} onClick={() => setTab("mias")}>Mis solicitudes</button>}
        {canApprove && (
          <button className={tab === "aprobar" ? "active" : ""} onClick={() => setTab("aprobar")}>
            Por aprobar {toApprove.length > 0 && `(${toApprove.length})`}
          </button>
        )}
        {canManage && (
          <button className={tab === "todas" ? "active" : ""} onClick={() => setTab("todas")}>Todas las solicitudes</button>
        )}
        {!isEspana && (
          <button className={tab === "extra" ? "active" : ""} onClick={() => setTab("extra")}>
            Horas extra {canApprove && otPending.length > 0 && `(${otPending.length})`}
          </button>
        )}
        <button className={tab === "registro" ? "active" : ""} onClick={() => setTab("registro")}>Registro</button>
      </div>

      {tab === "registro" && <RequestLog />}

      {tab === "extra" && (
        <>
          {myOtBalance.expiringSoonMin > 0 && myOtBalance.nextExpiration && (
            <div style={{ marginBottom: 8, fontSize: 12.5, background: "var(--warning-soft)", color: "var(--warning)", padding: "7px 12px", borderRadius: 8, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
              <Icon name="alert" size={14} /> {fmtDur(myOtBalance.expiringSoonMin)} vencen el {fmtDate(myOtBalance.nextExpiration)} si no las recuperás antes.
            </div>
          )}
          {myOtBalance.expiredMin > 0 && (
            <div style={{ marginBottom: 8, fontSize: 12.5, background: "var(--surface-2)", color: "var(--text-3)", padding: "7px 12px", borderRadius: 8, display: "flex", gap: 6, alignItems: "center" }}>
              <Icon name="ban" size={14} /> {fmtDur(myOtBalance.expiredMin)} vencieron sin recuperarse.
            </div>
          )}
          <MonthRequest onReport={setReportOt} onResubmit={setResubmitOt} recoverMin={myOtApproved} onRecover={() => setShowNew(true)} />
          <div className="card">
            {[...(canApprove ? otPending : []), ...myOvertime].length === 0 && (
              <Empty icon="flame" text="Sin horas extra registradas" sub="Cuando un mes supere la jornada, el administrador las enviará a supervisión desde Control de horas." />
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
                  <button className="btn btn-ghost btn-sm" onClick={() => setReportOt(o)} title="Trazabilidad de la solicitud (se puede exportar a PDF)">
                    <Icon name="scale" size={13} /> Trazabilidad
                  </button>
                  {canApprove && !isMineOt && o.status === "Pendiente" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setResolveOtId(o.id)}>Revisar</button>
                  )}
                  {isMineOt && o.status === "Devuelto" && (
                    <button className="btn btn-primary btn-sm" onClick={() => setResubmitOt(o)}>Corregir y reenviar</button>
                  )}
                  {canManage && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeleteOtReq(o)} aria-label="Eliminar" title="Eliminar">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "todas" && (
        <div className="card card-pad no-print" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select className="select" style={{ width: "auto" }} value={fPerson} onChange={(e) => setFPerson(e.target.value)}>
            <option value="">Todas las personas</option>
            {state.users.slice().sort((a, b) => a.name.localeCompare(b.name)).map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (baja)"}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <span style={{ fontSize: 12.5, color: "var(--text-3)", alignSelf: "center" }}>{all.length} solicitudes</span>
        </div>
      )}

      {(tab === "mias" || tab === "aprobar" || tab === "todas") && (
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
                    {tab !== "mias" && u && (
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

      {editAbsence && <NewAbsence edit={editAbsence} onClose={() => setEditAbsence(null)} />}

      {detail && (
        <RequestDetail
          request={detail}
          canApprove={canApprove && detail.userId !== me.id && detail.status === "Pendiente"}
          canManage={canManage}
          comment={comment}
          setComment={setComment}
          onResolve={resolve}
          onResubmit={detail.userId === me.id && detail.status === "Devuelto"
            ? (() => {
                if (detail.type === "Horas extra") {
                  const o = findOvertimeFor(state, detail);
                  if (o) setResubmitOt(o);
                } else setEditAbsence(detail);
                setDetail(null);
              })
            : undefined}
          onReport={detail.type === "Horas extra" ? (() => { const o = findOvertimeFor(state, detail); if (o) { setReportOt(o); setDetail(null); } }) : undefined}
          onDelete={() => { setDeleteAbsenceReq(detail); setDetail(null); }}
          onClose={() => setDetail(null)}
        />
      )}

      {deleteAbsenceReq && (
        <Modal
          title="Eliminar solicitud"
          onClose={() => setDeleteAbsenceReq(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteAbsenceReq(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDeleteAbsence}><Icon name="trash" size={14} /> Sí, eliminar</button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>
            ¿Eliminar la solicitud de <strong>{deleteAbsenceReq.type}</strong> ({fmtDate(deleteAbsenceReq.dateFrom)}
            {deleteAbsenceReq.dateFrom !== deleteAbsenceReq.dateTo && ` → ${fmtDate(deleteAbsenceReq.dateTo)}`})?
          </p>
        </Modal>
      )}

      {resolveOtId && (() => {
        const ot = state.overtime.find((x) => x.id === resolveOtId);
        const warnings = ot ? overtimeWarnings(state, ot) : [];
        const blockers = ot ? overtimeOverlapIssues(state, ot.userId, ot.weekStart) : [];
        return (
          <Modal
            title="Revisar horas extra"
            onClose={() => setResolveOtId(null)}
            footer={
              <>
                <button className="btn btn-danger" onClick={() => resolveOt("Rechazado")}>Rechazar</button>
                <button className="btn btn-secondary" onClick={() => resolveOt("Devuelto")}>Devolver con comentario</button>
                <button className="btn btn-primary" disabled={blockers.length > 0} onClick={() => resolveOt("Aprobado")}>Aprobar</button>
              </>
            }
          >
            <p style={{ fontSize: 13, color: "var(--text-2)" }}>
              Al aprobar, las horas quedan disponibles para que la persona las recupere mediante una solicitud de <strong>Compensación de horas</strong>.
            </p>
            {blockers.length > 0 && <OverlapBlock issues={blockers} />}
            {warnings.length > 0 && (
              <div style={{ background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: i > 0 ? 4 : 0 }}>
                    <Icon name="alert" size={13} style={{ marginTop: 2, flexShrink: 0 }} /> <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="field">
              <label>Comentario</label>
              <textarea className="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Opcional al aprobar o rechazar. Obligatorio para devolver: indicá qué hay que corregir (horas, fechas…)." />
            </div>
          </Modal>
        );
      })()}

      {resubmitOt && <ResubmitOvertime ot={resubmitOt} onClose={() => setResubmitOt(null)} />}

      {reportOt && <OvertimeTraceModal ot={reportOt} onClose={() => setReportOt(null)} />}

      {deleteOtReq && (
        <Modal
          title="Eliminar horas extra"
          onClose={() => setDeleteOtReq(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteOtReq(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmDeleteOt}><Icon name="trash" size={14} /> Sí, eliminar</button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>
            ¿Eliminar las horas extra de la semana del <strong>{fmtDate(deleteOtReq.weekStart)}</strong> ({fmtDur(deleteOtReq.minutes)})?
          </p>
        </Modal>
      )}
    </>
  );
}

/**
 * Solicitud de horas extra de un mes para la persona que inicia sesión: las calcula desde sus
 * registros, valida el calendario, genera la solicitud de Gestión junto con el informe y la
 * deja pendiente de aprobación de Recursos Humanos.
 */
function MonthRequest({ onReport, onResubmit, recoverMin, onRecover }: { onReport: (o: OvertimeRequest) => void; onResubmit: (o: OvertimeRequest) => void; recoverMin: number; onRecover: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const [ms, setMs] = useState(addMonths(monthStart(today()), -1));
  const me2 = monthEnd(ms);
  const label = new Date(ms + "T00:00:00").toLocaleDateString("es", { month: "long", year: "numeric" });

  const bd = overtimeBreakdown(state, me, ms, me2);
  const loaded = bd.loadedMin;
  const computable = bd.computableMin;
  const expected = expectedMinutesInRange(state, me, ms, me2);
  const overtimeMin = bd.extraMin;
  const issues = overtimeOverlapIssues(state, me.id, ms);
  const existing = state.overtime.find((o) => {
    if (o.userId !== me.id) return false;
    const [from, to] = overtimeRange(o.weekStart);
    return from <= me2 && ms <= to;
  });
  const expired = today() > overtimeClaimDeadline(me2);
  const open = ms >= monthStart(today());
  const reason = existing
    ? null
    : open
      ? "El mes todavía no terminó."
      : overtimeMin === 0
        ? "No hay horas extra en este mes."
        : expired
          ? "Pasaron más de 3 meses: ya no se puede reclamar."
          : issues.length > 0
            ? "Corregí las horas superpuestas del calendario para poder solicitarlas."
            : null;

  const [draft, setDraft] = useState<OvertimeRequest | null>(null);

  /** Borrador de la solicitud: se previsualiza el informe antes de enviarla */
  function preview() {
    setDraft({ id: uid(), userId: me.id, weekStart: ms, minutes: overtimeMin, status: "Pendiente", createdAt: today() });
  }

  function request(o: OvertimeRequest) {
    const created = o.createdAt;
    const pdf = overtimePdfDataUrl(buildOvertimeSummary(state, o));
    const file = `informe-horas-extra_${ms.slice(0, 7)}.pdf`;
    setDraft(null);
    dispatch({ type: "addOvertime", o });
    dispatch({
      type: "addAbsence",
      absence: {
        id: uid(), userId: me.id, type: "Horas extra", dateFrom: ms, dateTo: me2,
        reason: `Horas extra de ${label}`, attachments: [{ name: file, url: pdf, size: Math.round(pdf.length * 0.75) }], status: "Pendiente", createdAt: created,
      },
    });
    toast("Solicitud enviada a Recursos Humanos con el informe adjunto.");
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 12, padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="card-title" style={{ margin: 0 }}><Icon name="flame" size={14} /> Horas extra del mes</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setMs(addMonths(ms, -1))} aria-label="Mes anterior"><Icon name="arrow-left" size={13} /></button>
          <strong style={{ textTransform: "capitalize", minWidth: 120, textAlign: "center" }}>{label}</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => setMs(addMonths(ms, 1))} disabled={open} aria-label="Mes siguiente"><Icon name="arrow-right" size={13} /></button>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
          <span>Cargadas <strong>{fmtDur(loaded)}</strong>{loaded > computable && <span style={{ color: "var(--text-3)" }}> ({fmtDur(computable)} computables)</span>}</span>
          <span>Esperadas <strong>{fmtDur(expected)}</strong></span>
          <span>Extra <strong>{fmtDur(overtimeMin)}</strong></span>
        </div>
        <span style={{ flex: 1 }} />
        {recoverMin > 0 && <button className="btn btn-secondary btn-sm" onClick={onRecover}>Recuperar horas</button>}
      </div>
      {!existing && issues.length > 0 && !open && <OverlapBlock issues={issues} />}
      {existing ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge s={existing.status} />
          <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
            {existing.status === "Devuelto"
              ? <>Recursos Humanos te la devolvió{existing.supervisorComment ? <>: <em>“{existing.supervisorComment}”</em></> : "."}</>
              : <>Ya solicitaste {fmtDur(existing.minutes)} de este mes el {fmtDate(existing.createdAt)}.</>}
          </span>
          {existing.status === "Devuelto" && existing.userId === me.id && <button className="btn btn-primary btn-sm" onClick={() => onResubmit(existing)}>Corregir y reenviar</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => onReport(existing)}><Icon name="scale" size={13} /> Ver trazabilidad</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {draft && <OvertimeReportModal ot={draft} onClose={() => setDraft(null)} onSend={() => request(draft)} />}
          <button className="btn btn-primary" disabled={reason !== null} onClick={preview}>Previsualizar informe y solicitar</button>
          {reason && <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{reason}</span>}
        </div>
      )}
      <details style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>
        <summary style={{ cursor: "pointer", color: "var(--text-3)" }}>Cómo funcionan las horas extra</summary>
        <div style={{ marginTop: 4 }}>
          Se detectan por mes (cada día, lo que pasa de la jornada); No laborable y Vacaciones no cuentan. Hay <strong>3 meses</strong> desde ese mes para solicitarlas y no puede haber horas superpuestas en el calendario.
          Suman al saldo cuando Recursos Humanos las aprueba, y hay <strong>1 año</strong> para recuperarlas con una ausencia de tipo <strong>Compensación de horas</strong>.
        </div>
      </details>
    </div>
  );
}

/**
 * Reenvío de horas extra devueltas por Recursos Humanos: la persona corrige sus registros,
 * se recalcula el mes, se previsualiza el informe nuevo y la solicitud vuelve a Pendiente.
 */
function ResubmitOvertime({ ot, onClose }: { ot: OvertimeRequest; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const [from, to] = overtimeRange(ot.weekStart);
  const bd = overtimeBreakdown(state, me, from, to);
  const issues = overtimeOverlapIssues(state, me.id, monthStart(from));
  const expired = today() > overtimeClaimDeadline(to);
  const [preview, setPreview] = useState(false);
  const [reply, setReply] = useState("");
  const draft: OvertimeRequest = { ...ot, minutes: bd.extraMin, status: "Pendiente" };
  const blocked = bd.extraMin === 0 || issues.length > 0 || expired || from !== monthStart(from);

  function send() {
    const abs = findAbsenceFor(state, ot);
    const pdf = overtimePdfDataUrl(buildOvertimeSummary(state, draft));
    const file = `informe-horas-extra_${from.slice(0, 7)}.pdf`;
    const event: RequestEvent = { at: new Date().toISOString(), by: me.id, action: "Reenviada", comment: reply.trim() || undefined };
    dispatch({ type: "updateOvertime", o: { ...draft, history: [...(ot.history ?? []), event] } });
    if (abs) {
      const kept = abs.attachments.filter((f) => !f.name.startsWith("informe-horas-extra_"));
      dispatch({ type: "updateAbsence", absence: { ...abs, status: "Pendiente", history: [...(abs.history ?? []), event], attachments: [...kept, { name: file, url: pdf, size: Math.round(pdf.length * 0.75) }] } });
    }
    toast("Solicitud reenviada a Recursos Humanos con el informe actualizado.");
    onClose();
  }

  return (
    <>
      <Modal
        title="Corregir y reenviar horas extra"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" disabled={blocked} onClick={() => setPreview(true)}>Previsualizar informe y reenviar</button>
          </>
        }
      >
        {ot.supervisorComment && (
          <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>
            <strong>{state.users.find((x) => x.id === ot.resolvedBy)?.name ?? "Recursos Humanos"} pidió corregir:</strong> {ot.supervisorComment}
          </div>
        )}
        <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 0 }}>
          Corregí tus registros de horas (en Registrar o en el Calendario) y volvé acá: el informe se recalcula con lo que haya cargado ahora.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
          <span>Pedido antes <strong>{fmtDur(ot.minutes)}</strong></span>
          <span>Ahora <strong>{fmtDur(bd.extraMin)}</strong></span>
        </div>
        {issues.length > 0 && <OverlapBlock issues={issues} />}
        <div className="field" style={{ margin: "8px 0 0" }}>
          <label>Tu respuesta a Recursos Humanos <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(opcional)</span></label>
          <textarea className="textarea" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Qué corregiste o por qué las horas están bien…" />
        </div>
        {expired && <div style={{ fontSize: 12.5, color: "var(--danger)" }}>Pasaron más de 3 meses: ya no se puede reclamar.</div>}
        {bd.extraMin === 0 && !expired && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Con los registros actuales ya no hay horas extra en el mes.</div>}
      </Modal>
      {preview && <OvertimeReportModal ot={draft} onClose={() => setPreview(false)} onSend={send} />}
    </>
  );
}

/** Horas superpuestas en el calendario: impiden solicitar o aprobar horas extra hasta corregirlas */
function OverlapBlock({ issues }: { issues: string[] }) {
  return (
    <div style={{ background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
      <strong>Hay horas superpuestas en el calendario del mes. Hay que corregirlas antes de continuar:</strong>
      {issues.slice(0, 6).map((t, i) => <div key={i} style={{ marginTop: 3 }}>{t}</div>)}
      {issues.length > 6 && <div style={{ marginTop: 3 }}>y {issues.length - 6} más…</div>}
    </div>
  );
}

/** Detalle completo de una solicitud, con adjuntos y (para supervisores) acciones de aprobación/edición */
function RequestDetail({
  request: a,
  canApprove,
  canManage,
  comment,
  setComment,
  onResolve,
  onReport,
  onResubmit,
  onDelete,
  onClose,
}: {
  request: AbsenceRequest;
  canApprove: boolean;
  canManage: boolean;
  comment: string;
  setComment: (s: string) => void;
  onResolve: (s: "Aprobado" | "Rechazado" | "Devuelto") => void;
  onReport?: () => void;
  onResubmit?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const u = state.users.find((x) => x.id === a.userId);
  const resolver = state.users.find((x) => x.id === a.resolvedBy);
  const isOt = a.type === "Horas extra";
  const ot = isOt ? findOvertimeFor(state, a) : undefined;
  const sum = ot ? buildOvertimeSummary(state, ot) : null;
  // En horas extra el rango es el mes entero: avisar de fines de semana no aporta nada
  const warnings = canApprove && !isOt ? absenceWarnings(state, a) : [];
  const blockers = canApprove && isOt ? overtimeOverlapIssues(state, a.userId, monthStart(a.dateFrom)) : [];
  const autoReason = isOt && a.reason.startsWith("Horas extra de ");
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div style={{ color: "var(--text-3)", fontSize: 11.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 2 }}>{children}</div>
    </div>
  );
  const verb = a.status === "Aprobado" ? "Aprobado" : a.status === "Rechazado" ? "Rechazado" : "Devuelto";

  return (
    <Modal
      title="Detalle de la solicitud"
      width={640}
      onClose={onClose}
      footer={
        <>
          <div style={{ display: "flex", gap: 2, marginRight: "auto" }}>
            {onReport && <button className="btn btn-ghost btn-sm" onClick={onReport} title="Trazabilidad de la solicitud"><Icon name="scale" size={14} /> Trazabilidad</button>}
            {canManage && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={onDelete} title="Eliminar" aria-label="Eliminar"><Icon name="trash" size={14} /></button>
              </>
            )}
          </div>
          {canApprove ? (
            <>
              <button className="btn btn-danger btn-sm" onClick={() => onResolve("Rechazado")}>Rechazar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => onResolve("Devuelto")}>Devolver</button>
              <button className="btn btn-primary btn-sm" disabled={blockers.length > 0} onClick={() => onResolve("Aprobado")}>Aprobar</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
              {onResubmit && <button className="btn btn-primary btn-sm" onClick={onResubmit}>Corregir y reenviar</button>}
            </>
          )}
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "var(--accent)" }}><Icon name={TYPE_ICON[a.type]} size={22} /></span>
        <strong style={{ fontSize: 16 }}>{a.type}</strong>
        <StatusBadge s={a.status} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>Solicitada el {fmtDate(a.createdAt)}</span>
      </div>

      {blockers.length > 0 && <OverlapBlock issues={blockers} />}
      {warnings.length > 0 && (
        <div style={{ background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: i > 0 ? 4 : 0 }}>
              <Icon name="alert" size={13} style={{ marginTop: 2, flexShrink: 0 }} /> <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, background: "var(--surface-2)", borderRadius: 10, padding: "12px 14px" }}>
        <Field label="Solicitante">
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Avatar name={u?.name ?? "?"} size={20} /> {u?.name ?? "—"}
          </span>
        </Field>
        {isOt && sum ? (
          <>
            <Field label="Período">{sum.period}</Field>
            <Field label="Horas extra"><strong>{fmtDur(sum.extraMin)}</strong></Field>
          </>
        ) : (
          <>
            <Field label="Fechas">
              {fmtDate(a.dateFrom)}
              {a.dateFrom !== a.dateTo && ` → ${fmtDate(a.dateTo)}`}
            </Field>
            {(a.timeFrom || a.timeTo) && <Field label="Horario">{a.timeFrom || "—"} – {a.timeTo || "—"}</Field>}
          </>
        )}
      </div>

      {isOt && sum && sum.rows.length > 0 && (
        <table className="table table-compact" style={{ fontSize: 12.5 }}>
          <thead>
            <tr><th>Proyecto</th><th style={{ textAlign: "right" }}>Horas totales</th><th style={{ textAlign: "right" }}>Horas extra</th></tr>
          </thead>
          <tbody>
            {sum.rows.map((r) => (
              <tr key={r.projectId ?? "none"}>
                <td>{r.name}</td>
                <td style={{ textAlign: "right" }}>{fmtDur(r.totalMin)}</td>
                <td style={{ textAlign: "right", fontWeight: r.extraMin ? 700 : 400 }}>{r.extraMin ? fmtDur(r.extraMin) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {a.reason && !autoReason && <Field label="Motivo">{a.reason}</Field>}

      <Field label="Adjuntos">
        {a.attachments.length === 0 ? (
          <em style={{ color: "var(--text-3)" }}>Sin adjuntos</em>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {a.attachments.map((f, i) => (
              <AttachmentChip key={i} f={f} />
            ))}
          </div>
        )}
      </Field>

      {a.history && a.history.length > 0 && <HistoryThread events={a.history} />}

      {!a.history?.length && (a.status === "Aprobado" || a.status === "Rechazado" || a.status === "Devuelto") && (
        <div style={{ borderLeft: `3px solid ${a.status === "Aprobado" ? "var(--success)" : a.status === "Rechazado" ? "var(--danger)" : "var(--accent)"}`, paddingLeft: 12 }}>
          <div style={{ fontSize: 13 }}><strong>{verb}</strong> por {resolver?.name ?? "—"}{a.resolvedAt && ` · ${fmtDate(a.resolvedAt)}`}</div>
          {a.supervisorComment && <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 3 }}>“{a.supervisorComment}”</div>}
        </div>
      )}

      {canApprove && (
        <div className="field" style={{ margin: 0 }}>
          <label>Comentario <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(obligatorio para devolver)</span></label>
          <textarea className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Qué hay que corregir: horas, fechas, algo que llame la atención…" />
        </div>
      )}
    </Modal>
  );
}

/** Ida y vuelta de la solicitud: devoluciones con observaciones, respuestas y decisiones, con quién y cuándo */
function HistoryThread({ events }: { events: RequestEvent[] }) {
  const { state } = useStore();
  const LABEL = { Devuelta: "devolvió con observaciones", Reenviada: "respondió y reenvió", Aprobada: "aprobó", Rechazada: "rechazó" } as const;
  const COLOR = { Devuelta: "var(--accent)", Reenviada: "var(--text-3)", Aprobada: "var(--success)", Rechazada: "var(--danger)" } as const;
  return (
    <div>
      <div style={{ color: "var(--text-3)", fontSize: 11.5, fontWeight: 650, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Historial</div>
      {events.map((e, i) => (
        <div key={i} style={{ borderLeft: `3px solid ${COLOR[e.action]}`, paddingLeft: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 13 }}>
            <strong>{state.users.find((x) => x.id === e.by)?.name ?? "—"}</strong> {LABEL[e.action]}
            <span style={{ color: "var(--text-3)" }}> · {fmtDateTime(e.at)}</span>
          </div>
          {e.comment && <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>“{e.comment}”</div>}
        </div>
      ))}
    </div>
  );
}

/** Registro cronológico de solicitudes: quién solicitó, quién resolvió y cuándo */
function RequestLog() {
  const { state } = useStore();
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const canSeeAll = me.role === "admin" || me.role === "gerente";
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
  events.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {events.length === 0 && <Empty icon="history" text="Sin movimientos registrados" sub="Acá vas a ver el historial de solicitudes y aprobaciones." />}
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
                  <span className={`badge ${e.status === "Aprobado" ? "ok" : e.status === "Rechazado" ? "bad" : "acc"}`}>
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

function NewAbsence({ onClose, initialType, edit }: { onClose: () => void; initialType?: AbsenceType; edit?: AbsenceRequest }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [type, setType] = useState<AbsenceType>(edit?.type ?? initialType ?? "Vacaciones");
  const otBalance = validatedOvertimeMin(state, state.currentUserId);
  const [dateFrom, setDateFrom] = useState(edit?.dateFrom ?? today());
  const [dateTo, setDateTo] = useState(edit?.dateTo ?? today());
  const [timeFrom, setTimeFrom] = useState(edit?.timeFrom ?? "");
  const [timeTo, setTimeTo] = useState(edit?.timeTo ?? "");
  const [reason, setReason] = useState(edit?.reason ?? "");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<Attachment[]>(edit?.attachments ?? []);
  // Admin/gerente pueden cargar o corregir una solicitud a nombre de otra persona y dejarla ya resuelta
  const staff = ["admin", "gerente"].includes(state.users.find((u) => u.id === state.currentUserId)?.role ?? "");
  const [personId, setPersonId] = useState(edit?.userId ?? state.currentUserId);
  const [status, setStatus] = useState<AbsenceRequest["status"]>(edit?.status ?? "Pendiente");
  const target = staff ? personId : state.currentUserId;

  const partial = ["Salida médica", "Medio día", "Horario reducido", "Compensación de horas", "Horas extra"].includes(type);
  // Cambio 6: solo el tipo y la fecha son obligatorios; el resto es opcional
  // Horas extra: no se pueden solicitar con horas superpuestas en el calendario del mes
  const overlapIssues = type === "Horas extra" && dateFrom && status !== "Rechazado" ? overtimeOverlapIssues(state, target, monthStart(dateFrom)) : [];
  const valid = Boolean(type) && Boolean(dateFrom) && dateTo >= dateFrom && overlapIssues.length === 0;

  // Solo se listan los tipos habilitados en Administración (el tipo inicial forzado siempre se incluye)
  const enabledTypes = state.leaveTypeConfig.filter((t) => t.enabled).map((t) => t.type);
  const availableTypes = TYPES.filter((t) => enabledTypes.includes(t) || t === initialType || t === edit?.type);

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB por archivo

  function onFiles(list: FileList | null) {
    if (!list) return;
    const all = [...list];
    const badType = all.filter((f) => !attachmentMime(f.name));
    if (badType.length > 0) {
      toast(`Solo se aceptan archivos PDF, PNG o JPG. Se descartó: ${badType.map((f) => f.name).join(", ")}.`);
    }
    const picked = all.filter((f) => attachmentMime(f.name));
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

    const finalStatus = staff ? status : "Pendiente";
    const resolution = finalStatus === "Pendiente"
      ? { resolvedBy: undefined, resolvedAt: undefined }
      : finalStatus === edit?.status
        ? { resolvedBy: edit.resolvedBy, resolvedAt: edit.resolvedAt }
        : { resolvedBy: state.currentUserId, resolvedAt: today() };

    if (edit) {
      if (edit.type === "Horas extra" || type === "Horas extra") {
        const ot = findOvertimeFor(state, edit);
        if (edit.type === "Horas extra" && type !== "Horas extra" && ot) {
          dispatch({ type: "deleteOvertime", id: ot.id });
        } else if (type === "Horas extra") {
          let minutes = ot?.minutes ?? 0;
          if (timeFrom && timeTo) {
            const [h1, m1] = timeFrom.split(":").map(Number);
            const [h2, m2] = timeTo.split(":").map(Number);
            minutes = Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1)) || minutes;
          }
          const u = state.users.find((x) => x.id === target);
          if (!minutes) minutes = u ? (u.jornada === "media" ? 4 * 60 : Math.round((u.weeklyHours * 60) / Math.max(1, u.workDays.length))) : 8 * 60;
          const next: OvertimeRequest = {
            id: ot?.id ?? uid(), userId: target, weekStart: monthStart(dateFrom), minutes, status: finalStatus,
            createdAt: edit.createdAt, ...resolution, supervisorComment: reason.trim() || undefined,
          };
          dispatch(ot ? { type: "updateOvertime", o: next } : { type: "addOvertime", o: next });
        }
      }
      dispatch({
        type: "updateAbsence",
        absence: {
          ...edit,
          userId: target,
          status: finalStatus,
          ...resolution,
          type,
          dateFrom,
          dateTo,
          timeFrom: partial ? timeFrom || undefined : undefined,
          timeTo: partial ? timeTo || undefined : undefined,
          reason: reason.trim(),
          attachments: files,
          history: edit.status === "Devuelto"
            ? [...(edit.history ?? []), { at: new Date().toISOString(), by: state.currentUserId, action: "Reenviada", comment: reply.trim() || undefined }]
            : edit.history,
        },
      });
      toast(edit.status === "Devuelto" ? "Solicitud reenviada a Recursos Humanos." : "Solicitud actualizada.");
      onClose();
      return;
    }

    const created = today();

    if (type === "Horas extra") {
      let minutes = 0;
      if (timeFrom && timeTo) {
        const [h1, m1] = timeFrom.split(":").map(Number);
        const [h2, m2] = timeTo.split(":").map(Number);
        minutes = Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
      }
      if (minutes === 0) {
        const u = state.users.find((x) => x.id === target);
        minutes = u
          ? u.jornada === "media"
            ? 4 * 60
            : Math.round((u.weeklyHours * 60) / Math.max(1, u.workDays.length))
          : 8 * 60;
      }
      dispatch({
        type: "addOvertime",
        o: {
          id: uid(),
          userId: target,
          weekStart: monthStart(dateFrom),
          minutes,
          status: finalStatus,
          createdAt: created,
          ...resolution,
          supervisorComment: reason.trim() || undefined,
        },
      });
    }

    dispatch({
      type: "addAbsence",
      absence: {
        id: uid(),
        userId: target,
        type,
        dateFrom,
        dateTo,
        timeFrom: partial ? timeFrom || undefined : undefined,
        timeTo: partial ? timeTo || undefined : undefined,
        reason: reason.trim(),
        attachments: files,
        status: finalStatus,
        createdAt: created,
        ...resolution,
      },
    });
    toast(finalStatus === "Pendiente" ? "Solicitud enviada. Tu supervisor la revisará." : "Solicitud cargada.");
    onClose();
  }

  return (
    <Modal
      title={edit ? "Editar solicitud" : "Nueva solicitud de ausencia"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid}>{edit ? "Guardar cambios" : "Enviar solicitud"}</button>
        </>
      }
    >
      {staff && (
        <div className="form-grid">
          <div className="field">
            <label>Persona</label>
            <select className="select" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {state.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Estado</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as AbsenceRequest["status"])}>
              <option value="Pendiente">Pendiente</option>
              <option value="Aprobado">Aprobado</option>
              <option value="Rechazado">Rechazado</option>
            </select>
          </div>
        </div>
      )}
      <div className="field">
        <label>Tipo de ausencia <span style={{ color: "var(--danger)" }}>*</span></label>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
          {availableTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {overlapIssues.length > 0 && <OverlapBlock issues={overlapIssues} />}
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
      {edit?.status === "Devuelto" && (
        <div className="field">
          <label>Tu respuesta a Recursos Humanos <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(opcional)</span></label>
          <textarea className="textarea" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Qué corregiste o por qué está bien…" />
        </div>
      )}
      <div className="field">
        <label>Adjuntos <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(opcional — certificados, comprobantes · PDF, PNG o JPG · máx. 10 MB por archivo)</span></label>
        <input type="file" className="input" multiple accept={ATTACHMENT_ACCEPT} onChange={(e) => onFiles(e.target.files)} />
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
