import { useEffect, useRef, useState } from "react";

/**
 * Campo que se escribe libre y se registra una sola vez: al salir del campo, con Enter, o al
 * desaparecer el campo (un clic en el lienzo cambia la selección y cierra el panel antes de que
 * el navegador avise que el campo perdió el foco). Así cada cambio es un solo paso de deshacer.
 * `onSave` puede devolver false para rechazar lo escrito.
 */
export function useDraft(value: string, onSave: (text: string) => boolean | void) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft: value, saved: value, onSave });
  latest.current.onSave = onSave;
  const flush = () => {
    const l = latest.current;
    if (l.draft === l.saved) return;
    const prev = l.saved;
    l.saved = l.draft;
    // false = no se aceptó (por ejemplo, un enlace inválido): el campo vuelve a lo que tenía
    if (l.onSave(l.draft) === false) {
      l.saved = prev;
      change(prev);
    }
  };
  useEffect(() => flush, []);
  const change = (text: string) => {
    latest.current.draft = text;
    setDraft(text);
  };
  /** Descarta lo escrito (Esc) */
  const reset = () => change(latest.current.saved);
  return { draft, change, flush, reset };
}
