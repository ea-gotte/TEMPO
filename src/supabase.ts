/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Se captura antes de crear el cliente: Supabase reescribe la URL (quita el hash/query
// de auth) al procesar la sesión, y el evento PASSWORD_RECOVERY no siempre se dispara
// (depende del flujo implicit/PKCE). Mirar la URL original es la única señal confiable.
export const isPasswordRecoveryLink =
  window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");

// Un enlace de recuperación vencido o ya reemplazado por uno más nuevo redirige con
// #error=access_denied&error_code=otp_expired en vez de establecer sesión.
function readAuthUrlError(): string | null {
  const raw = window.location.hash.replace(/^#/, "") || window.location.search.replace(/^\?/, "");
  const params = new URLSearchParams(raw);
  const code = params.get("error_code");
  if (!code) return null;
  if (code === "otp_expired") {
    return "El enlace de recuperación venció o quedó reemplazado por uno más nuevo. Solicitá un correo de recuperación nuevo y usá únicamente el último que recibas.";
  }
  return params.get("error_description")?.replace(/\+/g, " ") || "El enlace del correo no es válido.";
}
export const authUrlError = readAuthUrlError();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
