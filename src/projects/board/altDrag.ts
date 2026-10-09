/**
 * Alt+arrastrar duplica (puro, sin Fabric): como en Figma, lo que se arrastra es el
 * duplicado y en el lugar de origen queda una copia con las flechas que tenía. Al soltar,
 * dice cómo quedan enganchadas las flechas.
 */

export interface Link {
  id: string;
  fromId: string | null;
  toId: string | null;
}

/**
 * `links`: flechas y líneas del lienzo (sin las copias nuevas); `dragged`: ids de lo arrastrado;
 * `copyOf`: id de lo arrastrado → id de su copia (que quedó en el lugar de origen).
 * Devuelve los extremos de cada flecha arrastrada, de su copia y de las de afuera que cambian.
 */
export function relinkAfterAltDrag(links: Link[], dragged: Set<string>, copyOf: Map<string, string>): Map<string, { fromId: string | null; toId: string | null }> {
  // lo que queda en el lugar de origen: las copias de lo arrastrado y lo que no se tocó
  const stay = (id: string | null) => (id && dragged.has(id) ? copyOf.get(id) ?? null : id);
  // lo que se mueve solo sigue enganchado a lo que se movió con él
  const moved = (id: string | null) => (id && dragged.has(id) ? id : null);
  const out = new Map<string, { fromId: string | null; toId: string | null }>();
  for (const l of links) {
    if (dragged.has(l.id)) {
      out.set(l.id, { fromId: moved(l.fromId), toId: moved(l.toId) });
      const copy = copyOf.get(l.id);
      if (copy) out.set(copy, { fromId: stay(l.fromId), toId: stay(l.toId) });
    } else {
      const next = { fromId: stay(l.fromId), toId: stay(l.toId) };
      if (next.fromId !== l.fromId || next.toId !== l.toId) out.set(l.id, next);
    }
  }
  return out;
}
