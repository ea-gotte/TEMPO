/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Se captura antes de crear el cliente: Supabase reescribe la URL (quita el hash/query
// de auth) al procesar la sesión, y el evento PASSWORD_RECOVERY no siempre se dispara
// (depende del flujo implicit/PKCE). Mirar la URL original es la única señal confiable.
export const isPasswordRecoveryLink =
  window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
