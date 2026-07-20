import React, { createContext, useContext, useState, useCallback } from "react";
import { hashHue, initials } from "../utils";

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
          <button className="iconbtn" onClick={onClose} aria-label="Cerrar">✕</button>
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

export function Empty({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--text-2)" }}>{text}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ---------- Menú contextual ---------- */
export interface CtxItem {
  label: string;
  ico?: string;
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
          {it.ico && <span style={{ width: 18, textAlign: "center" }}>{it.ico}</span>}
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
