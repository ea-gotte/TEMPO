import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { computableMinutes, expectedMinutesInRange, findAbsenceFor, overtimeBreakdown, overtimeRange, useStore } from "../store";
import { addDays, fmtDate, fmtDur, minToHM, today } from "../utils";
import { Modal } from "./ui";
import { Icon } from "./Icon";
import type { OvertimeRequest } from "../types";

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

const th: React.CSSProperties = { textAlign: "left", padding: "5px 8px", borderBottom: `1.5px solid ${INK}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: "4px 8px", borderBottom: `1px solid ${LINE}`, fontSize: 12 };

/** Informe de horas extra de un mes: detalle de lo cargado y trazabilidad de la aprobación. */
function ReportDoc({ ot }: { ot: OvertimeRequest }) {
  const { state } = useStore();
  const u = state.users.find((x) => x.id === ot.userId);
  const name = (id?: string | null) => state.users.find((x) => x.id === id)?.name ?? "—";
  const [from, to] = overtimeRange(ot.weekStart);
  const entries = state.entries
    .filter((e) => e.userId === ot.userId && e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const bd = u ? overtimeBreakdown(state, u, from, to) : null;
  const loaded = bd?.loadedMin ?? 0;
  const computable = bd?.computableMin ?? 0;
  const extra = bd?.extraMin ?? 0;
  const expected = u ? expectedMinutesInRange(state, u, from, to) : 0;
  const abs = findAbsenceFor(state, ot);
  const period = from.endsWith("-01") && to > from
    ? new Date(from + "T00:00:00").toLocaleDateString("es", { month: "long", year: "numeric" })
    : `${fmtDate(from)} al ${fmtDate(to)}`;
  const projectName = (id: string | null) => state.projects.find((p) => p.id === id)?.name ?? "Sin proyecto";

  const Field = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 12.5 }}>
      <span style={{ width: 120, color: MUTED }}>{k}</span>
      <strong style={{ fontWeight: 600 }}>{v}</strong>
    </div>
  );

  const steps: { title: string; who: string; at: string; note?: string; done: boolean; bad?: boolean }[] = [
    { title: "Solicitud generada por el usuario", who: name(ot.userId), at: fmtDate(ot.createdAt), done: true },
    {
      title: "Revisión de Recursos Humanos",
      who: ot.status === "Pendiente" ? "Pendiente de revisión" : name(ot.resolvedBy),
      at: ot.resolvedAt ? fmtDate(ot.resolvedAt) : "",
      note: ot.supervisorComment,
      done: ot.status !== "Pendiente",
      bad: ot.status === "Rechazado",
    },
    {
      title: "Cómputo en el saldo del usuario",
      who: ot.status === "Aprobado" ? `${fmtDur(ot.minutes)} acreditadas` : ot.status === "Rechazado" ? "No se acreditan horas" : "Pendiente",
      at: ot.status === "Aprobado" ? `Vencen el ${fmtDate(addDays(ot.weekStart, 365))}` : "",
      done: ot.status === "Aprobado",
      bad: ot.status === "Rechazado",
    },
  ];

  return (
    <div style={{ background: "#fff", color: INK, padding: 24, fontFamily: "var(--font, system-ui, sans-serif)", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${INK}`, paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>{state.company.name}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Informe de horas extra</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div>Folio <strong>{ot.id.slice(0, 8).toUpperCase()}</strong></div>
          <div style={{ color: MUTED }}>Emitido el {fmtDate(today())}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px", margin: "12px 0" }}>
        <div>
          <Field k="Persona" v={u?.name ?? "—"} />
          <Field k="Supervisor" v={name(u?.supervisorId)} />
          <Field k="Jornada" v={u ? `${u.jornada === "media" ? "Media" : "Completa"} · ${u.weeklyHours} h/sem` : "—"} />
        </div>
        <div>
          <Field k="Período" v={<span style={{ textTransform: "capitalize" }}>{period}</span>} />
          <Field k="Estado" v={ot.status} />
          <Field k="Horas extra" v={fmtDur(ot.minutes)} />
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={th}>Cargadas</th><th style={th}>No computables</th><th style={th}>Computables</th><th style={th}>Esperadas</th><th style={th}>Horas extra</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{fmtDur(loaded)}</td>
            <td style={td}>{fmtDur(loaded - computable)}</td>
            <td style={td}>{fmtDur(computable)}</td>
            <td style={td}>{fmtDur(expected)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{fmtDur(extra)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>
        Cada día se cuentan las horas desde el inicio hasta completar la jornada; lo cargado después es extra y se atribuye al proyecto del registro. No computan los proyectos No laborable y Vacaciones. Las esperadas descuentan feriados y ausencias de día completo.
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0" }}>Distribución de las horas extra por proyecto</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr><th style={th}>Proyecto</th><th style={th}>Horas extra</th><th style={th}>% de las extra</th><th style={th}>% de las horas del mes</th></tr>
        </thead>
        <tbody>
          {(bd?.byProject.length ?? 0) === 0 && <tr><td style={td} colSpan={4}>Sin horas extra en el período.</td></tr>}
          {bd?.byProject.map((p) => (
            <tr key={p.projectId ?? "none"}>
              <td style={td}>{projectName(p.projectId)}</td>
              <td style={td}>{fmtDur(p.minutes)}</td>
              <td style={td}>{extra ? ((p.minutes / extra) * 100).toFixed(1) : "0"} %</td>
              <td style={td}>{computable ? ((p.minutes / computable) * 100).toFixed(1) : "0"} %</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0" }}>Trazabilidad de la aprobación</div>
      <div style={{ marginBottom: 16 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${LINE}`, fontSize: 12.5 }}>
            <span style={{ width: 18, fontWeight: 700, color: s.bad ? "#b91c1c" : s.done ? "#15803d" : MUTED }}>{s.bad ? "✕" : s.done ? "✓" : "○"}</span>
            <div style={{ flex: 1 }}>
              <strong>{s.title}</strong>
              <div style={{ color: MUTED }}>{s.who}{s.at && ` · ${s.at}`}</div>
              {s.note && <div style={{ fontStyle: "italic" }}>“{s.note}”</div>}
            </div>
          </div>
        ))}
        {abs && <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Solicitud de gestión asociada: {abs.type}, {fmtDate(abs.dateFrom)} al {fmtDate(abs.dateTo)}.</div>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, margin: "6px 0" }}>Detalle de horas cargadas</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Fecha</th><th style={th}>Proyecto</th><th style={th}>Descripción</th><th style={th}>Horario</th><th style={th}>Duración</th><th style={th}>Extra</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && <tr><td style={td} colSpan={6}>Sin registros en el período.</td></tr>}
          {entries.map((e) => (
            <tr key={e.id} style={{ breakInside: "avoid" }}>
              <td style={td}>{fmtDate(e.date)}</td>
              <td style={td}>{projectName(e.projectId)}</td>
              <td style={td}>{e.description || "—"}</td>
              <td style={td}>{minToHM(e.start)}–{minToHM(e.end)}</td>
              <td style={td}>{fmtDur(e.end - e.start)}</td>
              <td style={td}>{computableMinutes(state, e) === 0 ? "No computa" : bd?.perEntry.get(e.id) ? fmtDur(bd.perEntry.get(e.id)!) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 40, marginTop: 48, fontSize: 12, breakInside: "avoid" }}>
        {[u?.name ?? "Solicitante", "Recursos Humanos"].map((l, i) => (
          <div key={i} style={{ flex: 1, borderTop: `1px solid ${INK}`, paddingTop: 4, textAlign: "center" }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

/** Vista previa del informe, con botón para guardarlo como PDF (diálogo de impresión). */
export function OvertimeReportModal({ ot, onClose }: { ot: OvertimeRequest; onClose: () => void }) {
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
        title="Informe de horas extra"
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={savePdf}><Icon name="printer" size={14} /> Guardar como PDF</button>
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
