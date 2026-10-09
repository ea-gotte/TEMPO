/**
 * Enlaces en los objetos del tablero (puro, sin Fabric): una nota o un plano que lleva al
 * documento o la carpeta. Solo direcciones web y de correo: un tablero importado podría traer
 * un "javascript:" que, al abrirse, correría código.
 */

const HAS_SCHEME = /^([a-z][a-z0-9+.-]*:\/\/|mailto:)/i;
// los rótulos (entre puntos) no incluyen el punto: si lo incluyeran, la expresión tardaría exponencialmente
// en rechazar "a.a.a.a…:x" y una dirección armada colgaría la página
const HOST_LIKE = /^[^\s/:?#.]+((\.[^\s/:?#.]+)+(:\d+)?|:\d+)([/?#]|$)/;

/** Dirección lista para guardar y abrir; "" = quitar el enlace; null = no es una dirección válida. */
export function normalizeLink(input: string): string | null {
  const s = input.trim();
  if (!s) return "";
  if (/\s/.test(s)) return null;
  // con esquema ("https://", "mailto:") va tal cual; si parece una dirección (con punto o con puerto), se le pone
  // https://. "intranet.local:8080" no es el esquema "intranet.local:" (por eso se mira que siga "//")
  const withScheme = HAS_SCHEME.test(s) ? s : HOST_LIKE.test(s) ? `https://${s}` : null;
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
