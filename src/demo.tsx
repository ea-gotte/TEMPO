import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { Dot, ToastProvider } from "./components/ui";
import { Icon } from "./components/Icon";
import { fmtDur } from "./utils";
import { Panorama } from "./projects/Panorama";
import { ProjectWorkspace } from "./projects/ProjectWorkspace";
import { DEMO_USERS, demoEnv } from "./projects/demoData";
import "./styles.css";

/**
 * Página autónoma (solo desarrollo): muestra el módulo de gestión de proyectos
 * con datos ficticios, sin iniciar sesión y sin tocar Supabase. Permite “ver
 * como” distintos usuarios para probar los permisos. NO forma parte del build.
 */
function DemoApp() {
  const [meId, setMeId] = useState("u1");
  const [tab, setTab] = useState<"proyectos" | "panorama">("panorama");
  const [open, setOpen] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const env = useMemo(() => demoEnv(meId), [meId]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const visible = env.projects.filter((p) => env.me.role === "admin" || env.me.role === "gerente" || p.memberIds.includes(env.me.id));

  return (
    <div style={{ minHeight: "100%", background: "var(--bg)" }}>
      <div className="topbar" style={{ position: "sticky", top: 0, zIndex: 20 }}>
        <div className="brand-logo">T</div>
        <span className="page-title">TEMPO · Demo de gestión de proyectos</span>
        <span style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}>
          Ver como
          <select className="select" style={{ width: "auto" }} value={meId} onChange={(e) => { setMeId(e.target.value); setOpen(null); }}>
            {DEMO_USERS.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
          </select>
        </label>
        <button className="iconbtn" onClick={() => setDark((d) => !d)} title="Tema claro/oscuro"><Icon name={dark ? "sun" : "moon"} /></button>
      </div>
      <div className="content" style={{ overflow: "visible" }}>
        <div className="content-inner">
          {open ? (
            <ProjectWorkspace env={env} projectId={open} onBack={() => setOpen(null)} onEditProject={() => alert("En la app real, esto abre el modal “Editar proyecto” que ya existe.")} />
          ) : (
            <>
              <div className="page-head">
                <h1>Proyectos</h1>
                <span className="spacer" />
                <div className="tabs">
                  <button className={tab === "proyectos" ? "active" : ""} onClick={() => setTab("proyectos")}>Proyectos</button>
                  <button className={tab === "panorama" ? "active" : ""} onClick={() => setTab("panorama")}>Panorama</button>
                </div>
              </div>
              {tab === "panorama" ? (
                <Panorama env={env} onOpen={setOpen} />
              ) : (
                <div className="card" style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead><tr><th>Proyecto</th><th>Cliente</th><th>Estado</th><th>Horas</th><th></th></tr></thead>
                    <tbody>
                      {visible.map((p) => (
                        <tr key={p.id}>
                          <td><div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, cursor: "pointer" }} onClick={() => setOpen(p.id)}><Dot color={p.color} /> {p.name}</div></td>
                          <td>{env.clients.find((c) => c.id === p.clientId)?.name}</td>
                          <td><span className={`badge ${p.status === "activo" ? "ok" : p.status === "completado" ? "acc" : ""}`}>{p.status}</span></td>
                          <td>{fmtDur(env.minutesByProject[p.id] ?? 0)} / {p.budgetHours} h</td>
                          <td><button className="btn btn-secondary btn-sm" onClick={() => setOpen(p.id)}><Icon name="folder" size={13} /> Abrir</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <DemoApp />
    </ToastProvider>
  </React.StrictMode>,
);
