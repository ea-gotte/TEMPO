import React from "react";
import { DateField } from "../components/ui";
import { MODE_LABEL } from "./constants";
import { TEMPLATES, copyStructure, hasStructure, structureFromTemplate, type Structure, type StructureSource } from "./templates";
import type { ProjectMode } from "./types";

/** De dónde sale la estructura inicial de un proyecto */
export interface StructureChoice {
  source: "plantilla" | "copia" | "vacio";
  mode: ProjectMode;
  fromProjectId: string;
  includeTasks: boolean;
  startDate: string;
}

/** Arma lo que hay que agregar al proyecto según lo elegido; null si se eligió empezar vacío. */
export function buildStructure(c: StructureChoice, work: StructureSource, targetProjectId: string, ownerId: string | null): Structure | null {
  if (c.source === "plantilla") return structureFromTemplate(targetProjectId, c.mode, c.startDate, ownerId);
  if (c.source === "copia" && c.fromProjectId) return copyStructure(work, c.fromProjectId, targetProjectId, c.startDate, { includeTasks: c.includeTasks, ownerId });
  return null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Elegir la estructura inicial: la plantilla de una metodología, la copia de otro proyecto o
 * nada. Muestra qué se va a crear antes de confirmarlo.
 */
export function StructurePicker({
  value, onChange, work, projects, allowEmpty, modeLocked,
}: {
  value: StructureChoice;
  onChange: (c: StructureChoice) => void;
  work: StructureSource;
  /** Proyectos de los que se puede copiar */
  projects: { id: string; name: string }[];
  allowEmpty: boolean;
  /** La metodología ya está decidida en otro lado: la plantilla usa esa */
  modeLocked?: boolean;
}) {
  const set = (patch: Partial<StructureChoice>) => onChange({ ...value, ...patch });
  const sources = projects.filter((p) => hasStructure(work, p.id)).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const tpl = TEMPLATES[value.mode];
  const preview = (() => {
    if (value.source === "plantilla") {
      return `${plural(tpl.milestones.length, "hito", "hitos")}, ${plural(tpl.milestones.reduce((a, m) => a + m.deliverables.length, 0), "entregable", "entregables")} y ${plural(tpl.risks.length, "riesgo", "riesgos")}, con fechas a partir del inicio.`;
    }
    if (value.source === "copia") {
      if (!value.fromProjectId) return "Elegí el proyecto de origen.";
      const id = value.fromProjectId;
      const nT = work.tasks.filter((t) => t.projectId === id && !t.archived).length;
      return `${plural(work.milestones.filter((m) => m.projectId === id).length, "hito", "hitos")}, ${plural(work.deliverables.filter((d) => d.projectId === id).length, "entregable", "entregables")} y ${plural(work.risks.filter((r) => r.projectId === id).length, "riesgo", "riesgos")}${value.includeTasks ? `, más ${plural(nT, "tarea", "tareas")} como pendientes y sin responsable` : ""}. Todo queda pendiente, sin fechas reales, con el plan corrido al inicio elegido.`;
    }
    return "El proyecto arranca sin hitos, entregables ni riesgos.";
  })();

  const option = (key: StructureChoice["source"], label: string, disabled = false) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <input type="radio" name="estructura-inicial" checked={value.source === key} disabled={disabled} onChange={() => set({ source: key })} /> {label}
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {option("plantilla", "Plantilla de la metodología")}
        {option("copia", sources.length ? "Copiar la estructura de otro proyecto" : "Copiar la estructura de otro proyecto (ninguno tiene hitos todavía)", sources.length === 0)}
        {allowEmpty && option("vacio", "Empezar vacío")}
      </div>

      <div className="form-grid">
        {value.source === "plantilla" && !modeLocked && (
          <div className="field">
            <label>Metodología de la plantilla</label>
            <select className="select" value={value.mode} onChange={(e) => set({ mode: e.target.value as ProjectMode })}>
              {(Object.keys(MODE_LABEL) as ProjectMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </div>
        )}
        {value.source === "copia" && (
          <div className="field">
            <label>Proyecto de origen</label>
            <select className="select" value={value.fromProjectId} onChange={(e) => set({ fromProjectId: e.target.value })}>
              <option value="">Elegir proyecto…</option>
              {sources.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {value.source !== "vacio" && (
          <div className="field">
            <label>Inicio del plan</label>
            <DateField value={value.startDate} onChange={(d) => set({ startDate: d })} />
          </div>
        )}
      </div>

      {value.source === "copia" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={value.includeTasks} onChange={(e) => set({ includeTasks: e.target.checked })} /> Copiar también las tareas
        </label>
      )}

      <div style={{ fontSize: 12.5, color: "var(--text-2)", background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px" }}>
        {preview}
        {value.source === "plantilla" && (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {tpl.milestones.map((m) => (
              <li key={m.name}><strong>{m.name}</strong>{m.deliverables.length > 0 && <>: {m.deliverables.map((d) => d.name).join(", ")}</>}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** ¿Lo elegido alcanza para crear la estructura? */
export const structureChoiceValid = (c: StructureChoice) => c.source === "vacio" || (!!c.startDate && (c.source === "plantilla" || !!c.fromProjectId));
