import React, { useState } from "react";
import { useStore, vacationInfo } from "../store";
import type { Jornada, Role, Team as TeamType, User } from "../types";
import { uid, weekStart, addDays, fmtDate, fmtDur, today, hashPassword, validatePassword } from "../utils";
import { Avatar, DateField, Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { supabase } from "../supabase";

const DAY_NAMES = ["L", "M", "X", "J", "V", "S", "D"];

type SortKey = "name" | "role" | "team" | "supervisor" | "jornada" | "hire" | "week";

export function Team() {
  const { state } = useStore();
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const me = state.users.find((u) => u.id === state.currentUserId)!;
  const canManage = me.role === "admin" || me.role === "gerente";

  const ws = weekStart(today());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  const [fName, setFName] = useState("");
  const [fRole, setFRole] = useState<Role | "">("");
  const [fTeam, setFTeam] = useState<TeamType | "">("");
  const [fSupervisor, setFSupervisor] = useState("");
  const [fJornada, setFJornada] = useState<Jornada | "">("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <Icon name="chevron-right" size={11} style={{ transform: sortDir === "asc" ? "rotate(-90deg)" : "rotate(90deg)" }} />;
  }

  const weekMinById = new Map(
    state.users.map((u) => [
      u.id,
      state.entries.filter((e) => e.userId === u.id && weekDays.includes(e.date)).reduce((a, e) => a + (e.end - e.start), 0),
    ]),
  );

  const filtersActive = Boolean(fName || fRole || fTeam || fSupervisor || fJornada);
  const filteredUsers = state.users.filter((u) => {
    if (fName && !u.name.toLowerCase().includes(fName.trim().toLowerCase()) && !u.email.toLowerCase().includes(fName.trim().toLowerCase())) return false;
    if (fRole && u.role !== fRole) return false;
    if (fTeam && u.team !== fTeam) return false;
    if (fSupervisor && u.supervisorId !== fSupervisor) return false;
    if (fJornada && u.jornada !== fJornada) return false;
    return true;
  });

  const sortedUsers = sortKey
    ? [...filteredUsers].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortKey) {
          case "name": return a.name.localeCompare(b.name) * dir;
          case "role": return a.role.localeCompare(b.role) * dir;
          case "team": return a.team.localeCompare(b.team) * dir;
          case "supervisor": {
            const an = state.users.find((x) => x.id === a.supervisorId)?.name ?? "";
            const bn = state.users.find((x) => x.id === b.supervisorId)?.name ?? "";
            return an.localeCompare(bn) * dir;
          }
          case "jornada": return (a.weeklyHours - b.weeklyHours) * dir;
          case "hire": return a.hireDate.localeCompare(b.hireDate) * dir;
          case "week": return ((weekMinById.get(a.id) ?? 0) - (weekMinById.get(b.id) ?? 0)) * dir;
          default: return 0;
        }
      })
    : filteredUsers;

  function clearFilters() {
    setFName("");
    setFRole("");
    setFTeam("");
    setFSupervisor("");
    setFJornada("");
  }

  return (
    <>
      <div className="page-head">
        <h1>Equipo</h1>
        <span className="spacer" />
        {canManage && <button className="btn btn-primary" onClick={() => setEdit("new")}><Icon name="plus" size={15} /> Agregar usuario</button>}
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
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <p className="page-sub" style={{ margin: 0 }}>
          {filteredUsers.length} de {state.users.length} personas
        </p>
        {filtersActive && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Limpiar filtros</button>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th className="th-sort" onClick={() => toggleSort("name")}>Persona {sortArrow("name")}</th>
              <th className="th-sort" onClick={() => toggleSort("role")}>Rol {sortArrow("role")}</th>
              <th className="th-sort" onClick={() => toggleSort("team")}>Equipo {sortArrow("team")}</th>
              <th className="th-sort" onClick={() => toggleSort("supervisor")}>Supervisor {sortArrow("supervisor")}</th>
              <th className="th-sort" onClick={() => toggleSort("jornada")}>Jornada {sortArrow("jornada")}</th>
              <th className="th-sort" onClick={() => toggleSort("hire")}>Ingreso / Vacaciones {sortArrow("hire")}</th>
              <th>Días laborales</th>
              <th className="th-sort" onClick={() => toggleSort("week")}>Esta semana {sortArrow("week")}</th>
              {canManage && <th></th>}
            </tr>
            <tr className="th-filters">
              <th>
                <input className="input" placeholder="Buscar…" value={fName} onChange={(e) => setFName(e.target.value)} onClick={(e) => e.stopPropagation()} />
              </th>
              <th>
                <select className="select" value={fRole} onChange={(e) => setFRole(e.target.value as Role | "")} onClick={(e) => e.stopPropagation()}>
                  <option value="">Todos</option>
                  <option value="admin">Administrador</option>
                  <option value="gerente">Gerente</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="usuario">Usuario</option>
                </select>
              </th>
              <th>
                <select className="select" value={fTeam} onChange={(e) => setFTeam(e.target.value as TeamType | "")} onClick={(e) => e.stopPropagation()}>
                  <option value="">Todos</option>
                  <option value="latam">LATAM</option>
                  <option value="espana">España</option>
                </select>
              </th>
              <th>
                <select className="select" value={fSupervisor} onChange={(e) => setFSupervisor(e.target.value)} onClick={(e) => e.stopPropagation()}>
                  <option value="">Todos</option>
                  {state.users.filter((u) => u.role !== "usuario").map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </th>
              <th>
                <select className="select" value={fJornada} onChange={(e) => setFJornada(e.target.value as Jornada | "")} onClick={(e) => e.stopPropagation()}>
                  <option value="">Todas</option>
                  <option value="completa">Completa</option>
                  <option value="media">Media</option>
                </select>
              </th>
              <th></th>
              <th></th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => {
              const sup = state.users.find((x) => x.id === u.supervisorId);
              const vac = vacationInfo(state, u.id, today());
              const weekMin = weekMinById.get(u.id) ?? 0;
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
                    <span className={`badge ${u.role === "admin" ? "acc" : u.role === "gerente" ? "ok" : u.role === "supervisor" ? "warn" : ""}`} style={{ textTransform: "capitalize" }}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.team === "espana" ? "warn" : ""}`}>{u.team === "espana" ? "España" : "LATAM"}</span>
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
                  {canManage && (
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
  const mustChangePassword = user ? (user.mustChangePassword ?? false) : true;
  const [error, setError] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "usuario");
  const [team, setTeam] = useState<TeamType>(user?.team ?? "latam");
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
      team,
      jornada,
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

    // Sincronizar perfil en Supabase. Si falla, no aplicamos el cambio localmente ni
    // cerramos el modal: mostrar "Usuario actualizado" cuando en realidad no se guardó
    // en el servidor hacía que el cambio pareciera aplicado y desapareciera al recargar.
    const { error: dbErr } = await supabase.from("profiles").upsert({
      id: next.id,
      name: next.name,
      email: next.email,
      role: next.role,
      team: next.team,
      jornada: next.jornada,
      supervisor_id: next.supervisorId || null,
      weekly_hours: next.weeklyHours,
      work_days: next.workDays,
      day_start: next.dayStart,
      day_end: next.dayEnd,
      birthday: next.birthday || null,
      hire_date: next.hireDate || null,
      must_change_password: next.mustChangePassword ?? false,
      active: next.active,
      online: next.online
    });
    if (dbErr) {
      setError(`No se pudo guardar en el servidor: ${dbErr.message}`);
      return;
    }

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
        {!user && (
          <div className="field">
            <label>Clave de acceso inicial</label>
            <input
              type="text"
              className="input"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Clave temporal"
              autoComplete="new-password"
            />
          </div>
        )}
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12, fontWeight: 650, gridColumn: "span 2", display: "flex", alignItems: "center", gap: 6 }} role="alert">
            <Icon name="alert" size={13} /> {error}
          </div>
        )}
        <div className="field">
          <label>Rol</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="usuario">Usuario</option>
            <option value="supervisor">Supervisor</option>
            <option value="gerente">Gerente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div className="field">
          <label>Equipo de trabajo</label>
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value as TeamType)}>
            <option value="latam">Equipo LATAM</option>
            <option value="espana">Equipo España</option>
          </select>
          {team === "espana" && (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              Acceso de consulta: perfil profesional y reportes. Un gerente de España conserva la aprobación de ausencias.
            </span>
          )}
        </div>
        <div className="field">
          <label>Supervisor</label>
          <select className="select" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            <option value="">— Sin supervisor —</option>
            {state.users.filter((u) => u.role !== "usuario" && u.id !== user?.id).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
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
