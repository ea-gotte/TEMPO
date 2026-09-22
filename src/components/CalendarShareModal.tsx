import React, { useEffect, useState } from "react";
import { supabase, supabaseUrl } from "../supabase";
import { Modal, useToast } from "./ui";
import { Icon } from "./Icon";

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Enlace privado de suscripción (iCal) al calendario de horas de la persona, para
 * verlo en Google Calendar u otros. El token es la llave: regenerarlo invalida el
 * enlace anterior. La función `calendar-feed` de Supabase es la que lo sirve. */
export function CalendarShareModal({ userId, baseLabel, onClose }: { userId: string; baseLabel: string; onClose: () => void }) {
  const toast = useToast();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("calendar_feeds")
      .select("token")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError("No se pudo leer el enlace. Puede que falte correr el SQL de la fase 25 en Supabase.");
          setToken(null);
          return;
        }
        setToken(data?.token ?? null);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const url = token ? `${supabaseUrl}/functions/v1/calendar-feed?token=${token}` : "";

  async function generate() {
    setBusy(true);
    setError(null);
    const t = newToken();
    const { error: err } = await supabase.from("calendar_feeds").upsert({ user_id: userId, token: t }, { onConflict: "user_id" });
    setBusy(false);
    if (err) {
      setError(`No se pudo generar el enlace: ${err.message}`);
      return;
    }
    setToken(t);
  }

  async function disable() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("calendar_feeds").delete().eq("user_id", userId);
    setBusy(false);
    if (err) {
      setError(`No se pudo desactivar el enlace: ${err.message}`);
      return;
    }
    setToken(null);
    toast("Enlace desactivado: quien lo tenía ya no puede ver el calendario.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado.");
    } catch {
      toast("No se pudo copiar automáticamente: seleccioná el enlace y copialo a mano.");
    }
  }

  return (
    <Modal
      title="Compartir y vincular con Google Calendar"
      onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>Cerrar</button>}
    >
      {token === undefined ? (
        <p style={{ fontSize: 13 }}>Cargando…</p>
      ) : token === null ? (
        <>
          <p style={{ fontSize: 13.5, marginBottom: 10 }}>
            Generá un enlace privado para ver tus registros de horas en Google Calendar (o compartirlos con quien quieras).
            Es de solo lectura: nada de lo que hagas en Google cambia TEMPO.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={generate}>
            <Icon name="share-2" size={14} /> {busy ? "Generando…" : "Generar enlace"}
          </button>
        </>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Tu enlace privado (iCal)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
              <button className="btn btn-secondary" onClick={copy}><Icon name="copy" size={14} /> Copiar</button>
            </div>
          </div>

          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <strong>Para verlo en Google Calendar</strong>
            <ol style={{ margin: "4px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>
              <li>Copiá el enlace de arriba.</li>
              <li>En Google Calendar (versión web), a la izquierda, abrí “Otros calendarios” y tocá “+”.</li>
              <li>Elegí “Desde URL”, pegá el enlace y tocá “Añadir calendario”.</li>
            </ol>
          </div>

          <ul style={{ fontSize: 12.5, color: "var(--text-2)", margin: "0 0 12px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            <li>Muestra tus registros de horas de los últimos 180 días y los futuros, con proyecto y descripción.</li>
            <li>
              Las horas se toman en tu huso <strong>Base</strong> de TEMPO ({baseLabel}) y Google las convierte al huso de tu cuenta.
              Si no coinciden, cambiá el huso “Base” del Calendario al que usás para cargar tus horas.
            </li>
            <li>Google actualiza los calendarios por URL cada varias horas (a veces hasta 24 h): no es instantáneo.</li>
            <li>Los eventos figuran como “disponible” para no bloquear tu agenda.</li>
            <li>Quien tenga el enlace puede ver tus registros. Si se filtra, tocá “Regenerar”: el anterior deja de funcionar.</li>
          </ul>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={generate}>
              <Icon name="repeat" size={13} /> Regenerar enlace
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={disable}>
              <Icon name="ban" size={13} /> Desactivar
            </button>
          </div>
        </>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </Modal>
  );
}
