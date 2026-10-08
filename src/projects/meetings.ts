import type { Project } from "../types";
import { addDays, uid } from "../utils";
import type { Meeting, MeetingImage } from "./types";

/** Una imagen subida se reduce (máx. 1600 px, JPEG) para que entre en el almacenamiento del navegador. */
export async function fileToImage(file: File, name?: string, maxDim = 1600, quality = 0.82): Promise<MeetingImage> {
  const src = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const label = name ?? file.name;
  // Los vectoriales y las animaciones se guardan tal cual
  if (file.type === "image/svg+xml" || file.type === "image/gif") return { id: uid(), name: label, src };
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("No se pudo leer la imagen"));
    i.src = src;
  });
  const k = Math.min(1, maxDim / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext("2d");
  if (!ctx) return { id: uid(), name: label, src };
  ctx.fillStyle = "#fff"; // los PNG con transparencia quedan sobre blanco
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { id: uid(), name: label, src: c.toDataURL("image/jpeg", quality) };
}

/** Croquis de ejemplo (SVG) para que la demo muestre una reunión con imagen. */
function sketch(title: string, lines: string[]): string {
  const rows = lines.map((l, i) => `<text x="36" y="${96 + i * 34}" font-size="20" fill="#334155">${l}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="3"/><text x="36" y="52" font-size="26" font-weight="700" fill="#0f172a">${title}</text><line x1="36" y1="66" x2="604" y2="66" stroke="#94a3b8" stroke-width="2"/>${rows}<circle cx="560" cy="290" r="34" fill="none" stroke="#5b6cff" stroke-width="4"/><path d="M546 290l10 10 18-22" fill="none" stroke="#5b6cff" stroke-width="5"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/** Reuniones de ejemplo de un proyecto (solo la demo). */
export function seedMeetings(project: Project, pick: (i: number) => string | null, now: string, allDone: boolean, startDate: string | null): Meeting[] {
  const team = project.memberIds.slice(0, 4);
  const first = startDate ? addDays(startDate, 2) : addDays(now, -40);
  const mk = (title: string, date: string, guests: string, notes: string, images: MeetingImage[]): Meeting => ({
    id: uid(), projectId: project.id, title, date, attendeeIds: team, guests, notes, images, createdBy: pick(1), createdAt: new Date().toISOString(),
  });
  const list: Meeting[] = [
    mk(
      "Reunión de arranque con el cliente", first, "Cliente: dirección de obra",
      "Objetivo: acordar alcance, contactos y calendario de entregas.\n\nAcuerdos\n- El Project Manager es el único interlocutor del cliente.\n- El cliente envía los planos base antes del viernes.\n- Entregas parciales cada dos semanas.\n\nPendientes\n- Confirmar el nivel de detalle del modelo (LOD 300).\n- Definir el formato de los planos para revisión.",
      [{ id: uid(), name: "Pizarra de la reunión", src: sketch("Arranque: acuerdos", ["1. Interlocutor único: Project Manager", "2. Planos base: viernes", "3. Entregas cada 2 semanas", "4. Nivel de detalle: LOD 300"]) }],
    ),
  ];
  if (!allDone) {
    list.push(mk(
      "Seguimiento semanal del equipo", addDays(now, -3), "",
      "Avance: el modelo estructural va según lo previsto; instalaciones con un par de días de atraso.\n\nBloqueos\n- Falta confirmar la ubicación de los shafts.\n\nPróximos pasos\n- Corrida de detección de interferencias el jueves.\n- Preparar la presentación de avance para el cliente.",
      [],
    ));
  }
  return list;
}
