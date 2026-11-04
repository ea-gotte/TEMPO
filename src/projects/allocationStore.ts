import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { monthOf, type AllocationInput, type MonthHoursInput } from "./allocation";

/**
 * Códigos Postgres / PostgREST para tabla o función inexistente en Supabase.
 */
export function isMissingSchemaError(err: unknown): boolean {
  if (!err) return false;
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  const msg = typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const targetCodes = ["42P01", "42883", "PGRST202", "PGRST205"];
  return targetCodes.some((c) => code.includes(c) || msg.includes(c));
}

export interface UseAllocationsResult {
  allocations: AllocationInput[];
  hours: MonthHoursInput[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  setPct: (projectId: string, userId: string, month: string, pct: number | null) => Promise<string | null>;
}

/**
 * Lee asignaciones teóricas y horas reales del rango [fromMonth, toMonth].
 * Se suscribe a cambios en tiempo real sobre project_allocations.
 */
export function useAllocations(fromMonth: string, toMonth: string): UseAllocationsResult {
  const normFrom = monthOf(fromMonth);
  const normTo = monthOf(toMonth);

  const [allocations, setAllocations] = useState<AllocationInput[]>([]);
  const [hours, setHours] = useState<MonthHoursInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const allocationsRef = useRef(allocations);
  allocationsRef.current = allocations;

  // Al cambiar rápido de mes, la respuesta vieja no debe pisar a la nueva
  const lastRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++lastRequest.current;
    try {
      const [allocRes, hoursRes] = await Promise.all([
        supabase
          .from("project_allocations")
          .select("project_id, user_id, month, pct")
          .gte("month", normFrom)
          .lte("month", normTo),
        supabase.rpc("project_hours_by_month", {
          p_from: normFrom,
          p_to: normTo,
        }),
      ]);

      if (request !== lastRequest.current) return;

      if (allocRes.error) {
        if (isMissingSchemaError(allocRes.error)) setMissingSchema(true);
        setError(allocRes.error.message);
        setLoading(false);
        return;
      }

      if (hoursRes.error) {
        if (isMissingSchemaError(hoursRes.error)) setMissingSchema(true);
        setError(hoursRes.error.message);
        setLoading(false);
        return;
      }

      const mappedAllocations: AllocationInput[] = (allocRes.data || []).map((r: { project_id: string; user_id: string; month: string; pct: number | string }) => ({
        projectId: r.project_id,
        userId: r.user_id,
        month: monthOf(r.month),
        pct: Number(r.pct) || 0,
      }));

      const mappedHours: MonthHoursInput[] = (hoursRes.data || []).map((r: { project_id: string; user_id: string; month: string; minutes: number | string; user_total_minutes: number | string }) => ({
        projectId: r.project_id,
        userId: r.user_id,
        month: monthOf(r.month),
        minutes: Number(r.minutes) || 0,
        userTotalMinutes: Number(r.user_total_minutes) || 0,
      }));

      setAllocations(mappedAllocations);
      setHours(mappedHours);
      setError(null);
      setMissingSchema(false);
      setLoading(false);
    } catch (err: unknown) {
      if (request !== lastRequest.current) return;
      if (isMissingSchemaError(err)) setMissingSchema(true);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
      setError(msg);
      setLoading(false);
    }
  }, [normFrom, normTo]);

  useEffect(() => {
    setLoading(true);
    void load();

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void load();
      }, 300);
    };

    const channel = supabase
      .channel(`project_allocations_${normFrom}_${normTo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_allocations" }, debouncedRefetch)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [normFrom, normTo, load]);

  const setPct = useCallback(
    async (projectId: string, userId: string, month: string, pct: number | null): Promise<string | null> => {
      const targetMonth = monthOf(month);
      const prev = allocationsRef.current;

      // Actualización optimista
      if (pct === null) {
        setAllocations((cur) =>
          cur.filter((a) => !(a.projectId === projectId && a.userId === userId && monthOf(a.month) === targetMonth)),
        );
      } else {
        setAllocations((cur) => {
          const idx = cur.findIndex(
            (a) => a.projectId === projectId && a.userId === userId && monthOf(a.month) === targetMonth,
          );
          const nextItem: AllocationInput = {
            projectId,
            userId,
            month: targetMonth,
            pct,
          };
          if (idx >= 0) {
            const copy = [...cur];
            copy[idx] = nextItem;
            return copy;
          }
          return [...cur, nextItem];
        });
      }

      try {
        let err: { message: string; code?: string } | null = null;
        if (pct === null) {
          const { error } = await supabase
            .from("project_allocations")
            .delete()
            .match({ project_id: projectId, user_id: userId, month: targetMonth });
          err = error;
        } else {
          const { error } = await supabase.from("project_allocations").upsert(
            {
              project_id: projectId,
              user_id: userId,
              month: targetMonth,
              pct,
            },
            { onConflict: "project_id,user_id,month" },
          );
          err = error;
        }

        if (err) {
          setAllocations(prev);
          if (isMissingSchemaError(err)) setMissingSchema(true);
          return err.message;
        }

        void load();
        return null;
      } catch (ex: unknown) {
        setAllocations(prev);
        if (isMissingSchemaError(ex)) setMissingSchema(true);
        return ex && typeof ex === "object" && "message" in ex ? String((ex as { message: unknown }).message) : String(ex);
      }
    },
    [load],
  );

  return {
    allocations,
    hours,
    loading,
    error,
    missingSchema,
    setPct,
  };
}

/**
 * Minutos acumulados por proyecto de todos los participantes.
 * Retorna null mientras carga o si falla.
 */
export function useProjectTotalMinutes(): Record<string, number> | null {
  const [data, setData] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: rows, error } = await supabase.rpc("project_total_minutes");
        if (cancelled) return;
        if (error || !rows) {
          setData(null);
          return;
        }
        const record: Record<string, number> = {};
        for (const r of rows as { project_id: string; minutes: number | string }[]) {
          record[r.project_id] = Number(r.minutes) || 0;
        }
        setData(record);
      } catch {
        if (!cancelled) setData(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
