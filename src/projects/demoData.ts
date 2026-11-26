import type { Client, Project, User } from "../types";
import { addDays, today } from "../utils";
import type { WorkEnv } from "./types";

/**
 * Datos ficticios SOLO para la página autónoma demo.html (no requiere
 * iniciar sesión ni toca Supabase). Dentro de la app real, el módulo usa los
 * proyectos, clientes y usuarios verdaderos.
 */

function user(id: string, name: string, role: User["role"], extra: Partial<User> = {}): User {
  return {
    id, name, email: `${name.split(" ")[0].toLowerCase()}@quantia.demo`, password: "", role, team: "latam", jornada: "completa",
    supervisorId: null, weeklyHours: 40, workDays: [1, 2, 3, 4, 5], dayStart: "09:00", dayEnd: "18:00",
    birthday: "1990-01-01", hireDate: "2022-01-01", active: true, ...extra,
  };
}

export const DEMO_USERS: User[] = [
  user("u1", "Emmanuel Gotte", "admin"),
  user("u2", "Ana Ríos", "gerente"),
  user("u3", "Carla Núñez", "supervisor"),
  user("u4", "Martín Paz", "usuario"),
  user("u5", "Lucía Vega", "usuario"),
  user("u6", "Diego Sosa", "usuario"),
  user("u7", "Sofía Luna", "usuario"),
];

export const DEMO_CLIENTS: Client[] = [
  { id: "c1", name: "Constructora Andes", color: "#0ea5e9" },
  { id: "c2", name: "Grupo Meridiano", color: "#f97316" },
  { id: "c3", name: "Hospital Norte", color: "#8b5cf6" },
];

const P = (id: string, clientId: string, name: string, color: string, status: Project["status"], budgetHours: number | null, memberIds: string[]): Project => ({
  id, clientId, name, color, status, budgetHours, memberIds, flightActivityId: null,
});

export const DEMO_PROJECTS: Project[] = [
  P("p1", "c1", "Nave industrial — Parque Sur", "#5b6cff", "activo", 320, ["u3", "u4", "u5", "u6"]),
  P("p2", "c2", "Edificio Meridiano 24", "#12b5a5", "activo", 480, ["u2", "u3", "u4", "u7", "u5"]),
  P("p3", "c3", "Coordinación BIM — Hospital Norte", "#f5a524", "activo", 200, ["u3", "u6", "u7", "u4"]),
  P("p4", "c1", "Puente peatonal — Ribera", "#f0446c", "activo", 150, ["u2", "u5", "u6", "u7"]),
  P("p5", "c2", "Planta de tratamiento — Etapa 2", "#84cc16", "pausado", 260, ["u3", "u4", "u7", "u5"]),
  P("p6", "c2", "Auditoría estructural — Depósitos", "#f97316", "completado", 120, ["u2", "u6", "u4", "u5"]),
];

/** Minutos cargados de ejemplo por proyecto */
export const DEMO_MINUTES: Record<string, number> = { p1: 7050, p2: 15500, p3: 3900, p4: 10500, p5: 6000, p6: 8100 };

export function demoEnv(meId: string): WorkEnv {
  return {
    projects: DEMO_PROJECTS,
    clients: DEMO_CLIENTS,
    users: DEMO_USERS,
    me: DEMO_USERS.find((u) => u.id === meId) ?? DEMO_USERS[0],
    minutesByProject: DEMO_MINUTES,
    absences: [
      { userId: "u5", dateFrom: addDays(today(), 1), dateTo: addDays(today(), 4) },
      { userId: "u4", dateFrom: addDays(today(), 8), dateTo: addDays(today(), 12) },
    ],
  };
}
