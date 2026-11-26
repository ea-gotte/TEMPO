import { projectCode } from "./templates";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dot, Empty } from "../components/ui";
import type { Project, User } from "../types";
import { addDays, fmtDate, monthLabel, parseISO, today } from "../utils";
import { useEnv } from "./env";
import { isPlanOverdue, projectPerms, taskProgress } from "./logic";
import { KpiCard, Person } from "./parts";
import type { WorkData, WorkEnv } from "./types";
import { useWork } from "./workStore";

const NAME_W = 260;
const ROW_H = 44;
const diffDays = (a: string, b: string) => Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
const isoDow = (d: string) => ((parseISO(d).getDay() + 6) % 7) + 1;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS_ORDER: Record<Project["status"], number> = { activo: 0, pausado: 1, completado: 2, archivado: 3 };

/** Desplazamiento arrastrando con el botón izquierdo (pan en ambos ejes). */
export function useDragPan(scroller: React.RefObject<HTMLDivElement>) {
  const panRef = useRef<{
    x0: number;
    y0: number;
    left0: number;
    top0: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".pw-g-handle, input, button, select, a, textarea")) return;
    const el = scroller.current;
    if (!el) return;

    panRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      left0: el.scrollLeft,
      top0: window.scrollY,
      moved: false,
      pointerId: e.pointerId,
    };

    const onPointerMove = (ev: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || ev.pointerId !== pan.pointerId) return;
      const dx = ev.clientX - pan.x0;
      const dy = ev.clientY - pan.y0;
      if (!pan.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        pan.moved = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      if (pan.moved) {
        el.scrollLeft = pan.left0 - dx;
        window.scrollTo({ top: pan.top0 - dy });
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cleanupRef.current = null;
    };

    const onPointerUp = (ev: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || ev.pointerId !== pan.pointerId) return;
      panRef.current = null;
      cleanup();

      if (pan.moved) {
        const suppressClick = (eClick: MouseEvent) => {
          eClick.stopPropagation();
          eClick.preventDefault();
        };
        el.addEventListener("click", suppressClick, { capture: true, once: true });
        setTimeout(() => {
          el.removeEventListener("click", suppressClick, { capture: true });
        }, 0);
      }
    };

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return { onPointerDown };
}

/** Zoom horizontal con Shift + rueda, anclado al día que está bajo el puntero. */
export function useWheelZoom(
  scroller: React.RefObject<HTMLDivElement>,
  enabled: boolean,
  init: number,
  min: number,
  max: number
) {
  const [dayW, setDayWState] = useState(init);
  const dayWRef = useRef(dayW);
  dayWRef.current = dayW;
  const anchor = useRef<{ day: number; px: number } | null>(null);
  const clamp = (w: number) => Math.min(max, Math.max(min, Math.round(w * 10) / 10));

  const zoomAt = (next: number, px: number) => {
    const el = scroller.current;
    const cur = dayWRef.current;
    const w = clamp(next);
    if (!el || w === cur) return;
    anchor.current = { day: (el.scrollLeft + px - NAME_W) / cur, px };
    setDayWState(w);
  };

  useEffect(() => {
    const el = scroller.current;
    if (!enabled || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      zoomAt(dayWRef.current * (delta < 0 ? 1.15 : 1 / 1.15), e.clientX - el.getBoundingClientRect().left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const a = anchor.current;
    if (el && a) el.scrollLeft = Math.max(0, a.day * dayW + NAME_W - a.px);
    anchor.current = null;
  }, [dayW, scroller]);

  const zoomCenter = (factor: number) => {
    const el = scroller.current;
    if (el) zoomAt(dayWRef.current * factor, NAME_W + (el.clientWidth - NAME_W) / 2);
  };

  const setDayW = (w: number) => {
    anchor.current = null;
    setDayWState(clamp(w));
  };

  return { dayW, setDayW, zoomCenter, dayWRef, clamp };
}

/* ====================================================================
 * Barra horizontal sincronizada (sticky) para diagramas de Gantt
 * ==================================================================== */
export interface GanttHScrollbarProps {
  scroller: React.RefObject<HTMLDivElement | null>;
  zoomKey?: unknown;
}

export function GanttHScrollbar({ scroller, zoomKey }: GanttHScrollbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [needed, setNeeded] = useState(false);
  const activeSource = useRef<"scroller" | "bar" | null>(null);

  const updateWidth = useCallback(() => {
    const s = scroller.current;
    if (!s) return;
    const sw = s.scrollWidth;
    const cw = s.clientWidth;
    setScrollWidth(sw);
    const isNeeded = sw > cw + 1;
    setNeeded(isNeeded);
    const b = barRef.current;
    if (b && Math.abs(b.scrollLeft - s.scrollLeft) >= 1) {
      b.scrollLeft = s.scrollLeft;
    }
  }, [scroller]);

  useEffect(() => {
    updateWidth();
  }, [updateWidth, zoomKey]);

  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    updateWidth();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateWidth();
      });
      ro.observe(s);
      if (s.firstElementChild) {
        ro.observe(s.firstElementChild);
      }
    }

    const mo =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            if (s.firstElementChild && ro) {
              ro.observe(s.firstElementChild);
            }
            updateWidth();
          })
        : null;
    mo?.observe(s, { childList: true });

    window.addEventListener("resize", updateWidth);

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [scroller, updateWidth]);

  useLayoutEffect(() => {
    const s = scroller.current;
    const b = barRef.current;
    if (needed && s && b && Math.abs(b.scrollLeft - s.scrollLeft) >= 1) {
      b.scrollLeft = s.scrollLeft;
    }
  }, [needed, scroller]);

  useEffect(() => {
    const s = scroller.current;
    const b = barRef.current;
    if (!s || !b) return;

    let rafId: number | null = null;

    const onScrollerScroll = () => {
      if (activeSource.current === "bar") return;
      activeSource.current = "scroller";
      if (Math.abs(b.scrollLeft - s.scrollLeft) >= 1) {
        b.scrollLeft = s.scrollLeft;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (activeSource.current === "scroller") activeSource.current = null;
      });
    };

    const onBarScroll = () => {
      if (activeSource.current === "scroller") return;
      activeSource.current = "bar";
      if (Math.abs(s.scrollLeft - b.scrollLeft) >= 1) {
        s.scrollLeft = b.scrollLeft;
      }
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (activeSource.current === "bar") activeSource.current = null;
      });
    };

    s.addEventListener("scroll", onScrollerScroll, { passive: true });
    b.addEventListener("scroll", onBarScroll, { passive: true });

    return () => {
      s.removeEventListener("scroll", onScrollerScroll);
      b.removeEventListener("scroll", onBarScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [scroller, needed]);

  return (
    <div
      ref={barRef}
      className={`pw-gantt-hscroll ${needed ? "" : "is-hidden"}`.trim()}
      aria-label="Desplazamiento horizontal del cronograma"
      style={{ display: needed ? undefined : "none" }}
    >
      <div style={{ width: scrollWidth, height: 1, minHeight: 1 }} />
    </div>
  );
}

/* ====================================================================
 * Cronograma de la cartera: una fila por proyecto
 * ==================================================================== */
export function PortfolioGantt({ onOpen }: { onOpen: (projectId: string) => void }) {
  const env = useEnv();
  const work = useWork();
  const now = today();
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    return env.projects
      .filter((p) => p.status !== "archivado" && projectPerms(env, work, p.id).canView)
      .map((p) => {
        const meta = work.meta[p.id];
        const ms = work.milestones.filter((m) => m.projectId === p.id);
        const msDates = ms.flatMap((m) => [m.startDate, m.dueDate]).filter(Boolean) as string[];
        const start = meta?.startDate ?? (msDates.length ? msDates.reduce((a, b) => (a < b ? a : b)) : null);
        const end = meta?.endDate ?? (msDates.length ? msDates.reduce((a, b) => (a > b ? a : b)) : null);
        const pct = taskProgress(work.tasks.filter((t) => t.projectId === p.id)).pct;
        const late = p.status === "activo" && !!meta?.endDate && meta.endDate < now;
        return { p, code: projectCode(p, meta), start, end: start && end && end < start ? start : end, ms: ms.filter((m) => m.dueDate), pct, late };
      })
      .sort((a, b) => STATUS_ORDER[a.p.status] - STATUS_ORDER[b.p.status] || (a.start ?? "9").localeCompare(b.start ?? "9"));
  }, [env, work, now]);

  const range = useMemo(() => {
    const all = [now, ...rows.flatMap((r) => [r.start, r.end, ...r.ms.map((m) => m.dueDate)])].filter(Boolean) as string[];
    const start = addDays(all.reduce((a, b) => (a < b ? a : b)), -7);
    return { start, days: diffDays(all.reduce((a, b) => (a > b ? a : b)), start) + 15 };
  }, [rows, now]);

  const { dayW, setDayW, zoomCenter } = useWheelZoom(scroller, rows.length > 0, 6, 1.5, 40);
  const { onPointerDown } = useDragPan(scroller);

  const X = (d: string) => diffDays(d, range.start) * dayW;
  const goToday = (smooth = true) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, X(now) - (el.clientWidth - NAME_W) * 0.3), behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => { goToday(false); /* al abrir, hoy queda a la vista */ }, [rows.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return <div className="card card-pad"><Empty icon="calendar-days" text="Nada para graficar" /></div>;

  const width = range.days * dayW;
  const months: { label: string; x: number }[] = [];
  const dayLabels: { d: string; x: number }[] = [];
  const shortMonths = dayW * 30 < 110;
  let firstMonday = 0;
  for (let i = 0; i < range.days; i++) {
    const d = addDays(range.start, i);
    if (i === 0 || d.endsWith("-01")) {
      const label = shortMonths ? `${monthLabel(d).slice(0, 3)} ${d.slice(2, 4)}` : monthLabel(d);
      const x = i * dayW;
      // El rótulo del primer mes (parcial) se omite si lo pisaría el del mes siguiente
      if (months.length === 1 && x - months[0].x < (shortMonths ? 46 : 100)) months.pop();
      months.push({ label, x });
    }
    const monday = isoDow(d) === 1;
    if (monday && !firstMonday) firstMonday = i;
    if (dayW >= 14 || (dayW >= 5 && monday)) dayLabels.push({ d, x: i * dayW });
  }
  const labelW = Math.max(dayW, 20);

  return (
    <>
      <div className="pw-toolbar" style={{ marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => goToday()}>Ir a hoy</button>
        <button className="btn btn-secondary btn-sm" title="Alejar" onClick={() => zoomCenter(1 / 1.4)}>−</button>
        <button className="btn btn-secondary btn-sm" title="Acercar" onClick={() => zoomCenter(1.4)}>+</button>
        <button className="btn btn-secondary btn-sm" onClick={() => { const el = scroller.current; if (el) { setDayW((el.clientWidth - NAME_W) / range.days); el.scrollLeft = 0; } }}>Ver todo</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Barra = plazo del proyecto (relleno = avance de tareas) · ◆ = hito · arrastrá para desplazarte · Shift + rueda para acercar o alejar</span>
      </div>
      <div className="pw-gantt-wrap">
        <div className="pw-gantt" ref={scroller} onPointerDown={onPointerDown} style={{ cursor: "grab" }}>
          <div className="pw-gantt-inner" style={{ width: NAME_W + width }}>
            <div className="pw-g-head">
            <div className="pw-g-name">Proyecto</div>
            <div className="pw-g-days" style={{ width }}>
              {months.map((m) => <span key={m.x} className="pw-g-month" style={{ left: m.x + 4 }}>{cap(m.label)}</span>)}
              {dayLabels.map(({ d, x }) => (
                <span key={d} className={`pw-g-day ${d === now ? "today" : ""}`} style={{ left: x + (dayW - labelW) / 2, width: labelW }}>{parseISO(d).getDate()}</span>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <div className="pw-g-today" style={{ left: NAME_W + X(now) + dayW / 2 }} title="Hoy" />
            {rows.map(({ p, code, start, end, ms, pct, late }) => {
              const dim = p.status !== "activo";
              const barW = start && end ? (diffDays(end, start) + 1) * dayW : 0;
              const title = `${p.name}${start && end ? `\n${fmtDate(start)} → ${fmtDate(end)}` : ""}\n${pct}% de avance de tareas${late ? "\nFin previsto vencido" : ""}`;
              return (
                <div key={p.id} className="pw-g-row" style={{ height: ROW_H }}>
                  <div className="pw-g-name" style={{ cursor: "pointer", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 1 }} onClick={() => onOpen(p.id)} title="Abrir el proyecto">
                    <span className="t" style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%" }}><Dot color={p.color} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span></span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500, marginLeft: 14 }}>{code}{dim ? ` · ${p.status}` : ""}</span>
                  </div>
                  <div
                    className="pw-g-track"
                    style={{ width, height: ROW_H, backgroundSize: `${dayW * 7}px 100%`, backgroundPosition: `${firstMonday * dayW}px 0`, backgroundImage: dayW < 2 ? "none" : undefined }}
                  >
                    {start && end ? (
                      <div
                        title={title} onClick={() => onOpen(p.id)}
                        style={{
                          position: "absolute", left: X(start), width: barW, top: 12, height: 18, borderRadius: 5, cursor: "pointer", overflow: "hidden",
                          background: `${p.color}33`, border: `1px solid ${late ? "var(--danger)" : p.color}`, boxShadow: late ? "0 0 0 1px var(--danger)" : undefined,
                          opacity: dim ? 0.55 : 1, display: "flex", alignItems: "center",
                        }}
                      >
                        <span style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct}%`, background: p.color, opacity: 0.85 }} />
                        {barW > 50 && <span style={{ position: "relative", fontSize: 10.5, fontWeight: 700, paddingLeft: 6, color: pct > 25 ? "#fff" : "var(--text-2)" }}>{pct}%</span>}
                      </div>
                    ) : (
                      <span style={{ position: "absolute", left: Math.max(8, X(now) + 8), top: 13, fontSize: 12, color: "var(--text-3)" }}>Sin fechas</span>
                    )}
                    {ms.map((m) => {
                      const color = m.status === "cumplido" ? "var(--success)" : isPlanOverdue(m, now) ? "var(--danger)" : "var(--text-2)";
                      return (
                        <span
                          key={m.id} title={`${m.name} · ${fmtDate(m.dueDate!)}`}
                          style={{ position: "absolute", left: X(m.dueDate!) + dayW / 2 - 6, top: 30, width: 12, textAlign: "center", fontSize: 11, lineHeight: "12px", color, opacity: dim ? 0.55 : 1, cursor: "default" }}
                        >◆</span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
        <GanttHScrollbar scroller={scroller} zoomKey={dayW} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
        Rombo rojo = hito vencido sin cumplir · verde = cumplido · borde rojo = proyecto con el fin previsto vencido · pausados y finalizados se ven atenuados. Clic en un proyecto para abrirlo.
      </div>
    </>
  );
}

/* ====================================================================
 * Ocupación del equipo
 * ==================================================================== */
export interface PersonWorkload {
  user: User;
  projectIds: string[];
  openTasks: number;
  unestimated: number;
  remainingHours: number;
  capacity4w: number;
  due4wHours: number;
  occupancyPct: number;
  /** Primer día en que, a jornada completa, ya no le queda trabajo asignado */
  freeFrom: string;
  status: "sobrecargado" | "al_limite" | "ok" | "se_libera" | "sin_tareas";
}

const LOAD_ORDER: Record<PersonWorkload["status"], number> = { sobrecargado: 0, al_limite: 1, se_libera: 2, sin_tareas: 3, ok: 4 };
const r1 = (n: number) => Math.round(n * 10) / 10;

export function teamWorkload(env: WorkEnv, work: WorkData, projectIds: Set<string>, now = today()): PersonWorkload[] {
  const active = new Set(env.projects.filter((p) => projectIds.has(p.id) && p.status === "activo").map((p) => p.id));
  const horizon = addDays(now, 27);
  const out: PersonWorkload[] = [];
  for (const u of env.users.filter((x) => x.active)) {
    const open = work.tasks.filter((t) => t.assigneeId === u.id && t.status !== "hecha" && !t.archived && projectIds.has(t.projectId));
    const pids = new Set<string>(open.map((t) => t.projectId).filter((id) => active.has(id)));
    for (const p of env.projects) if (active.has(p.id) && p.memberIds.includes(u.id)) pids.add(p.id);
    for (const a of work.assignments) if (a.userId === u.id && active.has(a.projectId)) pids.add(a.projectId);
    if (pids.size === 0 && open.length === 0) continue;

    const away = (env.absences ?? []).filter((a) => a.userId === u.id);
    const workday = (d: string) => u.workDays.includes(isoDow(d)) && !away.some((a) => d >= a.dateFrom && d <= a.dateTo);
    const daily = (u.weeklyHours || 40) / Math.max(1, u.workDays.length);

    let days4w = 0;
    for (let d = now; d <= horizon; d = addDays(d, 1)) if (workday(d)) days4w++;
    const capacity4w = r1(days4w * daily);
    const remainingHours = r1(open.reduce((s, t) => s + (t.estimateHours ?? 0), 0));
    const due4wHours = r1(open.filter((t) => !t.dueDate || t.dueDate <= horizon).reduce((s, t) => s + (t.estimateHours ?? 0), 0));
    const occupancyPct = capacity4w > 0 ? Math.round((due4wHours / capacity4w) * 100) : due4wHours > 0 ? 999 : 0;

    let freeFrom = now;
    if (remainingHours > 0 && daily > 0) {
      let left = remainingHours;
      let d = now;
      for (let i = 0; i < 730 && left > 0; i++, d = addDays(d, 1)) if (workday(d)) left -= daily;
      freeFrom = d;
    }

    const status: PersonWorkload["status"] =
      occupancyPct > 100 ? "sobrecargado" : occupancyPct >= 85 ? "al_limite" : open.length === 0 ? "sin_tareas" : freeFrom <= addDays(now, 14) ? "se_libera" : "ok";
    out.push({
      user: u, projectIds: [...pids], openTasks: open.length, unestimated: open.filter((t) => t.estimateHours == null).length,
      remainingHours, capacity4w, due4wHours, occupancyPct, freeFrom, status,
    });
  }
  return out.sort((a, b) => LOAD_ORDER[a.status] - LOAD_ORDER[b.status] || b.occupancyPct - a.occupancyPct);
}

const LOAD_PILL: Record<PersonWorkload["status"], { cls: string; label: string }> = {
  sobrecargado: { cls: "late", label: "Sobrecargado" },
  al_limite: { cls: "soon", label: "Al límite" },
  se_libera: { cls: "soon", label: "Se libera pronto" },
  sin_tareas: { cls: "", label: "Sin tareas" },
  ok: { cls: "ok", label: "OK" },
};

const loadColor = (pct: number) => (pct > 100 ? "var(--danger)" : pct >= 85 ? "var(--warning)" : pct < 50 ? "var(--text-3)" : "var(--accent)");

export function TeamWorkload({ projectIds }: { projectIds: Set<string> }) {
  const env = useEnv();
  const work = useWork();
  const now = today();
  const rows = useMemo(() => teamWorkload(env, work, projectIds, now), [env, work, projectIds, now]);

  if (rows.length === 0) return <div className="card card-pad"><Empty icon="users" text="No hay personas asignadas a proyectos activos" /></div>;

  const over = rows.filter((r) => r.status === "sobrecargado").length;
  const limit = rows.filter((r) => r.status === "al_limite").length;
  const freeing = rows.filter((r) => r.status === "se_libera" || r.status === "sin_tareas").length;
  const withCap = rows.filter((r) => r.capacity4w > 0);
  const avg = withCap.length ? Math.round(withCap.reduce((s, r) => s + Math.min(r.occupancyPct, 200), 0) / withCap.length) : 0;
  const nameOf = (id: string) => env.projects.find((p) => p.id === id)?.name ?? "";

  return (
    <>
      <div className="kpi-grid">
        <KpiCard icon="alert" label="Sobrecargados" value={over} tone={over ? "bad" : "ok"} hint="más del 100% en 4 semanas" />
        <KpiCard icon="flame" label="Al límite" value={limit} hint="entre 85% y 100%" />
        <KpiCard icon="calendar-days" label="Se quedan sin tareas en 2 semanas" value={freeing} hint="hay que asignarles trabajo" />
        <KpiCard icon="users" label="Ocupación media" value={`${avg}%`} hint={`${rows.length} personas`} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Persona</th><th>Proyectos</th><th>Ocupación próximas 4 semanas</th><th>Horas pendientes</th><th>Se queda sin tareas</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user.id}>
                <td><Person user={r.user} size={18} /></td>
                <td title={r.projectIds.map(nameOf).join("\n")}>{r.projectIds.length}</td>
                <td style={{ minWidth: 230 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 120, height: 8, borderRadius: 99, background: "var(--border)", overflow: "hidden", flexShrink: 0 }}>
                      <span style={{ display: "block", height: "100%", width: `${Math.min(100, r.occupancyPct)}%`, background: loadColor(r.occupancyPct), borderRadius: 99 }} />
                    </span>
                    <span style={{ fontSize: 12.5, whiteSpace: "nowrap", color: r.occupancyPct > 100 ? "var(--danger)" : undefined, fontWeight: r.occupancyPct > 100 ? 650 : undefined }}>
                      {r.occupancyPct > 999 ? ">999" : r.occupancyPct}% · {r.due4wHours} h de {r.capacity4w} h
                    </span>
                  </div>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.remainingHours} h
                  {r.unestimated > 0 && <span style={{ color: "var(--warning)", fontSize: 12 }}> · {r.unestimated} sin estimar</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{r.freeFrom === now ? "Hoy" : fmtDate(r.freeFrom)}</td>
                <td><span className={`pw-pill ${LOAD_PILL[r.status].cls}`}>{LOAD_PILL[r.status].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>
        Ocupación = horas estimadas de lo que vence en las próximas 4 semanas (más lo vencido y lo sin fecha) sobre la capacidad de la persona (jornada × días laborables, descontando ausencias aprobadas). “Se queda sin tareas” proyecta su trabajo pendiente a jornada completa. Las tareas sin estimar no suman horas.
      </div>
    </>
  );
}
