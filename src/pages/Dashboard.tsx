import React, { useMemo } from "react";
import { useStore, validatedOvertimeMin, vacationInfo } from "../store";
import { addDays, dayLabel, fmtDur, parseISO, today, weekStart } from "../utils";
import { Avatar, Donut, HBarChart } from "../components/ui";

export function Dashboard() {
  const { state } = useStore();
  const me = state.currentUserId;
  const t = today();
  const ws = weekStart(t);
  const monthPrefix = t.slice(0, 7);
  const user = state.users.find((u) => u.id === me)!;

  const mine = useMemo(() => state.entries.filter((e) => e.userId === me), [state.entries, me]);
  const sum = (list: typeof mine) => list.reduce((a, e) => a + (e.end - e.start), 0);

  const todayMin = sum(mine.filter((e) => e.date === t));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekMin = sum(mine.filter((e) => weekDays.includes(e.date)));
  const monthMin = sum(mine.filter((e) => e.date.startsWith(monthPrefix)));
  const targetWeek = user.weeklyHours * 60;
  const pendingWeek = Math.max(0, targetWeek - weekMin);
  // Solo horas extra aprobadas por supervisor y validadas por el admin
  const overtime = validatedOvertimeMin(state, me);

  const vac = vacationInfo(state, me, t);

  const upcoming = state.absences
    .filter((a) => a.status === "Aprobado" && a.dateFrom >= t)
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
    .slice(0, 4);

  const byProject = state.projects
    .map((p) => ({
      name: p.name,
      color: p.color,
      value: sum(mine.filter((e) => weekDays.includes(e.date) && e.projectId === p.id)),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const perDay = weekDays.map((d) => {
    const list = mine.filter((e) => e.date === d);
    return { d, total: sum(list) };
  });
  const maxDay = Math.max(60, ...perDay.map((x) => x.total));

  const online = state.users.filter((u) => u.online && u.active);
  const activeProjects = state.projects.filter((p) => p.status === "activo").length;

  const kpis: { label: string; ico: string; value: string; hint?: string }[] = [
    { label: "Hoy", ico: "⏱️", value: fmtDur(todayMin), hint: `Jornada: ${Math.round(targetWeek / 5 / 60)} h` },
    { label: "Esta semana", ico: "📅", value: fmtDur(weekMin), hint: `Objetivo ${user.weeklyHours} h` },
    { label: "Este mes", ico: "🗓️", value: fmtDur(monthMin) },
    { label: "Pendientes (semana)", ico: "⏳", value: fmtDur(pendingWeek) },
    { label: "Horas extra", ico: "🔥", value: fmtDur(overtime), hint: "Aprobadas y validadas" },
    {
      label: "Vacaciones disponibles", ico: "🌴", value: `${vac.available} días`,
      hint: `${vac.used} usados de ${vac.entitled}${vac.accruing ? " (acumulando)" : ""} · vencen ${dayLabel(vac.expiration)}`,
    },
    { label: "Proyectos activos", ico: "📁", value: String(activeProjects) },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Hola, {user.name.split(" ")[0]} 👋</h1>
        <span className="spacer" />
        <span className="badge ok">● {online.length} conectados</span>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <span className="label">{k.ico} {k.label}</span>
            <div className="value">{k.value}</div>
            {k.hint && <div className="hint">{k.hint}</div>}
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card card-pad">
            <div className="card-title">Horas por día — semana actual</div>
            <div className="barchart" role="img" aria-label="Horas por día">
              {perDay.map((x) => (
                <div className="bar" key={x.d}>
                  <div
                    className="fill"
                    style={{ height: `${(x.total / maxDay) * 100}%`, background: x.d === t ? "var(--accent)" : "var(--accent-soft)" }}
                    title={`${dayLabel(x.d)}: ${fmtDur(x.total)}`}
                  />
                  <span className="lbl">{dayLabel(x.d, { weekday: "short" })}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title">Tiempo por proyecto — semana actual</div>
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <Donut data={byProject} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <HBarChart data={byProject} fmt={(v) => fmtDur(v)} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card card-pad">
            <div className="card-title">Empleados conectados</div>
            {online.map((u) => (
              <div className="list-item" key={u.id}>
                <Avatar name={u.name} online />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                    {state.teams.find((tm) => tm.id === u.teamId)?.name ?? "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="card-title">Próximas licencias y ausencias</div>
            {upcoming.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>Nada programado.</div>}
            {upcoming.map((a) => {
              const u = state.users.find((x) => x.id === a.userId);
              return (
                <div className="list-item" key={a.id}>
                  <Avatar name={u?.name ?? "?"} size={26} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.type}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      {u?.name} · {dayLabel(a.dateFrom)}{a.dateFrom !== a.dateTo && ` → ${dayLabel(a.dateTo)}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card card-pad">
            <div className="card-title">Eventos próximos</div>
            {state.corpEvents
              .filter((e) => e.date >= t)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5)
              .map((e) => (
                <div className="list-item" key={e.id}>
                  <span style={{ fontSize: 16 }}>
                    {e.type.startsWith("Feriado") ? "🎉" : e.type === "Capacitación" ? "🎓" : e.type === "Reunión" ? "🤝" : e.type === "Home office" ? "🏠" : "📌"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{dayLabel(e.date)} · {e.type}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
