import { IText, type Canvas, type Line } from "fabric";
import { lineEnds } from "./connectors";
import { Arrow, CAPTION_SIZE, markTransient, prepareObject, replaceObject } from "./shapes";
import { FONT, INK } from "./tools";

/**
 * Texto en flechas y líneas ("Sí", "No"…): se escribe con doble clic y se dibuja en el
 * punto medio (ver Arrow en shapes.ts).
 */

/** Las líneas guardadas antes de que existiera el texto son Line: se pasan a flecha sin punta, que se ve igual. */
function asArrow(canvas: Canvas, l: Line): Arrow {
  if (l instanceof Arrow) return l;
  const { start, end } = lineEnds(l);
  const next = new Arrow([start.x, start.y, end.x, end.y], {
    stroke: l.stroke,
    strokeWidth: l.strokeWidth,
    strokeLineCap: l.strokeLineCap,
    strokeDashArray: l.strokeDashArray,
    opacity: l.opacity,
  });
  next.set({ id: l.id, kind: l.kind, fromId: l.fromId ?? null, toId: l.toId ?? null, lockedByUser: l.lockedByUser, heads: "none" });
  prepareObject(next);
  replaceObject(canvas, l, next);
  return next;
}

/** Edita el texto de una flecha o línea en su punto medio. Si queda vacío, la flecha queda sin texto. */
export function editCaption(canvas: Canvas, line: Line, onDone: (next: Arrow) => void) {
  const { start, end } = lineEnds(line);
  const before = line.caption ?? "";
  line.set({ caption: undefined }); // mientras se escribe, se ve solo el editor
  const editor = markTransient(
    new IText(before, {
      left: (start.x + end.x) / 2,
      top: (start.y + end.y) / 2,
      fontSize: CAPTION_SIZE,
      fontWeight: "500",
      fontFamily: FONT,
      fill: typeof line.stroke === "string" ? line.stroke : INK,
      textAlign: "center",
      backgroundColor: "#ffffff",
    }),
  );
  canvas.add(editor);
  canvas.setActiveObject(editor);
  editor.enterEditing();
  editor.selectAll();
  editor.on("editing:exited", () => {
    canvas.remove(editor);
    const next = asArrow(canvas, line);
    next.set({ caption: editor.text.trim() || undefined });
    canvas.setActiveObject(next);
    canvas.requestRenderAll();
    onDone(next);
  });
}
