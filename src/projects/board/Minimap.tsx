import React, { useEffect, useRef } from "react";
import type { Canvas } from "fabric";
import { getViewport, setViewport } from "./canvas";
import { shapeBox } from "./connectors";
import { unionBoxes, type Box } from "./geometry";
import { mapFit, mapToWorld, type MapFit } from "./mapView";
import { isTransient, type Kind } from "./shapes";

/**
 * Minimapa del tablero: todo el contenido en chico, con el recuadro de lo que se ve. Un clic o un
 * arrastre encima lleva la vista ahí (sin cambiar el zoom).
 */

const W = 200;
const H = 130;
const COLORS: Partial<Record<Kind, string>> = { note: "#fde68a", image: "#cbd5e1", marker: "#e11d48", text: "#64748b" };
/** Lo fino no se dibuja: en chico no se distingue y llena el mapa de rayas */
const SKIP: Kind[] = ["line", "arrow", "measure", "path", "highlight"];

export function Minimap({ canvas, onViewport }: { canvas: Canvas; onViewport: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fit = useRef<MapFit | null>(null);
  // mientras se arrastra sobre el mapa, su encuadre queda fijo (si no, se movería bajo el cursor)
  const dragging = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = W * dpr;
    el.height = H * dpr;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const v = getViewport(canvas);
      const view: Box = { left: -v.x / v.zoom, top: -v.y / v.zoom, width: canvas.width / v.zoom, height: canvas.height / v.zoom };
      const objs = canvas.getObjects().filter((o) => !isTransient(o) && o.visible);
      if (!dragging.current || !fit.current) {
        const world = unionBoxes([view, ...objs.map(shapeBox)])!;
        const pad = Math.max(world.width, world.height) * 0.05;
        fit.current = mapFit({ left: world.left - pad, top: world.top - pad, width: world.width + pad * 2, height: world.height + pad * 2 }, W, H);
      }
      const f = fit.current;
      const rect = (b: Box) => [f.x + b.left * f.scale, f.y + b.top * f.scale, Math.max(b.width * f.scale, 1.5), Math.max(b.height * f.scale, 1.5)] as const;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const o of objs) {
        if (o.kind && SKIP.includes(o.kind)) continue;
        const [x, y, w, h] = rect(shapeBox(o));
        if (o.kind === "frame") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
        } else {
          ctx.fillStyle = (o.kind && COLORS[o.kind]) || "#94a3b8";
          ctx.fillRect(x, y, w, h);
        }
      }
      const [x, y, w, h] = rect(view);
      ctx.fillStyle = "rgba(91, 108, 255, 0.1)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#5b6cff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    const off = canvas.on("after:render", schedule);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, [canvas]);

  const panTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const f = fit.current;
    if (!f) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = mapToWorld(f, { x: e.clientX - r.left, y: e.clientY - r.top });
    const v = getViewport(canvas);
    setViewport(canvas, { zoom: v.zoom, x: canvas.width / 2 - p.x * v.zoom, y: canvas.height / 2 - p.y * v.zoom });
    onViewport();
  };

  return (
    <canvas
      ref={ref}
      className="bd-minimap"
      style={{ width: W, height: H }}
      role="img"
      aria-label="Minimapa del tablero: clic o arrastre para mover la vista"
      title="Clic o arrastre para mover la vista"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // el arrastre sigue aunque salga del mapa
        } catch {
          /* sin captura: el arrastre funciona igual mientras esté encima */
        }
        dragging.current = true;
        panTo(e);
      }}
      onPointerMove={(e) => { if (dragging.current) panTo(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    />
  );
}
