// Función de borde `calendar-feed`: sirve los registros de horas de UNA persona
// como calendario iCal (.ics) para suscribirlo desde Google Calendar, Outlook, etc.
//
// Se identifica solo por el `token` privado de la tabla calendar_feeds (Fase 25);
// por eso debe desplegarse SIN verificación de JWT (Google no envía cabeceras).
//
//   GET https://<proyecto>.supabase.co/functions/v1/calendar-feed?token=<token>
//
// TEMPO guarda cada registro con la hora "de pared" tal como se cargó, sin huso. Se la
// interpreta en el huso Base del Calendario de la persona (profiles.calendar_tz, o el de
// la empresa) y se envía a Google en UTC, para que la convierta bien a su propio huso.
import { createClient } from "npm:@supabase/supabase-js@2";

// Clave con permisos de servicio: la nueva "secret key" del proyecto si existe
// (SUPABASE_SECRET_KEYS) y, si no, la clave heredada service_role.
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch { /* se usa la clave heredada */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());

const DAYS_BACK = 180; // cuántos días hacia atrás incluye el calendario
const PAGE = 1000;

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545: las líneas no pueden pasar de 75 octetos; se continúan con un espacio.
function fold(line: string): string {
  const enc = new TextEncoder();
  let out = "";
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) {
      out += cur + "\r\n ";
      cur = "";
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  return out + cur;
}

// Diferencia (ms) entre la hora "de pared" de un huso y UTC en un instante dado.
function tzOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Fecha + minutos de pared en `tz` -> instante UTC en formato iCal (YYYYMMDDTHHMMSSZ).
// Date.UTC absorbe solo los minutos >= 1440 (pasan al día siguiente).
function wallToUtc(date: string, min: number, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, min, 0);
  let utc = wall - tzOffsetMs(tz, wall);
  utc = wall - tzOffsetMs(tz, utc); // segunda pasada: cambios de horario de verano
  return new Date(utc).toISOString().replace(/[-:]/g, "").replace(/.d{3}/, "");
}

function validTz(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return new Response("Not found", { status: 404 });

  const { data: feed, error: feedErr } = await supabase.from("calendar_feeds").select("user_id").eq("token", token).maybeSingle();
  if (feedErr) return new Response(`Error al leer el enlace: ${feedErr.message}`, { status: 500 });
  if (!feed) return new Response("Not found", { status: 404 });

  const userId: string = feed.user_id;
  const { data: prof, error: profErr } = await supabase.from("profiles").select("name, calendar_tz").eq("id", userId).maybeSingle();
  if (profErr) return new Response(`Error al leer el perfil: ${profErr.message}`, { status: 500 });
  const { data: settings, error: setErr } = await supabase.from("app_settings").select("company").eq("id", "global").maybeSingle();
  if (setErr) return new Response(`Error al leer la configuración: ${setErr.message}`, { status: 500 });
  const tz = validTz(prof?.calendar_tz) ?? validTz(settings?.company?.timezone) ?? "UTC";

  const since = new Date(Date.now() - DAYS_BACK * 86400000).toISOString().slice(0, 10);
  const entries: any[] = [];
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from("time_entries")
      .select("id, project_id, sub_project_id, description, date, start_min, end_min")
      .eq("user_id", userId)
      .gte("date", since)
      .order("date")
      .order("start_min")
      .range(from, from + PAGE - 1);
    if (error) return new Response(`Error al leer los registros: ${error.message}`, { status: 500 });
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const projectIds = [...new Set(entries.map((e) => e.project_id).filter(Boolean))];
  const subIds = [...new Set(entries.map((e) => e.sub_project_id).filter(Boolean))];
  const projectName = new Map<string, string>();
  const subName = new Map<string, string>();
  if (projectIds.length) {
    const { data, error } = await supabase.from("projects").select("id, name").in("id", projectIds);
    if (error) return new Response(`Error al leer los proyectos: ${error.message}`, { status: 500 });
    for (const p of data ?? []) projectName.set(p.id, p.name);
  }
  if (subIds.length) {
    const { data, error } = await supabase.from("sub_projects").select("id, name").in("id", subIds);
    if (error) return new Response(`Error al leer los subproyectos: ${error.message}`, { status: 500 });
    for (const s of data ?? []) subName.set(s.id, s.name);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TEMPO//Registro de tiempo//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`TEMPO - ${prof?.name ?? "Registro de tiempo"}`)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const e of entries) {
    const project = e.project_id ? projectName.get(e.project_id) : undefined;
    const sub = e.sub_project_id ? subName.get(e.sub_project_id) : undefined;
    const summary = [project, e.description].filter(Boolean).join(" — ") || "Registro de horas";
    const detail = [
      project ? `Proyecto: ${project}` : "",
      sub ? `Subproyecto: ${sub}` : "",
      e.description ? `Descripción: ${e.description}` : "",
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@tempo`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${wallToUtc(e.date, e.start_min, tz)}`,
      `DTEND:${wallToUtc(e.date, e.end_min, tz)}`,
      `SUMMARY:${esc(summary)}`,
      ...(detail ? [`DESCRIPTION:${esc(detail)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache",
      "Content-Disposition": 'inline; filename="tempo.ics"',
    },
  });
});
