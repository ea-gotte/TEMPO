import { Canvas, PencilBrush, Point } from "fabric";
import { shapeBox } from "./connectors";
import { clampZoom, exportScale, fitViewport, unionBoxes, type Box, type Pt, type Viewport } from "./geometry";
import type { Tool } from "./tools";

/**
 * Lienzo infinito: zoom con la rueda, desplazamiento con la mano / Espacio /
 * botón del medio, modo de herramienta y exportación a PNG.
 * Adaptado de lib/canvas.ts de Figma_Clone (github.com/Lyam0udi/Figma_Clone),
 * SIN el límite de bordes que allá encierra a los objetos en la pantalla.
 */

export function createBoardCanvas(el: HTMLCanvasElement, width: number, height: number): Canvas {
  return new Canvas(el, {
    width,
    height,
    preserveObjectStacking: true, // seleccionar no trae el objeto al frente
    fireMiddleClick: true,
    stopContextMenu: true,
    targetFindTolerance: 6,
    selectionColor: "rgba(91,108,255,0.08)",
    selectionBorderColor: "#5b6cff",
    selectionLineWidth: 1,
  });
}

export function getViewport(c: Canvas): Viewport {
  const v = c.viewportTransform;
  return { x: v[4], y: v[5], zoom: v[0] };
}

export function setViewport(c: Canvas, v: Viewport) {
  c.setViewportTransform([v.zoom, 0, 0, v.zoom, v.x, v.y]);
  c.requestRenderAll();
}

export function zoomAt(c: Canvas, at: Pt, zoom: number) {
  c.zoomToPoint(new Point(at.x, at.y), clampZoom(zoom));
  c.requestRenderAll();
}

export const zoomStep = (c: Canvas, dir: 1 | -1) => zoomAt(c, { x: c.width / 2, y: c.height / 2 }, c.getZoom() * (dir > 0 ? 1.2 : 1 / 1.2));

/** Caja de todo el contenido guardable (sin auxiliares), en escena. */
export function contentBox(c: Canvas): Box | null {
  return unionBoxes(c.getObjects().filter((o) => !o.excludeFromExport && o.visible).map(shapeBox));
}

export function fitToContent(c: Canvas) {
  const b = contentBox(c);
  setViewport(c, b ? fitViewport(b, { width: c.width, height: c.height }) : { x: 0, y: 0, zoom: 1 });
}

/** Centro de la vista en coordenadas de escena (donde se insertan las imágenes). */
export function viewCenter(c: Canvas): Pt {
  const v = getViewport(c);
  return { x: (c.width / 2 - v.x) / v.zoom, y: (c.height / 2 - v.y) / v.zoom };
}

/** Prepara el lienzo para la herramienta: selección, dibujo a mano, cursor. */
export function applyToolMode(c: Canvas, tool: Tool, pen: { color: string; width: number }) {
  c.isDrawingMode = tool === "pencil";
  if (tool === "pencil") {
    const brush = new PencilBrush(c);
    brush.color = pen.color;
    brush.width = pen.width;
    c.freeDrawingBrush = brush;
  }
  const selecting = tool === "select";
  c.selection = selecting;
  // con una herramienta de dibujo, arrastrar encima de otro objeto dibuja (no lo agarra)
  c.skipTargetFind = !selecting;
  c.defaultCursor = tool === "hand" ? "grab" : selecting ? "default" : "crosshair";
  if (!selecting) c.discardActiveObject();
  c.requestRenderAll();
}

/** Zoom con la rueda (sobre el cursor) y desplazamiento arrastrando. Devuelve la función para soltar los eventos. */
export function attachPanZoom(c: Canvas, opts: { panMode: () => boolean; onChange: () => void }): () => void {
  let last: Pt | null = null;
  const offs = [
    c.on("mouse:wheel", (o) => {
      const e = o.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      zoomAt(c, { x: e.offsetX, y: e.offsetY }, c.getZoom() * 0.999 ** e.deltaY);
      opts.onChange();
    }),
    c.on("mouse:down", (o) => {
      const e = o.e as MouseEvent;
      if (!opts.panMode() && e.button !== 1) return;
      last = { x: e.clientX, y: e.clientY };
      c.setCursor("grabbing");
    }),
    c.on("mouse:move", (o) => {
      if (!last) return;
      const e = o.e as MouseEvent;
      c.relativePan(new Point(e.clientX - last.x, e.clientY - last.y));
      last = { x: e.clientX, y: e.clientY };
      c.requestRenderAll();
    }),
    c.on("mouse:up", () => {
      if (!last) return;
      last = null;
      opts.onChange();
    }),
  ];
  return () => offs.forEach((off) => off());
}

/**
 * PNG de todo el contenido, fondo blanco y margen de 24 px. "empty" si el tablero está vacío;
 * "failed" si el navegador no pudo generar la imagen (por ejemplo, demasiado grande).
 */
export async function exportPng(c: Canvas): Promise<Blob | "empty" | "failed"> {
  const b = contentBox(c);
  if (!b) return "empty";
  const pad = 24;
  const box = { left: b.left - pad, top: b.top - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  const vpt = [...c.viewportTransform] as typeof c.viewportTransform;
  const bg = c.backgroundColor;
  c.discardActiveObject();
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  c.backgroundColor = "#ffffff";
  try {
    return (await c.toBlob({ format: "png", multiplier: exportScale(box.width, box.height), ...box })) ?? "failed";
  } catch {
    return "failed";
  } finally {
    c.backgroundColor = bg;
    c.setViewportTransform(vpt);
    c.requestRenderAll();
  }
}
