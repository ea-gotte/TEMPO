import React from "react";

/**
 * Límite de errores de la pestaña Tablero: si el chunk de Fabric no se puede
 * descargar (corte de red, deploy nuevo) o el tablero falla al dibujarse, se
 * muestra un aviso en la pestaña en lugar de desmontar toda la app.
 */
export class BoardBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(_error: unknown): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card card-pad" role="alert">
        No se pudo abrir el tablero. Recargá la página para intentarlo de nuevo.{" "}
        <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>Recargar</button>
      </div>
    );
  }
}
