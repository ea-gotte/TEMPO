export const uid = () => Math.random().toString(36).slice(2, 10);

export const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD de un Date local */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function today(): string {
  return isoDate(new Date());
}

/** Lunes de la semana que contiene la fecha */
export function weekStart(s: string): string {
  const d = parseISO(s);
  const dow = (d.getDay() + 6) % 7; // 0=lunes
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

export function monthLabel(s: string): string {
  return parseISO(s).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

/** YYYY-MM-DD -> "dd/mm/aaaa" (formato usado en toda la app) */
export function fmtDate(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** ISO datetime -> "dd/mm/aaaa hh:mm" */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Etiqueta de día: por defecto "dd/mm/aaaa"; con weekday antepone el día de semana */
export function dayLabel(s: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!opts) return fmtDate(s);
  if (opts.weekday && !opts.year && !("month" in opts && opts.month === "long")) {
    // "lun 21/07" — día de semana + fecha numérica
    const wd = parseISO(s).toLocaleDateString("es-AR", { weekday: opts.weekday });
    if (opts.day && opts.month) return `${wd} ${fmtDate(s).slice(0, 5)}`;
    return wd;
  }
  return parseISO(s).toLocaleDateString("es-AR", opts);
}

/** minutos -> "8:30" */
export function fmtHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${pad(m)}`;
}

/** minutos -> "8 h 30 m" */
export function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} m`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** "09:30" -> 570 */
export function hmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minToHM(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(Math.round(mins % 60))}`;
}

export function fmtMoney(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function rangeDates(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

export function downloadFile(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(";"),
    )
    .join("\n");
}

/** Parser CSV simple: soporta campos entre comillas y detecta el delimitador (',' o ';') */
export function parseCSV(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const delim = semi > comma ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "dd/mm/aaaa" -> "YYYY-MM-DD"; null si no es una fecha válida */
export function parseDMY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = "20" + y;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00");
  if (isNaN(dt.getTime())) return null;
  return iso;
}

/** Normaliza texto para comparar sin distinguir mayúsculas ni acentos */
export function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Colores de avatar estables por nombre */
export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Hashea una contraseña usando SHA-256 de forma asíncrona */
export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valida los requisitos de seguridad de la contraseña:
 * - Al menos 8 caracteres de longitud.
 * - Al menos una letra mayúscula.
 * - Al menos una letra minúscula.
 * - Al menos un número.
 * - Al menos un carácter especial.
 * Retorna un string con el error o null si es válida.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (!/[A-Z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra mayúscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "La contraseña debe incluir al menos una letra minúscula.";
  }
  if (!/[0-9]/.test(password)) {
    return "La contraseña debe incluir al menos un número.";
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return "La contraseña debe incluir al menos un carácter especial (ej. !, @, #, $, %).";
  }
  return null;
}

