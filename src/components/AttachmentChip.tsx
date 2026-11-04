import { Icon } from "./Icon";
import { attachmentMime } from "../utils";
import type { Attachment } from "../types";

/** Convierte un data URL en Blob con el tipo indicado. El tipo lo decide la app
 * (attachmentMime), nunca el que declara el propio archivo. */
function dataUrlToBlob(dataUrl: string, mime: string): Blob {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function AttachmentChip({ f }: { f: Attachment }) {
  // null = tipo no permitido (HTML, SVG...): se puede descargar, pero no abrir.
  const viewMime = f.url ? attachmentMime(f.name, f.url) : null;

  const withBlobUrl = (mime: string, fn: (url: string) => void) => {
    if (!f.url) return;
    const url = URL.createObjectURL(dataUrlToBlob(f.url, mime));
    fn(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const view = () => {
    if (viewMime) withBlobUrl(viewMime, (url) => window.open(url, "_blank", "noopener"));
  };
  const download = () =>
    withBlobUrl("application/octet-stream", (url) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

  return (
    <span className="badge" style={{ gap: 6 }} title={f.url ? f.name : "Archivo de demostración (sin contenido cargado)"}>
      <Icon name="paperclip" size={12} /> {f.name}
      {f.size != null && <span style={{ color: "var(--text-3)" }}>({f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`})</span>}
      {f.url && (
        <>
          {viewMime && (
            <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={view} aria-label="Ver" title="Ver">
              <Icon name="eye" size={12} />
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={download} aria-label="Descargar" title="Descargar">
            <Icon name="download" size={12} />
          </button>
        </>
      )}
    </span>
  );
}
