import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore, vacationInfo } from "../store";
import { dayLabel, fmtDate, today } from "../utils";
import { Avatar, Modal } from "./ui";
import { Icon, type IconName } from "./Icon";

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

const NAV: { section: string; items: { key: PageKey; label: string; ico: IconName }[] }[] = [
  {
    section: "Tiempo",
    items: [
      { key: "tracker", label: "Registro de tiempo", ico: "timer" },
      { key: "calendar", label: "Calendario", ico: "calendar" },
      { key: "dashboard", label: "Dashboard", ico: "dashboard" },
      { key: "reports", label: "Reportes", ico: "trending-up" },
    ],
  },
  {
    section: "Gestión",
    items: [
      { key: "projects", label: "Clientes y proyectos", ico: "folder" },
      { key: "team", label: "Equipo", ico: "users" },
      { key: "control", label: "Control de horas", ico: "check-circle" },
      { key: "absences", label: "Gestión", ico: "briefcase" },
      { key: "corp", label: "Calendario corporativo", ico: "building" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { key: "admin", label: "Administración", ico: "settings" },
      { key: "integrations", label: "Integraciones (pendiente)", ico: "plug" },
    ],
  },
];

const KIND_ICON: Record<string, IconName> = {
  "timer-start": "play",
  "timer-stop": "stop",
  "registro-incompleto": "pencil",
  solicitud: "mail",
  aprobacion: "check-circle",
  feriado: "party",
  exceso: "flame",
  "falta-carga": "alert",
  vencimiento: "hourglass",
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
  const [allNotifsOpen, setAllNotifsOpen] = useState(false);
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
      (e) => e.description.toLowerCase().includes(q) && out.push({ kind: "Registro", label: `${e.description} · ${fmtDate(e.date)}`, go: "tracker" }),
    );
    state.corpEvents.forEach((e) => e.title.toLowerCase().includes(q) && out.push({ kind: "Evento", label: `${e.title} · ${fmtDate(e.date)}`, go: "corp" }));
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
                <span className="ico"><Icon name={it.ico} size={17} /></span>
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
            <Icon name="power" />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="iconbtn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Icon name="menu" /></button>
          <span className="page-title">{title}</span>
          <div className="searchbox">
            <span className="lens"><Icon name="search" size={15} /></span>
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
            <Icon name={state.theme === "light" ? "moon" : "sun"} />
          </button>
          <button className="iconbtn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notificaciones">
            <Icon name="bell" />
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
            {state.notifications.slice(0, 6).map((n) => (
              <NotifItem key={n.id} n={n} email={me.email} />
            ))}
            {state.notifications.length > 6 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
                onClick={() => { setAllNotifsOpen(true); setNotifOpen(false); }}
              >
                Ver más ({state.notifications.length - 6} más)
              </button>
            )}
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
                <Icon name="power" size={15} /> Sí, salir
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5 }}>
            ¿Estás seguro de que querés cerrar la sesión de <strong>{me.name}</strong>?
          </p>
          {state.timers.length > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--warning)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="alert" size={14} /> Tenés {state.timers.length} cronómetro{state.timers.length > 1 ? "s" : ""} en marcha. Seguirá{state.timers.length > 1 ? "n" : ""} corriendo hasta que lo{state.timers.length > 1 ? "s" : ""} detengas.
            </p>
          )}
        </Modal>
      )}

      {allNotifsOpen && (
        <Modal
          title={`Todas las notificaciones (${state.notifications.length})`}
          onClose={() => setAllNotifsOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => dispatch({ type: "markNotifsRead" })}>Marcar todas leídas</button>
              <button className="btn btn-secondary" onClick={() => setAllNotifsOpen(false)}>Cerrar</button>
            </>
          }
        >
          {state.notifications.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Sin notificaciones</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, margin: "-4px 0" }}>
            {state.notifications.map((n) => (
              <NotifItem key={n.id} n={n} email={me.email} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function NotifItem({ n, email }: { n: { id: string; kind: string; title: string; body: string; date: string; read: boolean }; email: string }) {
  return (
    <div className={`notif ${n.read ? "" : "unread"}`}>
      <span className="ic"><Icon name={KIND_ICON[n.kind] || "bell"} size={18} /></span>
      <div>
        <div style={{ fontWeight: 650, fontSize: 13 }}>{n.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{n.body}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
          {fmtDate(n.date)}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--success)" }} title={`Copia enviada a ${email}`}>
            · <Icon name="mail" size={12} /> copia por correo
          </span>
        </div>
      </div>
    </div>
  );
}
