import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import type { CorpEvent, CorpEventType } from "../types";
import { addDays, fmtDate, isoDate, monthLabel, parseISO, rangeDates, today, uid, weekStart } from "../utils";
import { Modal, useToast } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";

/** Categorías unificadas que se muestran en el calendario corporativo */
const EVENT_STYLES: Record<string, { bg: string; icon: IconName }> = {
  "Feriado / No laborable": { bg: "#f0446c", icon: "party" },
  "Cumpleaños": { bg: "#ec4899", icon: "cake" },
  "Capacitación": { bg: "#0ea5e9", icon: "graduation" },
  "Ausencia": { bg: "#12b5a5", icon: "sun" },
};

const TYPES = Object.keys(EVENT_STYLES);

/** Mapea el tipo guardado a la categoría unificada; null = no se muestra */
function unifiedType(t: string): string | null {
  if (t === "Feriado nacional" || t === "Feriado provincial" || t === "Día no laborable") return "Feriado / No laborable";
  if (t === "Capacitación") return "Capacitación";
  if (t === "Cumpleaños") return "Cumpleaños";
  // Reunión, Horario especial, Home office y Cierre de empresa ya no se muestran
  return null;
}

interface DayItem {
  key: string;
  label: string;
  type: string;
}

export function CorpCalendar() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [anchor, setAnchor] = useState(today());
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const isAdmin = state.users.find((u) => u.id === state.currentUserId)?.role === "admin";

  const monthCells = useMemo(() => {
    const d = parseISO(anchor);
    d.setDate(1);
    const first = weekStart(isoDate(d));
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [anchor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const push = (date: string, item: DayItem) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(item);
    };
    for (const e of state.corpEvents) {
      const type = unifiedType(e.type);
      if (type) push(e.date, { key: e.id, label: e.title, type });
    }
    // Vacaciones, licencias y toda ausencia aprobada se unifican en "Ausencia"
    for (const a of state.absences) {
      if (a.status !== "Aprobado") continue;
      const u = state.users.find((x) => x.id === a.userId);
      for (const d of rangeDates(a.dateFrom, a.dateTo)) {
        push(d, { key: `${a.id}-${d}`, label: `${u?.name.split(" ")[0] ?? "?"}: ${a.type}`, type: "Ausencia" });
      }
    }
    const year = anchor.slice(0, 4);
    for (const u of state.users) {
      push(`${year}-${u.birthday.slice(5)}`, { key: `bd-${u.id}`, label: `${u.name}`, type: "Cumpleaños" });
    }
    return map;
  }, [state.corpEvents, state.absences, state.users, anchor]);

  function shiftMonth(n: number) {
    const d = parseISO(anchor);
    d.setMonth(d.getMonth() + n);
    setAnchor(isoDate(d));
  }

  const visible = (t: string) => filters.size === 0 || filters.has(t);

  return (
    <>
      <div className="page-head">
        <h1>Calendario corporativo</h1>
        <span className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={() => shiftMonth(-1)} aria-label="Mes anterior"><Icon name="arrow-left" size={14} /></button>
        <strong style={{ textTransform: "capitalize", minWidth: 140, textAlign: "center" }}>{monthLabel(anchor)}</strong>
        <button className="btn btn-secondary btn-sm" onClick={() => shiftMonth(1)} aria-label="Mes siguiente"><Icon name="arrow-right" size={14} /></button>
        {isAdmin && <button className="btn btn-primary" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> Evento</button>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }} className="no-print">
        {TYPES.map((t) => {
          const active = filters.has(t);
          const color = EVENT_STYLES[t].bg;
          return (
            <button
              key={t}
              className="chip"
              style={{
                borderColor: color,
                background: active ? color : color + "1a",
                color: active ? "#fff" : color,
              }}
              onClick={() =>
                setFilters((f) => {
                  const n = new Set(f);
                  n.has(t) ? n.delete(t) : n.add(t);
                  return n;
                })
              }
            >
              {t}
            </button>
          );
        })}
        {filters.size > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters(new Set())}>Limpiar filtros</button>
        )}
      </div>

      <div className="month-grid">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} style={{ background: "var(--surface)", padding: 8, fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", textAlign: "center" }}>
            {d}
          </div>
        ))}
        {monthCells.map((day) => {
          const inMonth = parseISO(day).getMonth() === parseISO(anchor).getMonth();
          const items = (itemsByDay.get(day) ?? []).filter((i) => visible(i.type));
          return (
            <div key={day} className={`month-cell ${inMonth ? "" : "dim"}`}>
              <span className={`num ${day === today() ? "today" : ""}`}>{parseISO(day).getDate()}</span>
              {items.slice(0, 3).map((i) => {
                const st = EVENT_STYLES[i.type] ?? { bg: "#888", icon: "map-pin" as IconName };
                return (
                  <span key={i.key} className="month-evt" style={{ background: st.bg + "26", color: st.bg, display: "inline-flex", alignItems: "center", gap: 4 }} title={`${i.type}: ${i.label}`}>
                    <Icon name={st.icon} size={10} /> {i.label}
                  </span>
                );
              })}
              {items.length > 3 && <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>+{items.length - 3} más</span>}
            </div>
          );
        })}
      </div>

      {showNew && <NewEvent onClose={() => setShowNew(false)} />}
    </>
  );
}

function NewEvent({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [type, setType] = useState<CorpEventType>("Feriado nacional");
  const [title, setTitle] = useState("");

  function save() {
    if (!title.trim()) return;
    const evt: CorpEvent = { id: uid(), date, type, title: title.trim() };
    dispatch({ type: "patch", patch: { corpEvents: [...state.corpEvents, evt] } });
    dispatch({ type: "audit", action: "Evento corporativo creado", detail: `${evt.title} (${evt.date})` });
    toast("Evento agregado al calendario.");
    onClose();
  }

  return (
    <Modal
      title="Nuevo evento corporativo"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>Crear</button>
        </>
      }
    >
      <div className="field">
        <label>Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Fecha</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as CorpEventType)}>
            {(["Feriado nacional", "Feriado provincial", "Día no laborable", "Capacitación"] as CorpEventType[]).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
