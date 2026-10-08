import React, { useState } from "react";
import { Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { activeSprint, isDone, scopeStats, sumHours } from "./agile";
import { useEnv } from "./env";
import type { Perms } from "./logic";
import { KpiCard, Person } from "./parts";
import type { ChangeRequest, ChangeStatus } from "./types";
import { useWork, workActions } from "./workStore";

const STATUS: Record<ChangeStatus, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "soon" },
  aprobado: { label: "Aprobado", cls: "ok" },
  diferido: { label: "Diferido", cls: "" },
  rechazado: { label: "Rechazado", cls: "late" },
};

/**
 * Solicitudes de cambio del cliente. El proyecto es de precio cerrado: un
 * cambio aprobado NO se factura aparte, así que sus horas se “absorben” y
 * quedan medidas (crecimiento del alcance). Cada aprobación crea una nueva
 * línea base. Decide el Project Manager.
 */
export function ChangesTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const [filter, setFilter] = useState<ChangeStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<ChangeRequest | null>(null);

  const changes = work.changes.filter((c) => c.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const baselines = work.baselines.filter((b) => b.projectId === projectId).sort((a, b) => b.version - a.version);
  const st = scopeStats(baselines, changes);
  const shown = changes.filter((c) => !filter || c.status === filter);
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);

  return (
    <>
      <div className="kpi-grid">
        <KpiCard icon="clipboard" label="Solicitudes" value={st.total} hint={`${st.approved} aprobadas · ${st.rejected} rechazadas · ${st.deferred} diferidas`} />
        <KpiCard icon="hourglass" label="Pendientes de decidir" value={st.pending} tone={st.pending ? "bad" : "ok"} hint={st.oldestPendingDays ? `la más antigua, hace ${st.oldestPendingDays} d` : undefined} />
        <KpiCard icon="flame" label="Horas absorbidas" value={`${st.absorbedHours} h`} hint="cambios aprobados sin facturar aparte" tone={st.absorbedHours ? "bad" : undefined} />
        <KpiCard icon="trending-up" label="Crecimiento del alcance" value={st.growthPct === null ? "—" : `${st.growthPct > 0 ? "+" : ""}${st.growthPct}%`} hint={st.baselineHours !== null ? `${st.baselineHours} h → ${st.currentHours} h` : undefined} tone={st.growthPct !== null && st.growthPct >= 20 ? "bad" : undefined} />
        <KpiCard icon="calendar-days" label="Fin del proyecto" value={st.currentEnd ? fmtDate(st.currentEnd).slice(0, 5) : "—"} hint={st.endShiftDays ? `${st.endShiftDays > 0 ? "+" : ""}${st.endShiftDays} d contra el plan original` : "sin corrimiento"} />
      </div>

      <div className="pw-demo-banner" style={{ background: "var(--accent-soft)" }}>
        <b style={{ color: "var(--accent)" }}>Precio cerrado</b>
        <span>Los cambios aprobados no se cobran aparte: su esfuerzo reduce el margen. Por eso cada decisión queda registrada y mide cuánto creció el alcance. Decide el Project Manager.</span>
      </div>

      <div className="pw-toolbar">
        <div className="tabs">
          {([["", "Todas"], ["pendiente", "Pendientes"], ["aprobado", "Aprobadas"], ["diferido", "Diferidas"], ["rechazado", "Rechazadas"]] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <span className="grow" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nueva solicitud</button>
      </div>

      {shown.length === 0 && <div className="card card-pad"><Empty icon="message" text="No hay solicitudes" sub="Cuando el cliente pida algo nuevo, registralo acá para decidir con datos." /></div>}
      {shown.map((c) => {
        const task = work.tasks.find((t) => t.id === c.taskId);
        return (
          <div key={c.id} className="card card-pad" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14.5 }}>{c.title}</strong>
              <span className={`pw-pill ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
              {c.urgent && <span className="pw-pill late"><Icon name="flame" size={11} /> urgente</span>}
              {c.duringSprint && c.status === "aprobado" && <span className="pw-pill soon" title="Se aprobó con un sprint en marcha">entró en pleno sprint</span>}
              <span style={{ flex: 1 }} />
              <span className="pw-pill">{c.impactHours != null ? `${c.impactHours} h` : "sin horas"}{c.impactDays ? ` · +${c.impactDays} d` : ""}</span>
              {c.status === "pendiente" && perms.canApprove && <button className="btn btn-primary btn-sm" onClick={() => setDeciding(c)}>Decidir</button>}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 6px" }}>
              Pedido por {c.requestedBy || "—"} · registrado el {fmtDate(c.createdAt)} por {userOf(c.registeredBy)?.name ?? "—"}
            </div>
            {c.description && <div style={{ fontSize: 13, color: "var(--text-2)" }}>{c.description}</div>}
            {c.status !== "pendiente" && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-3)" }}>Decisión de</span> <Person user={userOf(c.decidedBy)} size={18} />
                <span style={{ color: "var(--text-3)" }}>el {c.decidedAt ? fmtDate(c.decidedAt) : "—"}</span>
                {c.decisionNote && <span style={{ color: "var(--text-2)" }}>· {c.decisionNote}</span>}
                {task && <span className="pw-tag" title="Ítem creado en el backlog / sprint">▸ {task.name}{task.sprintId ? ` (${work.sprints.find((s) => s.id === task.sprintId)?.name ?? "sprint"})` : " (backlog)"}</span>}
              </div>
            )}
          </div>
        );
      })}

      <div className="pw-section-title">Líneas base del plan</div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead><tr><th>Versión</th><th>Fecha</th><th>Alcance</th><th>Fin planificado</th><th>Motivo</th></tr></thead>
          <tbody>
            {baselines.length === 0 && <tr><td colSpan={5}><Empty icon="history" text="Sin línea base todavía" sub="Se crea sola al aprobar el primer cambio." /></td></tr>}
            {baselines.map((b, i) => (
              <tr key={b.id}>
                <td><span className={`pw-pill ${i === 0 ? "ok" : ""}`}>v{b.version}{i === 0 ? " · vigente" : ""}</span></td>
                <td>{fmtDate(b.date)}</td>
                <td><b>{b.scopeHours} h</b></td>
                <td>{b.endDate ? fmtDate(b.endDate) : "—"}</td>
                <td>{b.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>Los indicadores de plazo se miden contra la línea base vigente; lo que se movió por decisión del cliente queda registrado acá.</div>

      {creating && <NewChangeModal projectId={projectId} onClose={() => setCreating(false)} />}
      {deciding && <DecideModal change={deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}

function NewChangeModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const env = useEnv();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [hours, setHours] = useState("");
  const [days, setDays] = useState("");
  const [urgent, setUrgent] = useState(false);

  return (
    <Modal
      title="Nueva solicitud de cambio"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary" disabled={!title.trim()}
            onClick={() => {
              workActions.addChange({ projectId, title: title.trim(), description: description.trim(), requestedBy: requestedBy.trim(), registeredBy: env.me.id, urgent, impactHours: hours === "" ? null : Number(hours), impactDays: days === "" ? null : Number(days) });
              toast("Solicitud registrada. Queda pendiente de decisión del Project Manager.");
              onClose();
            }}
          >
            Registrar
          </button>
        </>
      }
    >
      <div className="field"><label>¿Qué pide el cliente?</label><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Agregar un nivel de subsuelo" /></div>
      <div className="field"><label>Detalle</label><textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="form-grid">
        <div className="field"><label>Quién lo pidió (cliente)</label><input className="input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} /></div>
        <div className="field"><label>¿Es urgente?</label><label style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Sí, no puede esperar</label></div>
        <div className="field"><label>Impacto estimado (horas)</label><input className="input" type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
        <div className="field"><label>Corrimiento de fecha (días)</label><input className="input" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function DecideModal({ change, onClose }: { change: ChangeRequest; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const sprints = work.sprints.filter((s) => s.projectId === change.projectId);
  const act = activeSprint(sprints);
  const planned = sprints.filter((s) => s.status === "planificado").sort((a, b) => a.number - b.number)[0];
  const [decision, setDecision] = useState<"aprobado" | "diferido" | "rechazado">("aprobado");
  const [dest, setDest] = useState<"backlog" | "proximo" | "activo">(change.urgent && act ? "activo" : "backlog");
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(change.impactHours != null ? String(change.impactHours) : "");
  const [days, setDays] = useState(change.impactDays != null ? String(change.impactDays) : "");
  const [swap, setSwap] = useState<string[]>([]);
  const [error, setError] = useState("");

  const impact = hours === "" ? 0 : Number(hours);
  const sprintOpen = act ? work.tasks.filter((t) => t.sprintId === act.id && !isDone(t) && t.changeRequestId !== change.id) : [];
  const freed = sumHours(sprintOpen.filter((t) => swap.includes(t.id)));

  function confirm() {
    if ((decision === "rechazado" || decision === "diferido") && !note.trim()) return setError("Dejá el motivo de la decisión: el cliente lo va a preguntar.");
    if (decision === "aprobado" && dest === "activo" && act && freed < impact) return setError(`Con el sprint en marcha entra “uno por uno”: tenés que sacar al menos ${impact} h (hoy sacás ${freed} h).`);
    workActions.decideChange(change.id, {
      decision, note: note.trim(), by: env.me.id, destination: decision === "aprobado" ? dest : undefined, swapOut: dest === "activo" ? swap : [],
      impactHours: hours === "" ? null : Number(hours), impactDays: days === "" ? null : Number(days),
    });
    toast(decision === "aprobado" ? "Cambio aprobado: se creó el ítem y se registró una nueva línea base." : decision === "diferido" ? "Cambio diferido." : "Cambio rechazado.");
    onClose();
  }

  return (
    <Modal
      title={`Decidir: ${change.title}`}
      onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={confirm}>Confirmar decisión</button></>}
    >
      <div className="tabs">
        {([["aprobado", "Aprobar"], ["diferido", "Diferir"], ["rechazado", "Rechazar"]] as const).map(([k, l]) => <button key={k} className={decision === k ? "active" : ""} onClick={() => { setDecision(k); setError(""); }}>{l}</button>)}
      </div>
      {decision === "aprobado" && (
        <>
          <div className="form-grid">
            <div className="field"><label>Horas que absorbe el proyecto</label><input className="input" type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
            <div className="field"><label>Corrimiento de la fecha de fin (días)</label><input className="input" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>¿Dónde entra?</label>
            <select className="select" value={dest} onChange={(e) => { setDest(e.target.value as typeof dest); setError(""); }}>
              <option value="backlog">Al backlog (se prioriza después)</option>
              {planned && <option value="proximo">Al {planned.name} (todavía no empezó)</option>}
              {act && <option value="activo">Al {act.name} (en marcha) — intercambio</option>}
            </select>
          </div>
          {dest === "activo" && act && (
            <div className="pw-field-card">
              <div style={{ fontSize: 12.5, marginBottom: 6 }}>Con el sprint en marcha <b>entra uno, sale uno</b>. Elegí qué sale (necesitás liberar {impact} h):</div>
              {sprintOpen.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>No hay ítems abiertos para sacar.</div>}
              {sprintOpen.map((t) => (
                <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 13 }}>
                  <input type="checkbox" checked={swap.includes(t.id)} onChange={() => setSwap((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))} />
                  <span style={{ flex: 1 }}>{t.name}</span><span className="pw-pill">{t.estimateHours ?? 0} h</span>
                </label>
              ))}
              <div style={{ fontSize: 12, marginTop: 6, color: freed >= impact ? "var(--success)" : "var(--warning)" }}>Liberás {freed} h de {impact} h necesarias.</div>
            </div>
          )}
        </>
      )}
      <div className="field"><label>Motivo / nota{decision !== "aprobado" ? " (obligatorio)" : ""}</label><textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {decision === "aprobado" && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Al aprobar se crea el ítem, se suma al alcance (nueva línea base) y se registra como horas absorbidas.</div>}
      {error && <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div>}
    </Modal>
  );
}
