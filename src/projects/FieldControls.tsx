import React, { useState } from "react";
import { Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { FIELD_TYPES, NO_VALUE, OPTION_COLORS, filterActive, hasOptions, newFilter, optionOf, selectedOptionIds, type FieldFilter } from "./fields";
import { OptDate } from "./parts";
import type { FieldDef, FieldType, FieldValue, Task } from "./types";
import { workActions } from "./workStore";

/* ====================================================================
 * Entrada de un campo (formulario de la tarea)
 * ==================================================================== */
export function FieldInput({ def, value, onChange, disabled }: { def: FieldDef; value: FieldValue | undefined; onChange: (v: FieldValue) => void; disabled?: boolean }) {
  switch (def.type) {
    case "texto":
      return <input className="input" disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
    case "numero":
      return (
        <input
          className="input" type="number" disabled={disabled} value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "fecha":
      return disabled ? <div className="input" style={{ opacity: 0.6 }}>{typeof value === "string" && value ? value.split("-").reverse().join("/") : "—"}</div> : <OptDate value={typeof value === "string" && value ? value : null} onChange={(v) => onChange(v)} />;
    case "casilla":
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13.5 }}>
          <input type="checkbox" disabled={disabled} checked={value === true} onChange={(e) => onChange(e.target.checked)} /> Sí
        </label>
      );
    case "seleccion":
      return (
        <select className="select" disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {def.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    case "multiple": {
      const cur = Array.isArray(value) ? value : [];
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {def.options.length === 0 && <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>Sin opciones definidas.</span>}
          {def.options.map((o) => (
            <button
              type="button" key={o.id} disabled={disabled} className={`chip ${cur.includes(o.id) ? "on" : ""}`}
              onClick={() => onChange(cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id])}
            >
              <span className="pw-dotc" style={{ background: o.color }} /> {o.label}
            </button>
          ))}
        </div>
      );
    }
  }
}

/** Valor de un campo como etiquetas de color (tarjetas, tablas). */
export function FieldValueView({ def, task, compact }: { def: FieldDef; task: Task; compact?: boolean }) {
  const v = task.custom[def.id];
  if (hasOptions(def.type)) {
    const ids = selectedOptionIds(task, def);
    if (ids.length === 0) return <span style={{ color: "var(--text-3)" }}>—</span>;
    return (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
        {ids.map((id) => {
          const o = optionOf(def, id);
          return o ? <span key={id} className="pw-opt" style={{ background: o.color + "22", color: o.color }}>{o.label}</span> : null;
        })}
      </span>
    );
  }
  if (def.type === "casilla") return v === true ? <span className="pw-opt" style={{ background: "var(--success-soft)", color: "var(--success)" }}>{compact ? def.name : "Sí"}</span> : <span style={{ color: "var(--text-3)" }}>{compact ? "" : "—"}</span>;
  if (v === undefined || v === null || v === "") return <span style={{ color: "var(--text-3)" }}>—</span>;
  const text = def.type === "fecha" ? String(v).split("-").reverse().join("/") : String(v);
  return <span>{compact ? `${def.name}: ${text}` : text}</span>;
}

/* ====================================================================
 * Barra de filtros por campo personalizado
 * ==================================================================== */
export function FieldFilterBar({ defs, filters, onChange }: { defs: FieldDef[]; filters: FieldFilter[]; onChange: (f: FieldFilter[]) => void }) {
  if (defs.length === 0) return null;
  const used = new Set(filters.map((f) => f.fieldId));
  const free = defs.filter((d) => !used.has(d.id));
  const set = (i: number, patch: Partial<FieldFilter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="pw-toolbar" style={{ alignItems: "flex-start" }}>
      {filters.map((f, i) => {
        const def = defs.find((d) => d.id === f.fieldId);
        if (!def) return null;
        return (
          <div key={f.fieldId} className={`pw-fbox ${filterActive(f, def) ? "on" : ""}`}>
            <span className="pw-fbox-name">{def.name}</span>
            <FilterEditor def={def} f={f} onChange={(p) => set(i, p)} />
            <button className="pw-fbox-x" title="Quitar filtro" onClick={() => onChange(filters.filter((_, j) => j !== i))}><Icon name="x" size={11} /></button>
          </div>
        );
      })}
      {free.length > 0 && (
        <select
          className="select" style={{ width: "auto", minWidth: 150 }} value=""
          onChange={(e) => { const d = defs.find((x) => x.id === e.target.value); if (d) onChange([...filters, newFilter(d)]); }}
        >
          <option value="">＋ Filtrar por campo…</option>
          {free.map((d) => <option key={d.id} value={d.id}>{d.name}{d.projectId === null ? "" : " (este proyecto)"}</option>)}
        </select>
      )}
    </div>
  );
}

function FilterEditor({ def, f, onChange }: { def: FieldDef; f: FieldFilter; onChange: (p: Partial<FieldFilter>) => void }) {
  switch (def.type) {
    case "seleccion":
    case "multiple": {
      const sel = f.optionIds ?? [];
      const toggle = (id: string) => onChange({ optionIds: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });
      return (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          {[...def.options, { id: NO_VALUE, label: "Sin valor", color: "var(--text-3)" }].map((o) => (
            <button key={o.id} type="button" className={`chip ${sel.includes(o.id) ? "on" : ""}`} style={{ padding: "1px 8px", fontSize: 11.5 }} onClick={() => toggle(o.id)}>
              <span className="pw-dotc" style={{ background: o.color, width: 7, height: 7 }} /> {o.label}
            </button>
          ))}
        </span>
      );
    }
    case "texto":
      return <input className="input" style={{ width: 150, padding: "3px 8px" }} placeholder="contiene…" value={f.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />;
    case "numero":
      return (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input className="input" type="number" style={{ width: 80, padding: "3px 8px" }} placeholder="mín" value={f.min ?? ""} onChange={(e) => onChange({ min: e.target.value })} />
          –
          <input className="input" type="number" style={{ width: 80, padding: "3px 8px" }} placeholder="máx" value={f.max ?? ""} onChange={(e) => onChange({ max: e.target.value })} />
        </span>
      );
    case "fecha":
      return (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input className="input" type="date" style={{ width: 138, padding: "3px 6px" }} value={f.from ?? ""} onChange={(e) => onChange({ from: e.target.value })} />
          –
          <input className="input" type="date" style={{ width: 138, padding: "3px 6px" }} value={f.to ?? ""} onChange={(e) => onChange({ to: e.target.value })} />
        </span>
      );
    case "casilla":
      return (
        <select className="select" style={{ width: "auto", padding: "3px 8px" }} value={f.bool ?? ""} onChange={(e) => onChange({ bool: e.target.value as FieldFilter["bool"] })}>
          <option value="">Todos</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      );
  }
}

/* ====================================================================
 * Gestión de campos (crear, editar opciones, eliminar)
 * ==================================================================== */
export function FieldsModal({ projectId, defs, isStaff, onClose }: { projectId: string; defs: FieldDef[]; isStaff: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("seleccion");
  const [scope, setScope] = useState<"project" | "global">("project");
  const [optText, setOptText] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  function create() {
    if (!name.trim()) return;
    const options = hasOptions(type) ? optText.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((label) => ({ label })) : [];
    workActions.addField({ projectId: scope === "global" && isStaff ? null : projectId, name, type, options });
    toast(`Campo “${name.trim()}” creado.`);
    setName(""); setOptText("");
  }

  return (
    <Modal title="Campos personalizados" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
        Definí tus propios campos para las tareas (Fase, Disciplina, Ubicación…) y después filtrá, agrupá y mostralos como columnas.
        Los <b>globales</b> valen para todos los proyectos y se pueden usar en el panel general.
      </div>

      {defs.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>Todavía no hay campos.</div>}
      {defs.map((d) => {
        const editable = d.projectId !== null || isStaff;
        return (
          <div key={d.id} className="pw-field-card">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input className="input" style={{ fontWeight: 600 }} disabled={!editable} value={d.name} onChange={(e) => workActions.updateField(d.id, { name: e.target.value })} />
              <span className="pw-pill">{FIELD_TYPES.find((t) => t.key === d.type)?.label}</span>
              <span className={`pw-pill ${d.projectId === null ? "ok" : ""}`}>{d.projectId === null ? "Global" : "Este proyecto"}</span>
              {editable && (
                confirmDel === d.id ? (
                  <button className="btn btn-danger btn-sm" onClick={() => { workActions.deleteField(d.id); setConfirmDel(null); toast("Campo eliminado."); }}>Confirmar</button>
                ) : (
                  <button className="btn btn-ghost btn-sm" title="Eliminar campo" onClick={() => setConfirmDel(d.id)}><Icon name="trash" size={13} /></button>
                )
              )}
            </div>
            {confirmDel === d.id && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>Se borra el campo y los valores cargados en todas las tareas.</div>}
            {hasOptions(d.type) && <OptionsEditor def={d} editable={editable} />}
          </div>
        );
      })}

      <div className="pw-field-card" style={{ borderStyle: "dashed" }}>
        <div className="card-title">Nuevo campo</div>
        <div className="form-grid">
          <div className="field"><label>Nombre</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Fase, Ubicación, Nº de plano" /></div>
          <div className="field">
            <label>Tipo</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {FIELD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {hasOptions(type) && (
            <div className="field full">
              <label>Opciones (separadas por coma)</label>
              <input className="input" value={optText} onChange={(e) => setOptText(e.target.value)} placeholder="Diseño, Modelado, Documentación" />
            </div>
          )}
          <div className="field full">
            <label>Alcance</label>
            <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={scope === "project"} onChange={() => setScope("project")} /> Solo este proyecto</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", opacity: isStaff ? 1 : 0.5 }} title={isStaff ? "" : "Solo admin y gerente crean campos globales"}>
                <input type="radio" disabled={!isStaff} checked={scope === "global"} onChange={() => setScope("global")} /> Todos los proyectos
              </label>
            </div>
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={!name.trim()} onClick={create}><Icon name="plus" size={14} /> Crear campo</button>
      </div>
    </Modal>
  );
}

function OptionsEditor({ def, editable }: { def: FieldDef; editable: boolean }) {
  const [text, setText] = useState("");
  const set = (options: FieldDef["options"]) => workActions.updateField(def.id, { options });
  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {def.options.map((o, i) => (
        <span key={o.id} className="pw-chip-user" style={{ padding: "2px 4px 2px 8px", gap: 5 }}>
          <button
            type="button" disabled={!editable} title="Cambiar color" style={{ width: 12, height: 12, borderRadius: "50%", background: o.color, cursor: "pointer" }}
            onClick={() => set(def.options.map((x, j) => (j === i ? { ...x, color: OPTION_COLORS[(OPTION_COLORS.indexOf(x.color) + 1) % OPTION_COLORS.length] } : x)))}
          />
          {o.label}
          {editable && <button title="Quitar opción" onClick={() => set(def.options.filter((x) => x.id !== o.id))}><Icon name="x" size={11} /></button>}
        </span>
      ))}
      {editable && (
        <span style={{ display: "inline-flex", gap: 4 }}>
          <input
            className="input" style={{ width: 130, padding: "3px 8px" }} placeholder="Nueva opción" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { set([...def.options, { id: Math.random().toString(36).slice(2, 10), label: text.trim(), color: OPTION_COLORS[def.options.length % OPTION_COLORS.length] }]); setText(""); } }}
          />
          <button
            className="btn btn-secondary btn-sm" disabled={!text.trim()}
            onClick={() => { set([...def.options, { id: Math.random().toString(36).slice(2, 10), label: text.trim(), color: OPTION_COLORS[def.options.length % OPTION_COLORS.length] }]); setText(""); }}
          >
            <Icon name="plus" size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
