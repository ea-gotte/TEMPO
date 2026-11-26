import { fmtDate } from "../utils";
import type { FieldDef, FieldOption, FieldType, FieldValue, Task } from "./types";

export const FIELD_TYPES: { key: FieldType; label: string }[] = [
  { key: "seleccion", label: "Selección única" },
  { key: "multiple", label: "Selección múltiple" },
  { key: "texto", label: "Texto" },
  { key: "numero", label: "Número" },
  { key: "fecha", label: "Fecha" },
  { key: "casilla", label: "Casilla (sí / no)" },
];

export const OPTION_COLORS = ["#5b6cff", "#12b5a5", "#f5a524", "#f0446c", "#8b5cf6", "#0ea5e9", "#84cc16", "#f97316"];

export const hasOptions = (t: FieldType) => t === "seleccion" || t === "multiple";

/** Campos que aplican a un proyecto: los globales más los propios, en orden. */
export function fieldsForProject(fields: FieldDef[], projectId: string): FieldDef[] {
  return fields.filter((f) => f.projectId === null || f.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export const globalFields = (fields: FieldDef[]) => fields.filter((f) => f.projectId === null).sort((a, b) => a.sortOrder - b.sortOrder);

export const optionOf = (def: FieldDef, id: string): FieldOption | undefined => def.options.find((o) => o.id === id);

/** Opciones elegidas de una tarea para un campo de selección (única o múltiple). */
export function selectedOptionIds(t: Task, def: FieldDef): string[] {
  const v = t.custom[def.id];
  if (def.type === "seleccion") return typeof v === "string" && v ? [v] : [];
  if (def.type === "multiple") return Array.isArray(v) ? v : [];
  return [];
}

/** Texto legible del valor de un campo (tablas, exportaciones). */
export function valueText(def: FieldDef, v: FieldValue | undefined): string {
  if (v === undefined || v === null || v === "") return "";
  switch (def.type) {
    case "seleccion": return optionOf(def, String(v))?.label ?? "";
    case "multiple": return Array.isArray(v) ? v.map((id) => optionOf(def, id)?.label).filter(Boolean).join(", ") : "";
    case "fecha": return fmtDate(String(v));
    case "casilla": return v ? "Sí" : "No";
    default: return String(v);
  }
}

/* ---------- Filtros ---------- */

/** Valor especial: tareas sin valor en el campo. */
export const NO_VALUE = "__sin_valor__";

export interface FieldFilter {
  fieldId: string;
  text?: string;
  optionIds?: string[];
  min?: string;
  max?: string;
  from?: string;
  to?: string;
  bool?: "si" | "no" | "";
}

export function newFilter(def: FieldDef): FieldFilter {
  return { fieldId: def.id, optionIds: [], text: "", min: "", max: "", from: "", to: "", bool: "" };
}

export function filterActive(f: FieldFilter, def: FieldDef): boolean {
  switch (def.type) {
    case "seleccion":
    case "multiple": return (f.optionIds?.length ?? 0) > 0;
    case "texto": return !!f.text?.trim();
    case "numero": return f.min !== "" && f.min !== undefined || f.max !== "" && f.max !== undefined;
    case "fecha": return !!f.from || !!f.to;
    case "casilla": return !!f.bool;
  }
}

export function matchesFilter(t: Task, f: FieldFilter, def: FieldDef): boolean {
  if (!filterActive(f, def)) return true;
  const v = t.custom[def.id];
  switch (def.type) {
    case "seleccion":
    case "multiple": {
      const ids = selectedOptionIds(t, def);
      const want = f.optionIds ?? [];
      return want.some((w) => (w === NO_VALUE ? ids.length === 0 : ids.includes(w)));
    }
    case "texto": return typeof v === "string" && v.toLowerCase().includes(f.text!.trim().toLowerCase());
    case "numero": {
      if (typeof v !== "number") return false;
      if (f.min !== "" && f.min !== undefined && v < Number(f.min)) return false;
      if (f.max !== "" && f.max !== undefined && v > Number(f.max)) return false;
      return true;
    }
    case "fecha": {
      if (typeof v !== "string" || !v) return false;
      if (f.from && v < f.from) return false;
      if (f.to && v > f.to) return false;
      return true;
    }
    case "casilla": return f.bool === "si" ? v === true : v !== true;
  }
}
