import React, { useRef, useState } from "react";
import { Modal, useToast } from "../components/ui";
import { Icon } from "../components/Icon";
import { fmtDate } from "../utils";
import { PLAN_STATUS, TASK_STATUS } from "./constants";
import { useEnv } from "./env";
import { assignableUsers } from "./logic";
import { downloadPlanWorkbook, parsePlan, planFileName, readPlanFile, summarizePlanImport, type PlanImport, type PlanRowType, type PlanSource } from "./planExcel";
import { projectCode } from "./templates";
import { useWork, workActions } from "./workStore";

const ONE: Record<PlanRowType, string> = { hito: "hito", entregable: "entregable", tarea: "tarea" };
const count = (n: Record<PlanRowType, number>) =>
  (Object.keys(ONE) as PlanRowType[]).filter((k) => n[k] > 0).map((k) => `${n[k]} ${ONE[k]}${n[k] !== 1 ? "s" : ""}`).join(", ");
const total = (n: Record<PlanRowType, number>) => n.hito + n.entregable + n.tarea;
const MAX_ROWS = 80;
const MAX_ISSUES = 25;

/**
 * Plan del proyecto en Excel: cualquiera que vea el proyecto lo descarga; quien lo
 * gestiona puede completarlo y volver a subirlo. Antes de guardar se muestra qué cambia.
 */
export function PlanExcelButtons({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const env = useEnv();
  const work = useWork();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ file: string; result: PlanImport } | null>(null);
  const project = env.projects.find((p) => p.id === projectId);
  if (!project) return null;

  const source = (onlyActive: boolean): PlanSource => ({
    projectId,
    milestones: work.milestones,
    deliverables: work.deliverables,
    tasks: work.tasks,
    users: env.users.filter((u) => !onlyActive || u.active).map((u) => ({ id: u.id, name: u.name, email: u.email })),
  });

  async function exportPlan() {
    if (busy || !project) return;
    setBusy(true);
    try {
      const team = assignableUsers(env, project, work.assignments).team.map((u) => ({ id: u.id, name: u.name, email: u.email }));
      await downloadPlanWorkbook({ ...source(false), projectName: project.name, team }, planFileName(projectCode(project, work.meta[projectId]) || project.name));
    } catch {
      toast("No se pudo generar el Excel.");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("El archivo es demasiado grande para ser un plan de proyecto.");
      return;
    }
    try {
      setPreview({ file: file.name, result: parsePlan(await readPlanFile(file), source(true)) });
    } catch {
      toast("No se pudo leer el archivo. Tiene que ser el Excel (.xlsx) del plan.");
    }
  }

  return (
    <>
      <button className="btn btn-secondary" onClick={exportPlan} title="Descarga el plan en Excel: sirve como planilla para completar y volver a importar">
        <Icon name="download" size={14} /> Planilla Excel
      </button>
      {canManage && (
        <>
          <button className="btn btn-secondary" onClick={() => inputRef.current?.click()} title="Sube la planilla completada: antes de guardar se muestra qué cambia">
            <Icon name="upload" size={14} /> Importar Excel
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => onPick(e.target.files?.[0])} />
        </>
      )}
      {preview && (
        <ImportPreview
          file={preview.file}
          result={preview.result}
          userName={(id) => env.users.find((u) => u.id === id)?.name ?? ""}
          onClose={() => setPreview(null)}
          onApply={() => {
            const s = summarizePlanImport(preview.result.items);
            workActions.importPlan(projectId, preview.result.items, env.me.id);
            toast(`Plan importado: ${total(s.nuevos)} nuevo${total(s.nuevos) !== 1 ? "s" : ""}, ${total(s.cambios)} actualizado${total(s.cambios) !== 1 ? "s" : ""}.`);
            setPreview(null);
          }}
        />
      )}
    </>
  );
}

function ImportPreview({ file, result, userName, onClose, onApply }: {
  file: string;
  result: PlanImport;
  userName: (id: string | null) => string;
  onClose: () => void;
  onApply: () => void;
}) {
  const s = summarizePlanImport(result.items);
  const errors = result.issues.filter((i) => i.level === "error");
  const warnings = result.issues.filter((i) => i.level === "aviso");
  const pending = total(s.nuevos) + total(s.cambios);
  const blocked = errors.length > 0;
  const issues = [...errors, ...warnings];
  const statusLabel = (type: PlanRowType, key: string) => (type === "tarea" ? TASK_STATUS : PLAN_STATUS).find((x) => x.key === key)?.label ?? key;

  return (
    <Modal
      title="Importar plan desde Excel"
      onClose={onClose}
      width={860}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{blocked || pending === 0 ? "Cerrar" : "Cancelar"}</button>
          {!blocked && pending > 0 && (
            <button className="btn btn-primary" onClick={onApply}>
              <Icon name="upload" size={14} /> Importar {pending} cambio{pending !== 1 ? "s" : ""}
            </button>
          )}
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 10 }}>{file}</p>

      {blocked ? (
        <div className="badge bad" style={{ display: "block", padding: "8px 12px", marginBottom: 12, whiteSpace: "normal" }}>
          El archivo tiene {errors.length} error{errors.length !== 1 ? "es" : ""}: no se importa nada. Corregilo en Excel y volvé a subirlo.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span className="badge ok">Nuevos: {total(s.nuevos) ? count(s.nuevos) : "ninguno"}</span>
          <span className="badge acc">Con cambios: {total(s.cambios) ? count(s.cambios) : "ninguno"}</span>
          <span className="badge">Sin cambios: {s.iguales}</span>
          {pending === 0 && <span style={{ fontSize: 12.5, color: "var(--text-2)", alignSelf: "center" }}>El archivo es igual a lo que ya tiene el proyecto.</span>}
        </div>
      )}

      {issues.length > 0 && (
        <div style={{ marginBottom: 12, fontSize: 12.5 }}>
          {issues.slice(0, MAX_ISSUES).map((i, n) => (
            <div key={n} style={{ display: "flex", gap: 8, padding: "3px 0", color: i.level === "error" ? "var(--danger)" : "var(--text-2)" }}>
              <span style={{ flex: "none", width: 64, fontVariantNumeric: "tabular-nums" }}>Fila {i.line}</span>
              <span>{i.level === "aviso" ? "Aviso: " : ""}{i.message}</span>
            </div>
          ))}
          {issues.length > MAX_ISSUES && <div style={{ color: "var(--text-3)", paddingTop: 3 }}>… y {issues.length - MAX_ISSUES} más.</div>}
        </div>
      )}

      {result.items.length > 0 && (
        <div style={{ maxHeight: "44vh", overflow: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
          <table className="table table-compact" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Fila</th>
                <th>Elemento</th>
                <th>Responsable</th>
                <th>Fin</th>
                <th>Estado</th>
                <th>Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {result.items.slice(0, MAX_ROWS).map((it) => (
                <tr key={it.line}>
                  <td style={{ color: "var(--text-3)" }}>{it.line}</td>
                  <td style={{ paddingLeft: it.type === "hito" ? 12 : it.type === "entregable" ? 28 : 44, fontWeight: it.type === "hito" ? 650 : 400 }}>
                    <span style={{ color: "var(--text-3)", marginRight: 6 }}>{it.type === "hito" ? "◆" : it.type === "entregable" ? "▣" : "·"}</span>
                    {it.name}
                  </td>
                  <td>{userName(it.ownerId) || <span style={{ color: "var(--text-3)" }}>Sin asignar</span>}</td>
                  <td>{it.type !== "tarea" && it.dueDate ? fmtDate(it.dueDate) : ""}</td>
                  <td>{statusLabel(it.type, it.status)}</td>
                  <td>
                    {it.isNew ? <span className="badge ok">Nuevo</span> : it.changed ? <span className="badge acc">Cambia</span> : <span style={{ color: "var(--text-3)" }}>Igual</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.items.length > MAX_ROWS && <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--text-3)" }}>… y {result.items.length - MAX_ROWS} filas más.</div>}
        </div>
      )}
      {!blocked && pending > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10 }}>Importar no borra nada: lo que no esté en el archivo queda como está.</p>
      )}
    </Modal>
  );
}
