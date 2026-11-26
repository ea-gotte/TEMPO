import React from "react";
import type { User } from "../types";
import { fmtDate, today } from "../utils";
import { Avatar, DateField } from "../components/ui";
import { Icon } from "../components/Icon";
import { planInfo, priorityInfo, statusInfo } from "./constants";
import { isPlanOverdue, isTaskOverdue } from "./logic";
import type { PlanStatus, Task, TaskPriority, TaskStatus } from "./types";
import "./projects.css";

/** Persona con avatar; "Sin asignar" si no hay. */
export function Person({ user, size = 20 }: { user?: User | null; size?: number }) {
  if (!user) return <span className="pw-person" style={{ color: "var(--text-3)" }}>Sin asignar</span>;
  return (
    <span className="pw-person" title={user.name}>
      <Avatar name={user.name} size={size} />
      {user.name}
    </span>
  );
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const s = statusInfo(status);
  return (
    <span className="pw-pill">
      <span className="pw-dotc" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function PlanPill({ status }: { status: PlanStatus }) {
  const s = planInfo(status);
  return (
    <span className="pw-pill">
      <span className="pw-dotc" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const p = priorityInfo(priority);
  return (
    <span className="pw-pill" title={`Prioridad ${p.label.toLowerCase()}`}>
      <Icon name="flame" size={11} style={{ color: p.color }} />
      {p.label}
    </span>
  );
}

/** Fecha límite con color: roja si está vencida, ámbar si vence en 3 días o menos. */
export function DuePill({ date, done, label }: { date: string | null; done: boolean; label?: string }) {
  if (!date) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>Sin fecha</span>;
  const now = today();
  const late = !done && date < now;
  const diff = Math.round((new Date(date + "T00:00:00").getTime() - new Date(now + "T00:00:00").getTime()) / 86400000);
  const soon = !done && !late && diff <= 3;
  return (
    <span className={`pw-pill ${late ? "late" : soon ? "soon" : ""}`} title={late ? "Vencida" : soon ? "Vence pronto" : undefined}>
      {late && <Icon name="alert" size={11} />}
      {label ? `${label} ` : ""}
      {fmtDate(date).slice(0, 5)}
    </span>
  );
}

export const taskDue = (t: Task) => <DuePill date={t.dueDate} done={t.status === "hecha"} />;
export { isPlanOverdue, isTaskOverdue };

export function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="progress" style={{ minWidth: 70 }}>
      <div style={{ width: `${pct}%`, background: color ?? (pct >= 100 ? "var(--success)" : "var(--accent)") }} />
    </div>
  );
}

/** Fecha opcional: el DateField más un botón para vaciarla. */
export function OptDate({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <DateField value={value ?? ""} onChange={(iso) => onChange(iso || null)} />
      </div>
      {value && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)} title="Quitar fecha">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

/** <select> de personas: primero el equipo del proyecto, después el resto. */
export function UserSelect({
  value, onChange, team, others, placeholder = "Sin asignar", disabled,
}: {
  value: string | null; onChange: (id: string | null) => void; team: User[]; others: User[];
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <select className="select" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {team.length > 0 && (
        <optgroup label="Equipo del proyecto">
          {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Otras personas">
          {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}

export function KpiCard({ icon, label, value, hint, tone }: { icon: React.ComponentProps<typeof Icon>["name"]; label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "ok" }) {
  return (
    <div className="card kpi">
      <span className="label"><Icon name={icon} size={14} /> {label}</span>
      <div className="value" style={tone === "bad" ? { color: "var(--danger)" } : tone === "ok" ? { color: "var(--success)" } : undefined}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
