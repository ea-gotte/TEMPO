import { projectCode } from "./templates";
import React, { useState } from "react";
import { Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { activeSprint, isDone, scopeStats, sumHours } from "./agile";
import { useEnv } from "./env";
import type { Perms } from "./logic";
import type { ChangeRequest, ChangeStatus } from "./types";
import { useWork, workActions } from "./workStore";
import { downloadChangeReport } from "./changeReport";

const STATUS: Record<ChangeStatus, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "soon" },
  aprobado: { label: "Aprobado", cls: "ok" },
  diferido: { label: "Diferido", cls: "" },
  rechazado: { label: "Rechazado", cls: "late" },
};

/**
 * Cambios que pide el cliente, en una lista: qué pidió, cuánto cuesta y qué se decidió.
 * Las horas de lo aprobado se absorben y quedan medidas; cada aprobación crea una línea
 * base nueva. Decide el Project Manager.
 */
export function ChangesTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const [onlyPending, setOnlyPending] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<ChangeRequest | null>(null);

  // Primero lo que espera decisión; después, lo más reciente
  const changes = work.changes
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => Number(b.status === "pendiente") - Number(a.status === "pendiente") || b.createdAt.localeCompare(a.createdAt));
  const baselines = work.baselines.filter((b) => b.projectId === projectId).sort((a, b) => b.version - a.version);
  const st = scopeStats(baselines, changes);
  const shown = changes.filter((c) => !onlyPending || c.status === "pendiente");
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);

  const handleExport = () => {
    const project = env.projects.find((p) => p.id === projectId);
    const meta = work.meta[projectId];
    const client = env.clients.find((c) => c.id === project?.clientId);
    downloadChangeReport({
      project: project ?? { name: "Proyecto" },
      code: (project ? projectCode(project, meta) : meta?.code) || null,
      clientName: client?.name ?? null,
      changes,
      baselines,
      users: env.users,
      tasks: work.tasks,
    });
  };

  return (
    <>
      <div className="pw-toolbar" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          <b style={{ color: st.pending ? "var(--danger)" : undefined }}>{st.pending} sin decidir</b>
          {" · "}{st.approved} aprobado{st.approved !== 1 ? "s" : ""}
          {" · "}<b>{st.absorbedHours} h</b> absorbidas
          {st.growthPct !== null && <span style={{ color: st.growthPct >= 20 ? "var(--danger)" : undefined }}> ({st.growthPct > 0 ? "+" : ""}{st.growthPct}% del alcance)</span>}
          {st.endShiftDays ? <> · fin {st.endShiftDays > 0 ? "+" : ""}{st.endShiftDays} d</> : null}
        </div>
        <span className="grow" />
        {changes.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo sin decidir
          </label>
        )}
        <button className="btn btn-ghost btn-sm" disabled={changes.length === 0} onClick={handleExport} title="Exportar el historial de cambios" aria-label="Exportar el historial de cambios"><Icon name="download" size={14} /></button>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={13} /> Nuevo cambio</button>
      </div>

      {shown.length === 0 && <Empty icon="message" text={changes.length ? "Nada sin decidir" : "Sin cambios del cliente"} sub={changes.length ? undefined : "Cuando el cliente pida algo fuera de lo acordado, registralo acá."} />}
      {shown.map((c) => {
        const open = openId === c.id;
        const task = work.tasks.find((t) => t.id === c.taskId);
        return (
          <div key={c.id} className="pw-chg">
            <div className="pw-chg-row" onClick={() => setOpenId(open ? null : c.id)} role="button" aria-expanded={open}>
              <Icon name="chevron-right" size={13} style={{ transform: open ? "rotate(90deg)" : undefined, color: "var(--text-3)", flexShrink: 0 }} />
              <span className="t">{c.title}</span>
              {c.urgent && c.status === "pendiente" && <span className="pw-pill late">urgente</span>}
              <span className="h">{c.impactHours != null ? `${c.impactHours} h` : "—"}{c.impactDays ? ` · +${c.impactDays} d` : ""}</span>
              <span className={`pw-pill ${STATUS[c.status].cls}`} style={{ minWidth: 76, justifyContent: "center" }}>{STATUS[c.status].label}</span>
              {c.status === "pendiente" && perms.canApprove && (
                <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setDeciding(c); }}>Decidir</button>
              )}
            </div>
            {open && (
              <div className="pw-chg-detail">
                {c.description && <div>{c.description}</div>}
                <div style={{ color: "var(--text-3)" }}>
                  Pedido por {c.requestedBy || "—"} · registrado el {fmtDate(c.createdAt)} por {userOf(c.registeredBy)?.name ?? "—"}
                </div>
                {c.status !== "pendiente" && (
                  <div>
                    <b>{STATUS[c.status].label}</b> por {userOf(c.decidedBy)?.name ?? "—"}{c.decidedAt ? ` el ${fmtDate(c.decidedAt)}` : ""}
                    {c.decisionNote && <> · {c.decisionNote}</>}
                    {task && <span style={{ color: "var(--text-3)" }}> · quedó como “{task.name}”{task.sprintId ? ` en ${work.sprints.find((sp) => sp.id === task.sprintId)?.name ?? "un sprint"}` : " en el backlog"}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {baselines.length > 0 && (
        <details className="pw-chg-base">
          <summary>Líneas base del plan ({baselines.length})</summary>
          <table className="table table-compact" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Versión</th><th>Fecha</th><th>Alcance</th><th>Fin planificado</th><th>Motivo</th></tr></thead>
            <tbody>
              {baselines.map((b, i) => (
                <tr key={b.id}>
                  <td>v{b.version}{i === 0 ? " · vigente" : ""}</td>
                  <td>{fmtDate(b.date)}</td>
                  <td>{b.scopeHours} h</td>
                  <td>{b.endDate ? fmtDate(b.endDate) : "—"}</td>
                  <td>{b.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

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
      title="Nuevo cambio del cliente"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary" disabled={!title.trim()}
            onClick={() => {
              workActions.addChange({ projectId, title: title.trim(), description: description.trim(), requestedBy: requestedBy.trim(), registeredBy: env.me.id, urgent, impactHours: hours === "" ? null : Number(hours), impactDays: days === "" ? null : Number(days) });
              toast("Cambio registrado. Queda pendiente de decisión del Project Manager.");
              onClose();
            }}
          >
            Registrar
          </button>
        </>
      }
    >
      <div className="field"><label>¿Qué pide el cliente?</label><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Agregar un nivel de subsuelo" /></div>
      <div className="form-grid">
        <div className="field"><label>Horas estimadas</label><input className="input" type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
        <div className="field"><label>&nbsp;</label><label style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", fontWeight: 400 }}><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Es urgente</label></div>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-3)" }}>Más datos (opcional)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
          <div className="field"><label>Detalle</label><textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="form-grid">
            <div className="field"><label>Quién lo pidió</label><input className="input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} /></div>
            <div className="field"><label>Corre la fecha de fin (días)</label><input className="input" type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} /></div>
          </div>
        </div>
      </details>
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
          {(planned || act) && <div className="field">
            <label>¿Dónde entra?</label>
            <select className="select" value={dest} onChange={(e) => { setDest(e.target.value as typeof dest); setError(""); }}>
              <option value="backlog">Al backlog (se prioriza después)</option>
              {planned && <option value="proximo">Al {planned.name} (todavía no empezó)</option>}
              {act && <option value="activo">Al {act.name} (en marcha) — intercambio</option>}
            </select>
          </div>}
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
