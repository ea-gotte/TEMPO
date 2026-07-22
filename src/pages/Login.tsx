import React, { useState } from "react";
import { useStore } from "../store";
import { Avatar, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { hashPassword, validatePassword, uid } from "../utils";
import emailjs from "@emailjs/browser";
import { supabase, authUrlError } from "../supabase";

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
  const [showPassword, setShowPassword] = useState(false);
  
  // Recovery states
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [error, setError] = useState(authUrlError || "");
  const [successMsg, setSuccessMsg] = useState("");

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setSuccessMsg("");

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authErr) {
        const errMsg = authErr.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos. Verificá tus credenciales."
          : `Error al iniciar sesión: ${authErr.message}`;
        setError(errMsg);
        toast(errMsg);
        return;
      }

      if (data?.user) {
        const msg = "¡Inicio de sesión correcto! Bienvenido/a.";
        setSuccessMsg(msg);
        toast(msg);
        dispatch({ type: "login", userId: data.user.id });
      }
    } catch (err: any) {
      const msg = "Error al conectar con Supabase: " + (err.message || err);
      setError(msg);
      toast(msg);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const targetEmail = recoveryEmail.trim().toLowerCase();

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin + window.location.pathname,
      });

      if (resetErr) {
        setError("Error al solicitar recuperación: " + resetErr.message);
        toast("Error al solicitar recuperación: " + resetErr.message);
        return;
      }

      toast(`Enlace de recuperación enviado por correo a ${targetEmail}.`);
      setSuccessMsg(`Se envió un correo de recuperación a ${targetEmail}.`);
      setMode("login");
    } catch (err: any) {
      setError("Error al procesar la solicitud: " + (err.message || err));
    }
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
                onChange={(e) => { setEmail(e.target.value); setError(""); setSuccessMsg(""); }}
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
                    setSuccessMsg("");
                  }}
                  style={{
                    background: "none", border: "none", color: "var(--accent)",
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="login-pass"
                  className="input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); setSuccessMsg(""); }}
                  placeholder="••••••••"
                  style={{ paddingRight: 40, width: "100%" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  style={{
                    position: "absolute",
                    right: 10,
                    background: "none",
                    border: "none",
                    color: "var(--text-3)",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                </button>
              </div>
            </div>
            {error && (
              <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }} role="alert">
                <Icon name="alert" size={14} /> {error}
              </div>
            )}
            {successMsg && (
              <div style={{ color: "var(--success)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }} role="status">
                <Icon name="check-circle" size={14} /> {successMsg}
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

      </div>
    </div>
  );
}

