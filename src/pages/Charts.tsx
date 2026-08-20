import React from "react";
import { useStore } from "../store";
import { MindMap } from "./MindMap";
// Organigrama oculto temporalmente: a repensar cómo organizarlo mejor (pedido 2026-08-20).
// import { OrgChart } from "./OrgChart";

export function Charts() {
  const { state } = useStore();
  const me = state.currentUserId;

  return (
    <>
      <div className="page-head">
        <h1>Gráficos</h1>
      </div>

      <MindMap userId={me} />
      {/* <OrgChart meId={me} /> */}
    </>
  );
}
