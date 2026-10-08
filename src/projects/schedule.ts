import { addDays, parseISO, today } from "../utils";
import type { ID } from "../types";
import type { Deliverable, Milestone, PlanStatus } from "./types";

/**
 * Programación de hitos y entregables: fecha PLANIFICADA contra fecha REAL, y
 * dependencias (fin → inicio). Si algo se atrasa, el atraso se propaga aguas
 * abajo: cada sucesor no puede empezar antes de que termine su predecesor, y su
 * duración planificada se mantiene.
 */

export const diffDays = (a: string, b: string) => Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);

export interface PlanItem {
  id: ID;
  kind: "m" | "d";
  name: string;
  status: PlanStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  dependsOn: ID[];
  /** Un entregable cuelga de un hito: el hito no puede terminar antes que sus entregables */
  parentId?: ID | null;
}

export function planItems(milestones: Milestone[], deliverables: Deliverable[]): PlanItem[] {
  return [
    ...milestones.map((m): PlanItem => ({ id: m.id, kind: "m", name: m.name, status: m.status, plannedStart: m.startDate ?? null, plannedEnd: m.dueDate, actualStart: m.actualStart ?? null, actualEnd: m.actualEnd ?? null, dependsOn: [] })), // por ahora los hitos no tienen dependencias
    ...deliverables.map((d): PlanItem => ({ id: d.id, kind: "d", name: d.name, status: d.status, plannedStart: d.startDate ?? null, plannedEnd: d.dueDate, actualStart: d.actualStart ?? null, actualEnd: d.actualEnd ?? null, dependsOn: [], parentId: d.milestoneId })), // por ahora no hay dependencias
  ];
}

export interface Forecast {
  id: ID;
  /** Fechas efectivas: reales si ya ocurrieron; si no, las previstas tras propagar los atrasos */
  start: string | null;
  end: string | null;
  done: boolean;
  /** Días de atraso del fin contra el planificado (+ = tarde, − = antes) */
  delayDays: number;
  /** Días que se corrió el inicio por esperar a un predecesor atrasado */
  inheritedDays: number;
  /** Atraso propio = el total menos lo heredado de los predecesores */
  ownDelayDays: number;
  /** El inicio se corrió por culpa de un predecesor */
  viaDeps: boolean;
}

/** Predecesores válidos: existen y no cierran un ciclo. */
function validPreds(items: PlanItem[]): Map<ID, ID[]> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<ID, ID[]>();
  const state = new Map<ID, 0 | 1 | 2>();
  const visit = (id: ID) => {
    state.set(id, 1);
    const keep: ID[] = [];
    for (const p of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(p) || p === id) continue;
      if (state.get(p) === 1) continue; // cerraría un ciclo: se ignora
      if (!state.has(p)) visit(p);
      keep.push(p);
    }
    out.set(id, keep);
    state.set(id, 2);
  };
  for (const i of items) if (!state.has(i.id)) visit(i.id);
  return out;
}

export function forecastSchedule(items: PlanItem[], now = today()): Map<ID, Forecast> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const preds = validPreds(items);
  const res = new Map<ID, Forecast>();
  const visiting = new Set<ID>();

  const calc = (id: ID): Forecast => {
    const hit = res.get(id);
    if (hit) return hit;
    const it = byId.get(id)!;
    // Guarda contra ciclos entre un hito y sus entregables
    if (visiting.has(id)) return { id, start: it.plannedStart, end: it.plannedEnd, done: false, delayDays: 0, inheritedDays: 0, ownDelayDays: 0, viaDeps: false };
    visiting.add(id);
    const ps = (preds.get(id) ?? []).map(calc);
    const done = it.status === "cumplido";
    const predEnd = ps.map((p) => p.end).filter(Boolean).reduce<string | null>((a, b) => (a === null || b! > a ? b! : a), null);
    let start: string | null;
    let end: string | null;
    let inherited = 0;

    if (done) {
      start = it.actualStart ?? it.plannedStart;
      end = it.actualEnd ?? it.plannedEnd;
    } else {
      const earliest = predEnd ? addDays(predEnd, 1) : null;
      start = it.actualStart ?? (it.plannedStart ? (earliest && earliest > it.plannedStart ? earliest : it.plannedStart) : earliest);
      const shift = it.plannedStart && start ? Math.max(0, diffDays(start, it.plannedStart)) : 0;
      if (!it.actualStart && earliest && it.plannedStart && earliest > it.plannedStart) inherited = diffDays(earliest, it.plannedStart);
      end = it.plannedEnd ? addDays(it.plannedEnd, shift) : null;
      // Si ya pasó su fecha y sigue abierto, como mínimo termina hoy
      if (end && end < now) end = now;
    }
    const ownEnd = end;
    // Un hito abierto no termina antes que sus entregables
    if (!done && it.kind === "m") {
      for (const c of items.filter((x) => x.parentId === id)) {
        const ce = calc(c.id).end;
        if (ce && (!end || ce > end)) end = ce;
      }
    }
    const delay = end && it.plannedEnd ? diffDays(end, it.plannedEnd) : 0;
    const ownDelay = ownEnd && it.plannedEnd ? diffDays(ownEnd, it.plannedEnd) : 0;
    const f: Forecast = { id, start, end, done, delayDays: delay, inheritedDays: inherited, ownDelayDays: done ? delay : Math.max(0, ownDelay - inherited), viaDeps: inherited > 0 };
    visiting.delete(id);
    res.set(id, f);
    return f;
  };
  for (const i of items) calc(i.id);
  return res;
}

/** Todo lo que cuelga, directa o indirectamente, de un ítem (aguas abajo). */
export function downstreamOf(items: PlanItem[], id: ID): ID[] {
  const preds = validPreds(items);
  const succ = new Map<ID, ID[]>();
  for (const [s, ps] of preds) for (const p of ps) succ.set(p, [...(succ.get(p) ?? []), s]);
  const seen = new Set<ID>();
  const walk = (x: ID) => { for (const s of succ.get(x) ?? []) if (!seen.has(s)) { seen.add(s); walk(s); } };
  walk(id);
  return [...seen];
}

/** ¿Hacer que `id` dependa de `pred` cerraría un ciclo? (pred ya depende de id, directa o indirectamente) */
export function wouldCycle(items: PlanItem[], id: ID, pred: ID): boolean {
  return pred === id || downstreamOf(items, id).includes(pred);
}

export interface ScheduleStats {
  /** Hitos y entregables cerrados con fecha real */
  closed: number;
  onTime: number;
  onTimePct: number | null;
  /** Desvío medio (días) del fin real contra el planificado; + = tarde */
  avgSlipDays: number | null;
  /** Cuántos están atrasados hoy (pasaron su fecha sin cerrar) o se corren por dependencias */
  delayedOpen: number;
  /** Días que se corre el último fin previsto contra el último fin planificado */
  endShiftDays: number;
}

export function scheduleStats(milestones: Milestone[], deliverables: Deliverable[], now = today()): ScheduleStats {
  const items = planItems(milestones, deliverables);
  const fc = forecastSchedule(items, now);
  const closed = items.filter((i) => i.status === "cumplido" && i.actualEnd && i.plannedEnd);
  const slips = closed.map((i) => diffDays(i.actualEnd!, i.plannedEnd!));
  const onTime = slips.filter((s) => s <= 0).length;
  const plannedEnds = items.map((i) => i.plannedEnd).filter(Boolean) as string[];
  const ends = [...fc.values()].map((f) => f.end).filter(Boolean) as string[];
  const maxOf = (xs: string[]) => xs.reduce((a, b) => (a > b ? a : b));
  return {
    closed: closed.length, onTime,
    onTimePct: closed.length ? Math.round((onTime / closed.length) * 100) : null,
    avgSlipDays: slips.length ? Math.round((slips.reduce((a, b) => a + b, 0) / slips.length) * 10) / 10 : null,
    delayedOpen: [...fc.values()].filter((f) => !f.done && f.delayDays > 0).length,
    endShiftDays: plannedEnds.length && ends.length ? diffDays(maxOf(ends), maxOf(plannedEnds)) : 0,
  };
}
