import React, { useState } from "react";
import { useStore } from "../store";
import { Avatar } from "../components/ui";
import { Icon } from "../components/Icon";

export function Login() {
  const { state, dispatch } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const user = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.active);
    if (!user || user.password !== password) {
      setError("Email o clave incorrectos. Verificá tus credenciales.");
      return;
    }
    dispatch({ type: "login", userId: user.id });
  }

  return (
    <div
      style={{
        minHeight: "100vh", display: "grid", placeItems: "center", padding: 20,
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "min(420px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 22 }}>
          <span
            style={{
              width: 44, height: 44, borderRadius: 12,
              background: "linear-gradient(135deg, var(--accent), #9b6bff)",
              display: "grid", placeItems: "center", color: "#fff", fontSize: 22, fontWeight: 800,
              boxShadow: "var(--shadow-md)",
            }}
          >
            T
          </span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>TEMPO</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{state.company.name}</div>
          </div>
        </div>

        <form className="card card-pad" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Iniciar sesión</div>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="tu@empresa.com"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="login-pass">Clave</label>
            <input
              id="login-pass"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600 }} role="alert">
              <Icon name="alert" size={13} /> {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" style={{ justifyContent: "center", padding: "10px 14px" }}>
            Ingresar
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-3)", fontSize: 11.5 }}>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            o continuar con
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: "center", opacity: 0.6, cursor: "not-allowed" }}
              disabled
              title="Disponible próximamente"
            >
              Google <span className="badge warn" style={{ marginLeft: 4 }}>Pendiente</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: "center", opacity: 0.6, cursor: "not-allowed" }}
              disabled
              title="Disponible próximamente"
            >
              Microsoft <span className="badge warn" style={{ marginLeft: 4 }}>Pendiente</span>
            </button>
          </div>
        </form>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="card-title">Usuarios de demostración — clic para completar</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {state.users.filter((u) => u.active).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { setEmail(u.email); setPassword(u.password); setError(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 9px",
                  borderRadius: 8, textAlign: "left", width: "100%",
                }}
                className="login-demo-row"
              >
                <Avatar name={u.name} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{u.email}</div>
                </div>
                <span className={`badge ${u.role === "admin" ? "acc" : u.role === "supervisor" ? "warn" : ""}`} style={{ textTransform: "capitalize" }}>
                  {u.role}
                </span>
                <code style={{ fontSize: 11, color: "var(--text-3)" }}>{u.password}</code>
              </button>
            ))}
          </div>
        </div>
        <style>{`.login-demo-row:hover { background: var(--surface-2); }`}</style>
      </div>
    </div>
  );
}
