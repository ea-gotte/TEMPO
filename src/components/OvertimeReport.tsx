import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store";
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
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div>Folio <strong>{s.folio}</strong></div>
          <div style={{ color: MUTED }}>Emitido el {s.issued}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px", margin: "12px 0" }}>
        {[["Persona", s.person], ["Período", s.period], ["Supervisor", s.supervisor], ["Estado", s.status]].map(([k, v]) => (
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
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 16 }}>
        {s.nonComputableMin > 0 && <>No computables (No laborable / Vacaciones): {fmtDur(s.nonComputableMin)}. </>}
        Cada día se cuentan las horas hasta completar la jornada; el resto es extra del proyecto en que se cargó.
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0" }}>Trazabilidad de la aprobación</div>
      <div>
        {s.steps.map((st, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 12.5 }}>
            <span style={{ width: 18, fontWeight: 700, color: st.bad ? "#b91c1c" : st.done ? "#15803d" : MUTED }}>{st.bad ? "✕" : st.done ? "✓" : "○"}</span>
            <div style={{ flex: 1 }}>
              <strong>{st.title}</strong>
              <div style={{ color: MUTED }}>{st.who}{st.at && ` · ${st.at}`}</div>
              {st.note && <div style={{ fontStyle: "italic" }}>“{st.note}”</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Vista previa del informe. Con `onSend` es la previsualización previa al envío de la solicitud
 * (el informe viaja como adjunto); sin él, es la consulta de una solicitud ya enviada, con opción
 * de guardarla como PDF (diálogo de impresión).
 */
export function OvertimeReportModal({ ot, onClose, onSend }: { ot: OvertimeRequest; onClose: () => void; onSend?: () => void }) {
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
