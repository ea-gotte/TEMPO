import React, { useState } from "react";
import { useStore, vacationInfo } from "../store";
import type { Jornada, Role, User } from "../types";
import { uid, weekStart, addDays, fmtDate, fmtDur, today, hashPassword, validatePassword } from "../utils";
import { Avatar, DateField, Modal, Switch, useToast } from "../components/ui";
import { Icon } from "../components/Icon";

const DAY_NAMES = ["L", "M", "X", "J", "V", "S", "D"];

export function Team() {
  const { state } = useStore();
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const isAdmin = me.role === "admin" || me.role === "supervisor";

  const ws = weekStart(today());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <>
      <div className="page-head">
        <h1>Equipo</h1>
        <span className="spacer" />
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit("new")}><Icon name="plus" size={15} /> Agregar usuario</button>}
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        <div className="card kpi">
          <span className="label"><Icon name="users" size={14} /> Personas activas</span>
          <div className="value">{state.users.filter((u) => u.active).length}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="dot" size={12} style={{ color: "var(--success)" }} /> Conectados ahora</span>
          <div className="value">{state.users.filter((u) => u.online).length}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="tag" size={14} /> Equipos</span>
          <div className="value">{state.teams.length}</div>
          <div className="hint">{state.teams.map((t) => t.name).join(" · ")}</div>
        </div>
        <div className="card kpi">
          <span className="label"><Icon name="building-columns" size={14} /> Departamentos</span>
          <div className="value">{state.departments.length}</div>
          <div className="hint">{state.departments.map((d) => d.name).join(" · ")}</div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Rol</th>
              <th>Equipo / Depto.</th>
              <th>Supervisor</th>
              <th>Jornada</th>
              <th>Ingreso / Vacaciones</th>
              <th>Días laborales</th>
              <th>Esta semana</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {state.users.map((u) => {
              const sup = state.users.find((x) => x.id === u.supervisorId);
              const vac = vacationInfo(state, u.id, today());
              const weekMin = state.entries
                .filter((e) => e.userId === u.id && weekDays.includes(e.date))
                .reduce((a, e) => a + (e.end - e.start), 0);
              const pct = Math.min(100, (weekMin / (u.weeklyHours * 60)) * 100);
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar name={u.name} online={u.online} />
                      <div>
                        <div style={{ fontWeight: 650 }}>{u.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "acc" : u.role === "supervisor" ? "warn" : ""}`} style={{ textTransform: "capitalize" }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {state.teams.find((t) => t.id === u.teamId)?.name ?? "—"}
                    <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{state.departments.find((d) => d.id === u.departmentId)?.name ?? ""}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{sup?.name ?? "—"}</td>
                  <td style={{ fontSize: 12.5 }}>
                    <span className={`badge ${u.jornada === "completa" ? "acc" : "warn"}`}>
                      {u.jornada === "completa" ? "Completa" : "Media"}
                    </span>{" "}
                    {u.weeklyHours} h/sem
                    <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{u.dayStart}–{u.dayEnd} flexible</div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name="calendar" size={12} /> {fmtDate(u.hireDate)}</div>
                    <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon name="sun" size={12} /> {vac.available} de {vac.entitled} días
                    </div>
                    <div style={{ color: vac.daysToExpire <= 90 ? "var(--warning)" : "var(--text-3)", fontSize: 11 }}>
                      vencen {u.hireDate && fmtDate(vac.expiration)}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 3 }}>
                      {DAY_NAMES.map((d, i) => (
                        <span
                          key={i}
                          style={{
                            width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center",
                            fontSize: 10, fontWeight: 700,
                            background: u.workDays.includes(i + 1) ? "var(--accent-soft)" : "var(--surface-2)",
                            color: u.workDays.includes(i + 1) ? "var(--accent)" : "var(--text-3)",
                          }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <div style={{ fontSize: 12, fontFamily: "var(--mono)", marginBottom: 3 }}>
                      {fmtDur(weekMin)} / {u.weeklyHours} h
                    </div>
                    <div className="progress">
                      <div style={{ width: `${pct}%`, background: pct < 50 ? "var(--warning)" : "var(--accent)" }} />
                    </div>
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEdit(u)}><Icon name="pencil" size={13} /> Editar</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && <UserModal user={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(user ? (user.mustChangePassword ?? false) : true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "empleado");
  const [teamId, setTeamId] = useState(user?.teamId ?? state.teams[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? state.departments[0]?.id ?? "");
  const [supervisorId, setSupervisorId] = useState(user?.supervisorId ?? "");
  const [jornada, setJornada] = useState<Jornada>(user?.jornada ?? "completa");
  const [weeklyHours, setWeeklyHours] = useState(user?.weeklyHours ?? state.company.defaultWeeklyHours);
  const [workDays, setWorkDays] = useState<number[]>(user?.workDays ?? [1, 2, 3, 4, 5]);
  const [dayStart, setDayStart] = useState(user?.dayStart ?? state.company.defaultDayStart);
  const [dayEnd, setDayEnd] = useState(user?.dayEnd ?? state.company.defaultDayEnd);
  const [hireDate, setHireDate] = useState(user?.hireDate ?? "");
  const [birthday, setBirthday] = useState(user?.birthday ?? "");

  async function save() {
    if (!name.trim() || !email.trim()) return;

    let hashedPassword = user?.password ?? "";
    if (password.trim()) {
      const valErr = validatePassword(password);
      if (valErr) {
        setError(valErr);
        return;
      }
      hashedPassword = await hashPassword(password.trim());
    } else if (!user) {
      setError("La contraseña temporal inicial es obligatoria.");
      return;
    }

    const next: User = {
      id: user?.id ?? uid(),
      name: name.trim(),
      email: email.trim(),
      password: hashedPassword,
      mustChangePassword,
      role,
      jornada,
      teamId: teamId || null,
      departmentId: departmentId || null,
      supervisorId: supervisorId || null,
      weeklyHours,
      workDays,
      dayStart,
      dayEnd,
      birthday: birthday || "1990-01-01",
      hireDate: hireDate || new Date().toISOString().slice(0, 10),
      active: user?.active ?? true,
      online: user?.online ?? false,
    };
    dispatch({
      type: "patch",
      patch: { users: user ? state.users.map((u) => (u.id === user.id ? next : u)) : [...state.users, next] },
    });
    dispatch({ type: "audit", action: user ? "Usuario modificado" : "Usuario agregado", detail: next.name });
    toast(user ? "Usuario actualizado." : "Usuario agregado al equipo.");
    onClose();
  }

  return (
    <Modal
      title={user ? `Editar usuario — ${user.name}` : "Agregar nuevo usuario"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim() || !email.trim()}>Guardar</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" className="input" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
        </div>
        <div className="field">
          <label>{user ? "Cambiar clave de acceso" : "Clave de acceso inicial"}</label>
          <input
            type="text"
            className="input"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder={user ? "Dejar vacío para no cambiar" : "Clave temporal"}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label style={{ display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", width: "100%" }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Cambio obligatorio</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Switch on={mustChangePassword} onToggle={() => setMustChangePassword(!mustChangePassword)} label="Forzar cambio de contraseña" />
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>Forzar al iniciar</span>
            </div>
          </label>
        </div>
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12, fontWeight: 650, gridColumn: "span 2", display: "flex", alignItems: "center", gap: 6 }} role="alert">
            <Icon name="alert" size={13} /> {error}
          </div>
        )}
        <div className="field">
          <label>Rol</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="empleado">Empleado</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div className="field">
          <label>Supervisor</label>
          <select className="select" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            <option value="">— Sin supervisor —</option>
            {state.users.filter((u) => u.role !== "empleado" && u.id !== user?.id).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Equipo</label>
          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Departamento</label>
          <select className="select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tipo de jornada</label>
          <select
            className="select"
            value={jornada}
            onChange={(e) => {
              const j = e.target.value as Jornada;
              setJornada(j);
              setWeeklyHours(j === "media" ? 20 : state.company.defaultWeeklyHours);
              setWorkDays([1, 2, 3, 4, 5]);
            }}
          >
            <option value="completa">Jornada completa</option>
            <option value="media">Media jornada</option>
          </select>
        </div>
        <div className="field">
          <label>Jornada semanal (horas)</label>
          <input type="number" className="input" value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Fecha de ingreso</label>
          <DateField value={hireDate} onChange={setHireDate} max={today()} />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            Escribí dd/mm/aaaa o elegí en el calendario. Vacaciones automáticas: 10 días hábiles por año desde el ingreso.
          </span>
        </div>
        <div className="field">
          <label>Fecha de cumpleaños</label>
          <DateField value={birthday} onChange={setBirthday} max={today()} />
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            Se agrega automáticamente al calendario corporativo.
          </span>
        </div>
        <div className="field">
          <label>Horario desde</label>
          <input type="time" className="input" value={dayStart} onChange={(e) => setDayStart(e.target.value)} />
        </div>
        <div className="field">
          <label>Horario hasta</label>
          <input type="time" className="input" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Días laborales (turnos personalizados)</label>
        <div style={{ display: "flex", gap: 6 }}>
          {DAY_NAMES.map((d, i) => (
            <button
              key={i}
              className={`chip ${workDays.includes(i + 1) ? "on" : ""}`}
              onClick={() => setWorkDays((w) => (w.includes(i + 1) ? w.filter((x) => x !== i + 1) : [...w, i + 1].sort()))}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
