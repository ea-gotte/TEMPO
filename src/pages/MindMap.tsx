import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type { Project, SubProject, TimeEntry, User } from "../types";
import { fmtDur } from "../utils";
import { Icon } from "../components/Icon";

/**
 * Mapa mental de dedicación: nodo central = persona, primer anillo = proyectos
 * en los que registró horas, segundo anillo = subproyectos. El tamaño de cada
 * nodo es proporcional al tiempo acumulado y las posiciones se acomodan solas
 * con una simulación de fuerzas simple (estilo grafo de Obsidian), simulada e
 * "dibujada" a mano con SVG — sin librerías externas.
 */

type NodeKind = "user" | "project" | "subproject" | "none";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  color: string;
  minutes: number;
  entries: number;
  r: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
}

const W = 1000;
const H = 640;

function radiusFor(mins: number, max: number, lo: number, hi: number): number {
  if (max <= 0) return lo;
  return lo + (hi - lo) * Math.sqrt(mins / max);
}

function buildGraph(centerUser: User, entries: TimeEntry[], projects: Project[], subProjects: SubProject[]) {
  const projMinutes = new Map<string, number>();
  const projCount = new Map<string, number>();
  const subMinutes = new Map<string, number>();
  const subCount = new Map<string, number>();
  let noneMinutes = 0;
  let noneCount = 0;

  for (const e of entries) {
    const mins = e.end - e.start;
    if (e.projectId) {
      projMinutes.set(e.projectId, (projMinutes.get(e.projectId) ?? 0) + mins);
      projCount.set(e.projectId, (projCount.get(e.projectId) ?? 0) + 1);
      if (e.subProjectId) {
        subMinutes.set(e.subProjectId, (subMinutes.get(e.subProjectId) ?? 0) + mins);
        subCount.set(e.subProjectId, (subCount.get(e.subProjectId) ?? 0) + 1);
      }
    } else {
      noneMinutes += mins;
      noneCount++;
    }
  }

  const totalMinutes = entries.reduce((a, e) => a + (e.end - e.start), 0);
  const maxBranch = Math.max(1, ...projMinutes.values(), ...subMinutes.values(), noneMinutes);

  const nodes: GraphNode[] = [
    { id: "me", kind: "user", label: centerUser.name, color: "var(--accent)", minutes: totalMinutes, entries: entries.length, r: 38 },
  ];
  const edges: GraphEdge[] = [];

  const sortedProjects = [...projMinutes.entries()].sort((a, b) => b[1] - a[1]);
  for (const [pid, mins] of sortedProjects) {
    const p = projects.find((x) => x.id === pid);
    if (!p) continue;
    nodes.push({
      id: `p:${pid}`, kind: "project", label: p.name, color: p.color, minutes: mins,
      entries: projCount.get(pid) ?? 0, r: radiusFor(mins, maxBranch, 22, 56),
    });
    edges.push({ source: "me", target: `p:${pid}` });
  }

  const sortedSubs = [...subMinutes.entries()].sort((a, b) => b[1] - a[1]);
  for (const [sid, mins] of sortedSubs) {
    const sp = subProjects.find((x) => x.id === sid);
    if (!sp || !projMinutes.has(sp.projectId)) continue;
    const p = projects.find((x) => x.id === sp.projectId);
    nodes.push({
      id: `s:${sid}`, kind: "subproject", label: sp.name, color: p?.color ?? "#8a8a8a", minutes: mins,
      entries: subCount.get(sid) ?? 0, r: radiusFor(mins, maxBranch, 14, 38),
    });
    edges.push({ source: `p:${sp.projectId}`, target: `s:${sid}` });
  }

  if (noneMinutes > 0) {
    nodes.push({
      id: "none", kind: "none", label: "Sin proyecto", color: "var(--text-3)", minutes: noneMinutes,
      entries: noneCount, r: radiusFor(noneMinutes, maxBranch, 18, 44),
    });
    edges.push({ source: "me", target: "none" });
  }

  return { nodes, edges, totalMinutes };
}

interface ForceParams {
  /** Fuerza de dispersión: qué tanto se empujan los nodos entre sí para no amontonarse */
  repel: number;
  /** Fuerza de atracción: qué tanto tiran los enlaces de los nodos conectados para acercarlos */
  attract: number;
}

function tick(nodes: SimNode[], edges: GraphEdge[], byId: Map<string, SimNode>, alpha: number, params: ForceParams) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 > 160000) continue; // > 400px: ignorar (ahorra CPU, no aporta al layout)
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2);
      const force = (params.repel / d2) * alpha;
      const ux = dx / d, uy = dy / d;
      if (a.fx == null) { a.vx += ux * force; a.vy += uy * force; }
      if (b.fx == null) { b.vx -= ux * force; b.vy -= uy * force; }
      const minD = a.r + b.r + 24;
      if (d < minD) {
        const overlap = (minD - d) / 2;
        if (a.fx == null) { a.x += ux * overlap; a.y += uy * overlap; }
        if (b.fx == null) { b.x -= ux * overlap; b.y -= uy * overlap; }
      }
    }
  }

  for (const e of edges) {
    const a = byId.get(e.source), b = byId.get(e.target);
    if (!a || !b) continue;
    const rest = a.r + b.r + 58;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const force = (d - rest) * params.attract * alpha;
    const ux = dx / d, uy = dy / d;
    if (a.fx == null) { a.vx += ux * force; a.vy += uy * force; }
    if (b.fx == null) { b.vx -= ux * force; b.vy -= uy * force; }
  }

  for (const n of nodes) {
    if (n.fx != null) { n.x = n.fx; n.y = n.fy!; n.vx = 0; n.vy = 0; continue; }
    n.vx += -n.x * 0.008 * alpha;
    n.vy += -n.y * 0.008 * alpha;
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += n.vx;
    n.y += n.vy;
  }
}

export function MindMap({ userId }: { userId: string }) {
  const { state } = useStore();
  const selectedUser = state.users.find((u) => u.id === userId)!;

  const entries = useMemo(
    () => state.entries.filter((e) => e.userId === userId),
    [state.entries, userId],
  );

  const { nodes: graphNodes, edges: graphEdges, totalMinutes } = useMemo(
    () => buildGraph(selectedUser, entries, state.projects, state.subProjects),
    [selectedUser, entries, state.projects, state.subProjects],
  );

  const neighborsOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of graphNodes) m.set(n.id, new Set());
    for (const e of graphEdges) {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    }
    return m;
  }, [graphNodes, graphEdges]);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewGroupRef = useRef<SVGGElement>(null);
  const nodeElRefs = useRef(new Map<string, SVGGElement>());
  const edgeElRefs = useRef(new Map<number, SVGLineElement>());
  const simRef = useRef<{ nodes: SimNode[] }>({ nodes: [] });
  const alphaRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const dragInfo = useRef<{ id: string; moved: boolean; startClientX: number; startClientY: number } | null>(null);
  const panInfo = useRef<{ startClientX: number; startClientY: number; startViewX: number; startViewY: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Parámetros de la simulación, ajustables desde la UI: dispersión (qué tanto
  // se repelen los nodos) y atracción (qué tanto tiran los enlaces para juntar
  // los nodos conectados). Viven en un ref para que el loop de animación los
  // lea siempre al día sin tener que reiniciarse.
  const [repel, setRepel] = useState(2600);
  const [attract, setAttract] = useState(0.06);
  const paramsRef = useRef<ForceParams>({ repel, attract });
  paramsRef.current = { repel, attract };

  // Ref siempre al día con las aristas actuales: si el loop de animación ya
  // estaba corriendo cuando cambian los datos, no debe quedarse leyendo una
  // lista de conexiones vieja (por closure) hasta que decaiga y se reinicie.
  const edgesRef = useRef(graphEdges);
  edgesRef.current = graphEdges;

  function reheat() {
    alphaRef.current = Math.max(alphaRef.current, 0.6);
    startLoop();
  }

  function applyViewTransform() {
    const g = viewGroupRef.current;
    if (g) g.setAttribute("transform", `translate(${W / 2 + viewRef.current.x},${H / 2 + viewRef.current.y}) scale(${viewRef.current.k})`);
  }

  function clientToWorld(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    const v = viewRef.current;
    return { x: (sx - W / 2 - v.x) / v.k, y: (sy - H / 2 - v.y) / v.k };
  }

  function startLoop() {
    if (rafRef.current != null) return;
    const step = () => {
      const nodes = simRef.current.nodes;
      const edges = edgesRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      alphaRef.current *= 0.985;
      const alpha = Math.max(alphaRef.current, dragInfo.current ? 0.4 : 0);
      tick(nodes, edges, byId, Math.max(alpha, 0.02), paramsRef.current);
      for (const n of nodes) {
        const el = nodeElRefs.current.get(n.id);
        if (el) el.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
      }
      edges.forEach((e, i) => {
        const a = byId.get(e.source), b = byId.get(e.target);
        const el = edgeElRefs.current.get(i);
        if (el && a && b) {
          el.setAttribute("x1", a.x.toFixed(1)); el.setAttribute("y1", a.y.toFixed(1));
          el.setAttribute("x2", b.x.toFixed(1)); el.setAttribute("y2", b.y.toFixed(1));
        }
      });
      if (alphaRef.current > 0.02 || dragInfo.current) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  // (Re)construir la simulación cuando cambian los datos, preservando posiciones
  // ya calculadas para los nodos que siguen existiendo (evita que "salte" todo
  // el grafo de golpe si solo cambió un registro).
  useEffect(() => {
    const prev = new Map(simRef.current.nodes.map((n) => [n.id, n]));
    const nodes: SimNode[] = graphNodes.map((g, i) => {
      const old = prev.get(g.id);
      if (old) return { ...old, label: g.label, color: g.color, minutes: g.minutes, entries: g.entries, r: g.r };
      const angle = (i / Math.max(graphNodes.length - 1, 1)) * Math.PI * 2;
      const startRadius = g.kind === "user" ? 0 : g.kind === "project" ? 150 : 260;
      return {
        ...g,
        x: Math.cos(angle) * startRadius, y: Math.sin(angle) * startRadius, vx: 0, vy: 0,
        fx: g.kind === "user" ? 0 : null, fy: g.kind === "user" ? 0 : null,
      };
    });
    simRef.current = { nodes };
    alphaRef.current = 1;
    startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphNodes]);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // Resaltar el nodo seleccionado y sus vecinos directos, atenuar el resto
  useEffect(() => {
    const highlight = selectedNode ? new Set([selectedNode, ...(neighborsOf.get(selectedNode) ?? [])]) : null;
    for (const [id, el] of nodeElRefs.current) el.style.opacity = !highlight || highlight.has(id) ? "1" : "0.28";
    graphEdges.forEach((e, i) => {
      const el = edgeElRefs.current.get(i);
      if (!el) return;
      el.style.opacity = !highlight || (highlight.has(e.source) && highlight.has(e.target)) ? "1" : "0.12";
    });
  }, [selectedNode, neighborsOf, graphEdges]);

  function onNodeDown(ev: React.MouseEvent, id: string) {
    ev.stopPropagation();
    const n = simRef.current.nodes.find((x) => x.id === id);
    if (!n) return;
    dragInfo.current = { id, moved: false, startClientX: ev.clientX, startClientY: ev.clientY };
    n.fx = n.x; n.fy = n.y;
  }

  function onBackgroundDown(ev: React.MouseEvent) {
    panInfo.current = { startClientX: ev.clientX, startClientY: ev.clientY, startViewX: viewRef.current.x, startViewY: viewRef.current.y };
  }

  function onWheel(ev: React.WheelEvent) {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
    const before = clientToWorld(ev.clientX, ev.clientY);
    viewRef.current.k = Math.max(0.35, Math.min(2.5, viewRef.current.k * factor));
    const svg = svgRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * W;
      const sy = ((ev.clientY - rect.top) / rect.height) * H;
      viewRef.current.x = sx - W / 2 - before.x * viewRef.current.k;
      viewRef.current.y = sy - H / 2 - before.y * viewRef.current.k;
    }
    applyViewTransform();
  }

  function resetView() {
    viewRef.current = { x: 0, y: 0, k: 1 };
    applyViewTransform();
    alphaRef.current = Math.max(alphaRef.current, 0.5);
    startLoop();
  }

  useEffect(() => {
    function onWinMove(e: MouseEvent) {
      if (dragInfo.current) {
        const info = dragInfo.current;
        info.moved = info.moved || Math.abs(e.clientX - info.startClientX) > 3 || Math.abs(e.clientY - info.startClientY) > 3;
        const n = simRef.current.nodes.find((x) => x.id === info.id);
        if (n) {
          const w = clientToWorld(e.clientX, e.clientY);
          n.fx = w.x; n.fy = w.y;
        }
        alphaRef.current = Math.max(alphaRef.current, 0.4);
        startLoop();
      } else if (panInfo.current) {
        const p = panInfo.current;
        const svg = svgRef.current;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          viewRef.current.x = p.startViewX + (e.clientX - p.startClientX) * (W / rect.width);
          viewRef.current.y = p.startViewY + (e.clientY - p.startClientY) * (H / rect.height);
          applyViewTransform();
        }
      }
    }
    function onWinUp() {
      if (dragInfo.current) {
        const { id, moved } = dragInfo.current;
        const n = simRef.current.nodes.find((x) => x.id === id);
        if (n) { n.fx = null; n.fy = null; }
        if (!moved) setSelectedNode((cur) => (cur === id ? null : id));
        dragInfo.current = null;
        alphaRef.current = Math.max(alphaRef.current, 0.3);
        startLoop();
      }
      panInfo.current = null;
    }
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
    return () => {
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = graphNodes.find((n) => n.id === selectedNode) ?? null;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px 0", flexWrap: "wrap" }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Mapa mental — dedicación por proyecto</div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{fmtDur(totalMinutes)} en total</span>
        <button className="btn btn-ghost btn-sm" onClick={resetView}>
          <Icon name="scale" size={14} /> Centrar
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "10px 18px 0", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)" }}>
          Dispersión
          <input
            type="range" min={800} max={6000} step={100} value={repel}
            onChange={(e) => { setRepel(Number(e.target.value)); reheat(); }}
            style={{ width: 110 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)" }}>
          Atracción
          <input
            type="range" min={0.01} max={0.2} step={0.005} value={attract}
            onChange={(e) => { setAttract(Number(e.target.value)); reheat(); }}
            style={{ width: 110 }}
          />
        </label>
      </div>

      {graphNodes.length <= 1 ? (
        <div style={{ textAlign: "center", color: "var(--text-3)", padding: 40 }}>
          Todavía no tenés registros de horas para mostrar en el mapa.
        </div>
      ) : (
        <div style={{ position: "relative", marginTop: 12 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="mm-svg"
            onWheel={onWheel}
            onMouseDown={onBackgroundDown}
          >
            <g ref={viewGroupRef} transform={`translate(${W / 2},${H / 2}) scale(1)`}>
              {graphEdges.map((e, i) => (
                <line
                  key={i}
                  ref={(el) => { if (el) edgeElRefs.current.set(i, el); else edgeElRefs.current.delete(i); }}
                  className="mm-edge"
                  x1={0} y1={0} x2={0} y2={0}
                />
              ))}
              {graphNodes.map((n) => (
                <g
                  key={n.id}
                  ref={(el) => { if (el) nodeElRefs.current.set(n.id, el); else nodeElRefs.current.delete(n.id); }}
                  className="mm-node"
                  onMouseDown={(ev) => onNodeDown(ev, n.id)}
                >
                  <circle r={n.r} fill={n.color} fillOpacity={n.kind === "subproject" ? 0.5 : n.kind === "user" ? 1 : 0.82} stroke={n.color} strokeWidth={n.kind === "user" ? 0 : 2} />
                  <text y={n.r + 15} textAnchor="middle" className="mm-label">{n.label}</text>
                </g>
              ))}
            </g>
          </svg>

          {selected && (
            <div className="mm-panel">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: selected.color === "var(--accent)" ? "var(--accent)" : selected.color, flexShrink: 0 }} />
                <strong style={{ fontSize: 13.5 }}>{selected.label}</strong>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>
                {fmtDur(selected.minutes)} · {selected.entries} registro{selected.entries !== 1 ? "s" : ""}
                {totalMinutes > 0 && selected.kind !== "user" && ` · ${Math.round((selected.minutes / totalMinutes) * 100)}% del total`}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setSelectedNode(null)}>Cerrar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
