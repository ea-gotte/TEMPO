import React, { useState } from "react";
import { Icon } from "../../components/Icon";
import { useDraft } from "./useDraft";
import { isSafeColor } from "./sanitize";
import { filterObservations, observationCounts, renumberObservations, type Observation, type ObservationFilter } from "./observations";

export type ObservationItem = Observation & { color: string };

const FILTERS: [ObservationFilter, string][] = [["all", "Todas"], ["open", "Abiertas"], ["resolved", "Resueltas"]];

/** Descripción de una observación: se registra al salir del campo, en un solo paso de deshacer (ver useDraft). */
export function DetailField({ value, onSave, autoFocus }: { value: string; onSave: (text: string) => void; autoFocus?: boolean }) {
  const { draft, change, flush, reset } = useDraft(value, onSave);
  return (
    <textarea
      className="bd-obs-detail"
      rows={2}
      autoFocus={autoFocus}
      placeholder="Qué hay que revisar…"
      aria-label="Descripción de la observación"
      value={draft}
      onChange={(e) => change(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        // Esc descarta lo escrito; Ctrl+Enter lo registra
        if (e.key === "Escape") { reset(); e.currentTarget.blur(); }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
      }}
    />
  );
}

/** Lista de las observaciones numeradas del tablero: descripción, estado, ir a cada una y copiar la lista. */
export function ObservationsPanel({ items, below, onFocus, onDetail, onResolved, onCopy, onRenumber, onClose }: {
  items: ObservationItem[];
  /** La barra de búsqueda está abierta arriba: el panel baja */
  below: boolean;
  onFocus: (id: string) => void;
  onDetail: (id: string, text: string) => void;
  onResolved: (id: string, resolved: boolean) => void;
  onCopy: () => void;
  /** Renumerar 1, 2, 3… (se ofrece solo si hay huecos o números repetidos) */
  onRenumber: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<ObservationFilter>("all");
  const counts = observationCounts(items);
  const shown = filterObservations(items, filter) as ObservationItem[];
  return (
    <aside className={`bd-panel bd-obs${below ? " below" : ""}`} aria-label="Observaciones">
      <div className="bd-panel-title">
        <Icon name="clipboard" size={14} /> Observaciones
        <span className="bd-obs-count">{counts.open} abierta{counts.open === 1 ? "" : "s"} · {counts.resolved} resuelta{counts.resolved === 1 ? "" : "s"}</span>
        <button type="button" className="bd-btn" title="Copiar la lista (se pega en Excel o en un correo)" aria-label="Copiar la lista" disabled={!items.length} onClick={onCopy}>
          <Icon name="copy" size={14} />
        </button>
        <button type="button" className="bd-btn" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {items.length ? (
        <>
          <div className="bd-row-ctl">
            {FILTERS.map(([f, label]) => (
              <button key={f} type="button" className={`bd-chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{label}</button>
            ))}
            {renumberObservations(items).size > 0 && (
              <button type="button" className="bd-chip" title="Hay números salteados o repetidos: numerarlas 1, 2, 3… en el orden que tienen" onClick={onRenumber}>
                Renumerar
              </button>
            )}
          </div>
          <ol className="bd-obs-list">
            {shown.map((o) => (
              <li key={o.id} className={`bd-obs-item${o.resolved ? " resolved" : ""}`}>
                <button type="button" className="bd-obs-num" style={{ background: isSafeColor(o.color) ? o.color : "#e11d48" }} title="Ir a la observación" aria-label={`Ir a la observación ${o.num}`} onClick={() => onFocus(o.id)}>
                  {o.num}
                </button>
                <div className="bd-obs-body">
                  {/* la clave incluye el texto guardado: si cambia por deshacer, el campo se pone al día */}
                  <DetailField key={o.detail} value={o.detail} onSave={(t) => onDetail(o.id, t)} />
                  <label className="bd-obs-check">
                    <input type="checkbox" checked={o.resolved} onChange={(e) => onResolved(o.id, e.target.checked)} /> Resuelta
                  </label>
                </div>
              </li>
            ))}
            {!shown.length && <li className="bd-obs-empty">No hay observaciones {filter === "open" ? "abiertas" : "resueltas"}.</li>}
          </ol>
        </>
      ) : (
        <p>Todavía no hay observaciones. Con la herramienta Observación (M) numerá los puntos a revisar sobre el plano.</p>
      )}
    </aside>
  );
}
