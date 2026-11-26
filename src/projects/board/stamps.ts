import { fmtDate } from "../../utils";

/** Sellos de revisión de planos (puro, sin Fabric): un rectángulo con borde de color, el estado y la fecha. */

export interface Stamp {
  key: string;
  label: string;
  color: string;
}

export const STAMPS: Stamp[] = [
  { key: "approved", label: "Aprobado", color: "#16a34a" },
  { key: "approved-notes", label: "Aprobado con observaciones", color: "#d97706" },
  { key: "revise", label: "Revisar y reenviar", color: "#ea580c" },
  { key: "rejected", label: "Rechazado", color: "#dc2626" },
  { key: "info", label: "Para información", color: "#2563eb" },
];

/** Texto del sello: el estado en mayúsculas y, abajo, la fecha (dd/mm/aaaa). */
export const stampText = (s: Stamp, isoDate: string) => `${s.label.toUpperCase()}\n${fmtDate(isoDate)}`;
