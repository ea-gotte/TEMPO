import React, { useMemo } from "react";
import { useStore } from "../store";
import type { Role } from "../types";
import { Avatar } from "../components/ui";
import { buildForest, buildLayout, teamIds, CARD_W, CARD_H } from "../orgTree";

/**
 * Organigrama dinámico, construido con los datos reales de "Supervisor" que ya
 * tiene cada persona (Team.tsx) — sin ningún dato nuevo. Un usuario ve su propia
 * cadena de mando (sus jefes hacia arriba y su equipo hacia abajo); el admin ve
 * la empresa completa. Horizontal: la raíz queda a la izquierda y ramifica
 * hacia la derecha.
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  usuario: "Usuario",
};

export function OrgChart({ meId }: { meId: string }) {
  const { state } = useStore();
  const me = state.users.find((u) => u.id === meId)!;
  const isAdmin = me.role === "admin";

  const roots = useMemo(() => {
    const active = state.users.filter((u) => u.active);
    if (isAdmin) return buildForest(active);
    const ids = teamIds(active, meId);
    return buildForest(active.filter((u) => ids.has(u.id)));
  }, [state.users, isAdmin, meId]);

  const { nodes, edges, totalWidth, totalHeight } = useMemo(() => buildLayout(roots), [roots]);

  return (
    <div className="card">
      <div style={{ padding: "16px 18px 4px" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {isAdmin ? "Organigrama de la empresa" : "Organigrama"}
        </div>
      </div>

      {nodes.length <= 1 ? (
        <div style={{ textAlign: "center", color: "var(--text-3)", padding: 30 }}>
          Todavía no hay una jerarquía definida (asigná un supervisor en Equipo).
        </div>
      ) : (
        <div style={{ overflowX: "auto", padding: "10px 18px 20px" }}>
          <div style={{ position: "relative", width: totalWidth, height: totalHeight }}>
            <svg width={totalWidth} height={totalHeight} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {edges.map((e, i) => {
                const midX = (e.x1 + e.x2) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2}`}
                    fill="none"
                    stroke="var(--border-strong)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>
            {nodes.map((n) => (
              <div
                key={n.user.id}
                className={`org-card${n.user.id === meId ? " me" : ""}`}
                style={{ position: "absolute", left: n.x, top: n.y, width: CARD_W, height: CARD_H }}
                title={`${n.user.name} · ${ROLE_LABEL[n.user.role]}`}
              >
                <Avatar name={n.user.name} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div className="org-name">{n.user.name}</div>
                  <div className="org-role">{ROLE_LABEL[n.user.role]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
