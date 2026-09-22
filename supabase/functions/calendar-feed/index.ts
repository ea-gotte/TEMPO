// Función de borde `calendar-feed`: sirve los registros de horas de UNA persona
// como calendario iCal (.ics) para suscribirlo desde Google Calendar, Outlook, etc.
//
// Se identifica solo por el `token` privado de la tabla calendar_feeds (Fase 25);
// por eso debe desplegarse SIN verificación de JWT (Google no envía cabeceras).
//
//   GET https://<proyecto>.supabase.co/functions/v1/calendar-feed?token=<token>
//
// Los horarios salen como hora "flotante" (sin huso): TEMPO guarda cada registro
// con la hora tal como se cargó, y cada calendario la muestra igual en su propio huso.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

function dt(date: string, min: number): string {
  let d = date;
  let m = min;
  if (m >= 1440) {
    const t = new Date(`${date}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    d = t.toISOString().slice(0, 10);
    m -= 1440;
  }
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${d.replaceAll("-", "")}T${hh}${mm}00`;
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return new Response("Not found", { status: 404 });

  const { data: feed } = await supabase.from("calendar_feeds").select("user_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Not found", { status: 404 });

  const userId: string = feed.user_id;
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();

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
    if (error) return new Response("Error", { status: 500 });
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const projectIds = [...new Set(entries.map((e) => e.project_id).filter(Boolean))];
  const subIds = [...new Set(entries.map((e) => e.sub_project_id).filter(Boolean))];
  const projectName = new Map<string, string>();
  const subName = new Map<string, string>();
  if (projectIds.length) {
    const { data } = await supabase.from("projects").select("id, name").in("id", projectIds);
    for (const p of data ?? []) projectName.set(p.id, p.name);
  }
  if (subIds.length) {
    const { data } = await supabase.from("sub_projects").select("id, name").in("id", subIds);
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
      `DTSTART:${dt(e.date, e.start_min)}`,
      `DTEND:${dt(e.date, e.end_min)}`,
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
