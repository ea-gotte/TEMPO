import React, { useState } from "react";
import { Empty, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate, today } from "../utils";
import { CONF_SCORE, isDone, riskLevel, riskScore, sumHours, uncertainty } from "./agile";
import { KindTag } from "./BacklogTab";
import { useEnv } from "./env";
import { assignableUsers, type Perms } from "./logic";
import { Bar, DuePill, KpiCard, OptDate, Person, UserSelect } from "./parts";
import type { GateDecision, Risk, RiskKind, RiskLevel, RiskStatus } from "./types";
import { useWork, workActions } from "./workStore";

const LEVEL = ["", "Baja", "Media", "Alta"];
const KIND: Record<RiskKind, string> = { riesgo: "Riesgo", supuesto: "Supuesto", desconocido: "Desconocido" };
const RSTATUS: Record<RiskStatus, string> = { abierto: "Abierto", mitigado: "Mitigado", ocurrido: "Ocurrido", cerrado: "Cerrado" };

/* ====================================================================
 * Descubrimiento (proyectos de alcance incierto)
 * ==================================================================== */
export function DiscoveryTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const project = env.projects.find((p) => p.id === projectId)!;
  const meta = work.meta[projectId];
  const tasks = work.tasks.filter((t) => t.projectId === projectId);
  const risks = work.risks.filter((r) => r.projectId === projectId);
  const spikes = tasks.filter((t) => t.kind === "spike");
  const gates = work.milestones.filter((m) => m.projectId === projectId && m.isGate);
  const logged = (env.minutesByProject[projectId] ?? 0) / 60;
  const unc = uncertainty(project, meta, tasks, risks, logged);
  const now = today();

  const used = sumHours(spikes.filter(isDone));
  const planned = sumHours(spikes);
  const box = meta?.discoveryHours ?? null;
  const daysLeft = meta?.discoveryEnd ? Math.round((new Date(meta.discoveryEnd).getTime() - new Date(now).getTime()) / 86400000) : null;
  const open = tasks.filter((t) => !isDone(t) && t.kind !== "spike");
  const byConf = (c: string) => open.filter((t) => t.estimateHours != null && (t.confidence ?? "media") === c).length;
  const unestimated = open.filter((t) => t.estimateHours == null).length;
  const budget = project.budgetHours;
  const range = unc.range;
  const scaleMax = Math.max(range?.max ?? 0, budget ? budget * (1 + (meta?.contingencyPct ?? 0) / 100) : 0, 1);

  return (
    <>
      <div className="pw-demo-banner" style={{ background: "var(--accent-soft)" }}>
        <b style={{ color: "var(--accent)" }}>Alcance incierto</b>
        <span>Se explora con un descubrimiento acotado en tiempo y horas, y recién después se compromete el resto. La puerta de decisión cierra la etapa.</span>
      </div>

      <div className="kpi-grid">
        <KpiCard icon="hourglass" label="Descubrimiento" value={box ? `${used} / ${box} h` : `${used} h`} hint={daysLeft === null ? "sin fecha límite" : daysLeft >= 0 ? `faltan ${daysLeft} d (${fmtDate(meta!.discoveryEnd!)})` : `venció hace ${-daysLeft} d`} tone={daysLeft !== null && daysLeft < 0 ? "bad" : undefined} />
        <KpiCard icon="check-circle" label="Madurez del plan" value={unc.maturityPct === null ? "—" : `${unc.maturityPct}%`} hint="qué tan firme es lo que falta estimar" tone={unc.maturityPct !== null && unc.maturityPct < 40 ? "bad" : undefined} />
        <KpiCard icon="alert" label="Riesgos altos abiertos" value={unc.highRisksOpen} tone={unc.highRisksOpen ? "bad" : "ok"} />
        <KpiCard icon="scale" label="Reserva de contingencia" value={unc.reserveHours !== null ? `${unc.reserveHours} h` : "—"} hint={unc.reserveUsedPct !== null ? (unc.reserveUsedPct >= 100 ? "no alcanza (escenario probable)" : `${unc.reserveUsedPct}% consumida (escenario probable)`) : `${meta?.contingencyPct ?? 0}% de las horas proyectadas`} tone={unc.reserveUsedPct !== null && unc.reserveUsedPct >= 80 ? "bad" : undefined} />
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <div className="card-title">Rango de horas finales</div>
          {range && budget ? (
            <>
              <div className="pw-range">
                <div className="pw-range-bar" style={{ left: `${(range.min / scaleMax) * 100}%`, width: `${((range.max - range.min) / scaleMax) * 100}%` }} />
                <div className="pw-range-prob" style={{ left: `${(range.prob / scaleMax) * 100}%` }} title={`Probable: ${range.prob} h`} />
                <div className="pw-range-budget" style={{ left: `${(budget / scaleMax) * 100}%` }} title={`Proyectado: ${budget} h`}><span>Proyectado {budget} h</span></div>
                <div className="pw-range-budget res" style={{ left: `${((budget * (1 + (meta?.contingencyPct ?? 0) / 100)) / scaleMax) * 100}%` }} title="Con reserva"><span>Con reserva</span></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 26 }}>
                <span>Mínimo <b>{range.min} h</b></span><span>Probable <b>{range.prob} h</b></span>
                <span style={{ color: range.max > budget * (1 + (meta?.contingencyPct ?? 0) / 100) ? "var(--danger)" : undefined }}>Máximo <b>{range.max} h</b></span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>Lo cargado ({Math.round(logged * 10) / 10} h) más lo que falta, con mínimo y máximo según la confianza de cada estimación. Si el máximo pasa la reserva, el precio cerrado está en riesgo.</div>
            </>
          ) : <div style={{ color: "var(--text-3)", fontSize: 13 }}>Sin horas proyectadas o sin tareas abiertas para calcular el rango.</div>}
        </div>

        <div className="card card-pad">
          <div className="card-title">Confianza de las estimaciones pendientes</div>
          {(["alta", "media", "baja"] as const).map((c) => (
            <div key={c} className="pw-load" style={{ gridTemplateColumns: "90px 1fr 50px" }}>
              <div className="pw-load-name" style={{ textTransform: "capitalize" }}>{c} <span style={{ color: "var(--text-3)", fontSize: 11 }}>({Math.round(CONF_SCORE[c] * 100)}%)</span></div>
              <div className="pw-load-track"><div className="pw-load-fill" style={{ width: `${open.length ? (byConf(c) / open.length) * 100 : 0}%`, background: c === "alta" ? "var(--success)" : c === "media" ? "var(--warning)" : "var(--danger)" }} /></div>
              <div className="pw-load-n">{byConf(c)}</div>
            </div>
          ))}
          <div className="pw-load" style={{ gridTemplateColumns: "90px 1fr 50px" }}>
            <div className="pw-load-name">Sin estimar</div>
            <div className="pw-load-track"><div className="pw-load-fill" style={{ width: `${open.length ? (unestimated / open.length) * 100 : 0}%`, background: "var(--text-3)" }} /></div>
            <div className="pw-load-n">{unestimated}</div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>La madurez promedia: alta 100%, media 50%, baja 15%, sin estimar 0%. Subirla es el objetivo del descubrimiento.</div>
        </div>
      </div>

      {/* ---------- Spikes ---------- */}
      <div className="pw-section-title">Investigación del descubrimiento (spikes) <span className="count" style={{ color: "var(--text-3)" }}>{planned} h previstas</span></div>
      <div className="card" style={{ overflow: "hidden" }}>
        {spikes.length === 0 && <div className="card-pad" style={{ color: "var(--text-3)", fontSize: 13 }}>Sin spikes. Creá tareas de tipo “Spike” para investigar lo desconocido.</div>}
        {spikes.map((t) => (
          <div key={t.id} className={`pw-task-row ${isDone(t) ? "done" : ""}`} style={{ cursor: "default" }}>
            <KindTag kind="spike" /><span className="name">{t.name}</span>
            <span className="pw-pill">{t.estimateHours ?? 0} h</span>
            <Person user={env.users.find((u) => u.id === t.assigneeId)} size={18} />
            <DuePill date={t.dueDate} done={isDone(t)} />
            <span className={`pw-pill ${isDone(t) ? "ok" : ""}`}>{t.status === "hecha" ? "Hecho" : t.status === "pendiente" ? "Pendiente" : "En curso"}</span>
          </div>
        ))}
      </div>
      {box !== null && <div style={{ marginTop: 8 }}><Bar pct={Math.min(100, (planned / box) * 100)} color={planned > box ? "var(--danger)" : undefined} /><div style={{ fontSize: 11.5, color: planned > box ? "var(--danger)" : "var(--text-3)", marginTop: 3 }}>{planned} h previstas de {box} h del descubrimiento{planned > box ? " — se pasó del tiempo acotado" : ""}.</div></div>}

      {/* ---------- Puertas de decisión ---------- */}
      <div className="pw-section-title">Puertas de decisión</div>
      {gates.length === 0 && <div className="card card-pad"><Empty icon="lock" text="No hay puertas de decisión" sub="Marcá un hito como “puerta de decisión” (pestaña Hitos y entregables, o al crearlo)." /></div>}
      {gates.map((g) => {
        const dec = g.gateDecision ?? "pendiente";
        const owner = env.users.find((u) => u.id === g.ownerId);
        return (
          <div key={g.id} className="card card-pad" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Icon name="lock" size={15} /><strong>{g.name}</strong>
              <DuePill date={g.dueDate} done={dec !== "pendiente"} />
              <Person user={owner} size={18} />
              <span style={{ flex: 1 }} />
              <span className={`pw-pill ${dec === "continuar" ? "ok" : dec === "pendiente" ? "soon" : "late"}`}>{dec === "pendiente" ? "Pendiente de decisión" : dec === "continuar" ? "Seguir" : dec === "replantear" ? "Replantear" : "Cancelar"}</span>
            </div>
            {g.gateCriteria && <div style={{ fontSize: 13, color: "var(--text-2)", margin: "8px 0" }}><b>Criterios para seguir:</b> {g.gateCriteria}</div>}
            {perms.canApprove ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {(["continuar", "replantear", "cancelar"] as GateDecision[]).map((d) => (
                  <button key={d} className={`btn btn-sm ${dec === d ? "btn-primary" : "btn-secondary"}`} onClick={() => { workActions.updateMilestone(g.id, { gateDecision: d, status: d === "continuar" ? "cumplido" : "en_curso" }); toast(`Decisión registrada: ${d}.`); }}>
                    {d === "continuar" ? "Seguir adelante" : d === "replantear" ? "Replantear" : "Cancelar"}
                  </button>
                ))}
                {dec !== "pendiente" && <button className="btn btn-ghost btn-sm" onClick={() => workActions.updateMilestone(g.id, { gateDecision: "pendiente", status: "en_curso" })}>Reabrir</button>}
                <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Nota de la decisión…" value={g.gateNote ?? ""} onChange={(e) => workActions.updateMilestone(g.id, { gateNote: e.target.value })} />
              </div>
            ) : g.gateNote ? <div style={{ fontSize: 13 }}>Nota: {g.gateNote}</div> : null}
          </div>
        );
      })}
    </>
  );
}

/* ====================================================================
 * Registro de riesgos, supuestos y desconocidos
 * ==================================================================== */
export function RisksTab({ projectId, perms }: { projectId: string; perms: Perms }) {
  const env = useEnv();
  const work = useWork();
  const [edit, setEdit] = useState<Risk | "new" | null>(null);
  const [fKind, setFKind] = useState<RiskKind | "">("");
  const [fStatus, setFStatus] = useState<RiskStatus | "">("abierto");
  const now = today();
  const all = work.risks.filter((r) => r.projectId === projectId);
  const rows = all.filter((r) => (!fKind || r.kind === fKind) && (!fStatus || r.status === fStatus)).sort((a, b) => riskScore(b) - riskScore(a));
  const openRisks = all.filter((r) => r.status === "abierto");

  return (
    <>
      <div className="grid-2" style={{ alignItems: "start", marginBottom: 14 }}>
        <div className="card card-pad">
          <div className="card-title">Mapa de calor (riesgos abiertos)</div>
          <div className="pw-heat">
            <div className="pw-heat-y">Impacto</div>
            {[3, 2, 1].map((imp) => (
              <React.Fragment key={imp}>
                <div className="pw-heat-lbl">{LEVEL[imp]}</div>
                {[1, 2, 3].map((prob) => {
                  const n = openRisks.filter((r) => r.impact === imp && r.probability === prob).length;
                  const lvl = riskLevel({ probability: prob as RiskLevel, impact: imp as RiskLevel });
                  return <div key={prob} className={`pw-heat-cell ${lvl}`}>{n || ""}</div>;
                })}
              </React.Fragment>
            ))}
            <div />
            {[1, 2, 3].map((p) => <div key={p} className="pw-heat-lbl" style={{ textAlign: "center" }}>{LEVEL[p]}</div>)}
          </div>
          <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>Probabilidad →</div>
        </div>
        <div className="card card-pad">
          <div className="card-title">Cómo se usa</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            <li><b>Riesgo:</b> algo que puede pasar y dañar el proyecto.</li>
            <li><b>Supuesto:</b> algo que damos por cierto sin haberlo verificado.</li>
            <li><b>Desconocido:</b> lo que todavía no sabemos y hay que investigar.</li>
            <li>Un riesgo alto sin plan de mitigación, o con la revisión vencida, aparece como punto crítico.</li>
          </ul>
        </div>
      </div>

      <div className="pw-toolbar">
        <select className="select" value={fKind} onChange={(e) => setFKind(e.target.value as RiskKind | "")}>
          <option value="">Tipo: todos</option>
          {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as RiskStatus | "")}>
          <option value="">Estado: todos</option>
          {Object.entries(RSTATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="grow" />
        {perms.canManage && <button className="btn btn-primary" onClick={() => setEdit("new")}><Icon name="plus" size={15} /> Nuevo</button>}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead><tr><th>Tipo</th><th>Descripción</th><th>Nivel</th><th>Responsable</th><th>Mitigación</th><th>Revisión</th><th>Estado</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7}><Empty icon="alert" text="Sin elementos" sub="Registrar lo que no sabemos es la mejor defensa contra las sorpresas." /></td></tr>}
            {rows.map((r) => {
              const lvl = riskLevel(r);
              const noMit = lvl === "alto" && r.status === "abierto" && !r.mitigation.trim();
              return (
                <tr key={r.id} style={{ cursor: perms.canManage ? "pointer" : undefined }} onClick={() => perms.canManage && setEdit(r)}>
                  <td><span className="pw-tag ghost">{KIND[r.kind]}</span></td>
                  <td style={{ minWidth: 220 }}><div style={{ fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 12, color: "var(--text-3)" }}>{r.description}</div></td>
                  <td><span className={`pw-pill ${lvl === "alto" ? "late" : lvl === "medio" ? "soon" : "ok"}`}>{lvl} · {LEVEL[r.probability]}/{LEVEL[r.impact]}</span></td>
                  <td><Person user={env.users.find((u) => u.id === r.ownerId)} size={18} /></td>
                  <td style={{ minWidth: 180, fontSize: 12.5 }}>{r.mitigation || (noMit ? <span className="pw-pill late"><Icon name="alert" size={11} /> falta definir</span> : <span style={{ color: "var(--text-3)" }}>—</span>)}</td>
                  <td>{r.reviewDate ? <DuePill date={r.reviewDate} done={r.status !== "abierto"} /> : "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {perms.canManage ? (
                      <select className="select" style={{ padding: "3px 8px", fontSize: 12.5 }} value={r.status} onChange={(e) => workActions.updateRisk(r.id, { status: e.target.value as RiskStatus })}>
                        {Object.entries(RSTATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    ) : <span className="pw-pill">{RSTATUS[r.status]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>Hoy: {fmtDate(now)} · nivel = probabilidad × impacto (alto ≥ 6).</div>
      {edit && <RiskModal projectId={projectId} risk={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RiskModal({ projectId, risk, onClose }: { projectId: string; risk: Risk | null; onClose: () => void }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const { team, others } = assignableUsers(env, env.projects.find((p) => p.id === projectId), work.assignments);
  const [kind, setKind] = useState<RiskKind>(risk?.kind ?? "riesgo");
  const [title, setTitle] = useState(risk?.title ?? "");
  const [description, setDescription] = useState(risk?.description ?? "");
  const [probability, setProbability] = useState<RiskLevel>(risk?.probability ?? 2);
  const [impact, setImpact] = useState<RiskLevel>(risk?.impact ?? 2);
  const [ownerId, setOwnerId] = useState<string | null>(risk?.ownerId ?? null);
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? "");
  const [reviewDate, setReviewDate] = useState<string | null>(risk?.reviewDate ?? null);
  const [confirmDel, setConfirmDel] = useState(false);

  function save() {
    if (!title.trim()) return;
    const f = { kind, title: title.trim(), description: description.trim(), probability, impact, ownerId, mitigation: mitigation.trim(), reviewDate };
    if (risk) workActions.updateRisk(risk.id, f);
    else workActions.addRisk({ projectId, status: "abierto", ...f });
    toast(risk ? "Actualizado." : "Registrado.");
    onClose();
  }

  const lvlSel = (v: RiskLevel, set: (n: RiskLevel) => void) => (
    <select className="select" value={v} onChange={(e) => set(Number(e.target.value) as RiskLevel)}>
      <option value={1}>Baja</option><option value={2}>Media</option><option value={3}>Alta</option>
    </select>
  );

  return (
    <Modal
      title={risk ? "Editar" : "Nuevo riesgo, supuesto o desconocido"}
      onClose={onClose}
      footer={
        <>
          {risk && (confirmDel ? <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => { workActions.deleteRisk(risk.id); onClose(); }}>Confirmar eliminación</button> : <button className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => setConfirmDel(true)}>Eliminar</button>)}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={save}>{risk ? "Guardar" : "Registrar"}</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field"><label>Tipo</label><select className="select" value={kind} onChange={(e) => setKind(e.target.value as RiskKind)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label>Responsable</label><UserSelect value={ownerId} onChange={setOwnerId} team={team} others={others} /></div>
        <div className="field full"><label>Título</label><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field full"><label>Descripción</label><textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="field"><label>Probabilidad</label>{lvlSel(probability, setProbability)}</div>
        <div className="field"><label>Impacto</label>{lvlSel(impact, setImpact)}</div>
        <div className="field full"><label>Plan de mitigación</label><textarea className="textarea" rows={2} value={mitigation} onChange={(e) => setMitigation(e.target.value)} placeholder="¿Qué hacemos para reducirlo o investigarlo?" /></div>
        <div className="field full"><label>Próxima revisión</label><OptDate value={reviewDate} onChange={setReviewDate} /></div>
      </div>
    </Modal>
  );
}
