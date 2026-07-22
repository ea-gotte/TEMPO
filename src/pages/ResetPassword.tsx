import React, { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../components/Icon";
import { useToast } from "../components/ui";
import { validatePassword } from "../utils";
import { supabase } from "../supabase";

export function ResetPassword() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const complexityError = validatePassword(newPassword);
    if (complexityError) {
      setError(complexityError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateErr) {
      setError("Error al actualizar la contraseña: " + updateErr.message);
      return;
    }

    dispatch({ type: "patch", patch: { passwordRecovery: false } });
    toast("Contraseña actualizada con éxito. Ya podés usar la aplicación.");
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
      <div style={{ width: "min(420px, 100%)" }}>
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
            <div style={{ fontWeight: 700, fontSize: 16.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name="lock" size={18} /> Establecer nueva contraseña
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>
              Ingresá tu nueva contraseña para completar la recuperación de la cuenta.
            </p>
          </div>

          <div className="field">
            <label htmlFor="new-pass">Nueva contraseña</label>
            <input
              id="new-pass"
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
              placeholder="Mínimo 8 caracteres, mayúscula, minúscula y número"
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="confirm-pass">Confirmar nueva contraseña</label>
            <input
              id="confirm-pass"
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div style={{ color: "var(--danger)", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }} role="alert">
              <Icon name="alert" size={13} /> {error}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center", padding: "10px 14px", marginTop: 6 }}>
            {loading ? "Actualizando…" : "Restablecer contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
