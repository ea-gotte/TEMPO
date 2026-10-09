/**
 * Enlaces en los objetos del tablero (puro, sin Fabric): una nota o un plano que lleva al
 * documento o la carpeta. Solo direcciones web y de correo: un tablero importado podría traer
 * un "javascript:" que, al abrirse, correría código.
 */

/** Dirección lista para guardar y abrir; "" = quitar el enlace; null = no es una dirección válida. */
export function normalizeLink(input: string): string | null {
  const s = input.trim();
  if (!s) return "";
  if (/\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : /^[^/]+\.[^/]+/.test(s) ? `https://${s}` : null;
  if (!withScheme) return null;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol === "mailto:") return withScheme;
  if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) return withScheme;
  return null;
}
