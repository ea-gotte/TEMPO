/**
 * Imágenes y planos que entran al tablero (spec §5.3). Lo puro se prueba con
 * Vitest; readImage usa APIs del navegador (FileReader, Image, canvas).
 * Adaptado de handleImageUpload (lib/shapes.ts) de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_SIDE = 4096;

/** Mensaje para el usuario si el archivo no sirve; null si está bien. SVG no: puede traer scripts. */
export function validateImageFile(f: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(f.type)) return "Solo se pueden agregar imágenes PNG, JPG, WebP o GIF.";
  if (f.size > MAX_BYTES) return "La imagen supera los 25 MB.";
  return null;
}

/** Medidas reducidas para que el lado mayor no pase de `max`. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { width: number; height: number; scaled: boolean } {
  const side = Math.max(w, h);
  if (side <= max) return { width: w, height: h, scaled: false };
  const k = max / side;
  return { width: Math.round(w * k), height: Math.round(h * k), scaled: true };
}

/**
 * Una imagen se recodifica si hubo que reducirla o si pesa más de 4 MB: cada
 * instantánea del historial lleva su data URL, y una muy pesada deja sin pasos de deshacer.
 */
export const REENCODE_BYTES = 4 * 1024 * 1024;
export const needsReencode = (bytes: number, scaled: boolean) => scaled || bytes > REENCODE_BYTES;

/** ¿Algún píxel (RGBA) no es opaco? */
export function hasAlpha(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen ilegible"));
    img.src = src;
  });

/**
 * Lee la imagen como data URL. Si pasa de 4096 px (o pesa más de 4 MB) se reduce y se recodifica
 * (JPEG 0,85; PNG si tiene transparencia); si no, queda el archivo original.
 */
export async function readImage(file: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  const original = await readAsDataUrl(file);
  const img = await loadImg(original);
  const fit = fitWithin(img.naturalWidth, img.naturalHeight);
  if (!needsReencode(file.size, fit.scaled)) return { dataUrl: original, width: fit.width, height: fit.height };
  const canvas = document.createElement("canvas");
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin contexto 2D");
  ctx.drawImage(img, 0, 0, fit.width, fit.height);
  const alpha = file.type !== "image/jpeg" && hasAlpha(ctx.getImageData(0, 0, fit.width, fit.height).data);
  const encoded = alpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  // una imagen sin reducir solo se reemplaza si la recodificación realmente ocupa menos
  const dataUrl = !fit.scaled && encoded.length >= original.length ? original : encoded;
  return { dataUrl, width: fit.width, height: fit.height };
}
