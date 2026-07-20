import React, { useEffect, useMemo, useState } from "react";
import { useStore, overlaps, visibleProjects } from "../store";
import type { TimeEntry, RunningTimer } from "../types";
import { addDays, fmtDur, fmtHM, minToHM, today, uid, dayLabel } from "../utils";
import { EntryModal } from "../components/EntryModal";
import { ContextMenu, Empty, useToast } from "../components/ui";

function useNow(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function elapsed(t: RunningTimer): string {
  const s = Math.floor((Date.now() - t.startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function Tracker() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const myProjects = visibleProjects(state, state.currentUserId);
  const [desc, setDesc] = useState("");
  const [projectId, setProjectId] = useState(myProjects.find((p) => p.status === "activo")?.id ?? "");
  const [modal, setModal] = useState<Partial<TimeEntry> | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: TimeEntry } | null>(null);

  useNow(state.timers.length > 0);

  const me = state.currentUserId;
  const myEntries = useMemo(
    () => state.entries.filter((e) => e.userId === me).sort((a, b) => (a.date === b.date ? b.start - a.start : b.date.localeCompare(a.date))),
    [state.entries, me],
  );

  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of myEntries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()].slice(0, 14);
  }, [myEntries]);

  const favorites = myEntries.filter((e) => e.favorite);
  const favUnique = favorites.filter((f, i) => favorites.findIndex((x) => x.description === f.description && x.projectId === f.projectId) === i).slice(0, 6);

  function startTimer(preset?: Partial<RunningTimer>) {
    const pid = preset?.projectId ?? projectId ?? null;
    const t: RunningTimer = {
      id: uid(),
      projectId: pid,
      taskId: preset?.taskId ?? null,
      description: preset?.description ?? desc,
      tagIds: preset?.tagIds ?? [],
      // Facturable se hereda de la configuración del proyecto
      billable: state.projects.find((p) => p.id === pid)?.billable ?? false,
      startedAt: Date.now(),
    };
    dispatch({ type: "startTimer", timer: t });
    dispatch({ type: "notify", n: { kind: "timer-start", title: "Cronómetro iniciado", body: t.description || "Sin descripción" } });
    setDesc("");
  }

  function duplicateEntry(e: TimeEntry) {
    const dur = e.end - e.start;
    const start = Math.min(e.end, 24 * 60 - dur);
    dispatch({ type: "addEntry", entry: { ...e, id: uid(), start, end: start + dur } });
    toast("Registro duplicado.");
  }

  function copyDay(date: string, target: string) {
    const src = myEntries.filter((e) => e.date === date);
    const copies = src.map((e) => ({ ...e, id: uid(), date: target, favorite: false }));
    dispatch({ type: "addEntries", entries: copies });
    toast(`${copies.length} registros copiados a ${dayLabel(target)}.`);
  }

  const proj = (id: string | null) => state.projects.find((p) => p.id === id);

  return (
    <>
      <div className="page-head">
        <h1>Registro de tiempo</h1>
        <span className="spacer" />
        <button className="btn btn-secondary" onClick={() => setModal({})}>＋ Carga manual</button>
      </div>

      {/* Barra de cronómetro: máximo 2 clics para iniciar */}
      <div className="timerbar no-print">
        <input
          className="desc"
          placeholder="¿En qué estás trabajando?"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startTimer()}
          aria-label="Descripción del registro"
        />
        <select className="select" style={{ width: "auto", minWidth: 170 }} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Proyecto">
          {myProjects.filter((p) => p.status === "activo").map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="playbtn" onClick={() => startTimer()} aria-label="Iniciar cronómetro" title="Iniciar (Enter)">▶</button>
      </div>

      {/* Temporizadores múltiples en curso */}
      {state.timers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {state.timers.map((t) => {
            const p = proj(t.projectId);
            return (
              <div className="running-timer" key={t.id}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", animation: "pulse 1s infinite" }} />
                <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description || "Sin descripción"}
                </strong>
                {p && (
                  <span className="proj" style={{ color: p.color, fontWeight: 600, fontSize: 12.5 }}>● {p.name}</span>
                )}
                <span className="timer-clock">{elapsed(t)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: "stopTimer", id: t.id, discard: true })}>
                  Descartar
                </button>
                <button
                  className="playbtn stop"
                  style={{ width: 34, height: 34 }}
                  onClick={() => {
                    dispatch({ type: "stopTimer", id: t.id });
                    dispatch({ type: "notify", n: { kind: "timer-stop", title: "Cronómetro detenido", body: t.description || "Registro guardado" } });
                  }}
                  aria-label="Detener"
                >
                  ⏹
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Favoritos: registro en un clic */}
      {favUnique.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="card-title">⭐ Favoritos — iniciá con un clic</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {favUnique.map((f) => {
              const p = proj(f.projectId);
              return (
                <button
                  key={f.id}
                  className="chip"
                  onClick={() => startTimer({ description: f.description, projectId: f.projectId, taskId: f.taskId, billable: f.billable, tagIds: f.tagIds })}
                >
                  ▶ {f.description || "Sin descripción"}
                  {p && <span style={{ color: p.color }}>●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Historial agrupado por día */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {days.length === 0 && (
          <div className="card"><Empty icon="⏱️" text="Todavía no hay registros" sub="Iniciá el cronómetro o cargá horas manualmente." /></div>
        )}
        {days.map(([date, list]) => {
          const total = list.reduce((a, e) => a + (e.end - e.start), 0);
          return (
            <div className="card" key={date}>
              <div className="day-head">
                <span style={{ textTransform: "capitalize" }}>
                  {dayLabel(date, { weekday: "long", day: "numeric", month: "long" })}
                  {date === today() && <span className="badge acc" style={{ marginLeft: 8 }}>Hoy</span>}
                </span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    className="btn btn-ghost btn-sm no-print"
                    title="Copiar registros al día siguiente hábil"
                    onClick={() => copyDay(date, addDays(date, 1))}
                  >
                    ⧉ Copiar día
                  </button>
                  <strong style={{ fontFamily: "var(--mono)" }}>{fmtDur(total)}</strong>
                </span>
              </div>
              {list.map((e) => {
                const p = proj(e.projectId);
                const conf = overlaps(state.entries, e);
                return (
                  <div
                    className="entry-row"
                    key={e.id}
                    onDoubleClick={() => setModal(e)}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      setCtx({ x: ev.clientX, y: ev.clientY, entry: e });
                    }}
                  >
                    <span className="desc">
                      {e.favorite && "⭐ "}
                      {e.description || <em style={{ color: "var(--text-3)" }}>Sin descripción</em>}
                      {e.recurring && <span className="badge" style={{ marginLeft: 6 }}>↻ {e.recurring}</span>}
                      {conf.length > 0 && <span className="overlap-flag" title="Se solapa con otro registro"> ⚠ solapado</span>}
                    </span>
                    {e.tagIds.map((gid) => {
                      const g = state.tags.find((x) => x.id === gid);
                      return g ? (
                        <span className="badge" key={gid}>
                          <span className="swatch" style={{ background: g.color }} />
                          {g.name}
                        </span>
                      ) : null;
                    })}
                    {p && (
                      <span className="proj" style={{ color: p.color }}>
                        ● {p.name}
                        {e.taskId && `: ${p.tasks.find((t) => t.id === e.taskId)?.name ?? ""}`}
                      </span>
                    )}
                    <span className="time">
                      {minToHM(e.start)} – {minToHM(e.end)}
                    </span>
                    <span className="dur">{fmtHM(e.end - e.start)}</span>
                    <button className="btn btn-ghost btn-sm no-print" onClick={() => setModal(e)} aria-label="Editar">✎</button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {modal && <EntryModal initial={modal} onClose={() => setModal(null)} />}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: "Editar", ico: "✎", onClick: () => setModal(ctx.entry) },
            { label: "Duplicar", ico: "⧉", onClick: () => duplicateEntry(ctx.entry) },
            {
              label: ctx.entry.favorite ? "Quitar de favoritos" : "Marcar favorito", ico: "⭐",
              onClick: () => dispatch({ type: "updateEntry", entry: { ...ctx.entry, favorite: !ctx.entry.favorite } }),
            },
            {
              label: "▶ Iniciar cronómetro igual", ico: "⏱",
              onClick: () =>
                startTimer({ description: ctx.entry.description, projectId: ctx.entry.projectId, taskId: ctx.entry.taskId, tagIds: ctx.entry.tagIds }),
            },
            {
              label: "Eliminar", ico: "🗑", danger: true,
              onClick: () => {
                dispatch({ type: "deleteEntry", id: ctx.entry.id });
                toast("Registro eliminado.");
              },
            },
          ]}
        />
      )}
      <style>{`@keyframes pulse { 50% { opacity: 0.3; } }`}</style>
    </>
  );
}
