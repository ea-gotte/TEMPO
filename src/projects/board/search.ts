/** Buscar texto en el tablero (puro, sin Fabric): sin distinguir mayúsculas ni tildes. */

export const normalizeText = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Ids de los elementos cuyo texto contiene la búsqueda, en el orden en que vienen. */
export function findMatches(items: { id: string; text: string }[], query: string): string[] {
  const q = normalizeText(query.trim());
  if (!q) return [];
  return items.filter((i) => normalizeText(i.text).includes(q)).map((i) => i.id);
}
