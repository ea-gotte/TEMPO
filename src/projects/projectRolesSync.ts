import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { RoleAssignment } from "./types";
import { setModeBackend, setRoleBackend, workActions, type RoleBackend } from "./workStore";

/**
 * Backend de roles en Supabase y sincronización en tiempo real.
 * Una sola carga y un canal compartido entre todos los componentes suscriptores.
 */

const roleBackend: RoleBackend = {
  async insert(a: RoleAssignment): Promise<string | null> {
    const { error } = await supabase.from("project_role_assignments").insert({
      id: a.id,
      project_id: a.projectId,
      user_id: a.userId,
      role_key: a.roleKey,
      role_label: a.roleLabel ?? null,
    });
    return error ? error.message : null;
  },
  async remove(id: string): Promise<string | null> {
    const { error } = await supabase.from("project_role_assignments").delete().eq("id", id);
    return error ? error.message : null;
  },
};

setRoleBackend(roleBackend);

setModeBackend(async (projectId, mode) => {
  const { error } = await supabase.rpc("set_project_mode", { p_project: projectId, p_mode: mode });
  if (!error) return null;
  return error.code === "PGRST202" || error.code === "42883" ? "Falta correr la fase 37 en Supabase." : error.message;
});

interface SyncState {
  ready: boolean;
  error: string | null;
}

let syncState: SyncState = { ready: false, error: null };
const listeners = new Set<(s: SyncState) => void>();

function notify() {
  for (const listener of listeners) {
    listener(syncState);
  }
}

let subscriberCount = 0;
let channel: ReturnType<typeof supabase.channel> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let activeFetchId = 0;
const PAGE_SIZE = 1000;

async function fetchRoles() {
  const fetchId = ++activeFetchId;
  const rows: RoleAssignment[] = [];
  let from = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from("project_role_assignments")
        .select("id, project_id, user_id, role_key, role_label")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);

      if (fetchId !== activeFetchId) return;

      if (error) {
        throw error;
      }

      if (data) {
        for (const r of data) {
          rows.push({
            id: r.id,
            projectId: r.project_id,
            userId: r.user_id,
            roleKey: r.role_key,
            roleLabel: r.role_label ?? undefined,
          });
        }
        if (data.length < PAGE_SIZE) {
          break;
        }
        from += PAGE_SIZE;
      } else {
        break;
      }
    }

    if (fetchId !== activeFetchId) return;

    workActions.hydrateAssignments(rows);
    syncState = { ready: true, error: null };
    notify();
  } catch (err: unknown) {
    if (fetchId !== activeFetchId) return;
    const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
    workActions.hydrateAssignments([]);
    syncState = { ready: true, error: msg };
    notify();
  }
}

function debouncedRefetch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void fetchRoles();
  }, 300);
}

function startSync() {
  void fetchRoles();
  if (!channel) {
    channel = supabase
      .channel("project_role_assignments_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_role_assignments" }, debouncedRefetch)
      .subscribe();
  }
}

function stopSync() {
  activeFetchId++;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  // Sin nadie conectado (cerró sesión): que el próximo no vea los roles de este
  workActions.hydrateAssignments([]);
  syncState = { ready: false, error: null };
  notify();
}

export function useProjectRolesSync(): { ready: boolean; error: string | null } {
  const [state, setState] = useState<SyncState>(syncState);

  useEffect(() => {
    const listener = (s: SyncState) => setState(s);
    listeners.add(listener);

    subscriberCount++;
    if (subscriberCount === 1) {
      startSync();
    } else {
      setState(syncState);
    }

    return () => {
      listeners.delete(listener);
      subscriberCount--;
      if (subscriberCount === 0) {
        stopSync();
      }
    };
  }, []);

  return state;
}
