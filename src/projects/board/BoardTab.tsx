import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActiveSelection, IText, type Canvas, type FabricObject, type Group, type Line } from "fabric";
import { Icon } from "../../components/Icon";
import { ContextMenu, type CtxItem } from "../../components/ui";
import { today, uid } from "../../utils";
import { boardEpoch, loadBoard, saveBoard, type BoardDoc } from "./boardStore";
import { applyToolMode, attachPanZoom, createBoardCanvas, exportPng, fitToContent, fitToObjects, getViewport, setViewport, viewCenter, zoomAt, zoomStep } from "./canvas";
import { isConnector, lineEnds, refreshConnectors, setLineEnds, shapeBox } from "./connectors";
import { parseMeters } from "./measure";
import { calibrateImage, refreshMeasures } from "./measures";
import { attachDrawing } from "./draw";
import { connectorEnds, fitScale, fitViewport, gridSpec, snapDelta, unionBoxes, type Box, type Pt } from "./geometry";
import { TEMPLATES, templateBounds, templateOffset, type Template } from "./templates";
import { alignDeltas, distributeDeltas, gridDeltas, type AlignMode } from "./align";
import { createHistory } from "./history";
import { readImage, validateImageFile } from "./image";
import { attachKeys, shouldIntercept, type KeyAction } from "./keys";
import { BOARD_MIME, decodeClip, encodeClip, pasteOffset, textOf } from "./clipboard";
import { bakeScaledLabels, createLabeled, editLabel, isLabeled, readLabeled } from "./labels";
import { editCaption } from "./captions";
import { PropertiesPanel } from "./PropertiesPanel";
import { ObservationsPanel, type ObservationItem } from "./ObservationsPanel";
import { observationsTable, renumberObservations } from "./observations";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { SearchBar } from "./SearchBar";
import { findMatches } from "./search";
import { insertCopies, restore, snapshot } from "./serialize";
import { decodeBoardFile, encodeBoardFile, itemsBounds } from "./boardFile";
import { relinkAfterAltDrag, type Link } from "./altDrag";
import { normalizeLink } from "./links";
import { attachSectionPicking, editSectionTitle, isSection, keepSectionsBack, sectionContents } from "./frames";
import { STAMPS, stampText, type Stamp } from "./stamps";
import { applyLock, createConnector, createImage, createText, isTransient, prepareObject, replaceObject, setMarkerNumber, setMarkerResolved } from "./shapes";
import { applyStyle, readStyle, type StylePatch, type StyleState } from "./style";
import { mergeStyles } from "./styleMerge";
import { SAVE_LABEL, Toolbar, type Pen, type SaveState } from "./Toolbar";
import { INK, NOTE_COLORS, type Tool } from "./tools";
import "./board.css";

/**
 * Tablero del proyecto: un lienzo infinito para pizarra de ideas, marcado de
 * planos e imágenes y diagramas. Se guarda en este navegador (IndexedDB), como el
 * resto de la demo. Basado en la idea de Figma_Clone (github.com/Lyam0udi/Figma_Clone),
 * sin Liveblocks. Spec: docs/superpowers/specs/2026-10-08-tablero-proyecto-design.md
 */

const SNAP_KEY = "tempo-tablero-cuadricula";

type Banner = { kind: "unavailable" } | { kind: "quota"; mb: number } | { kind: "corrupt"; raw: unknown };

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "proyecto";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sección que se está arrastrando: lo de adentro, con su posición (o sus extremos, si es una flecha) al empezar */
interface SectionDrag {
  frame: FabricObject;
  left: number;
  top: number;
  items: { o: FabricObject; left: number; top: number; ends?: { start: Pt; end: Pt } }[];
}

export default function BoardTab({ projectId, fileLabel }: { projectId: string; fileLabel: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const cRef = useRef<Canvas | null>(null);
  const history = useRef(createHistory()).current;
  const lastData = useRef<BoardDoc["fabric"] | null>(null);
  /** Recién con el tablero cargado se puede guardar (StrictMode monta y desmonta antes). */
  const loaded = useRef(false);
  const dirty = useRef(false);
  /** Registro dañado: no se guarda nada hasta que el usuario decida. */
  const blockSave = useRef(false);
  const epoch = useRef(boardEpoch());
  const saveTimer = useRef(0);
  const commitTimer = useRef(0);
  const restoring = useRef(false);
  const restoreQueue = useRef<Promise<void>>(Promise.resolve());
  /** Operación propia en curso: el evento selection:cleared no debe registrar pasos intermedios. */
  const quiet = useRef(false);
  const clipboard = useRef<Record<string, unknown>[]>([]);
  const pasteCount = useRef(0);
  /** Proyecto del que salió lo copiado en memoria */
  const clipSource = useRef("");
  /** Último punto del puntero sobre el lienzo (escena), para pegar donde está el cursor */
  const pointer = useRef<Pt | null>(null);
  const spaceHeld = useRef(false);
  const downAt = useRef<Pt | null>(null);

  const [tool, setToolState] = useState<Tool>("select");
  const toolRef = useRef<Tool>("select");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const noteColorRef = useRef(noteColor);
  noteColorRef.current = noteColor;
  const [pen, setPen] = useState<Pen>({ color: INK, width: 4, highlighter: false });
  const penRef = useRef(pen);
  penRef.current = pen;
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<{
    count: number;
    style: StyleState;
    image: { calibrated: boolean } | null;
    marker: { id: string; num: number; detail: string; resolved: boolean } | null;
    link: { id: string; url: string } | null;
  } | null>(null);
  const [obsOpen, setObsOpen] = useState(false);
  /** Sube con cada cambio registrado (y al deshacer): la lista de observaciones se vuelve a leer del lienzo */
  const [rev, setRev] = useState(0);
  /** Calibrando la escala de esta imagen (se espera que se trace una línea) */
  const [calibrating, setCalibrating] = useState(false);
  const calibImg = useRef<FabricObject | null>(null);
  const [lockedFocus, setLockedFocus] = useState<FabricObject | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [lockPrompt, setLockPrompt] = useState<FabricObject | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState<{ query: string; ids: string[]; index: number } | null>(null);
  // ajustar a la cuadrícula: preferencia de quien mira, recordada en este navegador
  const [snapOn, setSnapOn] = useState(() => {
    try {
      return localStorage.getItem(SNAP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const snapRef = useRef(snapOn);
  snapRef.current = snapOn;
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const noticeTimer = useRef(0);

  /** Aviso dentro del tablero: a diferencia de los toasts de la app, también se ve en pantalla completa. */
  const notify = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);

  /* ---------- Guardado e historial ---------- */

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const c = cRef.current;
    if (!c || !loaded.current || !dirty.current || blockSave.current || epoch.current !== boardEpoch()) return;
    dirty.current = false;
    setSaveState("saving");
    const res = await saveBoard({
      projectId, version: 1, fabric: lastData.current ?? { objects: [] }, viewport: getViewport(c), updatedAt: new Date().toISOString(),
    });
    if (res === "ok") {
      setBanner((b) => (b?.kind === "quota" ? null : b));
      // si hubo otro cambio mientras se guardaba, sigue pendiente
      setSaveState(dirty.current ? "pending" : "saved");
      return;
    }
    dirty.current = true; // se reintenta con el próximo cambio
    setSaveState(res === "unavailable" ? "off" : "error");
    if (res === "quota") setBanner({ kind: "quota", mb: (history.current()?.length ?? 0) / 1e6 });
    else if (res === "unavailable") setBanner({ kind: "unavailable" });
    else notify("No se pudo guardar el tablero.");
  }, [projectId, history, notify]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (!blockSave.current) setSaveState("pending");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 800);
  }, [flushSave]);

  const syncHistory = useCallback(() => {
    setHist({ undo: history.canUndo(), redo: history.canRedo() });
    setRev((r) => r + 1);
  }, [history]);

  /** Registra el estado actual como un paso de deshacer y programa el guardado. */
  const commit = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = 0; // 0 = no hay un commitSoon pendiente
    const c = cRef.current;
    if (!c || !loaded.current || restoring.current) return;
    refreshMeasures(c); // las cotas muestran la longitud según la escala de la imagen que tienen debajo
    keepSectionsBack(c);
    const snap = snapshot(c);
    if (!history.push(snap.json)) return;
    lastData.current = snap.data;
    syncHistory();
    scheduleSave();
  }, [history, scheduleSave, syncHistory]);

  /** Para cambios continuos (opacidad, flechas del teclado): un solo paso de deshacer. */
  const commitSoon = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(commit, 300);
  }, [commit]);

  const refreshPanel = useCallback(() => {
    const c = cRef.current;
    const objs = c ? c.getActiveObjects().filter((o) => !isTransient(o)) : [];
    // con varios objetos, el panel ofrece lo que tenga cualquiera de ellos (no solo el primero)
    const img = objs.length === 1 && objs[0].kind === "image" ? objs[0] : null;
    const mk = objs.length === 1 && objs[0].kind === "marker" && objs[0].id ? objs[0] : null;
    setSel(objs.length ? {
      count: objs.length,
      style: mergeStyles(objs.map(readStyle)),
      image: img ? { calibrated: !!img.mPerPx } : null,
      marker: mk ? { id: mk.id!, num: mk.num ?? 0, detail: mk.detail ?? "", resolved: !!mk.resolved } : null,
      link: objs.length === 1 && objs[0].id ? { id: objs[0].id, url: objs[0].link ?? "" } : null,
    } : null);
  }, []);

  /** Tras cambiar la vista: zoom en la barra, cuadrícula del fondo y guardado. */
  const onViewport = useCallback(() => {
    const c = cRef.current;
    const host = hostRef.current;
    if (!c || !host) return;
    const v = getViewport(c);
    setZoom(v.zoom);
    const g = gridSpec(v);
    host.classList.toggle("no-grid", !g);
    if (g) {
      host.style.backgroundSize = `${g.size}px ${g.size}px`;
      host.style.backgroundPosition = `${g.x}px ${g.y}px`;
    }
    scheduleSave();
  }, [scheduleSave]);

  const setTool = useCallback((t: Tool) => {
    if (t === "image") {
      fileRef.current?.click(); // Imagen no es un modo: abre el selector de archivos
      return;
    }
    toolRef.current = t;
    setToolState(t);
    const c = cRef.current;
    if (c && !spaceHeld.current) applyToolMode(c, t, penRef.current);
    if (t === "area") notify("Superficie: clic en cada vértice; para cerrar, doble clic, Enter o clic en el primero. Esc cancela.");
  }, [notify]);

  /* ---------- Acciones (solo usan refs y callbacks estables) ---------- */

  /** Saca los objetos de la selección (así quedan en coordenadas reales) y los devuelve. */
  const takeSelection = (): FabricObject[] => {
    const c = cRef.current;
    if (!c) return [];
    const objs = c.getActiveObjects().filter((o) => !isTransient(o));
    c.discardActiveObject();
    return objs;
  };

  const select = (objs: FabricObject[]) => {
    const c = cRef.current;
    if (!c) return;
    const live = objs.filter((o) => o.selectable && c.getObjects().includes(o));
    if (live.length === 1) c.setActiveObject(live[0]);
    else if (live.length > 1) c.setActiveObject(new ActiveSelection(live, { canvas: c }));
    c.requestRenderAll();
    refreshPanel();
  };

  const applySnapshot = async (json: string | null) => {
    const c = cRef.current;
    if (!c || json === null) return;
    restoring.current = true;
    try {
      c.discardActiveObject();
      await restore(c, json);
      lastData.current = JSON.parse(json) as BoardDoc["fabric"];
    } finally {
      restoring.current = false;
    }
    setLockedFocus(null);
    setLockPrompt(null); // los objetos se recrearon: la imagen que se ofrecía bloquear ya no es la del lienzo
    syncHistory();
    refreshPanel();
    scheduleSave();
  };

  /**
   * Deshacer/rehacer en fila: con imágenes, restaurar tarda, y mantener apretado Ctrl+Z
   * no debe solapar restauraciones. Antes se registra un cambio que esperaba (commitSoon).
   */
  const step = (pick: () => string | null) => {
    if (commitTimer.current) commit();
    restoreQueue.current = restoreQueue.current.then(() => applySnapshot(pick())).catch(() => {});
  };
  const undo = () => step(() => history.undo());
  const redo = () => step(() => history.redo());

  const restyle = (patch: StylePatch) => {
    const c = cRef.current;
    if (!c) return;
    const next = takeSelection().map((o) => {
      const n = applyStyle(o, patch);
      if (n !== o) replaceObject(c, o, n);
      return n;
    });
    refreshConnectors(c);
    select(next);
    commitSoon();
  };

  const reorder = (front: boolean) => {
    const c = cRef.current;
    if (!c) return;
    const objs = takeSelection();
    // al fondo se mandan en orden inverso para conservar el orden entre ellos
    for (const o of front ? objs : [...objs].reverse()) {
      if (front) c.bringObjectToFront(o);
      else c.sendObjectToBack(o);
    }
    select(objs);
    commit();
  };

  const setLocked = (objs: FabricObject[], locked: boolean) => {
    const c = cRef.current;
    if (!c || !objs.length) return;
    objs.forEach((o) => applyLock(o, locked));
    setLockedFocus(null);
    if (locked) {
      c.discardActiveObject();
      c.requestRenderAll();
      refreshPanel();
    } else select(objs);
    commit();
  };

  const removeSelection = () => {
    const c = cRef.current;
    const objs = takeSelection();
    if (!c || !objs.length) return;
    c.remove(...objs);
    refreshConnectors(c); // las flechas enganchadas quedan con ese extremo suelto
    refreshPanel();
    commit();
  };

  /** Copia la selección: devuelve los objetos serializados (o null si no hay nada seleccionado). */
  const copySelection = (): Record<string, unknown>[] | null => {
    const objs = takeSelection();
    if (!objs.length) return null;
    clipboard.current = objs.map((o) => o.toObject() as Record<string, unknown>);
    clipSource.current = projectId;
    pasteCount.current = 0;
    select(objs);
    return clipboard.current;
  };

  /** Dónde va lo pegado: donde está el puntero si está sobre el lienzo; si no, al centro de la vista. */
  const pastePoint = (): Pt => {
    const c = cRef.current;
    return pointer.current ?? (c ? viewCenter(c) : { x: 0, y: 0 });
  };

  const pasteObjects = async (items: Record<string, unknown>[], sourceProject: string) => {
    const c = cRef.current;
    if (!c || !items.length) return;
    const same = sourceProject === projectId;
    pasteCount.current = same ? pasteCount.current + 1 : 0;
    const { dx, dy } = pasteOffset(items, pastePoint(), same, pasteCount.current);
    const objs = await insertCopies(c, items, dx, dy);
    refreshConnectors(c);
    select(objs);
    commit();
  };

  /** Texto pegado desde otra aplicación: una nota con ese texto (crece si hace falta). */
  const pasteText = (text: string) => {
    const c = cRef.current;
    if (!c) return;
    const p = pastePoint();
    const note = createLabeled({ kind: "note", box: { left: p.x - 100, top: p.y - 100, width: 200, height: 200 }, text: text.slice(0, 2000), fill: noteColorRef.current });
    c.add(note);
    c.setActiveObject(note);
    refreshPanel();
    commit();
  };

  const duplicate = async () => {
    const c = cRef.current;
    const objs = takeSelection();
    if (!c || !objs.length) return;
    const copies = await insertCopies(c, objs.map((o) => o.toObject() as Record<string, unknown>), 20);
    refreshConnectors(c);
    select(copies);
    commit();
  };

  const nudge = (dx: number, dy: number) => {
    const c = cRef.current;
    const a = c?.getActiveObject();
    if (!c || !a) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    if (isConnector(a)) a.set({ fromId: null, toId: null }); // mover una flecha a mano la desengancha
    const ids = c.getActiveObjects().map((o) => o.id).filter((id): id is string => !!id);
    refreshConnectors(c, new Set(ids));
    c.requestRenderAll();
    commitSoon();
  };

  const selectAll = () => {
    const c = cRef.current;
    if (!c) return;
    c.discardActiveObject();
    select(c.getObjects().filter((o) => o.selectable && !isTransient(o))); // lo bloqueado queda afuera
  };

  const clearBoard = () => {
    const c = cRef.current;
    if (!c || !c.getObjects().length) return;
    if (!confirm("¿Vaciar el tablero? Se puede deshacer con Ctrl+Z.")) return;
    c.discardActiveObject();
    c.remove(...c.getObjects());
    setLockedFocus(null);
    refreshPanel();
    commit();
  };

  const addImages = async (files: File[], at?: Pt) => {
    const c = cRef.current;
    if (!c) return;
    let shift = 0;
    for (const file of files) {
      const err = validateImageFile(file);
      if (err) {
        notify(err);
        continue;
      }
      try {
        const img = await readImage(file);
        const z = getViewport(c).zoom;
        const scale = fitScale(img.width, img.height, (c.width * 0.8) / z, (c.height * 0.8) / z);
        const p = at ?? pastePoint();
        const obj = await createImage(img.dataUrl, { x: p.x + shift, y: p.y + shift }, scale);
        shift += 24;
        c.add(obj);
        c.setActiveObject(obj);
        refreshPanel();
        commit();
        if (Math.max(img.width, img.height) > 1200) setLockPrompt(obj);
      } catch {
        notify("No se pudo leer la imagen.");
      }
    }
  };

  const exportBoard = async () => {
    const c = cRef.current;
    if (!c) return;
    const res = await exportPng(c);
    if (res === "empty") notify("El tablero está vacío: no hay nada para exportar.");
    else if (res === "failed") notify("No se pudo exportar el tablero: la imagen resultante es demasiado grande para el navegador.");
    else download(res, `tablero-${slug(fileLabel)}-${today()}.png`);
  };

  /** Archivo del tablero (.json): respaldo, o para pasárselo a alguien que lo importa en su tablero. */
  const exportFile = () => {
    const c = cRef.current;
    if (!c) return;
    const objects = snapshot(c).data.objects as Record<string, unknown>[];
    if (!objects.length) return notify("El tablero está vacío: no hay nada para descargar.");
    const blob = new Blob([encodeBoardFile(fileLabel, objects, new Date().toISOString())], { type: "application/json" });
    download(blob, `tablero-${slug(fileLabel)}-${today()}.json`);
  };

  /** Menú Más de la barra: exportar, descargar o importar el tablero, vaciarlo. */
  const openMoreMenu = (x: number, y: number) =>
    setMenu({
      x,
      y,
      items: [
        { label: "Exportar imagen PNG", ico: "image", onClick: () => void exportBoard() },
        { label: "Descargar el tablero (.json)", ico: "download", onClick: exportFile },
        { label: "Importar un tablero (.json)…", ico: "upload", onClick: () => importRef.current?.click() },
        { label: "Vaciar el tablero", ico: "trash", danger: true, onClick: clearBoard },
      ],
    });

  /** Agrega al tablero el contenido de un archivo de tablero, al lado de lo que ya hay (un paso de deshacer). */
  const importFile = async (file: File) => {
    const c = cRef.current;
    if (!c) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      return notify("No se pudo leer el archivo.");
    }
    const parsed = decodeBoardFile(text);
    if (!parsed) return notify("Ese archivo no es un tablero: elegí un .json descargado desde un tablero (Más → Descargar el tablero).");
    const bounds = itemsBounds(parsed.objects);
    if (!bounds) return notify("El tablero de ese archivo está vacío.");
    const occupied = c.getObjects().filter((o) => !isTransient(o)).map(shapeBox);
    const { dx, dy } = templateOffset(bounds, viewCenter(c), occupied);
    c.discardActiveObject();
    let objs: FabricObject[];
    try {
      objs = await insertCopies(c, parsed.objects, dx, dy, true);
    } catch {
      return notify("El archivo del tablero está dañado: no se pudo agregar.");
    }
    refreshConnectors(c);
    const b = unionBoxes(objs.map(shapeBox));
    if (b) setViewport(c, fitViewport(b, { width: c.width, height: c.height }));
    onViewport();
    select(objs);
    commit();
    notify(`Se agregó ${parsed.project ? `el tablero «${parsed.project}»` : "el tablero del archivo"} (${objs.length} elementos).`);
  };

  /** Exporta a PNG solo lo seleccionado (por ejemplo, un plano con sus marcas). */
  const exportSelection = async () => {
    const c = cRef.current;
    const objs = takeSelection();
    if (!c || !objs.length) return;
    // una sección se exporta con lo que tiene adentro
    const all = [...new Set(objs.flatMap((o) => (isSection(o) ? [o, ...sectionContents(c, o)] : [o])))];
    const res = await exportPng(c, all);
    select(objs);
    if (res === "failed") notify("No se pudo exportar la selección: la imagen resultante es demasiado grande para el navegador.");
    else if (res !== "empty") download(res, `tablero-${slug(fileLabel)}-seleccion-${today()}.png`);
  };

  const startOver = () => {
    const c = cRef.current;
    if (!c || !confirm("Se reemplaza el tablero guardado de este proyecto por uno vacío. ¿Continuar?")) return;
    blockSave.current = false;
    setBanner(null);
    c.clear();
    const snap = snapshot(c);
    history.reset(snap.json);
    lastData.current = snap.data;
    syncHistory();
    dirty.current = true;
    void flushSave();
  };

  const onKey = (a: KeyAction) => {
    const c = cRef.current;
    if (!c) return;
    switch (a.type) {
      case "tool": setTool(a.tool); break;
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "duplicate": void duplicate(); break;
      case "selectAll": selectAll(); break;
      case "delete": removeSelection(); break;
      case "nudge": nudge(a.dx, a.dy); break;
      case "find":
        setSearch((s) => s ?? { query: "", ids: [], index: 0 });
        break;
      case "front":
        reorder(true);
        break;
      case "back":
        reorder(false);
        break;
      case "toggleSnap":
        toggleSnap();
        break;
      case "help":
        setHelp((h) => !h);
        break;
      case "escape":
        setHelp(false);
        setMenu(null);
        cancelCalibration();
        c.discardActiveObject();
        c.requestRenderAll();
        setTool("select");
        break;
      case "fit":
        fitToContent(c);
        onViewport();
        break;
      case "zoom":
        zoomStep(c, a.dir);
        onViewport();
        break;
      case "zoomReset":
        zoomAt(c, { x: c.width / 2, y: c.height / 2 }, 1);
        onViewport();
        break;
      case "fitSelection":
        fitToObjects(c, c.getActiveObjects());
        onViewport();
        break;
      case "spaceDown":
        if (!spaceHeld.current) {
          spaceHeld.current = true;
          applyToolMode(c, "hand", penRef.current);
        }
        break;
      case "spaceUp":
        if (spaceHeld.current) {
          spaceHeld.current = false;
          applyToolMode(c, toolRef.current, penRef.current);
        }
        break;
    }
  };

  const toggleSnap = () => {
    setSnapOn((v) => {
      try {
        localStorage.setItem(SNAP_KEY, v ? "0" : "1");
      } catch {
        /* sin almacenamiento: vale para esta sesión */
      }
      return !v;
    });
  };

  /** Alinear o distribuir la selección; las flechas no se mueven solas: siguen a sus formas. */
  const arrange = (deltasFor: (boxes: Box[]) => { dx: number; dy: number }[]) => {
    const c = cRef.current;
    if (!c) return;
    const objs = takeSelection();
    const movable = objs.filter((o) => !isConnector(o));
    deltasFor(movable.map(shapeBox)).forEach((d, i) => {
      const o = movable[i];
      o.set({ left: o.left + d.dx, top: o.top + d.dy });
      o.setCoords();
    });
    refreshConnectors(c);
    select(objs);
    commit();
  };
  const alignSelection = (mode: AlignMode) => arrange((boxes) => alignDeltas(boxes, mode));
  const distributeSelection = (axis: "h" | "v") => arrange((boxes) => distributeDeltas(boxes, axis));
  const tidySelection = () => arrange((boxes) => gridDeltas(boxes));

  /** Calibrar la escala de la imagen seleccionada: se traza una línea sobre una distancia conocida. */
  const startCalibration = () => {
    const c = cRef.current;
    const img = c?.getActiveObject();
    if (!c || !img || img.kind !== "image") return;
    calibImg.current = img;
    setCalibrating(true);
    setTool("calibrate");
  };
  const cancelCalibration = () => {
    calibImg.current = null;
    setCalibrating(false);
  };
  const finishCalibration = (a: Pt, b: Pt) => {
    const c = cRef.current;
    const img = calibImg.current;
    cancelCalibration();
    setTool("select");
    if (!c || !img || !c.getObjects().includes(img) || Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
    const meters = parseMeters(window.prompt("¿Cuánto mide en la realidad la línea que trazaste? Por ejemplo: 3,5 m · 350 cm", ""));
    if (meters === null) {
      notify("No se calibró la escala: ingresá una longitud, por ejemplo 3,5 m.");
      return;
    }
    calibrateImage(img, a, b, meters);
    c.setActiveObject(img);
    commit(); // también recalcula las cotas que ya estaban sobre la imagen
    refreshPanel();
    notify("Escala calibrada: ya podés medir sobre el plano con la herramienta Medir (K).");
  };

  /** Crea una plantilla centrada en la vista, con sus flechas enganchadas; es un solo paso de deshacer. */
  const insertTemplate = (t: Template) => {
    const c = cRef.current;
    if (!c) return;
    const b = templateBounds(t);
    // al centro de la vista; si ahí ya hay algo, a la derecha de todo (no se encima con lo existente)
    const occupied = c.getObjects().filter((o) => !isTransient(o)).map(shapeBox);
    const { dx, dy } = templateOffset(b, viewCenter(c), occupied);
    c.discardActiveObject();
    const objs: FabricObject[] = t.items.map((it) => {
      const box = { left: it.x + dx, top: it.y + dy, width: it.w, height: it.h };
      if (it.kind !== "text") return createLabeled({ kind: it.kind, box, text: it.text, fill: it.fill });
      const title = createText({ x: box.left + it.w / 2, y: box.top + it.h / 2 });
      title.set({ text: it.text, width: it.w, fontSize: 24, fontWeight: "bold" });
      return title;
    });
    objs.forEach((o) => c.add(o));
    for (const [from, to, caption] of t.links) {
      const a = objs[from];
      const z = objs[to];
      const ends = connectorEnds(shapeBox(a), shapeBox(z), { x: 0, y: 0 }, { x: 0, y: 0 });
      const arrow = createConnector("arrow", ends.start, ends.end);
      arrow.set({ fromId: a.id, toId: z.id, caption });
      c.add(arrow);
      objs.push(arrow);
    }
    // la vista se centra en la plantilla nueva (puede haber quedado fuera de pantalla)
    const z = c.getZoom();
    setViewport(c, { zoom: z, x: c.width / 2 - (b.left + dx + b.width / 2) * z, y: c.height / 2 - (b.top + dy + b.height / 2) * z });
    onViewport();
    select(objs);
    commit();
  };

  /** Sello de revisión (Aprobado, Rechazado…) con la fecha de hoy, al centro de la vista y seleccionado para ubicarlo. */
  const insertStamp = (s: Stamp) => {
    const c = cRef.current;
    if (!c) return;
    const p = viewCenter(c);
    const stamp = createLabeled({
      kind: "rect",
      box: { left: p.x - 150, top: p.y - 40, width: 300, height: 80 },
      text: stampText(s, today()),
      fill: "rgba(255, 255, 255, 0.85)",
      stroke: s.color,
      strokeWidth: 3,
      color: s.color,
      bold: true,
      fontSize: 20,
    });
    c.add(stamp);
    c.setActiveObject(stamp);
    c.requestRenderAll();
    refreshPanel();
    commit();
  };

  /** Lista de secciones (por posición, de arriba a abajo): elegir una encuadra la vista en ella. */
  const openSections = (x: number, y: number) => {
    const c = cRef.current;
    if (!c) return;
    const sections = c.getObjects().filter(isSection).sort((a, b) => a.top - b.top || a.left - b.left);
    setMenu({
      x,
      y,
      items: sections.length
        ? sections.map((s) => ({ label: s.caption || "Sección", onClick: () => { fitToObjects(c, [s]); onViewport(); } }))
        : [{ label: "No hay secciones: creá una con la herramienta Sección (F)", onClick: () => setTool("frame") }],
    });
  };

  const openStamps = (x: number, y: number) =>
    setMenu({ x, y, items: STAMPS.map((s) => ({ label: s.label, onClick: () => insertStamp(s) })) });

  const openTemplates = (x: number, y: number) =>
    setMenu({ x, y, items: TEMPLATES.map((t) => ({ label: t.label, onClick: () => insertTemplate(t) })) });

  /** Texto de un objeto, para buscar: notas, formas, textos, flechas, observaciones y cotas. */
  const objectText = (o: FabricObject): string => {
    if (isLabeled(o)) return readLabeled(o).text ?? "";
    if (o.kind === "text") return (o as IText).text;
    if (o.kind === "marker") return `Observación ${o.num} ${o.detail ?? ""}`;
    if (o.kind === "measure" || o.kind === "area") return o.measureLabel ?? "";
    if (isConnector(o) || isSection(o)) return o.caption ?? "";
    return "";
  };

  /** Selecciona el objeto (si no está bloqueado) y centra la vista en él, sin cambiar el zoom. */
  const focusObject = (id: string) => {
    const c = cRef.current;
    const o = c?.getObjects().find((x) => x.id === id);
    if (!c || !o) return;
    const b = shapeBox(o);
    const z = c.getZoom();
    setViewport(c, { zoom: z, x: c.width / 2 - (b.left + b.width / 2) * z, y: c.height / 2 - (b.top + b.height / 2) * z });
    onViewport();
    if (o.selectable) c.setActiveObject(o);
    else c.discardActiveObject();
    c.requestRenderAll();
    refreshPanel();
  };

  const runSearch = (query: string) => {
    const c = cRef.current;
    if (!c) return;
    const ids = findMatches(c.getObjects().filter((o) => o.id).map((o) => ({ id: o.id!, text: objectText(o) })), query);
    setSearch({ query, ids, index: 0 });
    if (ids.length) focusObject(ids[0]);
  };

  const stepSearch = (dir: 1 | -1) => {
    if (!search || !search.ids.length) return;
    const index = (search.index + dir + search.ids.length) % search.ids.length;
    setSearch({ ...search, index });
    focusObject(search.ids[index]);
  };

  /** Menú del clic derecho: acciones sobre lo seleccionado, o sobre el lienzo si se hizo en vacío. */
  const openMenu = (x: number, y: number, target: FabricObject | undefined, at: Pt) => {
    const c = cRef.current;
    if (!c) return;
    pointer.current = at; // "Pegar aquí" pega donde se hizo clic
    const items: CtxItem[] = [];
    if (target?.lockedByUser) {
      items.push({ label: "Desbloquear", ico: "unlock", onClick: () => setLocked([target], false) });
    } else if (target) {
      if (!c.getActiveObjects().includes(target)) {
        c.setActiveObject(target);
        c.requestRenderAll();
        refreshPanel();
      }
      items.push(
        { label: "Copiar", ico: "copy", onClick: () => document.execCommand("copy") },
        { label: "Cortar", onClick: () => document.execCommand("cut") },
        { label: "Duplicar", onClick: () => void duplicate() },
        { label: "Girar 90°", ico: "rotate-cw", onClick: () => rotateSelection() },
        { label: "Traer al frente", ico: "bring-front", onClick: () => reorder(true) },
        { label: "Enviar al fondo", ico: "send-back", onClick: () => reorder(false) },
        { label: "Bloquear", ico: "lock", onClick: () => setLocked(takeSelection(), true) },
        { label: "Exportar selección (PNG)", ico: "download", onClick: () => void exportSelection() },
        { label: "Eliminar", ico: "trash", danger: true, onClick: () => removeSelection() },
      );
    } else {
      c.discardActiveObject();
      c.requestRenderAll();
      if (clipboard.current.length) items.push({ label: "Pegar aquí", ico: "clipboard", onClick: () => void pasteObjects(clipboard.current, clipSource.current) });
      items.push(
        { label: "Seleccionar todo", onClick: () => selectAll() },
        { label: "Ajustar al contenido", ico: "scan", onClick: () => { fitToContent(c); onViewport(); } },
      );
    }
    setMenu({ x, y, items });
  };

  /**
   * Gira lo seleccionado 90° a la derecha alrededor de su centro (un plano escaneado de costado).
   * Se registra como cualquier giro a mano: object:modified rehace lo que haga falta y guarda.
   */
  const rotateSelection = () => {
    const c = cRef.current;
    const t = c?.getActiveObject();
    if (!c || !t || isSection(t)) return;
    t.rotate((Math.round(t.angle / 90) * 90 + 90) % 360);
    t.setCoords();
    c.fire("object:modified", { target: t } as Parameters<typeof c.fire<"object:modified">>[1]);
    c.requestRenderAll();
  };

  /** Descripción o estado de una observación numerada (desde el panel o la lista). */
  const setMarkerInfo = (id: string, patch: { detail?: string; resolved?: boolean }) => {
    const c = cRef.current;
    const m = c?.getObjects().find((o) => o.id === id && o.kind === "marker") as Group | undefined;
    if (!c || !m) return;
    if (patch.detail !== undefined) m.set({ detail: patch.detail.trim() || undefined });
    if (patch.resolved !== undefined) setMarkerResolved(m, patch.resolved);
    c.requestRenderAll();
    refreshPanel();
    commit();
  };

  /** Enlace de un objeto (desde el panel). Solo direcciones web o de correo; vacío lo quita. */
  const setLink = (id: string, text: string): boolean => {
    const c = cRef.current;
    const o = c?.getObjects().find((x) => x.id === id);
    if (!c || !o) return true;
    const url = normalizeLink(text);
    if (url === null) {
      notify("Ese enlace no es válido: pegá una dirección web (https://…) o de correo (mailto:…).");
      return false;
    }
    o.set({ link: url || undefined });
    c.requestRenderAll();
    refreshPanel();
    commit();
    return true;
  };

  /** Abre el enlace del objeto en otra pestaña (se vuelve a validar: pudo venir en un tablero importado). */
  const openLink = (o: FabricObject | null | undefined) => {
    const url = o?.link ? normalizeLink(o.link) : null;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  /** Numera las observaciones 1, 2, 3… en el orden que tienen (después de borrar o duplicar alguna). */
  const renumberMarkers = () => {
    const c = cRef.current;
    if (!c) return;
    const markers = c.getObjects().filter((o) => o.kind === "marker" && o.id) as Group[];
    const next = renumberObservations(markers.map((m) => ({ id: m.id!, num: m.num ?? 0, detail: "", resolved: false })));
    if (!next.size) return;
    for (const m of markers) setMarkerNumber(m, next.get(m.id!) ?? m.num ?? 0);
    c.requestRenderAll();
    refreshPanel();
    commit();
    notify(`Observaciones renumeradas del 1 al ${markers.length}.`);
  };

  const copyObservations = async (items: ObservationItem[]) => {
    try {
      await navigator.clipboard.writeText(observationsTable(items));
      notify(`Lista copiada (${items.length} observaciones): pegala en Excel o en un correo.`);
    } catch {
      notify("No se pudo copiar la lista: el navegador no dio permiso para usar el portapapeles.");
    }
  };

  const actions = {
    undo, redo, select, restyle, reorder, setLocked, takeSelection, removeSelection, copySelection, pasteObjects, pasteText,
    duplicate, clearBoard, addImages, exportBoard, startOver, onKey, openMenu, alignSelection, distributeSelection, tidySelection, toggleSnap, exportSelection, startCalibration, cancelCalibration, finishCalibration, openTemplates, openStamps, openSections, openMoreMenu, importFile, rotateSelection,
    setMarkerInfo, copyObservations, renumberMarkers, setLink, openLink,
  };
  const act = useRef(actions);
  act.current = actions;

  /** Observaciones del tablero, leídas del lienzo mientras la lista está abierta (y otra vez con cada cambio). */
  const observations = useMemo<ObservationItem[]>(() => {
    const c = cRef.current;
    if (!obsOpen || !c) return [];
    return c.getObjects().filter((o) => o.kind === "marker" && o.id).map((o) => ({
      id: o.id!,
      num: o.num ?? 0,
      detail: o.detail ?? "",
      resolved: !!o.resolved,
      color: String((o as Group).getObjects()[0]?.fill ?? INK),
    }));
    // rev avisa que el lienzo cambió (el lienzo no es estado de React)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obsOpen, rev]);

  /* ---------- Montaje del lienzo ---------- */

  useEffect(() => {
    const host = hostRef.current!;
    const root = rootRef.current!;
    // el <canvas> se crea acá (no en JSX): Fabric lo envuelve y en StrictMode se monta dos veces
    const el = document.createElement("canvas");
    host.appendChild(el);
    const c = createBoardCanvas(el, host.clientWidth, host.clientHeight);
    cRef.current = c;
    loaded.current = false;
    // el textarea oculto con el que Fabric edita texto va dentro del tablero: así se escribe en pantalla completa
    IText.ownDefaults.hiddenTextareaContainer = root;
    // solo en desarrollo: acceso al lienzo para las pruebas automatizadas en el navegador (no entra al build)
    if (import.meta.env.DEV) (window as unknown as { __board?: Canvas }).__board = c;
    let disposed = false;

    const ro = new ResizeObserver(() => {
      c.setDimensions({ width: host.clientWidth, height: host.clientHeight });
      c.requestRenderAll();
    });
    ro.observe(host);

    const live = (t: FabricObject) => {
      const ids = (t instanceof ActiveSelection ? t.getObjects() : [t]).map((o) => o.id).filter((id): id is string => !!id);
      refreshConnectors(c, new Set(ids));
    };
    // si el texto nuevo agranda la forma, las flechas enganchadas se reacomodan en el mismo paso
    const edit = (g: Parameters<typeof editLabel>[1]) => editLabel(c, g, () => { refreshConnectors(c); refreshPanel(); commit(); });

    /**
     * Alt+arrastrar duplica, como en Figma: al presionar se crean copias de lo arrastrado en el lugar
     * de origen y las flechas de afuera pasan a ellas; lo que se arrastra es el duplicado. Si no hubo
     * arrastre, se deshace todo; si lo hubo, queda en un solo paso de deshacer (ver altDrag.ts).
     */
    let alt: { links: Link[]; ready: Promise<FabricObject[]> } | null = null;
    /** Sección que se está arrastrando: lo de adentro, con su posición al empezar */
    let section: SectionDrag | null = null;
    /** Lleva lo de adentro de la sección a donde está ahora la sección */
    const moveSection = (s: SectionDrag) => {
      const dx = s.frame.left - s.left;
      const dy = s.frame.top - s.top;
      for (const it of s.items) {
        if (it.ends) setLineEnds(it.o as Line, { x: it.ends.start.x + dx, y: it.ends.start.y + dy }, { x: it.ends.end.x + dx, y: it.ends.end.y + dy });
        else it.o.set({ left: it.left + dx, top: it.top + dy });
        it.o.setCoords();
      }
      refreshConnectors(c, new Set(s.items.map((it) => it.o.id).filter((id): id is string => !!id)));
    };
    const startAltDrag = (target: FabricObject) => {
      const objs = (target instanceof ActiveSelection ? target.getObjects() : isSection(target) ? [target, ...sectionContents(c, target)] : [target]).filter((o) => o.id);
      if (!objs.length) return;
      const ids = new Set(objs.map((o) => o.id!));
      // toObject del lienzo da coordenadas reales aunque estén dentro de una selección múltiple
      const data = (c.toObject().objects as Record<string, unknown>[]).filter((d) => ids.has(d.id as string));
      const links: Link[] = c.getObjects().filter(isConnector).map((l) => ({ id: l.id!, fromId: l.fromId ?? null, toId: l.toId ?? null }));
      const ready = insertCopies(c, data, 0, 0).then((copies) => {
        const copyOf = new Map<string, string>();
        copies.forEach((copy, i) => {
          const orig = c.getObjects().find((o) => o.id === data[i].id);
          copyOf.set(data[i].id as string, copy.id!);
          // la copia queda en el lugar del original en el apilado (justo debajo de él)
          if (orig) c.moveObjectTo(copy, c.getObjects().indexOf(orig));
        });
        const byId = new Map(c.getObjects().map((o) => [o.id, o]));
        for (const [id, ends] of relinkAfterAltDrag(links, ids, copyOf)) byId.get(id)?.set(ends);
        refreshConnectors(c);
        c.requestRenderAll();
        return copies;
      });
      alt = { links, ready };
    };
    const cancelAltDrag = () => {
      const pending = alt;
      alt = null;
      if (!pending) return;
      void pending.ready.then((copies) => {
        copies.forEach((o) => c.remove(o));
        const byId = new Map(c.getObjects().map((o) => [o.id, o]));
        for (const l of pending.links) byId.get(l.id)?.set({ fromId: l.fromId, toId: l.toId });
        refreshConnectors(c);
        c.requestRenderAll();
      });
    };

    /** Al terminar de mover, escalar o girar a mano: rehace lo que haga falta, reacomoda las flechas y registra. */
    function afterModified(t: FabricObject) {
      if (t instanceof ActiveSelection) {
        // Una selección por área también atrapa flechas que tocan una sola de sus formas y se mueven con ella.
        // Al soltar se desarma la selección (fuera del evento, por lo mismo que abajo), se rehacen las formas
        // escaladas, se reacomodan las flechas y recién ahí se registra UN paso de deshacer.
        const objs = t.getObjects();
        window.setTimeout(() => {
          if (cRef.current !== c) return;
          quiet.current = true;
          c.discardActiveObject();
          quiet.current = false;
          // las cotas giradas o escaladas en grupo vuelven a escala 1 y sin giro, como al tocarlas solas
          for (const o of objs) if (o.kind === "measure") { const e = lineEnds(o as Line); setLineEnds(o as Line, e.start, e.end); }
          const baked = new Map(bakeScaledLabels(c, objs).map((g) => [g.id, g]));
          refreshConnectors(c);
          act.current.select(objs.map((o) => (o.id && baked.get(o.id)) || o));
          commit();
        }, 0);
        return;
      }
      if (isConnector(t)) t.set({ fromId: null, toId: null }); // mover una flecha a mano la desengancha
      if (isSection(t) && (t.scaleX !== 1 || t.scaleY !== 1)) {
        t.set({ width: t.width * t.scaleX, height: t.height * t.scaleY, scaleX: 1, scaleY: 1 });
        t.setCoords();
      }
      if (t.kind === "measure") {
        // una cota escalada o girada vuelve a escala 1 (así sus marcas y su texto no se deforman)
        const ends = lineEnds(t as Line);
        setLineEnds(t as Line, ends.start, ends.end);
      }
      if (isLabeled(t) && (t.scaleX !== 1 || t.scaleY !== 1)) {
        // Fabric dispara object:modified ANTES de cerrar la transformación: si acá se saca la forma
        // del lienzo, cerrarla vuelve a disparar el evento sin fin. Se rehace cuando Fabric terminó.
        window.setTimeout(() => {
          if (cRef.current !== c) return;
          quiet.current = true;
          c.discardActiveObject();
          quiet.current = false;
          const [next] = bakeScaledLabels(c, [t]);
          if (next) c.setActiveObject(next);
          refreshConnectors(c);
          refreshPanel();
          commit();
        }, 0);
        return;
      }
      refreshConnectors(c);
      refreshPanel();
      commit();
    }

    const offs: (() => void)[] = [
      // clic derecho: Fabric corta la propagación del evento del navegador, así que se usa el suyo
      c.on("contextmenu", (o) => {
        const e = o.e as MouseEvent;
        if (toolRef.current !== "select" || spaceHeld.current) return;
        const p = c.getScenePoint(e);
        act.current.openMenu(e.clientX, e.clientY, o.target, { x: p.x, y: p.y });
      }),
      attachSectionPicking(c),
      attachPanZoom(c, { panMode: () => toolRef.current === "hand" || spaceHeld.current, onChange: onViewport }),
      attachDrawing(c, {
        // con Espacio apretado se desplaza la vista: no se dibuja aunque haya una herramienta de dibujo elegida
        tool: () => (spaceHeld.current ? "hand" : toolRef.current),
        noteColor: () => noteColorRef.current,
        snap: () => snapRef.current,
        onCalibrate: (a, b) => act.current.finishCalibration(a, b),
        onCreated: (obj, editing) => {
          if (obj.kind !== "marker") setTool("select"); // las observaciones se ponen de a varias
          if (editing) return; // el texto nuevo se registra al salir de la edición
          refreshPanel();
          commit();
          if (isLabeled(obj) && obj.kind === "note") edit(obj); // una nota nueva entra directo a escribir
        },
      }),
      c.on("object:moving", (e) => {
        if (snapRef.current) {
          // con la cuadrícula, la esquina superior izquierda de lo que se mueve cae en ella
          const t = e.target;
          t.setCoords(); // durante el arrastre las coordenadas quedan de la posición anterior
          const d = snapDelta(t.getBoundingRect());
          if (d.dx || d.dy) {
            t.set({ left: t.left + d.dx, top: t.top + d.dy });
            t.setCoords();
          }
        }
        if (section && e.target === section.frame) moveSection(section);
        live(e.target);
      }),
      c.on("object:scaling", (e) => live(e.target)),
      c.on("object:rotating", (e) => {
        // con Shift se gira de a 15°
        if ((e.e as MouseEvent).shiftKey) e.target.set({ angle: Math.round(e.target.angle / 15) * 15 });
        live(e.target);
      }),
      c.on("object:modified", (e) => {
        const t = e.target;
        if (!t || isTransient(t)) return;
        const pending = alt;
        const s = section;
        alt = null;
        // Alt+arrastrar: se registra cuando las copias del origen están listas (suele ser enseguida); si se
        // soltó antes, las flechas recién quedaron sueltas: lo de adentro de la sección se vuelve a ubicar
        if (pending) void pending.ready.then(() => {
          if (cRef.current !== c) return;
          if (s && s.frame === t) moveSection(s);
          afterModified(t);
        });
        else afterModified(t);
      }),
      c.on("mouse:down", (e) => {
        const tr = e.transform;
        if (toolRef.current !== "select" || spaceHeld.current || !(e.e as MouseEvent).altKey) return;
        if (tr?.action === "drag" && tr.target && !tr.target.lockedByUser) startAltDrag(tr.target);
      }),
      // presionar con Alt sin arrastrar no duplica nada
      c.on("mouse:up", cancelAltDrag),
      c.on("mouse:down", (e) => {
        const tr = e.transform;
        section = null;
        if (toolRef.current !== "select" || tr?.action !== "drag" || !isSection(tr.target)) return;
        // las flechas se mueven por sus extremos: el suelto se desplaza y el enganchado lo recalcula refreshConnectors
        const items = sectionContents(c, tr.target).map((o) => ({ o, left: o.left, top: o.top, ends: isConnector(o) ? lineEnds(o) : undefined }));
        section = { frame: tr.target, left: tr.target.left, top: tr.target.top, items };
      }),
      c.on("mouse:up", () => { section = null; }),
      // distintivo de los objetos con enlace (en pantalla, no al exportar)
      c.on("after:render", ({ ctx }) => {
        if (ctx !== c.getContext()) return;
        const v = c.viewportTransform;
        for (const o of c.getObjects()) {
          if (!o.link || !o.visible || isTransient(o)) continue;
          const r = o.getBoundingRect();
          const x = (r.left + r.width) * v[0] + v[4];
          const y = r.top * v[3] + v[5];
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fillStyle = "#5b6cff";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("↗", x, y + 0.5);
          ctx.restore();
        }
      }),
      c.on("path:created", (e) => {
        // el resaltador se multiplica con lo de abajo: marca el plano sin taparlo
        const hl = penRef.current.highlighter;
        e.path.set({ id: uid(), kind: hl ? "highlight" : "path", ...(hl ? { globalCompositeOperation: "multiply" } : {}) });
        prepareObject(e.path);
        commit();
      }),
      c.on("text:editing:exited", (e) => {
        const t = e.target;
        if (isTransient(t)) return;
        if (t.kind === "text" && !t.text.trim()) c.remove(t); // un texto que quedó vacío se descarta
        refreshPanel();
        commit();
      }),
      c.on("mouse:dblclick", (e) => {
        const t = e.target;
        if (toolRef.current !== "select" || !t || t.lockedByUser) return;
        if (isLabeled(t)) edit(t);
        else if (isSection(t)) editSectionTitle(c, t, () => { refreshPanel(); commit(); });
        else if (isConnector(t)) editCaption(c, t, () => { refreshPanel(); commit(); });
      }),
      c.on("selection:created", () => { setLockedFocus(null); refreshPanel(); }),
      c.on("selection:updated", () => { setLockedFocus(null); refreshPanel(); }),
      c.on("selection:cleared", () => {
        refreshPanel();
        if (restoring.current || quiet.current) return;
        // al soltar una selección múltiple: las formas con texto escaladas se rehacen y las flechas se reacomodan
        const baked = bakeScaledLabels(c);
        if (refreshConnectors(c) || baked.length) commit();
      }),
      c.on("mouse:down", (e) => { downAt.current = { x: e.viewportPoint.x, y: e.viewportPoint.y }; }),
      c.on("mouse:move", (e) => { pointer.current = { x: e.scenePoint.x, y: e.scenePoint.y }; }),
      c.on("mouse:out", () => { pointer.current = null; }),
      c.on("mouse:up", (e) => {
        const d = downAt.current;
        downAt.current = null;
        if (toolRef.current !== "select" || spaceHeld.current || !d) return;
        if (Math.hypot(e.viewportPoint.x - d.x, e.viewportPoint.y - d.y) >= 4) return;
        const me = e.e as MouseEvent;
        // Ctrl+clic (o Cmd+clic) sobre algo con enlace lo abre, aunque esté bloqueado
        if ((me.ctrlKey || me.metaKey) && e.target?.link) return act.current.openLink(e.target);
        // clic (sin arrastre) sobre algo bloqueado: el panel ofrece desbloquearlo
        setLockedFocus(e.target?.lockedByUser ? e.target : null);
      }),
      attachKeys((a) => act.current.onKey(a), () => !!(c.getActiveObject() as IText | undefined)?.isEditing, {
        root: () => rootRef.current,
        hasSelection: () => c.getActiveObjects().length > 0,
      }),
    ];

    void (async () => {
      const res = await loadBoard(projectId);
      if (disposed) return;
      if (res.status === "unavailable") {
        // no se pudo leer lo guardado: si IndexedDB volviera después, guardar pisaría ese tablero con este
        blockSave.current = true;
        setBanner({ kind: "unavailable" });
      }
      if (res.status === "corrupt") {
        blockSave.current = true;
        setBanner({ kind: "corrupt", raw: res.raw });
      }
      if (res.status === "ok" && res.doc) {
        try {
          await restore(c, res.doc.fabric);
          setViewport(c, res.doc.viewport);
        } catch {
          if (disposed) return;
          blockSave.current = true;
          c.clear();
          setBanner({ kind: "corrupt", raw: res.doc });
        }
      }
      if (disposed) return;
      const snap = snapshot(c);
      history.reset(snap.json);
      lastData.current = snap.data;
      loaded.current = true;
      syncHistory();
      onViewport();
      dirty.current = false; // la vista recién cargada no es un cambio
      window.clearTimeout(saveTimer.current);
      applyToolMode(c, toolRef.current, penRef.current);
      setSaveState(blockSave.current ? "off" : "saved"); // la vista recién cargada no deja nada pendiente
      setReady(true);
    })();

    /** Un texto en edición todavía no está en la forma (el editor es auxiliar): se cierra antes de guardar. */
    const finishEditing = () => {
      const a = c.getActiveObject();
      if (a instanceof IText && a.isEditing) a.exitEditing();
    };
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      commit();
      void flushSave();
    };
    const onPageHide = () => {
      finishEditing();
      commit();
      void flushSave();
    };
    // si la ventana pierde el foco con Espacio apretado, el keyup nunca llega: se suelta la mano temporal
    const onBlur = () => {
      if (!spaceHeld.current) return;
      spaceHeld.current = false;
      applyToolMode(c, toolRef.current, penRef.current);
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);

    return () => {
      disposed = true;
      finishEditing(); // el texto que se estaba escribiendo no se pierde al cambiar de pestaña
      commit(); // un cambio pendiente de commitSoon no se pierde
      void flushSave(); // lee el estado de forma síncrona, antes de desarmar el lienzo
      loaded.current = false;
      offs.forEach((off) => off());
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
      ro.disconnect();
      IText.ownDefaults.hiddenTextareaContainer = null;
      cRef.current = null;
      void c.dispose();
      host.replaceChildren();
    };
    // Se monta una vez por proyecto: BoardTab se renderiza con key={projectId}
  }, []);

  /* ---------- Pegar, pantalla completa, grosor del lápiz ---------- */

  useEffect(() => {
    const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    // el foco está en el tablero o en ningún lado: no en un botón o campo del resto de la página
    const focusOk = (t: EventTarget | null) => t === document.body || t === document.documentElement || (t instanceof Node && !!rootRef.current?.contains(t));

    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      const c = cRef.current;
      if (!c || !e.clipboardData || typingIn(e.target)) return;
      const ctx = { focusInBoard: focusOk(e.target), hasSelection: c.getActiveObjects().length > 0, textSelected: !!window.getSelection()?.toString() };
      if (!shouldIntercept({ type: "copy" }, ctx)) return; // texto de la página: copia normal
      const items = act.current.copySelection();
      if (!items) return;
      e.preventDefault();
      e.clipboardData.setData(BOARD_MIME, encodeClip(projectId, items));
      e.clipboardData.setData("text/plain", textOf(items) || "Elementos del tablero de TEMPO");
      if (cut) act.current.removeSelection();
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cutEv = (e: ClipboardEvent) => onCopy(e, true);

    const onPaste = (e: ClipboardEvent) => {
      if (typingIn(e.target) || !focusOk(e.target) || !e.clipboardData) return;
      const board = decodeClip(e.clipboardData.getData(BOARD_MIME));
      const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
      const text = e.clipboardData.getData("text/plain").trim();
      if (board) {
        e.preventDefault();
        void act.current.pasteObjects(board.objects, board.projectId);
      } else if (files.length) {
        e.preventDefault();
        void act.current.addImages(files);
      } else if (text) {
        e.preventDefault();
        act.current.pasteText(text);
      } else if (clipboard.current.length) {
        // el navegador no conservó el tipo propio: se usa la copia en memoria
        e.preventDefault();
        void act.current.pasteObjects(clipboard.current, clipSource.current);
      }
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cutEv);
    window.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cutEv);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const c = cRef.current;
    if (c && toolRef.current === "pencil" && !spaceHeld.current) applyToolMode(c, "pencil", pen);
  }, [pen]);

  /* ---------- Render ---------- */

  const withCanvas = (fn: (c: Canvas) => void) => () => {
    const c = cRef.current;
    if (!c) return;
    fn(c);
    onViewport();
  };

  return (
    <div
      className="bd-root"
      ref={rootRef}
      // se acepta soltar archivos en todo el tablero: si caen en la barra o un aviso, el navegador
      // abriría el archivo y saldría de la app. Fuera del lienzo, la imagen va al centro de la vista.
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files);
        const c = cRef.current;
        if (!files.length || !c || !hostRef.current) return;
        e.preventDefault();
        const r = hostRef.current.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        const v = getViewport(c);
        void act.current.addImages(files, inside ? { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom } : undefined);
      }}
    >
      <Toolbar
        tool={tool}
        onTool={setTool}
        noteColor={noteColor}
        onNoteColor={setNoteColor}
        pen={pen}
        onPen={setPen}
        canUndo={hist.undo}
        canRedo={hist.redo}
        onUndo={() => act.current.undo()}
        onRedo={() => act.current.redo()}
        zoom={zoom}
        onZoomIn={withCanvas((c) => zoomStep(c, 1))}
        onZoomOut={withCanvas((c) => zoomStep(c, -1))}
        onZoomReset={withCanvas((c) => zoomAt(c, { x: c.width / 2, y: c.height / 2 }, 1))}
        onFit={withCanvas(fitToContent)}
        onMore={(x, y) => act.current.openMoreMenu(x, y)}
        fullscreen={fullscreen}
        onFullscreen={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void rootRef.current?.requestFullscreen();
        }}
        onHelp={() => setHelp((h) => !h)}
        snap={snapOn}
        onToggleSnap={() => act.current.toggleSnap()}
        onTemplates={(x, y) => act.current.openTemplates(x, y)}
        onStamps={(x, y) => act.current.openStamps(x, y)}
        onSearch={() => setSearch((s) => s ?? { query: "", ids: [], index: 0 })}
        onSections={(x, y) => act.current.openSections(x, y)}
        observations={obsOpen}
        onObservations={() => setObsOpen((o) => !o)}
      />

      {banner?.kind === "unavailable" && (
        <div className="bd-banner warn" role="status">
          <Icon name="alert" size={14} /> No se puede guardar en este navegador; los cambios se pierden al cerrar.
        </div>
      )}
      {banner?.kind === "quota" && (
        <div className="bd-banner warn" role="status">
          <Icon name="alert" size={14} /> El tablero no se pudo guardar: ocupa unos {banner.mb.toFixed(1)} MB y el navegador no tiene más espacio. Quitá o achicá imágenes; lo que ves no se perdió.
        </div>
      )}
      {banner?.kind === "corrupt" && (
        <div className="bd-banner error" role="alert">
          <Icon name="alert" size={14} /> El tablero guardado de este proyecto está dañado y no se pudo abrir. No se modificó nada.
          <span style={{ flex: 1 }} />
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => download(new Blob([JSON.stringify(banner.raw, null, 2)], { type: "application/json" }), `tablero-${slug(fileLabel)}-copia.json`)}
          >
            Descargar copia (JSON)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => act.current.startOver()}>Empezar de nuevo</button>
        </div>
      )}
      {calibrating && (
        <div className="bd-banner info" role="status">
          <Icon name="ruler" size={14} /> Calibrar la escala: trazá una línea sobre una distancia conocida del plano (por ejemplo, una cota) y después indicá cuánto mide.
          <button className="btn btn-ghost btn-sm" onClick={() => { act.current.cancelCalibration(); setTool("select"); }}>Cancelar</button>
        </div>
      )}
      {lockPrompt && (
        <div className="bd-banner info" role="status">
          <Icon name="lock" size={14} /> La imagen es grande. ¿Bloquearla para marcar encima sin moverla?
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              // la imagen pudo haberse borrado desde que apareció el aviso
              if (cRef.current?.getObjects().includes(lockPrompt)) act.current.setLocked([lockPrompt], true);
              setLockPrompt(null);
            }}
          >
            Bloquear
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLockPrompt(null)}>No</button>
        </div>
      )}

      <div className="bd-stage">
        <div className="bd-canvas" ref={hostRef} />
        {/* el estado del guardado va sobre el lienzo: en la barra, al cambiar de largo, la hacía saltar de renglón */}
        <span className={`bd-save ${saveState}`} role="status" aria-live="polite">{SAVE_LABEL[saveState]}</span>
        {!ready && <div className="bd-loading">Cargando el tablero…</div>}
        {notice && <div className="bd-notice" role="status">{notice}</div>}
        {search && (
          <SearchBar
            query={search.query}
            count={search.ids.length}
            index={search.index}
            onQuery={(q) => runSearch(q)}
            onNext={() => stepSearch(1)}
            onPrev={() => stepSearch(-1)}
            onClose={() => setSearch(null)}
          />
        )}
        {obsOpen && (
          <ObservationsPanel
            items={observations}
            below={!!search}
            onFocus={(id) => focusObject(id)}
            onDetail={(id, t) => act.current.setMarkerInfo(id, { detail: t })}
            onResolved={(id, r) => act.current.setMarkerInfo(id, { resolved: r })}
            onCopy={() => void act.current.copyObservations(observations)}
            onRenumber={() => act.current.renumberMarkers()}
            onClose={() => setObsOpen(false)}
          />
        )}
        {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        {sel ? (
          <PropertiesPanel
            count={sel.count}
            style={sel.style}
            onStyle={(p) => act.current.restyle(p)}
            onFront={() => act.current.reorder(true)}
            onBack={() => act.current.reorder(false)}
            onLock={() => act.current.setLocked(act.current.takeSelection(), true)}
            onDuplicate={() => void act.current.duplicate()}
            onRotate={() => act.current.rotateSelection()}
            onDelete={() => act.current.removeSelection()}
            onAlign={(m) => act.current.alignSelection(m)}
            onDistribute={(a) => act.current.distributeSelection(a)}
            onTidy={() => act.current.tidySelection()}
            onExport={() => void act.current.exportSelection()}
            image={sel.image}
            onCalibrate={() => act.current.startCalibration()}
            marker={sel.marker}
            onMarker={(id, patch) => act.current.setMarkerInfo(id, patch)}
            link={sel.link}
            onLink={(id, t) => act.current.setLink(id, t)}
            onOpenLink={() => act.current.openLink(cRef.current?.getActiveObject())}
          />
        ) : lockedFocus ? (
          <aside className="bd-panel" aria-label="Elemento bloqueado">
            <div className="bd-panel-title"><Icon name="lock" size={14} /> Bloqueado</div>
            <p>No se mueve ni se selecciona con un clic. Arrastrá encima para seleccionar lo que dibujaste sobre él.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => act.current.setLocked([lockedFocus], false)}>
              <Icon name="unlock" size={13} /> Desbloquear
            </button>
          </aside>
        ) : null}
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void act.current.importFile(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void act.current.addImages(files);
        }}
      />
    </div>
  );
}
