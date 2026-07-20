import React from "react";
import { useStore } from "../store";

export function Integrations() {
  const { state } = useStore();

  return (
    <>
      <div className="page-head">
        <h1>Integraciones</h1>
        <span className="badge warn">Pendiente</span>
      </div>
      <div
        className="card card-pad"
        style={{ marginBottom: 14, borderLeft: "3px solid var(--warning)" }}
      >
        <strong>🚧 Módulo pendiente de implementación.</strong>
        <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>
          Las integraciones estarán disponibles cuando se conecte el backend. Por ahora se listan las
          herramientas previstas; ninguna está activa.
        </p>
      </div>
      <div className="int-grid">
        {state.integrations.map((i) => (
          <div className="card int-card" key={i.id} style={{ opacity: 0.75 }}>
            <span className="ic">{i.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{i.name}</strong>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3 }}>{i.desc}</div>
            </div>
            <span className="badge warn">Pendiente</span>
          </div>
        ))}
      </div>
    </>
  );
}
