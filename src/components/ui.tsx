import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { hashHue, initials, normText } from "../utils";
import { Icon, type IconName } from "./Icon";

/** Diálogos abiertos, del más viejo al más nuevo: el teclado lo atiende el último */
const openModals: object[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Quién tenía el foco antes de abrir: se anota al crear el diálogo, antes de que un autoFocus de adentro se lo lleve
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  const wanted = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const token = {};
    openModals.push(token);
    const el = ref.current;
    // Si nada de adentro pidió el foco (autoFocus), lo toma el diálogo. Se recuerda quién lo pidió
    // porque en desarrollo React monta el efecto dos veces y entre una y otra el foco vuelve afuera.
    if (el) {
      if (el.contains(document.activeElement)) wanted.current = document.activeElement as HTMLElement;
      else if (wanted.current && el.contains(wanted.current)) wanted.current.focus();
      else el.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      // Con un diálogo sobre otro, solo responde el de arriba
      if (openModals[openModals.length - 1] !== token || !el) return;
      if (e.key === "Escape") {
        // Un control de adentro (buscador, desplegable) puede haberlo usado ya
        if (e.defaultPrevented) return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Tab no sale del diálogo: da la vuelta entre el primer y el último control
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !el.contains(active) || active === el;
      if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = openModals.indexOf(token);
      if (i >= 0) openModals.splice(i, 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, online, size = 30 }: { name: string; online?: boolean; size?: number }) {
  const hue = hashHue(name);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 55% 48%)` }}
      title={name}
    >
      {initials(name)}
      {online !== undefined && <span className={`status ${online ? "on" : ""}`} />}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color, width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />;
}

/**
 * Campo de fecha con doble entrada: texto manual en dd/mm/aaaa y selector de calendario.
 * `value`/`onChange` trabajan en ISO (YYYY-MM-DD).
 */
export function DateField({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
}) {
  const isoToText = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
  const [text, setText] = useState(isoToText(value));
  const dateRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setText(isoToText(value)), [value]);

  function commit(raw: string) {
    const m = raw.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (!m) {
      setText(isoToText(value)); // revertir si no es válido
      return;
    }
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = new Date(iso + "T00:00:00");
    if (isNaN(parsed.getTime())) {
      setText(isoToText(value));
      return;
    }
    onChange(iso);
  }

  function openPicker() {
    const el = dateRef.current;
    if (!el) return;
    // showPicker() abre el calendario nativo; fallback a focus/click
    if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker!();
    } else {
      el.focus();
      el.click();
    }
  }

  return (
    <div style={{ position: "relative", display: "flex", gap: 6 }}>
      <input
        className="input"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
        aria-label="Fecha (dd/mm/aaaa)"
      />
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: "0 10px", flexShrink: 0 }}
        onClick={openPicker}
        title="Elegir en el calendario"
        aria-label="Abrir calendario"
      >
        <Icon name="calendar" size={16} />
      </button>
      {/* input nativo oculto que provee el calendario */}
      <input
        ref={dateRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, right: 8, bottom: 0, pointerEvents: "none" }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Selector de proyecto con buscador: en vez de un <select> nativo (incómodo
 * con listas largas de proyectos), es un campo de texto que filtra la lista
 * a medida que se escribe.
 */
export function ProjectSelect({
  projects,
  value,
  onChange,
  placeholder = "Buscar proyecto…",
  favoriteIds,
}: {
  projects: { id: string; name: string; color?: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Proyectos favoritos de la persona: van primero en la lista, con una estrella */
  favoriteIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = projects.find((p) => p.id === value);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Ordenado alfabéticamente acá (no en cada lugar que arma la lista de
  // proyectos) para que este selector quede siempre ordenado sin importar
  // el orden en el que venga la prop.
  const sorted = useMemo(
    () => [...projects].sort((a, b) =>
      Number(favoriteIds?.has(b.id) ?? false) - Number(favoriteIds?.has(a.id) ?? false) || a.name.localeCompare(b.name)),
    [projects, favoriteIds],
  );
  const filtered = query.trim() ? sorted.filter((p) => normText(p.name).includes(normText(query))) : sorted;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className="input"
        value={open ? query : selected?.name ?? ""}
        placeholder={selected ? undefined : placeholder}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Con la lista abierta, Escape solo la cierra (no el diálogo que la contiene)
          if (e.key === "Escape") { if (open) e.preventDefault(); setOpen(false); setQuery(""); }
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            onChange(filtered[0].id);
            setOpen(false);
            setQuery("");
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            maxHeight: 220, overflowY: "auto", background: "var(--surface)",
            border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-md)",
          }}
        >
          {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--text-3)" }}>Sin resultados.</div>}
          {filtered.map((p) => (
            <div
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p.id);
                setOpen(false);
                setQuery("");
              }}
              style={{
                padding: "7px 10px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                background: p.id === value ? "var(--accent-soft)" : undefined,
              }}
            >
              {p.color && <span className="swatch" style={{ background: p.color, width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }} />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
              {favoriteIds?.has(p.id) && <Icon name="star" size={12} style={{ color: "var(--warning)", fill: "currentColor", flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      className={`switch ${on ? "on" : ""}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label || "Alternar"}
    />
  );
}

export function Empty({ icon, text, sub }: { icon: IconName; text: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="big" style={{ color: "var(--text-3)" }}><Icon name={icon} size={34} strokeWidth={1.6} /></div>
      <div style={{ fontWeight: 600, color: "var(--text-2)" }}>{text}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ---------- Menú contextual ---------- */
export interface CtxItem {
  label: string;
  ico?: IconName;
  danger?: boolean;
  onClick: () => void;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  React.useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 190);
  const top = Math.min(y, window.innerHeight - items.length * 36 - 16);
  return (
    <div className="ctx-menu" style={{ left, top }} role="menu" onClick={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          className={it.danger ? "danger" : ""}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          {it.ico && <span style={{ width: 18, display: "grid", placeItems: "center" }}><Icon name={it.ico} size={15} /></span>}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Gráfico de barras horizontal ---------- */
export function HBarChart({
  data,
  fmt,
  valWidth,
}: {
  data: { name: string; value: number; color: string }[];
  fmt: (v: number) => string;
  /** Ancho de la columna del valor, para textos más largos que el estándar (60px) */
  valWidth?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbar">
      {data.map((d) => (
        <div className="row" key={d.name} style={valWidth ? { gridTemplateColumns: `130px 1fr ${valWidth}px` } : undefined}>
          <span className="name" title={d.name}>{d.name}</span>
          <div className="track">
            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", background: d.color, borderRadius: 99 }} />
          </div>
          <span className="val">{fmt(d.value)}</span>
        </div>
      ))}
      {data.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>Sin datos en el período.</div>}
    </div>
  );
}

/* ---------- Donut SVG ---------- */
export function Donut({ data, size = 140 }: { data: { name: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribución">
      {data.map((d) => {
        const frac = d.value / total;
        const dash = `${frac * c} ${c}`;
        const off = -acc * c;
        acc += frac;
        return (
          <circle
            key={d.name}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={16}
            strokeDasharray={dash}
            strokeDashoffset={off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill="var(--text)">
        {Math.round(total / 60)} h
      </text>
    </svg>
  );
}
