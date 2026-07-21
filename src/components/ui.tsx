import React, { createContext, useContext, useState, useCallback } from "react";
import { hashHue, initials } from "../utils";
import { Icon, type IconName } from "./Icon";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
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
}: {
  data: { name: string; value: number; color: string }[];
  fmt: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbar">
      {data.map((d) => (
        <div className="row" key={d.name}>
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
