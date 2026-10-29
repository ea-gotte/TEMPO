import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { findAbsenceFor, useStore } from "../store";
import { buildOvertimeSummary } from "../overtimeSummary";
import { fmtDur } from "../utils";
import { Modal } from "./ui";
import { Icon } from "./Icon";
import type { OvertimeRequest } from "../types";

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

const th: React.CSSProperties = { textAlign: "left", padding: "5px 8px", borderBottom: `1.5px solid ${INK}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: "5px 8px", borderBottom: `1px solid ${LINE}`, fontSize: 12.5 };

/** Informe de horas extra de un mes: horas totales y extra por proyecto, y trazabilidad de la aprobación. */
function ReportDoc({ ot }: { ot: OvertimeRequest }) {
  const { state } = useStore();
  const s = buildOvertimeSummary(state, ot);

  return (
    <div style={{ background: "#fff", color: INK, padding: 24, fontFamily: "var(--font, system-ui, sans-serif)", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${INK}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{s.company}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Informe de horas extra</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: MUTED }}>Emitido el {s.issued}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px", margin: "12px 0" }}>
        {[["Persona", s.person], ["Período", s.period], ["Supervisor", s.supervisor]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 80, color: MUTED }}>{k}</span>
            <strong style={{ fontWeight: 600 }}>{v}</strong>
          </div>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
        <thead>
          <tr><th style={th}>Proyecto</th><th style={{ ...th, textAlign: "right" }}>Horas totales</th><th style={{ ...th, textAlign: "right" }}>Horas extra</th></tr>
        </thead>
        <tbody>
          {s.rows.length === 0 && <tr><td style={td} colSpan={3}>Sin horas computables en el período.</td></tr>}
          {s.rows.map((r) => (
            <tr key={r.projectId ?? "none"}>
              <td style={td}>{r.name}</td>
              <td style={{ ...td, textAlign: "right" }}>{fmtDur(r.totalMin)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: r.extraMin ? 700 : 400 }}>{r.extraMin ? fmtDur(r.extraMin) : "—"}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>Total</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtDur(s.totalMin)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtDur(s.extraMin)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: MUTED }}>
        {s.nonComputableMin > 0 && <>No computables (No laborable / Vacaciones): {fmtDur(s.nonComputableMin)}. </>}
        Cada día se cuentan las horas hasta completar la jornada; el resto es extra del proyecto en que se cargó.
      </div>
    </div>
  );
}

/** Contenedor oculto que se imprime ("Guardar como PDF") en lugar de la aplicación */
function usePrintHost() {
  const [host] = useState(() => {
    const d = document.createElement("div");
    d.className = "print-only";
    return d;
  });

  useEffect(() => {
    document.body.appendChild(host);
    return () => {
      host.remove();
      document.body.classList.remove("printing-report");
    };
  }, [host]);

  function savePdf() {
    document.body.classList.add("printing-report");
    const done = () => {
      document.body.classList.remove("printing-report");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }
  return { host, savePdf };
}

/**
 * Vista previa del informe. Con `onSend` es la previsualización previa al envío de la solicitud
 * (el informe viaja como adjunto); sin él, es la consulta de una solicitud ya enviada, con opción
 * de guardarla como PDF (diálogo de impresión).
 */
export function OvertimeReportModal({ ot, onClose, onSend }: { ot: OvertimeRequest; onClose: () => void; onSend?: () => void }) {
  const { host, savePdf } = usePrintHost();

  return (
    <>
      <Modal
        title={onSend ? "Previsualizar informe" : "Informe de horas extra"}
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-secondary" onClick={onClose}>{onSend ? "Volver" : "Cerrar"}</button>
            {!onSend && <button className="btn btn-primary" onClick={savePdf}><Icon name="printer" size={14} /> Guardar como PDF</button>}
            {onSend && <button className="btn btn-primary" onClick={onSend}>Enviar solicitud con este informe adjunto</button>}
          </>
        }
      >
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <ReportDoc ot={ot} />
        </div>
      </Modal>
      {createPortal(<ReportDoc ot={ot} />, host)}
    </>
  );
}

/** Documento web de la trazabilidad: las etapas se completan solas a medida que avanza la solicitud */
function TraceDoc({ ot }: { ot: OvertimeRequest }) {
  const { state } = useStore();
  const s = buildOvertimeSummary(state, ot);
  const annex = findAbsenceFor(state, ot)?.attachments ?? [];
  const current = s.steps.findIndex((st) => !st.done);
  const finished = current === -1 || s.steps.some((st) => st.bad);

  return (
    <div style={{ background: "#fff", color: INK, padding: 24, fontFamily: "var(--font, system-ui, sans-serif)", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${INK}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{s.company}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Trazabilidad de horas extra</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: ot.status === "Aprobado" ? "#15803d" : ot.status === "Rechazado" ? "#b91c1c" : "#b45309" }}>{ot.status}</div>
          <div style={{ color: MUTED }}>Emitido el {s.issued}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px", margin: "12px 0" }}>
        {[["Persona", s.person], ["Período", s.period], ["Supervisor", s.supervisor], ["Horas extra", fmtDur(ot.minutes)]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 80, color: MUTED }}>{k}</span>
            <strong style={{ fontWeight: 600 }}>{v}</strong>
          </div>
        ))}
      </div>

      <div style={{ margin: "16px 0 4px" }}>
        {s.steps.map((st, i) => {
          const color = st.bad ? "#b91c1c" : st.done ? "#15803d" : i === current ? "#b45309" : "#9ca3af";
          return (
            <div key={i} style={{ display: "flex", gap: 14, breakInside: "avoid" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, background: st.done || st.bad ? color : "#fff", border: `2px solid ${color}`, color: st.done || st.bad ? "#fff" : color, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>
                  {st.bad ? "✕" : st.done ? "✓" : i + 1}
                </div>
                {i < s.steps.length - 1 && <div style={{ flex: 1, width: 2, background: st.done ? color : LINE, minHeight: 28 }} />}
              </div>
              <div style={{ paddingBottom: 16, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{st.title}</div>
                <div style={{ fontSize: 12.5, color: st.done || i === current ? INK : MUTED }}>{st.who}</div>
                {st.at && <div style={{ fontSize: 12, color: MUTED }}>{st.at}</div>}
                {st.note && <div style={{ fontSize: 12.5, fontStyle: "italic", marginTop: 2 }}>“{st.note}”</div>}
                {!st.done && !st.bad && i === current && <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 2 }}>Etapa en curso</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 8, fontSize: 12, color: MUTED }}>
        {annex.length > 0 && <div>Informe adjunto a la solicitud: {annex.map((f) => f.name).join(", ")}</div>}
        {!finished && <div>Este documento se completa a medida que avanzan las etapas.</div>}
      </div>
    </div>
  );
}

export function OvertimeTraceModal({ ot, onClose }: { ot: OvertimeRequest; onClose: () => void }) {
  const { host, savePdf } = usePrintHost();
  return (
    <>
      <Modal
        title="Trazabilidad de la solicitud"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={savePdf}><Icon name="printer" size={14} /> Exportar a PDF</button>
          </>
        }
      >
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <TraceDoc ot={ot} />
        </div>
      </Modal>
      {createPortal(<TraceDoc ot={ot} />, host)}
    </>
  );
}
