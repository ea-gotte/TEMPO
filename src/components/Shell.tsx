import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore, vacationInfo } from "../store";
import { dayLabel, today } from "../utils";
import { Avatar, Modal } from "./ui";

/** Páginas visibles para el rol empleado (vista básica) */
export const EMPLOYEE_PAGES: PageKey[] = ["tracker", "calendar", "dashboard", "reports", "absences", "corp"];

export type PageKey =
  | "dashboard"
  | "tracker"
  | "calendar"
  | "reports"
  | "projects"
  | "team"
  | "control"
  | "absences"
  | "corp"
  | "admin"
  | "integrations";

const NAV: { section: string; items: { key: PageKey; label: string; ico: string }[] }[] = [
  {
    section: "Tiempo",
    items: [
      { key: "tracker", label: "Registro de tiempo", ico: "⏱️" },
      { key: "calendar", label: "Calendario", ico: "🗓️" },
      { key: "dashboard", label: "Dashboard", ico: "📊" },
      { key: "reports", label: "Reportes", ico: "📈" },
    ],
  },
  {
    section: "Gestión",
    items: [
      { key: "projects", label: "Clientes y proyectos", ico: "📁" },
      { key: "team", label: "Equipo", ico: "👥" },
      { key: "control", label: "Control de horas", ico: "✅" },
      { key: "absences", label: "Gestión", ico: "🗂️" },
      { key: "corp", label: "Calendario corporativo", ico: "🏢" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { key: "admin", label: "Administración", ico: "⚙️" },
      { key: "integrations", label: "Integraciones (pendiente)", ico: "🔌" },
    ],
  },
];

const KIND_ICON: Record<string, string> = {
  "timer-start": "▶️",
  "timer-stop": "⏹️",
  "registro-incompleto": "✏️",
  solicitud: "📩",
  aprobacion: "✅",
  feriado: "🎉",
  exceso: "🔥",
  "falta-carga": "⚠️",
  vencimiento: "⌛",
};

export function Shell({
  page,
  setPage,
  children,
}: {
  page: PageKey;
  setPage: (p: PageKey) => void;
  children: React.ReactNode;
}) {
  const { state, dispatch } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const me = state.users.find((u) => u.id === state.currentUserId)!;

  // Aviso de vencimiento de vacaciones: desde 3 meses antes del aniversario
  useEffect(() => {
    const info = vacationInfo(state, me.id, today());
    if (info.available > 0 && info.daysToExpire <= 90 && info.daysToExpire > 0) {
      const body = `Tenés ${info.available} día${info.available !== 1 ? "s" : ""} de vacaciones que vencen el ${dayLabel(info.expiration)}.`;
      if (!state.notifications.some((n) => n.body === body)) {
        dispatch({ type: "notify", n: { kind: "vencimiento", title: "Vacaciones por vencer", body } });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);
  const unread = state.notifications.filter((n) => !n.read).length;
  const pending = state.absences.filter((a) => a.status === "Pendiente").length;

  const title = useMemo(() => {
    for (const s of NAV) for (const i of s.items) if (i.key === page) return i.label;
    return "Tempo";
  }, [page]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { kind: string; label: string; go: PageKey }[] = [];
    state.projects.forEach((p) => p.name.toLowerCase().includes(q) && out.push({ kind: "Proyecto", label: p.name, go: "projects" }));
    state.clients.forEach((c) => c.name.toLowerCase().includes(q) && out.push({ kind: "Cliente", label: c.name, go: "projects" }));
    state.users.forEach((u) => u.name.toLowerCase().includes(q) && out.push({ kind: "Persona", label: u.name, go: "team" }));
    state.entries.forEach(
      (e) => e.description.toLowerCase().includes(q) && out.push({ kind: "Registro", label: `${e.description} · ${e.date}`, go: "tracker" }),
    );
    state.corpEvents.forEach((e) => e.title.toLowerCase().includes(q) && out.push({ kind: "Evento", label: `${e.title} · ${e.date}`, go: "corp" }));
    return out.slice(0, 12);
  }, [query, state]);

  return (
    <div className="app">
      {menuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.3)" }}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-logo">T</span> TEMPO
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>
            {state.company.name}
          </span>
        </div>
        {NAV.map((sec) => {
          const items = sec.items.filter((it) => me.role !== "empleado" || EMPLOYEE_PAGES.includes(it.key));
          if (items.length === 0) return null;
          return (
          <React.Fragment key={sec.section}>
            <div className="nav-section">{sec.section}</div>
            {items.map((it) => (
              <button
                key={it.key}
                className={`nav-item ${page === it.key ? "active" : ""}`}
                onClick={() => {
                  setPage(it.key);
                  setMenuOpen(false);
                }}
              >
                <span className="ico">{it.ico}</span>
                {it.label}
                {it.key === "absences" && pending > 0 && <span className="count">{pending}</span>}
              </button>
            ))}
          </React.Fragment>
          );
        })}
        <div style={{ marginTop: "auto", padding: "12px 10px 4px", display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={me.name} online={me.online} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 650, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {me.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "capitalize" }}>{me.role}</div>
          </div>
          <button
            className="iconbtn"
            onClick={() => setConfirmLogout(true)}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            ⏻
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="iconbtn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">☰</button>
          <span className="page-title">{title}</span>
          <div className="searchbox">
            <span className="lens">🔎</span>
            <input
              ref={searchRef}
              placeholder="Buscar proyectos, personas, registros…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              aria-label="Búsqueda global"
            />
            {hits.length > 0 && (
              <div className="search-results">
                {hits.map((h, i) => (
                  <div
                    key={i}
                    className="search-hit"
                    onClick={() => {
                      setPage(h.go);
                      setQuery("");
                    }}
                  >
                    <span className="kind">{h.kind}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="iconbtn"
            onClick={() => dispatch({ type: "toggleTheme" })}
            aria-label="Cambiar tema"
            title={state.theme === "light" ? "Tema oscuro" : "Tema claro"}
          >
            {state.theme === "light" ? "🌙" : "☀️"}
          </button>
          <button className="iconbtn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notificaciones">
            🔔
            {unread > 0 && <span className="dot" />}
          </button>
        </header>

        {notifOpen && (
          <div className="notif-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px" }}>
              <strong style={{ fontSize: 13.5 }}>Notificaciones</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: "markNotifsRead" })}>
                Marcar leídas
              </button>
            </div>
            {state.notifications.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Sin notificaciones</div>
            )}
            {state.notifications.slice(0, 20).map((n) => (
              <div key={n.id} className={`notif ${n.read ? "" : "unread"}`}>
                <span className="ic">{KIND_ICON[n.kind] || "🔔"}</span>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 13 }}>{n.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{n.date}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <main className="content" onClick={() => notifOpen && setNotifOpen(false)}>
          <div className="content-inner">{children}</div>
        </main>
      </div>

      {confirmLogout && (
        <Modal
          title="Cerrar sesión"
          onClose={() => setConfirmLogout(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmLogout(false)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setConfirmLogout(false);
                  dispatch({ type: "logout" });
                }}
              >
                ⏻ Sí, salir
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>
            ¿Estás seguro de que querés cerrar la sesión de <strong>{me.name}</strong>?
          </p>
          {state.timers.length > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--warning)", fontWeight: 600 }}>
              ⚠ Tenés {state.timers.length} cronómetro{state.timers.length > 1 ? "s" : ""} en marcha. Seguirá{state.timers.length > 1 ? "n" : ""} corriendo hasta que lo{state.timers.length > 1 ? "s" : ""} detengas.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
