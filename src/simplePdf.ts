/** Generador mínimo de PDF (A4, Helvetica) para el informe de horas extra: solo texto y líneas. */

export type PdfOp =
  | { t: "text"; x: number; y: number; s: string; size?: number; bold?: boolean; gray?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; w?: number };

export const PDF_W = 595;
export const PDF_H = 842;

const SPECIAL: Record<string, string> = { "—": "\x97", "–": "\x96", "“": "\x93", "”": "\x94", "’": "\x92", "‘": "\x91", "…": "\x85" };

/** Texto → bytes WinAnsi (un char por byte) con paréntesis y barras escapados */
function enc(s: string) {
  let out = "";
  for (const ch of s) {
    const c = SPECIAL[ch] ?? (ch.charCodeAt(0) < 256 ? ch : "?");
    out += c === "(" || c === ")" || c === "\\" ? "\\" + c : c;
  }
  return out;
}

function pageStream(ops: PdfOp[]) {
  let s = "";
  for (const o of ops) {
    if (o.t === "line") s += `${o.w ?? 0.6} w ${o.x1} ${o.y1} m ${o.x2} ${o.y2} l S\n`;
    else s += `BT /${o.bold ? "F2" : "F1"} ${o.size ?? 10} Tf ${o.gray ?? 0} g ${o.x} ${o.y} Td (${enc(o.s)}) Tj ET\n`;
  }
  return s;
}

/** PDF como data URL (base64), listo para guardarlo como adjunto */
export function pdfDataUrl(pages: PdfOp[][]): string {
  const objs: string[] = [];
  const pageIds: number[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  let n = 5;
  for (const ops of pages) {
    const page = n++;
    const content = n++;
    const stream = pageStream(ops);
    objs[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`;
    objs[content] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    pageIds.push(page);
  }
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return "data:application/pdf;base64," + btoa(pdf);
}
