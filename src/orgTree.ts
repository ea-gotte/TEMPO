import type { User } from "./types";

/**
 * Layout de árbol jerárquico HORIZONTAL (raíz a la izquierda, ramifica hacia
 * la derecha), reutilizado por el Organigrama (OrgChart.tsx) y por la vista
 * de cadena de mando de Control de horas (HoursControl.tsx) — misma lógica
 * de árbol, dos usos distintos.
 */

export interface TreeNode {
  user: User;
  children: TreeNode[];
}

export interface PositionedNode {
  user: User;
  x: number;
  y: number;
  children: PositionedNode[];
}

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  parentId: string;
  childId: string;
}

export const CARD_W = 140;
export const CARD_H = 56;
/** Espacio entre niveles (horizontal, la dirección en la que crece el árbol). */
export const H_GAP = 46;
/** Espacio entre hermanos (vertical). */
export const V_GAP = 14;

/** Ids de la cadena de mando de una persona: sus jefes hacia arriba + ella misma + todo su equipo hacia abajo. */
export function teamIds(users: User[], meId: string): Set<string> {
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

export function buildForest(users: User[]): TreeNode[] {
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

/** Alto total (vertical) que ocupa el subárbol, apilando a los hijos uno debajo del otro. */
function subtreeSpan(node: TreeNode): number {
  if (node.children.length === 0) return CARD_H;
  const total = node.children.reduce((sum, c) => sum + subtreeSpan(c), 0) + V_GAP * (node.children.length - 1);
  return Math.max(CARD_H, total);
}

function layout(node: TreeNode, topEdge: number, depth: number): PositionedNode {
  const span = subtreeSpan(node);
  const childSpans = node.children.map(subtreeSpan);
  const totalChildSpan = childSpans.reduce((a, b) => a + b, 0) + V_GAP * Math.max(0, node.children.length - 1);
  const centerY = topEdge + span / 2;
  const x = depth * (CARD_W + H_GAP);
  let cursor = topEdge + (span - totalChildSpan) / 2;
  const children = node.children.map((c, i) => {
    const placed = layout(c, cursor, depth + 1);
    cursor += childSpans[i] + V_GAP;
    return placed;
  });
  return { user: node.user, x, y: centerY, children };
}

function flatten(node: PositionedNode, nodes: PositionedNode[], edges: Edge[]) {
  nodes.push(node);
  for (const c of node.children) {
    edges.push({ x1: node.x + CARD_W, y1: node.y + CARD_H / 2, x2: c.x, y2: c.y + CARD_H / 2, parentId: node.user.id, childId: c.user.id });
    flatten(c, nodes, edges);
  }
}

export function buildLayout(roots: TreeNode[]) {
  const nodes: PositionedNode[] = [];
  const edges: Edge[] = [];
  let cursor = 0;
  for (const root of roots) {
    const span = subtreeSpan(root);
    const placed = layout(root, cursor, 0);
    flatten(placed, nodes, edges);
    cursor += span + V_GAP * 2;
  }
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
  return { nodes, edges, totalWidth: maxX + CARD_W, totalHeight: Math.max(cursor - V_GAP * 2, CARD_H) };
}
