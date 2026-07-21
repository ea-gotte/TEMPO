import React, { useMemo, useRef, useState } from "react";
import { useStore, overlaps } from "../store";
import type { TimeEntry } from "../types";
import { addDays, clamp, dayLabel, fmtDur, isoDate, minToHM, monthLabel, parseISO, today, uid, weekStart } from "../utils";
import { EntryModal } from "../components/EntryModal";
import { ContextMenu, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

const H0 = 0; // primera hora visible (día completo)
const H1 = 24; // última hora
const PX_H = 44; // px por hora
const SCROLL_TO = 7; // hora a la que se posiciona el scroll al abrir

type View = "dia" | "semana" | "mes" | "timeline";

/** Husos horarios adicionales disponibles para la vista de calendario */
const TZ_OPTIONS = [
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)", short: "ARG" },
  { id: "Europe/Madrid", label: "España (Madrid)", short: "ESP" },
  { id: "America/Santiago", label: "Chile (Santiago)", short: "CHI" },
  { id: "America/Mexico_City", label: "México (CDMX)", short: "MEX" },
  { id: "America/Bogota", label: "Colombia (Bogotá)", short: "COL" },
  { id: "America/New_York", label: "EE. UU. (Nueva York)", short: "NY" },
  { id: "UTC", label: "UTC", short: "UTC" },
];

/** Offset (min) de una zona horaria respecto de UTC en un instante dado */
function tzOffsetMin(tz: string, at: Date): number {
  const loc = new Date(at.toLocaleString("en-US", { timeZone: tz }));
  return Math.round((loc.getTime() - at.getTime()) / 60000);
}

interface Drag {
  entryId: string;
  mode: "move" | "resize";
  startY: number;
  startX: number;
  colWidth: number;
  orig: TimeEntry;
  dMin: number;
  dDay: number;
}

export function CalendarPage() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [view, setView] = useState<View>("semana");
  const [anchor, setAnchor] = useState(today());
  const [modal, setModal] = useState<Partial<TimeEntry> | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: TimeEntry } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Al abrir la vista de día/semana, posicionar el scroll en la mañana
  React.useEffect(() => {
    if (view === "dia" || view === "semana") {
      scrollRef.current?.scrollTo({ top: SCROLL_TO * PX_H });
    }
  }, [view]);

  const me = state.currentUserId;
  const meUser = state.users.find((u) => u.id === me)!;

  // Configuración de husos guardada por usuario
  const baseTz = meUser.calendarTz ?? state.company.timezone;
  const tz2 = meUser.calendarTz2 ?? "";

  function savePref(field: "calendarTz" | "calendarTz2", value: string) {
    dispatch({
      type: "patch",
      patch: { users: state.users.map((u) => (u.id === me ? { ...u, [field]: value } : u)) },
    });
  }

  // Diferencia en minutos entre el huso adicional y el huso base elegido
  const tzDiff = useMemo(() => {
    if (!tz2) return 0;
    const now = parseISO(anchor);
    return tzOffsetMin(tz2, now) - tzOffsetMin(baseTz, now);
  }, [tz2, anchor, baseTz]);
  const tz2Short = TZ_OPTIONS.find((t) => t.id === tz2)?.short ?? "";
  const baseShort = TZ_OPTIONS.find((t) => t.id === baseTz)?.short ?? "LOC";
  const ws = weekStart(anchor);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);
  const visibleDays = view === "dia" ? [anchor] : weekDays;

  const entries = useMemo(() => state.entries.filter((e) => e.userId === me), [state.entries, me]);

  function shift(n: number) {
    if (view === "mes") {
      const d = parseISO(anchor);
      d.setMonth(d.getMonth() + n);
      setAnchor(isoDate(d));
    } else if (view === "dia") setAnchor(addDays(anchor, n));
    else setAnchor(addDays(anchor, n * 7));
  }

  /* ---------- drag & drop ---------- */
  function onBlockDown(e: React.MouseEvent, entry: TimeEntry, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    const colWidth = (gridRef.current?.querySelector(".cal-col") as HTMLElement)?.offsetWidth ?? 120;
    setDrag({ entryId: entry.id, mode, startY: e.clientY, startX: e.clientX, colWidth, orig: entry, dMin: 0, dDay: 0 });
  }

  function onMove(e: React.MouseEvent) {
    if (!drag) return;
    const dMin = Math.round(((e.clientY - drag.startY) / PX_H) * 60 / 15) * 15;
    const dDay = view === "dia" ? 0 : Math.round((e.clientX - drag.startX) / drag.colWidth);
    setDrag({ ...drag, dMin, dDay });
  }

  function onUp() {
    if (!drag) return;
    const { orig, dMin, dDay, mode } = drag;
    let next: TimeEntry;
    if (mode === "move") {
      const dur = orig.end - orig.start;
      const start = clamp(orig.start + dMin, 0, 24 * 60 - dur);
      const dayIdx = clamp(weekDays.indexOf(orig.date) + dDay, 0, 6);
      next = { ...orig, start, end: start + dur, date: view === "dia" ? orig.date : weekDays[dayIdx] };
    } else {
      next = { ...orig, end: clamp(orig.end + dMin, orig.start + 15, 24 * 60) };
    }
    if (next.start !== orig.start || next.end !== orig.end || next.date !== orig.date) {
      dispatch({ type: "updateEntry", entry: next });
    }
    setDrag(null);
  }

  function dragged(e: TimeEntry): TimeEntry {
    if (!drag || drag.entryId !== e.id) return e;
    const { dMin, dDay, mode, orig } = drag;
    if (mode === "move") {
      const dur = orig.end - orig.start;
      const start = clamp(orig.start + dMin, 0, 24 * 60 - dur);
      const dayIdx = clamp(weekDays.indexOf(orig.date) + dDay, 0, 6);
      return { ...orig, start, end: start + dur, date: view === "dia" ? orig.date : weekDays[dayIdx] };
    }
    return { ...orig, end: clamp(orig.end + dMin, orig.start + 15, 24 * 60) };
  }

  function duplicateEntry(e: TimeEntry) {
    const dur = e.end - e.start;
    const start = Math.min(e.end, 24 * 60 - dur);
    dispatch({ type: "addEntry", entry: { ...e, id: uid(), start, end: start + dur } });
    toast("Registro duplicado.");
  }

  function onEmptyClick(day: string, ev: React.MouseEvent) {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const min = H0 * 60 + Math.floor(((ev.clientY - rect.top) / PX_H) * 60 / 30) * 30;
    setModal({ date: day, start: min, end: min + 60 });
  }

  const totalWeek = entries
    .filter((e) => weekDays.includes(e.date))
    .reduce((a, e) => a + (e.end - e.start), 0);

  /* ---------- mes ---------- */
  const monthCells = useMemo(() => {
    const d = parseISO(anchor);
    d.setDate(1);
    const first = weekStart(isoDate(d));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [anchor]);

  return (
    <>
      <div className="page-head">
        <h1>Calendario</h1>
        <span className="spacer" />
        <div className="tabs" role="tablist">
          {(["dia", "semana", "mes", "timeline"] as View[]).map((v) => (
            <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)} role="tab" aria-selected={view === v}>
              {v === "dia" ? "Día" : v === "semana" ? "Semana" : v === "mes" ? "Mes" : "Timeline"}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => shift(-1)} aria-label="Anterior"><Icon name="arrow-left" size={14} /></button>
        <button className="btn btn-secondary btn-sm" onClick={() => setAnchor(today())}>Hoy</button>
        <button className="btn btn-secondary btn-sm" onClick={() => shift(1)} aria-label="Siguiente"><Icon name="arrow-right" size={14} /></button>
        {(view === "dia" || view === "semana") && (
          <>
            <select
              className="select"
              style={{ width: "auto" }}
              value={baseTz}
              onChange={(e) => savePref("calendarTz", e.target.value)}
              aria-label="Huso horario base"
              title="Huso horario base del calendario (se guarda en tu perfil)"
            >
              {TZ_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  Base: {t.label}{t.id === state.company.timezone ? " (empresa)" : ""}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ width: "auto" }}
              value={tz2}
              onChange={(e) => savePref("calendarTz2", e.target.value)}
              aria-label="Huso horario adicional"
              title="Segundo huso horario opcional (se guarda en tu perfil)"
            >
              <option value="">Sin huso adicional</option>
              {TZ_OPTIONS.filter((t) => t.id !== baseTz).map((t) => (
                <option key={t.id} value={t.id}>+ {t.label}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <p className="page-sub">
        {view === "mes"
          ? monthLabel(anchor)
          : view === "dia"
            ? dayLabel(anchor, { weekday: "long", day: "numeric", month: "long" })
            : `Semana del ${dayLabel(ws)} · total ${fmtDur(totalWeek)}`}
        {" · "}Arrastrá para mover, borde inferior para redimensionar, clic en un hueco para crear.
      </p>

      {(view === "semana" || view === "dia") && (
        <div ref={scrollRef} style={{ maxHeight: "70vh", overflowY: "auto", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
        <div
          className="cal-wrap"
          ref={gridRef}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          style={{
            cursor: drag ? (drag.mode === "move" ? "grabbing" : "ns-resize") : undefined,
            gridTemplateColumns: tz2 ? "52px 52px 1fr" : "52px 1fr",
            border: "none",
            overflow: "visible",
          }}
        >
          <div>
            <div className="cal-tz-head" style={{ color: "var(--text-2)" }}>
              {baseShort}
            </div>
            {Array.from({ length: H1 - H0 }, (_, i) => (
              <div className="cal-hour-label" key={i}>{`${H0 + i}:00`}</div>
            ))}
          </div>
          {tz2 && (
            <div style={{ borderLeft: "1px dashed var(--border)" }}>
              <div className="cal-tz-head" style={{ color: "var(--accent)" }}>
                {tz2Short}
              </div>
              {Array.from({ length: H1 - H0 }, (_, i) => {
                const m = (((H0 + i) * 60 + tzDiff) % (24 * 60) + 24 * 60) % (24 * 60);
                return (
                  <div className="cal-hour-label" key={i} style={{ color: "var(--accent)" }}>
                    {minToHM(m).replace(/^0/, "")}
                  </div>
                );
              })}
            </div>
          )}
          <div className="cal-days" style={view === "dia" ? { gridTemplateColumns: "1fr" } : undefined}>
            {visibleDays.map((day) => {
              const dayMin = entries.filter((e) => e.date === day).reduce((acc, e) => acc + (e.end - e.start), 0);
              return (
                <div key={`h-${day}`} className={`cal-day-head ${day === today() ? "today" : ""}`}>
                  {dayLabel(day, { weekday: "short" })}
                  <span className="num">{parseISO(day).getDate()}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", marginTop: 2, display: "block" }}>
                    {fmtDur(dayMin)}
                  </span>
                </div>
              );
            })}
            {visibleDays.map((day) => {
              const dayEntries = entries.filter((e) => e.date === day || (drag && dragged(state.entries.find((x) => x.id === drag.entryId)!).date === day && drag.entryId === e.id));
              return (
                <div key={day} className="cal-col" style={{ gridRow: "2" }} onClick={(ev) => !drag && onEmptyClick(day, ev)}>
                  {Array.from({ length: H1 - H0 }, (_, i) => (
                    <div className="cal-cell" key={i} />
                  ))}
                  {dayEntries.map((raw) => {
                    const e = dragged(raw);
                    if (e.date !== day) return null;
                    const top = ((e.start - H0 * 60) / 60) * PX_H;
                    const height = Math.max(18, ((e.end - e.start) / 60) * PX_H - 2);
                    const p = state.projects.find((x) => x.id === e.projectId);
                    const conf = overlaps(state.entries, e).length > 0;
                    return (
                      <div
                        key={raw.id}
                        className={`cal-block ${conf ? "overlap" : ""}`}
                        style={{ top, height, background: p?.color ?? "var(--accent)" }}
                        onMouseDown={(ev) => onBlockDown(ev, raw, "move")}
                        onDoubleClick={(ev) => {
                          ev.stopPropagation();
                          setModal(raw);
                        }}
                        onClick={(ev) => ev.stopPropagation()}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setCtx({ x: ev.clientX, y: ev.clientY, entry: raw });
                        }}
                        title={`${e.description} · ${minToHM(e.start)}–${minToHM(e.end)}${tz2 ? ` (${tz2Short}: ${minToHM((((e.start + tzDiff) % 1440) + 1440) % 1440)}–${minToHM((((e.end + tzDiff) % 1440) + 1440) % 1440)})` : ""}`}
                      >
                        {e.description || p?.name || "Registro"}
                        <span className="t"> {minToHM(e.start)}–{minToHM(e.end)}</span>
                        <span className="rsz" onMouseDown={(ev) => onBlockDown(ev, raw, "resize")} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {view === "mes" && (
        <div className="month-grid">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} style={{ background: "var(--surface)", padding: "8px", fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", textAlign: "center" }}>
              {d}
            </div>
          ))}
          {monthCells.map((day) => {
            const inMonth = parseISO(day).getMonth() === parseISO(anchor).getMonth();
            const dayEntries = entries.filter((e) => e.date === day);
            const total = dayEntries.reduce((a, e) => a + (e.end - e.start), 0);
            return (
              <div
                key={day}
                className={`month-cell ${inMonth ? "" : "dim"}`}
                onClick={() => {
                  setAnchor(day);
                  setView("dia");
                }}
                style={{ cursor: "pointer" }}
              >
                <span className={`num ${day === today() ? "today" : ""}`}>{parseISO(day).getDate()}</span>
                {total > 0 && (
                  <span className="month-evt" style={{ background: "var(--accent-soft)", color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="timer" size={10} /> {fmtDur(total)}
                  </span>
                )}
                {dayEntries.slice(0, 2).map((e) => {
                  const p = state.projects.find((x) => x.id === e.projectId);
                  return (
                    <span key={e.id} className="month-evt" style={{ background: (p?.color ?? "#888") + "22", color: p?.color }}>
                      {e.description || p?.name}
                    </span>
                  );
                })}
                {dayEntries.length > 3 && <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>+{dayEntries.length - 2} más</span>}
              </div>
            );
          })}
        </div>
      )}

      {view === "timeline" && (
        <div className="card card-pad">
          <div className="card-title">Timeline semanal — {dayLabel(ws)} a {dayLabel(addDays(ws, 6))}</div>
          {weekDays.map((day) => {
            const dayEntries = entries.filter((e) => e.date === day);
            return (
              <div className="tl-row" key={day}>
                <span style={{ fontSize: 12.5, fontWeight: 600, textTransform: "capitalize" }}>
                  {dayLabel(day, { weekday: "long", day: "numeric" })}
                </span>
                <div className="tl-track">
                  {dayEntries.map((e) => {
                    const p = state.projects.find((x) => x.id === e.projectId);
                    const left = ((e.start - H0 * 60) / ((H1 - H0) * 60)) * 100;
                    const width = ((e.end - e.start) / ((H1 - H0) * 60)) * 100;
                    return (
                      <span
                        key={e.id}
                        className="tl-seg"
                        style={{ left: `${clamp(left, 0, 100)}%`, width: `${clamp(width, 1, 100)}%`, background: p?.color ?? "var(--accent)" }}
                        title={`${e.description} · ${minToHM(e.start)}–${minToHM(e.end)}`}
                        onDoubleClick={() => setModal(e)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="legend">
            {state.projects.filter((p) => entries.some((e) => weekDays.includes(e.date) && e.projectId === p.id)).map((p) => (
              <span key={p.id}>
                <span className="sw" style={{ background: p.color }} />
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {modal && <EntryModal initial={modal} onClose={() => setModal(null)} />}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: "Editar", ico: "pencil", onClick: () => setModal(ctx.entry) },
            { label: "Duplicar", ico: "copy", onClick: () => duplicateEntry(ctx.entry) },
            {
              label: "Eliminar", ico: "trash", danger: true,
              onClick: () => {
                dispatch({ type: "deleteEntry", id: ctx.entry.id });
                toast("Registro eliminado.");
              },
            },
          ]}
        />
      )}
    </>
  );
}
