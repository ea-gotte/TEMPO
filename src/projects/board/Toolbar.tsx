import React from "react";
import { Icon, type IconName } from "../../components/Icon";
import { NOTE_COLORS, PALETTE, PEN_WIDTHS, TOOLS, type Tool, type ToolGroup } from "./tools";

/** Barra superior del tablero. Adaptado de Navbar/ShapesMenu de Figma_Clone (github.com/Lyam0udi/Figma_Clone). */

/** Estado del guardado en este navegador, para el indicador de la barra */
export type SaveState = "saved" | "pending" | "saving" | "error" | "off";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Guardado",
  pending: "Guardando…",
  saving: "Guardando…",
  error: "No se pudo guardar",
  off: "Sin guardar",
};

export interface Pen {
  color: string;
  width: number;
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
  onExport: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onClear: () => void;
  saveState: SaveState;
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
        </div>
        <span className="bd-spacer" />
        <span className={`bd-save ${p.saveState}`} role="status" aria-live="polite">{SAVE_LABEL[p.saveState]}</span>
        <div className="bd-group">
          <Btn icon="download" label="Exportar PNG" onClick={p.onExport} />
          <Btn icon={p.fullscreen ? "minimize" : "maximize"} label={p.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={p.onFullscreen} />
          <Btn icon="trash" label="Vaciar el tablero" danger onClick={p.onClear} />
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
          <span>Color</span>
          {PALETTE.filter((c) => c !== "#ffffff").map((c) => <Swatch key={c} color={c} on={p.pen.color === c} onClick={() => p.onPen({ ...p.pen, color: c })} />)}
          <span style={{ marginLeft: 8 }}>Grosor</span>
          {PEN_WIDTHS.map((w) => (
            <button key={w} type="button" className={`bd-chip${p.pen.width === w ? " on" : ""}`} onClick={() => p.onPen({ ...p.pen, width: w })}>{w} px</button>
          ))}
        </div>
      )}
    </div>
  );
}
