/// <reference types="vite/client" />
/**
 * Conexión personal con Microsoft (Outlook/Teams): cada usuario conecta su
 * propia cuenta desde el Calendario para ver sus reuniones de Teams
 * mezcladas con sus registros de TEMPO. Es de solo lectura (permiso
 * Calendars.Read) y 100% del lado del navegador — no hay backend propio
 * involucrado, ni Supabase se entera de esto: la sesión de Microsoft vive
 * en el localStorage de cada navegador (msal-browser la administra sola).
 *
 * Requiere una app registrada en Azure AD (Microsoft Entra ID) — ver
 * .env.example para las dos variables necesarias.
 */
import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || "";
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID || "";

/** false si todavía no se cargaron las credenciales de Azure AD */
export const msalConfigured = Boolean(clientId && tenantId);

const SCOPES = ["Calendars.Read"];

const msalInstance = msalConfigured
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        // Origen + ruta exactos de la app, sin query ni hash — tiene que
        // coincidir con el URI de redirección tipo "SPA" cargado en Azure AD.
        redirectUri: window.location.href.split(/[?#]/)[0],
      },
      cache: { cacheLocation: "localStorage" },
    })
  : null;

let initPromise: Promise<void> | null = null;
function ensureInitialized(): Promise<void> {
  if (!msalInstance) return Promise.reject(new Error("La conexión con Microsoft no está configurada."));
  if (!initPromise) initPromise = msalInstance.initialize();
  return initPromise;
}

/** Cuenta de Microsoft ya conectada en este navegador, si hay una. */
export function getConnectedAccount(): AccountInfo | null {
  if (!msalInstance) return null;
  return msalInstance.getAllAccounts()[0] ?? null;
}

/** Abre el login de Microsoft en un popup y pide permiso de solo-lectura de calendario. */
export async function connectMicrosoft(): Promise<AccountInfo> {
  await ensureInitialized();
  const result = await msalInstance!.loginPopup({ scopes: SCOPES, prompt: "select_account" });
  if (!result.account) throw new Error("No se pudo obtener la cuenta de Microsoft.");
  return result.account;
}

/** Olvida la cuenta conectada en este navegador (no cierra la sesión de Microsoft en sí). */
export async function disconnectMicrosoft(): Promise<void> {
  const account = getConnectedAccount();
  if (!msalInstance || !account) return;
  await ensureInitialized();
  await msalInstance.clearCache({ account });
}

async function acquireToken(): Promise<string> {
  await ensureInitialized();
  const account = getConnectedAccount();
  if (!account) throw new Error("No hay una cuenta de Microsoft conectada.");
  try {
    const res = await msalInstance!.acquireTokenSilent({ scopes: SCOPES, account });
    return res.accessToken;
  } catch {
    // El token silencioso puede fallar si venció o el permiso cambió — se
    // repite con un popup para que la persona vuelva a confirmar.
    const res = await msalInstance!.acquireTokenPopup({ scopes: SCOPES, account });
    return res.accessToken;
  }
}

export interface TeamsEvent {
  id: string;
  subject: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  isAllDay: boolean;
  location: string;
  webLink: string;
}

/** Reuniones de Outlook/Teams de la cuenta conectada entre [fromISO, toISO] (fechas YYYY-MM-DD). */
export async function fetchTeamsEvents(fromISO: string, toISO: string): Promise<TeamsEvent[]> {
  const token = await acquireToken();
  const url =
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${fromISO}T00:00:00&endDateTime=${toISO}T23:59:59` +
    `&$top=200&$orderby=start/dateTime&$select=id,subject,start,end,isAllDay,location,webLink`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Microsoft Graph respondió ${res.status}`);
  const data = await res.json();
  return ((data.value ?? []) as any[]).map((e) => ({
    id: e.id,
    subject: e.subject || "(sin título)",
    // Graph devuelve "2024-05-01T09:00:00.0000000" sin "Z" cuando se pide UTC explícito.
    start: e.start?.dateTime ? `${e.start.dateTime}Z` : "",
    end: e.end?.dateTime ? `${e.end.dateTime}Z` : "",
    isAllDay: Boolean(e.isAllDay),
    location: e.location?.displayName ?? "",
    webLink: e.webLink ?? "",
  }));
}
