import React from "react";
import { Icon } from "../../components/Icon";

/** Buscar texto en el tablero (Ctrl+F): Enter va al siguiente, Shift+Enter al anterior, Esc cierra. */
export function SearchBar({ query, count, index, onQuery, onNext, onPrev, onClose }: {
  query: string;
  count: number;
  index: number;
  onQuery: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  return (
    <div className="bd-search" role="search">
      <Icon name="search" size={14} />
      <input
        autoFocus
        className="bd-search-input"
        placeholder="Buscar en el tablero…"
        aria-label="Buscar en el tablero"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="bd-search-count">{query.trim() ? (count ? `${index + 1} de ${count}` : "Sin resultados") : ""}</span>
      <button type="button" className="bd-btn" aria-label="Anterior (Shift+Enter)" title="Anterior (Shift+Enter)" disabled={!count} onClick={onPrev}>
        <Icon name="arrow-left" size={14} />
      </button>
      <button type="button" className="bd-btn" aria-label="Siguiente (Enter)" title="Siguiente (Enter)" disabled={!count} onClick={onNext}>
        <Icon name="arrow-right" size={14} />
      </button>
      <button type="button" className="bd-btn" aria-label="Cerrar (Esc)" title="Cerrar (Esc)" onClick={onClose}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
