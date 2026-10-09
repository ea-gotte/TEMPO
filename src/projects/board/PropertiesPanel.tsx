import React from "react";
import type { AlignMode } from "./align";
import type { StylePatch, StyleState } from "./style";
import type { DashStyle, HeadStyle } from "./strokes";
import { Btn, Swatch } from "./Toolbar";
import { FILL_COLORS, HIGHLIGHT_COLORS, HIGHLIGHT_WIDTHS, NOTE_COLORS, PALETTE, STROKE_WIDTHS } from "./tools";

/** Panel derecho (solo con selección). Adaptado de RightSidebar de Figma_Clone (github.com/Lyam0udi/Figma_Clone). */

const DASHES: [DashStyle, string][] = [["solid", "Continuo"], ["dashed", "Discontinuo"], ["dotted", "Punteado"]];
const HEADS: [HeadStyle, string, string][] = [["end", "→", "Al final"], ["start", "←", "Al inicio"], ["both", "↔", "En ambos extremos"], ["none", "—", "Sin punta"]];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72];

export interface PanelProps {
  count: number;
  style: StyleState;
  onStyle: (p: StylePatch) => void;
  onFront: () => void;
  onBack: () => void;
  onLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: "h" | "v") => void;
  onExport: () => void;
  /** Una imagen sola seleccionada: estado de su escala (para medir sobre el plano) */
  image: { calibrated: boolean } | null;
  onCalibrate: () => void;
}

/** Selector de color libre (además de la paleta). Con valores mixtos o sin color parte de un gris. */
function ColorInput({ value, label, onPick }: { value: string; label: string; onPick: (c: string) => void }) {
  const hex = value.length === 7 && value[0] === "#" ? value : "#9ca3af";
  return <input type="color" className="bd-color" value={hex} title={label} aria-label={label} onChange={(e) => onPick(e.target.value)} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bd-row">
      <span>{label}</span>
      <div className="bd-row-ctl">{children}</div>
    </div>
  );
}

export function PropertiesPanel({ count, style: s, onStyle, onFront, onBack, onLock, onDuplicate, onDelete, onAlign, onDistribute, onExport, image, onCalibrate }: PanelProps) {
  const fills = s.kind === "note" ? NOTE_COLORS : FILL_COLORS;
  // el resaltador tiene sus propios colores claros y trazos anchos
  const hl = s.strokeLabel === "Resaltador";
  const opacity = Math.round(s.opacity * 100);
  return (
    <aside className="bd-panel" aria-label="Propiedades de la selección">
      <div className="bd-panel-title">{count > 1 ? `${count} elementos` : "Propiedades"}</div>
      {s.fill !== null && (
        <Row label="Relleno">
          {fills.map((c) => <Swatch key={c} color={c} on={s.fill === c} onClick={() => onStyle({ fill: c })} />)}
          <ColorInput value={s.fill} label="Otro color de relleno" onPick={(c) => onStyle({ fill: c })} />
        </Row>
      )}
      {s.stroke !== null && (
        <Row label={s.strokeLabel}>
          {(hl ? HIGHLIGHT_COLORS : PALETTE).map((c) => <Swatch key={c} color={c} on={s.stroke === c} onClick={() => onStyle({ stroke: c })} />)}
          <ColorInput value={s.stroke} label="Otro color" onPick={(c) => onStyle({ stroke: c })} />
        </Row>
      )}
      {s.strokeWidth !== null && (
        <Row label="Grosor">
          {(hl ? HIGHLIGHT_WIDTHS : STROKE_WIDTHS).map((w) => (
            <button key={w} type="button" className={`bd-chip${s.strokeWidth === w ? " on" : ""}`} onClick={() => onStyle({ strokeWidth: w })}>{w} px</button>
          ))}
        </Row>
      )}
      {s.dash !== null && (
        <Row label="Trazo">
          {DASHES.map(([v, label]) => (
            <button key={v} type="button" className={`bd-chip${s.dash === v ? " on" : ""}`} onClick={() => onStyle({ dash: v })}>{label}</button>
          ))}
        </Row>
      )}
      {s.heads !== null && (
        <Row label="Puntas">
          {HEADS.map(([v, label, title]) => (
            <button key={v} type="button" className={`bd-chip${s.heads === v ? " on" : ""}`} title={title} aria-label={title} onClick={() => onStyle({ heads: v })}>{label}</button>
          ))}
        </Row>
      )}
      {s.fontSize !== null && (
        <Row label="Tamaño del texto">
          <select
            className="select"
            value={FONT_SIZES.includes(s.fontSize) ? s.fontSize : ""}
            onChange={(e) => { const v = Number(e.target.value); if (v) onStyle({ fontSize: v }); }}
          >
            {!FONT_SIZES.includes(s.fontSize) && <option value="">{s.fontSize ? `${s.fontSize} px` : "Mixto"}</option>}
            {FONT_SIZES.map((f) => <option key={f} value={f}>{f} px</option>)}
          </select>
        </Row>
      )}
      <Row label={`Opacidad · ${opacity} %`}>
        <input type="range" min={10} max={100} step={5} value={opacity} onChange={(e) => onStyle({ opacity: Number(e.target.value) / 100 })} style={{ width: "100%" }} aria-label="Opacidad" />
      </Row>
      {image && (
        <Row label={image.calibrated ? "Escala del plano: calibrada" : "Escala del plano: sin calibrar"}>
          <button type="button" className="bd-chip" onClick={onCalibrate}>
            {image.calibrated ? "Recalibrar" : "Calibrar escala"}
          </button>
        </Row>
      )}
      {count > 1 && (
        <Row label="Alinear">
          <Btn icon="align-left" label="Alinear a la izquierda" onClick={() => onAlign("left")} />
          <Btn icon="align-hcenter" label="Centrar horizontalmente" onClick={() => onAlign("hcenter")} />
          <Btn icon="align-right" label="Alinear a la derecha" onClick={() => onAlign("right")} />
          <Btn icon="align-top" label="Alinear arriba" onClick={() => onAlign("top")} />
          <Btn icon="align-vmiddle" label="Centrar verticalmente" onClick={() => onAlign("vmiddle")} />
          <Btn icon="align-bottom" label="Alinear abajo" onClick={() => onAlign("bottom")} />
          {count > 2 && <Btn icon="distribute-h" label="Distribuir horizontalmente" onClick={() => onDistribute("h")} />}
          {count > 2 && <Btn icon="distribute-v" label="Distribuir verticalmente" onClick={() => onDistribute("v")} />}
        </Row>
      )}
      <div className="bd-actions">
        <Btn icon="bring-front" label="Traer al frente" onClick={onFront} />
        <Btn icon="send-back" label="Enviar al fondo" onClick={onBack} />
        <Btn icon="lock" label="Bloquear (para marcar encima sin moverlo)" onClick={onLock} />
        <Btn icon="copy" label="Duplicar (Ctrl+D)" onClick={onDuplicate} />
        <Btn icon="download" label="Exportar la selección (PNG)" onClick={onExport} />
        <Btn icon="trash" label="Eliminar (Supr)" danger onClick={onDelete} />
      </div>
    </aside>
  );
}
