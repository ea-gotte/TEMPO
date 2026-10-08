import React, { useEffect, useMemo, useState } from "react";
import { Dot, Empty } from "../components/ui";
import { Icon } from "../components/Icon";
import { addDays, fmtDate, today } from "../utils";
import { EnvProvider, useEnv } from "./env";
import { byDue, isPlanOverdue, isProjectLate, isTaskOverdue, projectPerms, taskProgress } from "./logic";
import { Bar, DuePill, KpiCard, Person } from "./parts";
import type { WorkEnv } from "./types";
import { useWork, workActions } from "./workStore";
import { DemoBanner } from "./ProjectWorkspace";
import { IndicatorsPanel } from "./IndicatorsPanel";
import "./projects.css";

const SEED_LIMIT = 8;

/** Panorama global: una pestaña de “Proyectos”, no un dashboard aparte. */
export function Panorama({ env, onOpen }: { env: WorkEnv; onOpen: (projectId: string) => void }) {
  return (
    <EnvProvider value={env}>
      <PanoramaInner onOpen={onOpen} />
    </EnvProvider>
  );
}

function PanoramaInner({ onOpen }: { onOpen: (id: string) => void }) {
  const env = useEnv();
  const work = useWork();
  const now = today();
  const [fStatus, setFStatus] = useState<"" | "activo" | "pausado" | "completado">("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [q, setQ] = useState("");
  const [sub, setSub] = useState<"resumen" | "indicadores">("resumen");

  // Datos de ejemplo para los primeros proyectos (solo en la demo)
  useEffect(() => {
    env.projects
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.status !== "archivado")
      .slice(0, SEED_LIMIT)
      .filter(({ p }) => !work.seeded[p.id])
      .forEach(({ p, i }) => workActions.ensureSeed(p, i));
  }, [env.projects, work.seeded]);

  const visible = useMemo(
    () => env.projects.filter((p) => p.status !== "archivado" && projectPerms(env, work, p.id).canView),
    [env, work],
  );
  const ids = new Set(visible.map((p) => p.id));
  const tasks = work.tasks.filter((t) => ids.has(t.projectId));
  const milestones = work.milestones.filter((m) => ids.has(m.projectId));
  const deliverables = work.deliverables.filter((d) => ids.has(d.projectId));
  const nameOf = (id: string) => env.projects.find((p) => p.id === id);
  const userOf = (id: string | null) => env.users.find((u) => u.id === id);

  const lateOf = (pid: string) => {
    const p = nameOf(pid)!;
    return isProjectLate(p, work.meta[pid], milestones.filter((m) => m.projectId === pid), now);
  };

  const open = tasks.filter((t) => t.status !== "hecha");
  // La programación se sigue por hitos y entregables: “atrasado” es lo que pasó su fecha sin cumplirse
  const lateMs = milestones.filter((m) => isPlanOverdue(m, now));
  const lateDel = deliverables.filter((d) => isPlanOverdue(d, now));
  const horizon = addDays(now, 30);
  const nextMs = milestones.filter((m) => m.status !== "cumplido" && m.dueDate && m.dueDate <= horizon).sort(byDue);
  const nextDel = deliverables.filter((d) => d.status !== "cumplido" && d.dueDate && d.dueDate <= horizon).sort(byDue);

  const rows = visible.filter((p) => {
    if (fStatus && p.status !== fStatus) return false;
    if (onlyLate && !lateOf(p.id)) return false;
    if (q && !p.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  // Carga por responsable: tareas abiertas (y cuántas de ellas atrasadas)
  const load = useMemo(() => {
    const m = new Map<string, { open: number; late: number }>();
    for (const t of open) {
      if (!t.assigneeId) continue;
      const cur = m.get(t.assigneeId) ?? { open: 0, late: 0 };
      cur.open++;
      if (isTaskOverdue(t, now)) cur.late++; // su hito o entregable ya pasó de fecha
      m.set(t.assigneeId, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].open - a[1].open).slice(0, 8);
  }, [open, now]);
  const maxLoad = Math.max(1, ...load.map(([, v]) => v.open));

  if (visible.length === 0) return <div className="card card-pad"><Empty icon="folder" text="Sin proyectos para mostrar" sub="Cuando participes en proyectos, vas a ver acá su panorama." /></div>;

  return (
    <>
      <DemoBanner />
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={sub === "resumen" ? "active" : ""} onClick={() => setSub("resumen")}>Resumen</button>
        <button className={sub === "indicadores" ? "active" : ""} onClick={() => setSub("indicadores")}>Indicadores</button>
      </div>
      {sub === "indicadores" && <IndicatorsPanel onOpen={onOpen} />}
      {sub === "resumen" && (<>
      <div className="kpi-grid">
        <KpiCard icon="briefcase" label="Proyectos activos" value={visible.filter((p) => p.status === "activo").length} hint={`${visible.filter((p) => p.status === "pausado").length} pausados`} />
        <KpiCard icon="check-circle" label="Finalizados" value={visible.filter((p) => p.status === "completado").length} />
        <KpiCard icon="alert" label="Proyectos atrasados" value={visible.filter((p) => lateOf(p.id)).length} tone={visible.some((p) => lateOf(p.id)) ? "bad" : "ok"} hint="fin vencido u hito sin cumplir" />
        <KpiCard icon="clipboard" label="Tareas pendientes" value={open.length} hint={`de ${tasks.length} en total`} />
        <KpiCard icon="flame" label="Hitos y entregables atrasados" value={lateMs.length + lateDel.length} tone={lateMs.length + lateDel.length ? "bad" : "ok"} hint={`${lateMs.length} hitos · ${lateDel.length} entregables`} />
        <KpiCard icon="calendar-days" label="Hitos próximos (30 d)" value={nextMs.length} hint={`${nextDel.length} entregables`} />
      </div>

      <div className="pw-toolbar">
        <input className="input" style={{ minWidth: 200 }} placeholder="Buscar proyecto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)}>
          <option value="">Estado: todos</option>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
          <option value="completado">Finalizados</option>
        </select>
        <label className={`chip ${onlyLate ? "on" : ""}`} style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} style={{ display: "none" }} /> Solo atrasados
        </label>
        <span className="grow" />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{rows.length} de {visible.length} proyectos · clic en una fila para abrir</span>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Proyecto</th><th>Project Manager</th><th>Estado</th><th>Avance de tareas</th><th>Próximo hito</th><th>Atrasados</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}><Empty icon="search" text="Sin resultados" /></td></tr>}
            {rows.map((p) => {
              const pt = tasks.filter((t) => t.projectId === p.id);
              const pr = taskProgress(pt);
              const ref = work.assignments.find((a) => a.projectId === p.id && a.roleKey === "lider_proyecto");
              const ms = milestones.filter((m) => m.projectId === p.id && m.status !== "cumplido").sort(byDue)[0];
              const lateN = milestones.filter((m) => m.projectId === p.id && isPlanOverdue(m, now)).length + deliverables.filter((d) => d.projectId === p.id && isPlanOverdue(d, now)).length;
              const late = lateOf(p.id);
              return (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onOpen(p.id)}>
                  <td style={{ minWidth: 220 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><Dot color={p.color} /> {p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginLeft: 16 }}>
                      {work.meta[p.id]?.code} · {env.clients.find((c) => c.id === p.clientId)?.name ?? "Sin cliente"}
                    </div>
                  </td>
                  <td><Person user={userOf(ref?.userId ?? null)} size={18} /></td>
                  <td>
                    <span className={`badge ${p.status === "activo" ? "ok" : p.status === "completado" ? "acc" : ""}`}>{p.status}</span>
                    {late && <span className="pw-pill late" style={{ marginLeft: 6 }}><Icon name="alert" size={11} /> Atrasado</span>}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    {pr.total ? (<><div style={{ fontSize: 12, marginBottom: 4 }}>{pr.pct}% · {pr.done}/{pr.total} tareas</div><Bar pct={pr.pct} /></>) : <span style={{ color: "var(--text-3)" }}>Sin tareas</span>}
                  </td>
                  <td>
                    {ms ? (<div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 12.5 }}>◆ {ms.name}</span><DuePill date={ms.dueDate} done={false} /></div>) : <span style={{ color: "var(--text-3)" }}>—</span>}
                  </td>
                  <td>{lateN ? <span className="pw-pill late">{lateN}</span> : <span style={{ color: "var(--text-3)" }}>0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="card-title">Próximos hitos y entregables (30 días)</div>
          {nextMs.length + nextDel.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Sin vencimientos en los próximos 30 días.</div>}
          {[...nextMs.map((m) => ({ k: "m" + m.id, icon: "◆", name: m.name, due: m.dueDate, pid: m.projectId, owner: m.ownerId, over: isPlanOverdue(m) })),
            ...nextDel.map((d) => ({ k: "d" + d.id, icon: "▣", name: d.name, due: d.dueDate, pid: d.projectId, owner: d.ownerId, over: isPlanOverdue(d) }))]
            .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
            .slice(0, 9)
            .map((x) => (
              <div className="list-item" key={x.k} style={{ cursor: "pointer" }} onClick={() => onOpen(x.pid)}>
                <span style={{ color: x.over ? "var(--danger)" : "var(--text-3)" }}>{x.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{nameOf(x.pid)?.name}</div>
                </div>
                <Person user={userOf(x.owner)} size={18} />
                <DuePill date={x.due} done={false} />
              </div>
            ))}
        </div>

        <div className="card card-pad">
          <div className="card-title">Hitos y entregables atrasados</div>
          {lateMs.length + lateDel.length === 0 && <div style={{ color: "var(--success)", fontSize: 13 }}>No hay nada atrasado.</div>}
          {[
            ...lateMs.map((m) => ({ k: "m" + m.id, icon: "◆", name: m.name, due: m.dueDate, pid: m.projectId, owner: m.ownerId })),
            ...lateDel.map((d) => ({ k: "d" + d.id, icon: "▣", name: d.name, due: d.dueDate, pid: d.projectId, owner: d.ownerId })),
          ].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")).slice(0, 8).map((x) => (
            <div className="list-item" key={x.k} style={{ cursor: "pointer" }} onClick={() => onOpen(x.pid)}>
              <span style={{ color: "var(--danger)" }}>{x.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{nameOf(x.pid)?.name}</div>
              </div>
              <Person user={userOf(x.owner)} size={18} />
              <DuePill date={x.due} done={false} />
            </div>
          ))}
          {lateMs.length + lateDel.length > 8 && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>y {lateMs.length + lateDel.length - 8} más…</div>}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div className="card-title">Carga por responsable (tareas abiertas)</div>
        {load.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Sin tareas asignadas.</div>}
        <div className="hbar">
          {load.map(([id, v]) => (
            <div className="row" key={id} style={{ gridTemplateColumns: "170px 1fr 90px" }}>
              <span className="name"><Person user={userOf(id)} size={18} /></span>
              <span className="track" style={{ height: 11 }}>
                <span style={{ display: "block", height: "100%", width: `${(v.open / maxLoad) * 100}%`, background: v.late ? "var(--warning)" : "var(--accent)", borderRadius: 99 }} />
              </span>
              <span className="val">{v.open}{v.late ? ` · ${v.late} fuera de plazo` : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>Fecha de hoy: {fmtDate(now)}.</div>
      </>)}
    </>
  );
}
