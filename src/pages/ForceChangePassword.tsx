import React, { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../components/Icon";
import { useToast } from "../components/ui";
import { hashPassword, validatePassword } from "../utils";

export function ForceChangePassword() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const me = state.users.find((u) => u.id === state.currentUserId)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Todos los campos son obligatorios.");
      return;
    }

    const currentHash = await hashPassword(currentPassword);
    if (me.password !== currentHash) {
      setError("La contraseña actual es incorrecta.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("La nueva contraseña debe ser diferente a la actual.");
      return;
    }

    const complexityError = validatePassword(newPassword);
    if (complexityError) {
      setError(complexityError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }

    const newHash = await hashPassword(newPassword);
    const updatedUsers = state.users.map((u) =>
      u.id === me.id ? { ...u, password: newHash, mustChangePassword: false } : u
    );

    dispatch({
      type: "patch",
      patch: { users: updatedUsers },
    });
    dispatch({
      type: "audit",
      action: "Cambio obligatorio de clave",
      detail: me.email,
    });

    toast("Contraseña actualizada con éxito.");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "min(460px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 22 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--accent), #9b6bff)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 22,
              fontWeight: 800,
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

        <form className="card card-pad" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 16.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--warning)" }}>
              <Icon name="lock" size={18} /> Cambio de contraseña obligatorio
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>
              Por seguridad, debés cambiar la contraseña temporal antes de poder usar la aplicación.
            </p>
          </div>

          <div className="field">
            <label htmlFor="current-pass">Contraseña actual</label>
            <input
              id="current-pass"
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setError("");
              }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div className="field">
            <label htmlFor="new-pass">Nueva contraseña</label>
            <input
              id="new-pass"
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError("");
              }}
              placeholder="Mínimo 8 caracteres, mayúscula, minúscula y número"
              autoComplete="new-password"
            />
          </div>

          <div className="field">
            <label htmlFor="confirm-pass">Confirmar nueva contraseña</label>
            <input
              id="confirm-pass"
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }} role="alert">
              <Icon name="alert" size={13} /> {error}
            </div>
          )}

          <button className="btn btn-primary" type="submit" style={{ justifyContent: "center", padding: "10px 14px", marginTop: 6 }}>
            Actualizar contraseña e ingresar
          </button>
        </form>
      </div>
    </div>
  );
}
