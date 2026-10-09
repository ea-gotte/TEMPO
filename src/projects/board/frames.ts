import { IText, Point, Rect, classRegistry, type Canvas, type FabricObject, type Line, type TBBox } from "fabric";
import { uid } from "../../utils";
import { isConnector, lineEnds, setLineEnds, shapeBox } from "./connectors";
import type { Box } from "./geometry";
import { SECTION_HEADER, inSection, sectionHit, sectionOrder } from "./sections";
import { isTransient, markTransient, prepareObject } from "./shapes";
import { FONT } from "./tools";

/**
 * Secciones (capa Fabric): un marco con título que ordena el tablero en zonas. Lo de adentro
 * se mueve con ella, siempre quedan detrás del resto y se toman por el título o el borde
 * (adentro, el clic es para lo que contienen). La geometría pura está en sections.ts.
 */

const TITLE_COLOR = "#3b3f46";

export class Frame extends Rect {
  static type = "Frame";

  /** Mientras se edita el título, lo muestra el editor */
  hideTitle = false;

  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);
    const w = this.width;
    const h = this.height;
    ctx.save();
    // franja del título, apenas más oscura que el fondo
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, Math.min(SECTION_HEADER, h));
    ctx.clip();
    ctx.fillStyle = "rgba(15, 17, 22, 0.04)";
    ctx.fillRect(-w / 2, -h / 2, w, SECTION_HEADER);
    if (!this.hideTitle) {
      ctx.font = `600 15px ${FONT}`;
      ctx.fillStyle = TITLE_COLOR;
      ctx.textBaseline = "middle";
      ctx.fillText(this.caption || "Sección", -w / 2 + 14, -h / 2 + SECTION_HEADER / 2);
    }
    ctx.restore();
  }
}
classRegistry.setClass(Frame);

export const isSection = (o: FabricObject | null | undefined): o is Frame => o?.kind === "frame";

export function createSection(box: Box, title: string): Frame {
  const w = Math.max(box.width, 160);
  const h = Math.max(box.height, 120);
  const f = new Frame({
    left: box.left + w / 2, top: box.top + h / 2, width: w, height: h,
    fill: "#ffffff", stroke: "#d0d5dd", strokeWidth: 1.5, strokeUniform: true, rx: 10, ry: 10,
  });
  f.set({ id: uid(), kind: "frame", caption: title });
  prepareObject(f);
  return f;
}

/** Lo que está adentro de la sección (incluidas las secciones más chicas que contiene). */
export function sectionContents(canvas: Canvas, section: FabricObject): FabricObject[] {
  const b = shapeBox(section);
  return canvas.getObjects().filter((o) => o !== section && !isTransient(o) && !o.group && inSection(b, shapeBox(o)));
}

/**
 * Lo de adentro de cada una de `sections`, sin lo que está en `exclude` (lo que ya se mueve por su
 * cuenta). Un objeto dentro de dos de ellas (una sección dentro de otra) va con la más chica.
 */
export function contentsBySection(canvas: Canvas, sections: FabricObject[], exclude: Set<FabricObject>): Map<FabricObject, FabricObject[]> {
  const taken = new Set(exclude);
  const area = (o: FabricObject) => {
    const b = shapeBox(o);
    return b.width * b.height;
  };
  const out = new Map<FabricObject, FabricObject[]>();
  for (const s of [...sections].sort((a, b) => area(a) - area(b))) {
    const mine = sectionContents(canvas, s).filter((o) => !taken.has(o));
    mine.forEach((o) => taken.add(o));
    out.set(s, mine);
  }
  return out;
}

/**
 * Desplaza objetos (lo de adentro de una sección que se movió con el teclado o al alinear). Las
 * flechas se mueven por sus extremos: después refreshConnectors reacomoda los enganchados.
 */
export function shiftObjects(objs: FabricObject[], dx: number, dy: number) {
  for (const o of objs) {
    if (isConnector(o)) {
      const { start, end } = lineEnds(o as Line);
      setLineEnds(o as Line, { x: start.x + dx, y: start.y + dy }, { x: end.x + dx, y: end.y + dy });
    } else {
      o.set({ left: o.left + dx, top: o.top + dy });
      o.setCoords();
    }
  }
}

/** Las secciones van al fondo, las más grandes más atrás (se llama antes de registrar cada cambio). */
export function keepSectionsBack(canvas: Canvas) {
  const sections = canvas.getObjects().filter(isSection);
  sectionOrder(sections.map(shapeBox)).forEach((idx, i) => {
    if (canvas.getObjects().indexOf(sections[idx]) !== i) canvas.moveObjectTo(sections[idx], i);
  });
}

/**
 * Una sección se toma por su título o su borde: el interior deja pasar el clic a lo que contiene, y una
 * selección por área solo la incluye si la abarca entera. Devuelve la función que lo deshace.
 */
export function attachSectionPicking(c: Canvas): () => void {
  type Picking = {
    _checkTarget: (obj: FabricObject, pointer: Point) => boolean;
    collectObjects: (bbox: TBBox, opts?: { includeIntersecting?: boolean }) => FabricObject[];
  };
  const pc = c as unknown as Picking;
  const check = pc._checkTarget.bind(c);
  const collect = pc.collectObjects.bind(c);
  pc._checkTarget = (obj, pointer) => check(obj, pointer) && (!isSection(obj) || sectionHit(shapeBox(obj), pointer, 8 / c.getZoom()));
  pc.collectObjects = (bbox, opts) => {
    const tl = new Point(bbox.left, bbox.top);
    const br = new Point(bbox.left + bbox.width, bbox.top + bbox.height);
    return collect(bbox, opts).filter((o) => !isSection(o) || o.isContainedWithinRect(tl, br));
  };
  return () => {
    delete (c as unknown as Partial<Picking>)._checkTarget;
    delete (c as unknown as Partial<Picking>).collectObjects;
  };
}

/** Doble clic en el título: se escribe encima; vacío deja el que tenía. */
export function editSectionTitle(canvas: Canvas, section: Frame, onDone: () => void) {
  const b = shapeBox(section);
  const before = section.caption ?? "";
  const editor = markTransient(
    new IText(before, {
      left: b.left + 14, top: b.top + SECTION_HEADER / 2, originX: "left", originY: "center",
      fontSize: 15, fontWeight: "600", fontFamily: FONT, fill: TITLE_COLOR,
    }),
  );
  section.hideTitle = true;
  section.set({ dirty: true });
  canvas.add(editor);
  canvas.setActiveObject(editor);
  editor.enterEditing();
  editor.selectAll();
  editor.on("editing:exited", () => {
    canvas.remove(editor);
    section.hideTitle = false;
    section.set({ caption: editor.text.trim() || before || "Sección", dirty: true });
    canvas.setActiveObject(section);
    canvas.requestRenderAll();
    onDone();
  });
}
