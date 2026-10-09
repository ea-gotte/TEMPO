import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActiveSelection, IText, type Canvas, type FabricObject } from "fabric";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/ui";
import { today, uid } from "../../utils";
import { boardEpoch, loadBoard, saveBoard, type BoardDoc } from "./boardStore";
import { applyToolMode, attachPanZoom, createBoardCanvas, exportPng, fitToContent, getViewport, setViewport, viewCenter, zoomAt, zoomStep } from "./canvas";
import { isConnector, refreshConnectors } from "./connectors";
import { attachDrawing } from "./draw";
import { fitScale, gridSpec, type Pt } from "./geometry";
import { createHistory } from "./history";
import { readImage, validateImageFile } from "./image";
import { attachKeys, type KeyAction } from "./keys";
import { bakeScaledLabels, editLabel, isLabeled } from "./labels";
import { PropertiesPanel } from "./PropertiesPanel";
import { insertCopies, restore, snapshot } from "./serialize";
import { applyLock, createImage, isTransient, prepareObject, replaceObject } from "./shapes";
import { applyStyle, readStyle, type StylePatch, type StyleState } from "./style";
import { Toolbar, type Pen } from "./Toolbar";
import { INK, NOTE_COLORS, type Tool } from "./tools";
import "./board.css";

/**
 * Tablero del proyecto: un lienzo infinito para pizarra de ideas, marcado de
 * planos e imágenes y diagramas. Se guarda en este navegador (IndexedDB), como el
 * resto de la demo. Basado en la idea de Figma_Clone (github.com/Lyam0udi/Figma_Clone),
 * sin Liveblocks. Spec: docs/superpowers/specs/2026-10-08-tablero-proyecto-design.md
 */

type Banner = { kind: "unavailable" } | { kind: "quota"; mb: number } | { kind: "corrupt"; raw: unknown };

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "proyecto";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BoardTab({ projectId, fileLabel }: { projectId: string; fileLabel: string }) {
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
  /** Operación propia en curso: el evento selection:cleared no debe registrar pasos intermedios. */
  const quiet = useRef(false);
  const clipboard = useRef<Record<string, unknown>[]>([]);
  const pasteCount = useRef(0);
  const spaceHeld = useRef(false);
  const downAt = useRef<Pt | null>(null);

  const [tool, setToolState] = useState<Tool>("select");
  const toolRef = useRef<Tool>("select");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const noteColorRef = useRef(noteColor);
  noteColorRef.current = noteColor;
  const [pen, setPen] = useState<Pen>({ color: INK, width: 4 });
  const penRef = useRef(pen);
  penRef.current = pen;
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<{ count: number; style: StyleState } | null>(null);
  const [lockedFocus, setLockedFocus] = useState<FabricObject | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [lockPrompt, setLockPrompt] = useState<FabricObject | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);

  /* ---------- Guardado e historial ---------- */

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const c = cRef.current;
    if (!c || !loaded.current || !dirty.current || blockSave.current || epoch.current !== boardEpoch()) return;
    dirty.current = false;
    const res = await saveBoard({
      projectId, version: 1, fabric: lastData.current ?? { objects: [] }, viewport: getViewport(c), updatedAt: new Date().toISOString(),
    });
    if (res === "ok") {
      setBanner((b) => (b?.kind === "quota" ? null : b));
      return;
    }
    dirty.current = true; // se reintenta con el próximo cambio
    if (res === "quota") setBanner({ kind: "quota", mb: (history.current()?.length ?? 0) / 1e6 });
    else if (res === "unavailable") setBanner({ kind: "unavailable" });
    else toast("No se pudo guardar el tablero.");
  }, [projectId, history, toast]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 800);
  }, [flushSave]);

  const syncHistory = useCallback(() => setHist({ undo: history.canUndo(), redo: history.canRedo() }), [history]);

  /** Registra el estado actual como un paso de deshacer y programa el guardado. */
  const commit = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = 0; // 0 = no hay un commitSoon pendiente
    const c = cRef.current;
    if (!c || !loaded.current || restoring.current) return;
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
    setSel(objs.length ? { count: objs.length, style: readStyle(objs[0]) } : null);
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
  }, []);

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
    syncHistory();
    refreshPanel();
    scheduleSave();
  };

  // Antes de deshacer/rehacer se registra un cambio que esperaba (commitSoon): si no, se perdería
  const undo = () => {
    if (commitTimer.current) commit();
    void applySnapshot(history.undo());
  };
  const redo = () => {
    if (commitTimer.current) commit();
    void applySnapshot(history.redo());
  };

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

  const copySelection = () => {
    const objs = takeSelection();
    if (!objs.length) return;
    clipboard.current = objs.map((o) => o.toObject() as Record<string, unknown>);
    pasteCount.current = 0;
    select(objs);
  };

  const pasteClipboard = async () => {
    const c = cRef.current;
    if (!c || !clipboard.current.length) return;
    pasteCount.current += 1;
    const objs = await insertCopies(c, clipboard.current, 20 * pasteCount.current);
    refreshConnectors(c);
    select(objs);
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
        toast(err);
        continue;
      }
      try {
        const img = await readImage(file);
        const z = getViewport(c).zoom;
        const scale = fitScale(img.width, img.height, (c.width * 0.8) / z, (c.height * 0.8) / z);
        const p = at ?? viewCenter(c);
        const obj = await createImage(img.dataUrl, { x: p.x + shift, y: p.y + shift }, scale);
        shift += 24;
        c.add(obj);
        c.setActiveObject(obj);
        refreshPanel();
        commit();
        if (Math.max(img.width, img.height) > 1200) setLockPrompt(obj);
      } catch {
        toast("No se pudo leer la imagen.");
      }
    }
  };

  const exportBoard = async () => {
    const c = cRef.current;
    if (!c) return;
    const blob = await exportPng(c);
    if (!blob) {
      toast("El tablero está vacío: no hay nada para exportar.");
      return;
    }
    download(blob, `tablero-${slug(fileLabel)}-${today()}.png`);
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
      case "copy": copySelection(); break;
      case "duplicate": void duplicate(); break;
      case "selectAll": selectAll(); break;
      case "delete": removeSelection(); break;
      case "nudge": nudge(a.dx, a.dy); break;
      case "escape":
        c.discardActiveObject();
        c.requestRenderAll();
        setTool("select");
        break;
      case "fit":
        fitToContent(c);
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

  const actions = {
    undo, redo, select, restyle, reorder, setLocked, takeSelection, removeSelection, copySelection, pasteClipboard, duplicate,
    clearBoard, addImages, exportBoard, startOver, onKey, hasClipboard: () => clipboard.current.length > 0,
  };
  const act = useRef(actions);
  act.current = actions;

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
    const edit = (g: Parameters<typeof editLabel>[1]) => editLabel(c, g, () => { refreshPanel(); commit(); });

    const offs: (() => void)[] = [
      attachPanZoom(c, { panMode: () => toolRef.current === "hand" || spaceHeld.current, onChange: onViewport }),
      attachDrawing(c, {
        // con Espacio apretado se desplaza la vista: no se dibuja aunque haya una herramienta de dibujo elegida
        tool: () => (spaceHeld.current ? "hand" : toolRef.current),
        noteColor: () => noteColorRef.current,
        onCreated: (obj, editing) => {
          setTool("select");
          if (editing) return; // el texto nuevo se registra al salir de la edición
          refreshPanel();
          commit();
          if (isLabeled(obj) && obj.kind === "note") edit(obj); // una nota nueva entra directo a escribir
        },
      }),
      c.on("object:moving", (e) => live(e.target)),
      c.on("object:scaling", (e) => live(e.target)),
      c.on("object:rotating", (e) => live(e.target)),
      c.on("object:modified", (e) => {
        const t = e.target;
        if (!t || isTransient(t)) return;
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
            const baked = new Map(bakeScaledLabels(c, objs).map((g) => [g.id, g]));
            refreshConnectors(c);
            act.current.select(objs.map((o) => (o.id && baked.get(o.id)) || o));
            commit();
          }, 0);
          return;
        }
        if (isConnector(t)) t.set({ fromId: null, toId: null }); // mover una flecha a mano la desengancha
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
      }),
      c.on("path:created", (e) => {
        e.path.set({ id: uid(), kind: "path" });
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
        if (toolRef.current === "select" && isLabeled(t) && !t.lockedByUser) edit(t);
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
      c.on("mouse:up", (e) => {
        const d = downAt.current;
        downAt.current = null;
        if (toolRef.current !== "select" || spaceHeld.current || !d) return;
        // clic (sin arrastre) sobre algo bloqueado: el panel ofrece desbloquearlo
        if (Math.hypot(e.viewportPoint.x - d.x, e.viewportPoint.y - d.y) < 4) setLockedFocus(e.target?.lockedByUser ? e.target : null);
      }),
      attachKeys((a) => act.current.onKey(a), () => !!(c.getActiveObject() as IText | undefined)?.isEditing),
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
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      disposed = true;
      finishEditing(); // el texto que se estaba escribiendo no se pierde al cambiar de pestaña
      commit(); // un cambio pendiente de commitSoon no se pierde
      void flushSave(); // lee el estado de forma síncrona, antes de desarmar el lienzo
      loaded.current = false;
      offs.forEach((off) => off());
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
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
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void act.current.addImages(files);
      } else if (act.current.hasClipboard()) {
        e.preventDefault();
        void act.current.pasteClipboard();
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
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
    <div className="bd-root" ref={rootRef}>
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
        onExport={() => void act.current.exportBoard()}
        fullscreen={fullscreen}
        onFullscreen={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void rootRef.current?.requestFullscreen();
        }}
        onClear={() => act.current.clearBoard()}
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
      {lockPrompt && (
        <div className="bd-banner info" role="status">
          <Icon name="lock" size={14} /> La imagen es grande. ¿Bloquearla para marcar encima sin moverla?
          <button className="btn btn-primary btn-sm" onClick={() => { act.current.setLocked([lockPrompt], true); setLockPrompt(null); }}>Bloquear</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLockPrompt(null)}>No</button>
        </div>
      )}

      <div className="bd-stage">
        <div
          className="bd-canvas"
          ref={hostRef}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files);
            const c = cRef.current;
            if (!files.length || !c || !hostRef.current) return;
            e.preventDefault();
            const r = hostRef.current.getBoundingClientRect();
            const v = getViewport(c);
            void act.current.addImages(files, { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom });
          }}
        />
        {!ready && <div className="bd-loading">Cargando el tablero…</div>}
        {sel ? (
          <PropertiesPanel
            count={sel.count}
            style={sel.style}
            onStyle={(p) => act.current.restyle(p)}
            onFront={() => act.current.reorder(true)}
            onBack={() => act.current.reorder(false)}
            onLock={() => act.current.setLocked(act.current.takeSelection(), true)}
            onDuplicate={() => void act.current.duplicate()}
            onDelete={() => act.current.removeSelection()}
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
