import type { Project, TimeEntry, User } from "./types";

/** Matriz de un mes: personas en filas, proyectos en columnas, minutos cargados en cada cruce. */
export interface StaffMatrix {
  /** Proyectos con horas en el mes, del que más horas tiene al que menos */
  projects: { id: string | null; name: string; color: string; totalMin: number }[];
  rows: { user: User; byProject: Map<string | null, number>; totalMin: number }[];
  totalMin: number;
  /** Mayor valor de una celda: sirve para graduar la intensidad del color */
  maxCellMin: number;
}

/**
 * Horas de cada persona en cada proyecto durante un mes (`month` = "AAAA-MM").
 * Solo salen como columna los proyectos con horas ese mes; las personas sin horas quedan
 * con la fila vacía (así se ve quién no cargó).
 */
export function staffMatrix(entries: TimeEntry[], users: User[], projects: Project[], month: string): StaffMatrix {
  const userIds = new Set(users.map((u) => u.id));
  const perUser = new Map<string, Map<string | null, number>>();
  const perProject = new Map<string | null, number>();
  for (const e of entries) {
    if (!e.date.startsWith(month) || !userIds.has(e.userId)) continue;
    const min = e.end - e.start;
    if (min <= 0) continue;
    const pid = e.projectId ?? null;
    let row = perUser.get(e.userId);
    if (!row) perUser.set(e.userId, (row = new Map()));
    row.set(pid, (row.get(pid) ?? 0) + min);
    perProject.set(pid, (perProject.get(pid) ?? 0) + min);
  }

  const byId = new Map(projects.map((p) => [p.id, p]));
  const cols = [...perProject.entries()]
    .map(([id, totalMin]) => ({
      id,
      name: id ? byId.get(id)?.name ?? "Proyecto eliminado" : "Sin proyecto",
      color: (id && byId.get(id)?.color) || "#8f95a1",
      totalMin,
    }))
    .sort((a, b) => b.totalMin - a.totalMin || a.name.localeCompare(b.name, "es"));

  const rows = users
    .map((user) => {
      const byProject = perUser.get(user.id) ?? new Map<string | null, number>();
      let totalMin = 0;
      for (const v of byProject.values()) totalMin += v;
      return { user, byProject, totalMin };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name, "es"));

  let maxCellMin = 0;
  for (const r of rows) for (const v of r.byProject.values()) if (v > maxCellMin) maxCellMin = v;
  return { projects: cols, rows, totalMin: rows.reduce((a, r) => a + r.totalMin, 0), maxCellMin };
}
