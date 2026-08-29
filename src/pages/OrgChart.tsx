import React, { useMemo } from "react";
import { useStore } from "../store";
import type { Role, User } from "../types";
import { Avatar } from "../components/ui";

/**
 * Organigrama dinámico, construido con los datos reales de "Supervisor" que ya
 * tiene cada persona (Team.tsx) — sin ningún dato nuevo. Un usuario ve su propia
 * cadena de mando (sus jefes hacia arriba y su equipo hacia abajo); el admin ve
 * la empresa completa.
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  usuario: "Usuario",
};

interface TreeNode {
  user: User;
  children: TreeNode[];
}

interface PositionedNode {
  user: User;
  x: number;
  y: number;
  children: PositionedNode[];
}

const CARD_W = 136;
const CARD_H = 60;
const H_GAP = 20;
const V_GAP = 46;

/** Ids de la cadena de mando de una persona: sus jefes hacia arriba + ella misma + todo su equipo hacia abajo. */
function teamIds(users: User[], meId: string): Set<string> {
  const byId = new Map(users.map((u) => [u.id, u]));
  const ids = new Set<string>([meId]);

  let cur = byId.get(meId);
  while (cur?.supervisorId && !ids.has(cur.supervisorId)) {
    ids.add(cur.supervisorId);
    cur = byId.get(cur.supervisorId);
  }

  const childrenOf = new Map<string, User[]>();
  for (const u of users) {
    if (!u.supervisorId) continue;
    if (!childrenOf.has(u.supervisorId)) childrenOf.set(u.supervisorId, []);
    childrenOf.get(u.supervisorId)!.push(u);
  }
  const stack = [meId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenOf.get(id) ?? []) {
      if (!ids.has(c.id)) { ids.add(c.id); stack.push(c.id); }
    }
  }
  return ids;
}

function buildForest(users: User[]): TreeNode[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const nodeOf = new Map<string, TreeNode>();
  for (const u of users) nodeOf.set(u.id, { user: u, children: [] });
  const roots: TreeNode[] = [];
  for (const u of users) {
    const node = nodeOf.get(u.id)!;
    if (u.supervisorId && byId.has(u.supervisorId)) {
      nodeOf.get(u.supervisorId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortByName = (a: TreeNode, b: TreeNode) => a.user.name.localeCompare(b.user.name);
  const sortRec = (n: TreeNode) => { n.children.sort(sortByName); n.children.forEach(sortRec); };
  roots.sort(sortByName);
  roots.forEach(sortRec);
  return roots;
}

function subtreeWidth(node: TreeNode): number {
  if (node.children.length === 0) return CARD_W;
  const total = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0) + H_GAP * (node.children.length - 1);
  return Math.max(CARD_W, total);
}

function layout(node: TreeNode, leftEdge: number, depth: number): PositionedNode {
  const width = subtreeWidth(node);
  const childWidths = node.children.map(subtreeWidth);
  const totalChildWidth = childWidths.reduce((a, b) => a + b, 0) + H_GAP * Math.max(0, node.children.length - 1);
  const centerX = leftEdge + width / 2;
  const y = depth * (CARD_H + V_GAP);
  let cursor = leftEdge + (width - totalChildWidth) / 2;
  const children = node.children.map((c, i) => {
    const placed = layout(c, cursor, depth + 1);
    cursor += childWidths[i] + H_GAP;
    return placed;
  });
  return { user: node.user, x: centerX, y, children };
}

function flatten(node: PositionedNode, nodes: PositionedNode[], edges: { x1: number; y1: number; x2: number; y2: number }[]) {
  nodes.push(node);
  for (const c of node.children) {
    edges.push({ x1: node.x, y1: node.y + CARD_H, x2: c.x, y2: c.y });
    flatten(c, nodes, edges);
  }
}

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

  const { nodes, edges, totalWidth, totalHeight } = useMemo(() => {
    const allNodes: PositionedNode[] = [];
    const allEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    let cursor = 0;
    for (const root of roots) {
      const w = subtreeWidth(root);
      const placed = layout(root, cursor, 0);
      flatten(placed, allNodes, allEdges);
      cursor += w + H_GAP * 2;
    }
    const maxDepth = allNodes.reduce((m, n) => Math.max(m, n.y), 0);
    return { nodes: allNodes, edges: allEdges, totalWidth: Math.max(cursor - H_GAP * 2, CARD_W), totalHeight: maxDepth + CARD_H };
  }, [roots]);

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
          <div style={{ position: "relative", width: totalWidth, height: totalHeight, margin: "0 auto" }}>
            <svg width={totalWidth} height={totalHeight} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {edges.map((e, i) => {
                const midY = (e.y1 + e.y2) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${e.x1} ${e.y1} V ${midY} H ${e.x2} V ${e.y2}`}
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
                style={{ position: "absolute", left: n.x - CARD_W / 2, top: n.y, width: CARD_W, height: CARD_H }}
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
