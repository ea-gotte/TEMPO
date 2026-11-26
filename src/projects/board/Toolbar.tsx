import React from "react";
import { Icon, type IconName } from "../../components/Icon";
import { HIGHLIGHT_COLORS, HIGHLIGHT_WIDTHS, INK, NOTE_COLORS, PALETTE, PEN_WIDTHS, TOOLS, type Tool, type ToolGroup } from "./tools";

/** Barra superior del tablero. Adaptado de Navbar/ShapesMenu de Figma_Clone (github.com/Lyam0udi/Figma_Clone). */

/** Estado del guardado en este navegador, para el indicador de la barra */
export type SaveState = "saved" | "pending" | "saving" | "error" | "off";

export const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Guardado",
  pending: "Guardando…",
  saving: "Guardando…",
  error: "No se pudo guardar",
  off: "Sin guardar",
};

export interface Pen {
  color: string;
  width: number;
  /** Resaltador: trazo ancho y semitransparente que no tapa el plano */
  highlighter: boolean;
}

export interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  noteColor: string;
  onNoteColor: (c: string) => void;
  pen: Pen;
  onPen: (p: Pen) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  /** Abre el menú Más (exportar, descargar, importar, vaciar) junto al botón */
  onMore: (x: number, y: number) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onHelp: () => void;
  /** Abre el menú de plantillas debajo del botón (coordenadas de la ventana) */
  onTemplates: (x: number, y: number) => void;
  /** Abre el menú de sellos de revisión junto al botón */
  onStamps: (x: number, y: number) => void;
  onSearch: () => void;
  /** Abre la lista de secciones (para ir a cada una) junto al botón */
  onSections: (x: number, y: number) => void;
  observations: boolean;
  onObservations: () => void;
  snap: boolean;
  onToggleSnap: () => void;
}

const GROUPS: ToolGroup[] = ["nav", "ideas", "diagram", "markup", "common"];

export function Btn({ icon, label, onClick, on, disabled, danger }: {
  icon: IconName; label: string; onClick: () => void; on?: boolean; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" className={`bd-btn${on ? " on" : ""}${danger ? " danger" : ""}`} title={label} aria-label={label} aria-pressed={on} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={17} />
    </button>
  );
}

export function Swatch({ color, on, onClick }: { color: string; on: boolean; onClick: () => void }) {
  const none = color === "transparent";
  const label = none ? "Sin relleno" : color;
  return (
    <button type="button" className={`bd-swatch${on ? " on" : ""}${none ? " none" : ""}`} style={none ? undefined : { background: color }} title={label} aria-label={label} aria-pressed={on} onClick={onClick} />
  );
}

export function Toolbar(p: ToolbarProps) {
  return (
    <div className="bd-toolbar-wrap">
      <div className="bd-toolbar" role="toolbar" aria-label="Herramientas del tablero">
        {GROUPS.map((g) => (
          <div className="bd-group" key={g}>
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <Btn key={t.key} icon={t.icon} label={`${t.label} (${t.shortcut})`} on={p.tool === t.key} onClick={() => p.onTool(t.key)} />
            ))}
            {g === "markup" && (
              <button
                type="button"
                className="bd-btn"
                title="Sello de revisión"
                aria-label="Sello de revisión"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  p.onStamps(r.left, r.bottom + 4);
                }}
              >
                <Icon name="stamp" size={17} />
              </button>
            )}
          </div>
        ))}
        <div className="bd-group">
          <Btn icon="undo" label="Deshacer (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo} />
          <Btn icon="redo" label="Rehacer (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo} />
        </div>
        <div className="bd-group">
          <Btn icon="zoom-out" label="Alejar" onClick={p.onZoomOut} />
          <button type="button" className="bd-zoom" title="Volver a 100 %" onClick={p.onZoomReset}>{Math.round(p.zoom * 100)} %</button>
          <Btn icon="zoom-in" label="Acercar" onClick={p.onZoomIn} />
          <Btn icon="scan" label="Ajustar al contenido (Shift+1)" onClick={p.onFit} />
          <Btn icon="grid" label="Ajustar a la cuadrícula (G)" on={p.snap} onClick={p.onToggleSnap} />
        </div>
        <span className="bd-spacer" />
        <div className="bd-group">
          <button
            type="button"
            className="bd-btn"
            title="Plantillas"
            aria-label="Plantillas"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              p.onTemplates(r.left, r.bottom + 4);
            }}
          >
            <Icon name="dashboard" size={17} />
          </button>
          <button
            type="button"
            className="bd-btn"
            title="Ir a una sección"
            aria-label="Ir a una sección"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              p.onSections(r.left, r.bottom + 4);
            }}
          >
            <Icon name="list" size={17} />
          </button>
          <Btn icon="search" label="Buscar en el tablero (Ctrl+F)" onClick={p.onSearch} />
          <Btn icon="clipboard" label="Lista de observaciones" on={p.observations} onClick={p.onObservations} />
          <Btn icon="info" label="Atajos de teclado (?)" onClick={p.onHelp} />
          <Btn icon={p.fullscreen ? "minimize" : "maximize"} label={p.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={p.onFullscreen} />
          <button
            type="button"
            className="bd-btn"
            title="Más: exportar, descargar o importar el tablero, vaciarlo"
            aria-label="Más opciones"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              p.onMore(Math.max(8, r.right - 240), r.bottom + 4); // a la derecha de la barra: el menú se abre hacia la izquierda
            }}
          >
            <Icon name="menu" size={17} />
          </button>
        </div>
      </div>
      {p.tool === "note" && (
        <div className="bd-subbar">
          <span>Color de la nota</span>
          {NOTE_COLORS.map((c) => <Swatch key={c} color={c} on={p.noteColor === c} onClick={() => p.onNoteColor(c)} />)}
        </div>
      )}
      {p.tool === "pencil" && (
        <div className="bd-subbar">
          <button type="button" className={`bd-chip${!p.pen.highlighter ? " on" : ""}`} onClick={() => p.onPen({ color: INK, width: 4, highlighter: false })}>Lápiz</button>
          <button type="button" className={`bd-chip${p.pen.highlighter ? " on" : ""}`} onClick={() => p.onPen({ color: HIGHLIGHT_COLORS[0], width: 20, highlighter: true })}>Resaltador</button>
          <span style={{ marginLeft: 8 }}>Color</span>
          {(p.pen.highlighter ? HIGHLIGHT_COLORS : PALETTE.filter((c) => c !== "#ffffff")).map((c) => <Swatch key={c} color={c} on={p.pen.color === c} onClick={() => p.onPen({ ...p.pen, color: c })} />)}
          <span style={{ marginLeft: 8 }}>Grosor</span>
          {(p.pen.highlighter ? HIGHLIGHT_WIDTHS : PEN_WIDTHS).map((w) => (
            <button key={w} type="button" className={`bd-chip${p.pen.width === w ? " on" : ""}`} onClick={() => p.onPen({ ...p.pen, width: w })}>{w} px</button>
          ))}
        </div>
      )}
    </div>
  );
}
