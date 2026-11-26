import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { SYNC_KEYS, workRemote, type SyncKey, type WorkBackend, type WorkChange } from "./workStore";

/**
 * Datos de la gestión de proyectos en Supabase (fase 39): lectura inicial, guardado de cada
 * cambio y avisos en tiempo real. Una sola conexión compartida entre todos los suscriptores.
 *
 * Cada colección del módulo es una tabla con la misma forma: id, project_id y el elemento
 * completo en `data`. Si las tablas todavía no existen (no se corrió la fase 39), el módulo
 * sigue funcionando como demo local de este navegador.
 */

const TABLE: Record<SyncKey, string> = {
  meta: "project_meta",
  milestones: "project_milestones",
  deliverables: "project_deliverables",
  reviews: "project_reviews",
  tasks: "project_tasks",
  sprints: "project_sprints",
  changes: "project_changes",
  baselines: "project_baselines",
  risks: "project_risks",
  meetings: "project_meetings",
  fields: "project_fields",
};
const KEY_OF = new Map(Object.entries(TABLE).map(([k, t]) => [t, k as SyncKey]));
const PAGE = 1000;

interface Row {
  id: string;
  project_id: string | null;
  data: Record<string, unknown>;
}

/** Fila de la base → elemento del módulo. El id y el proyecto valen los de las columnas. */
function toItem(key: SyncKey, r: Row): unknown {
  return key === "meta" ? { ...r.data, projectId: r.project_id } : { ...r.data, id: r.id, projectId: r.project_id };
}

/** Ids que ya existen en la base, por colección: decide si un cambio es alta o edición. */
const known: Record<string, Set<string>> = {};
for (const k of SYNC_KEYS) known[k] = new Set();
/** Escrituras propias todavía viajando: mientras tanto se ignora el aviso de la base sobre ese elemento. */
const pending = new Map<string, number>();
const bump = (k: string, d: number) => {
  const n = (pending.get(k) ?? 0) + d;
  if (n > 0) pending.set(k, n);
  else pending.delete(k);
};

export interface WorkSyncState {
  /** "cargando" hasta la primera lectura; "compartido" con la base; "local" si faltan las tablas */
  mode: "cargando" | "compartido" | "local";
  /** Último problema al leer o guardar (se muestra una vez) */
  error: string | null;
  errorId: number;
}

let state: WorkSyncState = { mode: "cargando", error: null, errorId: 0 };
const listeners = new Set<(s: WorkSyncState) => void>();
function setState(patch: Partial<WorkSyncState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}
function report(message: string) {
  setState({ error: message, errorId: state.errorId + 1 });
}

/** La tabla no existe todavía (falta correr la fase 39) */
const missingTable = (err: { code?: string; message?: string } | null) =>
  !!err && (err.code === "PGRST205" || err.code === "42P01" || /could not find the table|does not exist/i.test(err.message ?? ""));

const friendly = (message: string) =>
  /row-level security|42501|permission denied/i.test(message) ? "No tenés permiso para ese cambio en este proyecto." : message;

async function fetchTable(key: SyncKey): Promise<{ rows: Row[]; error: { code?: string; message?: string } | null }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(TABLE[key]).select("id, project_id, data").order("id").range(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

let loadId = 0;

/** Lee todo (o solo algunas colecciones) y reemplaza lo que hay en memoria. */
async function load(keys: readonly SyncKey[] = SYNC_KEYS) {
  const mine = ++loadId;
  const results = await Promise.all(keys.map((k) => fetchTable(k)));
  if (mine !== loadId) return;
  if (results.some((r) => missingTable(r.error))) {
    workRemote.setLocal();
    setState({ mode: "local" });
    return;
  }
  const failed = results.find((r) => r.error);
  if (failed) {
    report("No se pudieron leer los datos de Proyectos: " + (failed.error?.message ?? "error desconocido"));
    // Sin la primera lectura no se sabe qué hay en la base: no se muestra como compartido
    if (state.mode === "cargando") setState({ mode: "local" });
    return;
  }
  const rows: Partial<Record<SyncKey, unknown[]>> = {};
  keys.forEach((k, i) => {
    known[k] = new Set(results[i].rows.map((r) => r.id));
    rows[k] = results[i].rows.map((r) => toItem(k, r));
  });
  workRemote.replaceAll(rows);
  setState({ mode: "compartido" });
}

/* ---------- Guardado ---------- */

// Los cambios se suben en orden, uno detrás de otro
let queue: Promise<void> = Promise.resolve();

async function pushNow(changes: WorkChange[]) {
  const errors: string[] = [];
  const touched = new Set<SyncKey>();
  const fail = (key: SyncKey, message: string) => {
    errors.push(message);
    touched.add(key);
  };
  await Promise.all(
    SYNC_KEYS.map(async (key) => {
      const mine = changes.filter((c) => c.key === key);
      if (mine.length === 0) return;
      const table = TABLE[key];
      const row = (c: WorkChange) => ({ id: c.id, project_id: c.projectId, data: c.item });
      const inserts = mine.filter((c) => c.op === "upsert" && !known[key].has(c.id));
      const updates = mine.filter((c) => c.op === "upsert" && known[key].has(c.id));
      const deletes = mine.filter((c) => c.op === "delete" && known[key].has(c.id));

      if (inserts.length) {
        const { error } = await supabase.from(table).insert(inserts.map(row));
        if (error) fail(key, error.message);
        else for (const c of inserts) known[key].add(c.id);
      }
      // De a una fila: quien solo puede cambiar el estado de SU tarea no tiene que fallar por las demás.
      // Una edición que la base no deja hacer no da error, devuelve cero filas.
      for (let i = 0; i < updates.length; i += 8) {
        await Promise.all(
          updates.slice(i, i + 8).map(async (c) => {
            const { data, error } = await supabase.from(table).update({ project_id: c.projectId, data: c.item }).eq("id", c.id).select("id");
            if (error) fail(key, error.message);
            else if (!data || data.length === 0) fail(key, "permission denied");
          }),
        );
      }
      if (deletes.length) {
        const ids = deletes.map((c) => c.id);
        const { data, error } = await supabase.from(table).delete().in("id", ids).select("id");
        if (error) fail(key, error.message);
        else {
          for (const r of data ?? []) known[key].delete((r as { id: string }).id);
          if ((data ?? []).length < ids.length) fail(key, "permission denied");
        }
      }
    }),
  );
  if (errors.length) {
    report("No se pudo guardar un cambio en Proyectos. " + friendly(errors[0]));
    // Lo que no se guardó vuelve a como está en la base
    await load([...touched]);
  }
}

const backend: WorkBackend = {
  push(changes) {
    for (const c of changes) bump(c.key + ":" + c.id, 1);
    queue = queue
      .then(() => pushNow(changes))
      .catch((err) => report("No se pudo guardar un cambio en Proyectos. " + String(err?.message ?? err)))
      .finally(() => {
        for (const c of changes) bump(c.key + ":" + c.id, -1);
      });
  },
};

/* ---------- Tiempo real ---------- */

let channel: ReturnType<typeof supabase.channel> | null = null;
let buffer: WorkChange[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const changes = buffer;
  buffer = [];
  workRemote.apply(changes);
}

function onChange(payload: { table: string; eventType: string; new: unknown; old: unknown }) {
  const key = KEY_OF.get(payload.table);
  if (!key) return;
  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: string } | null)?.id;
    if (!id) return;
    known[key].delete(id);
    buffer.push({ key, op: "delete", id, projectId: null });
  } else {
    const r = payload.new as Row | null;
    if (!r?.id || !r.data) return;
    known[key].add(r.id);
    // Lo local es igual o más nuevo que este aviso
    if (pending.has(key + ":" + r.id)) return;
    buffer.push({ key, op: "upsert", id: r.id, projectId: r.project_id, item: toItem(key, r) });
  }
  // Se juntan 200 ms: cargar una plantilla son decenas de avisos
  if (!timer) timer = setTimeout(flush, 200);
}

function start() {
  workRemote.setBackend(backend);
  setState({ mode: "cargando", error: null });
  void load();
  if (channel) return;
  let subscribedOnce = false;
  let ch = supabase.channel("project_work_sync");
  for (const table of Object.values(TABLE)) {
    ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel = ch.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    // Al reconectar pudieron perderse avisos: se lee todo de nuevo
    if (subscribedOnce && state.mode === "compartido") void load();
    subscribedOnce = true;
  });
}

function stop() {
  loadId++;
  if (timer) clearTimeout(timer);
  timer = undefined;
  buffer = [];
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  workRemote.setBackend(null);
  // Sin nadie conectado (cerró sesión): que el próximo no vea los datos de este
  workRemote.reset();
  for (const k of SYNC_KEYS) known[k] = new Set();
  state = { mode: "cargando", error: null, errorId: state.errorId };
}

let subscribers = 0;

/** Mantiene Proyectos sincronizado con la base mientras haya una sesión abierta. */
export function useWorkSync(): WorkSyncState {
  const [s, setS] = useState<WorkSyncState>(state);
  useEffect(() => {
    listeners.add(setS);
    subscribers++;
    if (subscribers === 1) start();
    else setS(state);
    return () => {
      listeners.delete(setS);
      subscribers--;
      if (subscribers === 0) stop();
    };
  }, []);
  return s;
}
