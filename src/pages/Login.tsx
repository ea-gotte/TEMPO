import React, { useState } from "react";
import { useStore } from "../store";
import { Avatar, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { hashPassword, validatePassword, uid } from "../utils";
import emailjs from "@emailjs/browser";

const DEMO_PASSWORDS: Record<string, string> = {
  u1: "Admin123!",
  u2: "Carla123!",
  u3: "Martin123!",
  u4: "Lucia123!",
};

export function Login() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");
  
  // Login states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Recovery states
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [error, setError] = useState("");

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    const user = state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.active);
    if (!user) {
      setError("Email o clave incorrectos. Verificá tus credenciales.");
      return;
    }
    const inputHash = await hashPassword(password);
    if (user.password !== inputHash) {
      setError("Email o clave incorrectos. Verificá tus credenciales.");
      return;
    }
    dispatch({ type: "login", userId: user.id });
  }

  function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const targetEmail = recoveryEmail.trim().toLowerCase();
    const user = state.users.find((u) => u.email.toLowerCase() === targetEmail && u.active);
    if (!user) {
      setError("No encontramos ninguna cuenta activa con ese correo electrónico.");
      return;
    }

    // Generate recovery code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryMin = state.company.passwordResetExpireMin ?? 30;
    const expires = new Date(Date.now() + expiryMin * 60 * 1000).toISOString();

    // Update user in state
    const updatedUsers = state.users.map((u) =>
      u.id === user.id ? { ...u, recoveryCode: code, recoveryExpires: expires } : u
    );
    dispatch({ type: "patch", patch: { users: updatedUsers } });

    // Send email outbox record
    const emailRecord = {
      id: uid(),
      to: user.email,
      subject: "[TEMPO] Recuperación de contraseña",
      body: `Hola,\n\nTu código temporal para restablecer la contraseña es: ${code}.\n\nEste código vencerá en ${expiryMin} minutos y solo puede ser utilizado una vez.\n\nSi no solicitaste este cambio, ignorá este mensaje.\n\nSaludos,\nEl equipo de TEMPO`,
      at: new Date().toISOString(),
    };
    dispatch({ type: "patch", patch: { emails: [emailRecord, ...state.emails] } });

    // Send real email via EmailJS
    emailjs.send(
      "default_service",
      "template_s020w0n",
      {
        to_email: user.email,
        to_name: user.name,
        recovery_code: code,
        expiry_minutes: expiryMin,
      },
      "9kvYrC80SMCYOFFpO"
    ).then(
      () => {
        console.log("EmailJS: Correo real enviado correctamente.");
      },
      (error) => {
        console.error("EmailJS: Fallo al enviar correo:", error);
      }
    );

    // Show toast with simulation helper
    toast(`Código de recuperación enviado a ${user.email}`);
    // Expose in toast for developer/user convenience
    setTimeout(() => {
      toast(`[SIMULACIÓN] Código enviado: ${code} (Vence en ${expiryMin}m)`);
    }, 800);

    setMode("reset");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!enteredCode || !newPassword || !confirmPassword) {
      setError("Todos los campos son obligatorios.");
      return;
    }

    const user = state.users.find((u) => u.email.toLowerCase() === recoveryEmail.trim().toLowerCase() && u.active);
    if (!user || user.recoveryCode !== enteredCode) {
      setError("El código de recuperación es incorrecto.");
      return;
    }

    if (new Date() > new Date(user.recoveryExpires ?? "")) {
      setError("El código de recuperación ha expirado. Solicitá uno nuevo.");
      return;
    }

    const complexityError = validatePassword(newPassword);
    if (complexityError) {
      setError(complexityError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const newHash = await hashPassword(newPassword);
    const updatedUsers = state.users.map((u) =>
      u.id === user.id ? { ...u, password: newHash, recoveryCode: null, recoveryExpires: null } : u
    );

    dispatch({ type: "patch", patch: { users: updatedUsers } });
    dispatch({ type: "audit", action: "Restablecimiento de clave", detail: user.email });

    toast("Contraseña restablecida con éxito.");
    setMode("login");
    setPassword("");
    setRecoveryEmail("");
    setEnteredCode("");
    setNewPassword("");
    setConfirmPassword("");
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

        {mode === "login" && (
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label htmlFor="login-pass">Clave</label>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryEmail(email);
                    setMode("forgot");
                    setError("");
                  }}
                  style={{
                    background: "none", border: "none", color: "var(--accent)",
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
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
        )}

        {mode === "forgot" && (
          <form className="card card-pad" onSubmit={handleForgotPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Recuperar contraseña</div>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.4 }}>
              Ingresá tu correo electrónico registrado y te enviaremos un código temporal para restablecer tu clave.
            </p>
            <div className="field">
              <label htmlFor="recovery-email">Email</label>
              <input
                id="recovery-email"
                className="input"
                type="email"
                value={recoveryEmail}
                onChange={(e) => { setRecoveryEmail(e.target.value); setError(""); }}
                placeholder="tu@empresa.com"
                autoFocus
              />
            </div>
            {error && (
              <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600 }} role="alert">
                <Icon name="alert" size={13} /> {error}
              </div>
            )}
            <button className="btn btn-primary" type="submit" style={{ justifyContent: "center", padding: "10px 14px" }}>
              Enviar código de recuperación
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setMode("login"); setError(""); }}
              style={{ justifyContent: "center" }}
            >
              Volver al inicio de sesión
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form className="card card-pad" onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Establecer nueva contraseña</div>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.4 }}>
              Ingresá el código de 6 dígitos que enviamos a <strong>{recoveryEmail}</strong> y tu nueva contraseña.
            </p>
            <div className="field">
              <label htmlFor="recovery-code">Código de recuperación</label>
              <input
                id="recovery-code"
                className="input"
                type="text"
                value={enteredCode}
                onChange={(e) => { setEnteredCode(e.target.value); setError(""); }}
                placeholder="123456"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="reset-pass">Nueva contraseña</label>
              <input
                id="reset-pass"
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                placeholder="Mínimo 8 caracteres, mayúscula, minúscula, número y símbolo"
              />
            </div>
            <div className="field">
              <label htmlFor="confirm-reset-pass">Confirmar nueva contraseña</label>
              <input
                id="confirm-reset-pass"
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600 }} role="alert">
                <Icon name="alert" size={13} /> {error}
              </div>
            )}
            <button className="btn btn-primary" type="submit" style={{ justifyContent: "center", padding: "10px 14px" }}>
              Restablecer contraseña
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setMode("login"); setError(""); }}
              style={{ justifyContent: "center" }}
            >
              Volver al inicio de sesión
            </button>
          </form>
        )}

        {mode === "login" && (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="card-title">Usuarios de demostración — clic para completar</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {state.users.filter((u) => u.active).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword(DEMO_PASSWORDS[u.id] || ""); setError(""); }}
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
                  <code style={{ fontSize: 11, color: "var(--text-3)" }}>{DEMO_PASSWORDS[u.id] || "—"}</code>
                </button>
              ))}
            </div>
          </div>
        )}
        <style>{`.login-demo-row:hover { background: var(--surface-2); }`}</style>
      </div>
    </div>
  );
}

