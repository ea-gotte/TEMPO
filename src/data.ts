import type { AppState, TimeEntry, CorpEvent, AbsenceRequest } from "./types";
import { addDays, isoDate, today, uid, weekStart } from "./utils";

const P = {
  indigo: "#5b6cff",
  teal: "#12b5a5",
  amber: "#f5a524",
  rose: "#f0446c",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
  lime: "#84cc16",
  orange: "#f97316",
};

function seedEntries(): TimeEntry[] {
  const t = today();
  const ws = weekStart(t);
  const mk = (
    userId: string,
    projectId: string,
    taskId: string | null,
    description: string,
    dayOffset: number,
    start: number,
    end: number,
    billable = true,
    tagIds: string[] = [],
  ): TimeEntry => ({
    id: uid(),
    userId,
    projectId,
    taskId,
    description,
    tagIds,
    date: addDays(ws, dayOffset),
    start,
    end,
    billable,
  });

  const out: TimeEntry[] = [];
  // Semana actual — usuaria actual (u1)
  out.push(mk("u1", "p1", "t1", "Modelado estructural nave industrial", 0, 9 * 60, 12 * 60 + 30, true, ["g1"]));
  out.push(mk("u1", "p2", "t4", "Revisión de planos de instalación", 0, 13 * 60 + 30, 17 * 60, true));
  out.push(mk("u1", "p1", "t2", "Memoria de cálculo — fundaciones", 1, 9 * 60, 13 * 60, true, ["g2"]));
  out.push(mk("u1", "p3", null, "Reunión de coordinación BIM", 1, 14 * 60, 15 * 60 + 30, false, ["g3"]));
  out.push(mk("u1", "p2", "t5", "Cómputo y presupuesto", 2, 9 * 60 + 15, 12 * 60 + 45, true));
  out.push(mk("u1", "p1", "t1", "Ajustes de modelo por revisión cliente", 2, 14 * 60, 18 * 60, true));
  out.push(mk("u1", "p3", "t6", "Documentación de obra", 3, 9 * 60, 12 * 60, true));
  out.push(mk("u1", "p4", null, "Capacitación interna Revit", 3, 15 * 60, 17 * 60, false, ["g3"]));
  out.push(mk("u1", "p1", "t3", "Planos de detalle — entrega parcial", 4, 9 * 60, 13 * 60 + 15, true, ["g2"]));

  // Semana pasada u1 (para reportes/balance)
  for (let d = -7; d <= -3; d++) {
    out.push(mk("u1", d % 2 ? "p1" : "p2", null, "Desarrollo de ingeniería de detalle", d, 9 * 60, 13 * 60, true));
    out.push(mk("u1", d % 2 ? "p2" : "p3", null, "Coordinación y documentación", d, 14 * 60, 17 * 60 + 30, d % 2 === 0));
  }

  // Otros usuarios, esta semana
  out.push(mk("u2", "p1", "t1", "Cálculo de estructuras metálicas", 0, 8 * 60 + 30, 12 * 60 + 30));
  out.push(mk("u2", "p1", "t2", "Verificación sísmica", 1, 9 * 60, 13 * 60));
  out.push(mk("u2", "p2", null, "Soporte a obra", 2, 9 * 60, 12 * 60));
  out.push(mk("u3", "p3", "t6", "Documentación BIM", 0, 9 * 60, 13 * 60));
  out.push(mk("u3", "p3", "t6", "Modelado MEP", 1, 9 * 60, 14 * 60));
  out.push(mk("u3", "p2", "t4", "Planos de instalaciones", 3, 10 * 60, 16 * 60));
  out.push(mk("u4", "p4", null, "Gestión administrativa", 0, 9 * 60, 12 * 60, false));
  out.push(mk("u4", "p2", "t5", "Presupuestos y compras", 1, 9 * 60, 13 * 60 + 30, false));
  return out;
}

function seedCorpEvents(): CorpEvent[] {
  const y = new Date().getFullYear();
  const t = today();
  const e = (date: string, type: CorpEvent["type"], title: string): CorpEvent => ({ id: uid(), date, type, title });
  return [
    e(`${y}-01-01`, "Feriado nacional", "Año Nuevo"),
    e(`${y}-05-01`, "Feriado nacional", "Día del Trabajador"),
    e(`${y}-07-09`, "Feriado nacional", "Día de la Independencia"),
    e(`${y}-12-25`, "Feriado nacional", "Navidad"),
    e(`${y}-08-17`, "Feriado nacional", "Paso a la Inmortalidad del Gral. San Martín"),
    e(`${y}-10-12`, "Feriado nacional", "Día del Respeto a la Diversidad Cultural"),
    e(`${y}-11-20`, "Feriado nacional", "Día de la Soberanía Nacional"),
    e(`${y}-12-08`, "Feriado nacional", "Inmaculada Concepción"),
    e(addDays(t, 9), "Feriado provincial", "Aniversario provincial"),
    e(addDays(t, 4), "Capacitación", "Taller: BIM colaborativo"),
    e(addDays(t, 15), "Día no laborable", "Puente turístico"),
  ];
}

function seedAbsences(): AbsenceRequest[] {
  const t = today();
  return [
    {
      id: uid(),
      userId: "u1",
      type: "Vacaciones",
      dateFrom: addDays(t, 20),
      dateTo: addDays(t, 27),
      reason: "Vacaciones familiares planificadas.",
      attachments: [],
      status: "Aprobado",
      supervisorComment: "Aprobado, ¡buen descanso!",
      createdAt: addDays(t, -12),
      resolvedBy: "u2",
    },
    {
      id: uid(),
      userId: "u3",
      type: "Licencia médica",
      dateFrom: addDays(t, -2),
      dateTo: addDays(t, -1),
      reason: "Gripe con reposo indicado.",
      attachments: [{ name: "certificado-medico.pdf" }],
      status: "Aprobado",
      supervisorComment: "Que te mejores.",
      createdAt: addDays(t, -3),
      resolvedBy: "u2",
    },
    {
      id: uid(),
      userId: "u4",
      type: "Trabajo remoto",
      dateFrom: addDays(t, 3),
      dateTo: addDays(t, 3),
      reason: "Trámite personal por la mañana, trabajo desde casa.",
      attachments: [],
      status: "Pendiente",
      createdAt: addDays(t, -1),
    },
    {
      id: uid(),
      userId: "u3",
      type: "Salida médica",
      dateFrom: addDays(t, 5),
      dateTo: addDays(t, 5),
      timeFrom: "10:00",
      timeTo: "12:30",
      reason: "Turno médico programado.",
      attachments: [],
      status: "Pendiente",
      createdAt: today(),
    },
  ];
}

export function seedState(): AppState {
  const t = today();
  return {
    theme: "light",
    authenticated: false,
    currentUserId: "u1",
    company: {
      name: "Quantia Ingeniería",
      country: "Argentina",
      timezone: "America/Argentina/Buenos_Aires",
      defaultDayStart: "09:00",
      defaultDayEnd: "18:00",
      defaultWeeklyHours: 40,
      currency: "USD",
    },
    clients: [
      { id: "c1", name: "Constructora Andes", color: P.sky },
      { id: "c2", name: "Grupo Meridiano", color: P.orange },
      { id: "c3", name: "Interno", color: P.violet },
    ],
    projects: [
      {
        id: "p1", clientId: "c1", name: "Nave industrial — Parque Sur", color: P.indigo, status: "activo",
        billable: true, hourlyRate: 55, costRate: 30, budgetHours: 320,
        memberIds: ["u1", "u2"],
        tasks: [
          { id: "t1", name: "Modelado estructural" },
          { id: "t2", name: "Memoria de cálculo" },
          { id: "t3", name: "Planos de detalle" },
        ],
      },
      {
        id: "p2", clientId: "c2", name: "Edificio Meridiano 24", color: P.teal, status: "activo",
        billable: true, hourlyRate: 60, costRate: 32, budgetHours: 480,
        memberIds: ["u1", "u2", "u3", "u4"],
        tasks: [
          { id: "t4", name: "Instalaciones" },
          { id: "t5", name: "Cómputo y presupuesto" },
        ],
      },
      {
        id: "p3", clientId: "c1", name: "Coordinación BIM — Hospital Norte", color: P.amber, status: "activo",
        billable: true, hourlyRate: 48, costRate: 28, budgetHours: 200,
        memberIds: ["u1", "u3"],
        tasks: [{ id: "t6", name: "Documentación BIM" }],
      },
      {
        id: "p4", clientId: "c3", name: "Gestión interna", color: P.rose, status: "activo",
        billable: false, hourlyRate: 0, costRate: 25, budgetHours: null, tasks: [],
        memberIds: ["u1", "u2", "u3", "u4"],
      },
      {
        id: "p5", clientId: "c2", name: "Auditoría estructural — Depósitos", color: P.lime, status: "completado",
        billable: true, hourlyRate: 52, costRate: 30, budgetHours: 120, tasks: [],
        memberIds: ["u2"],
      },
    ],
    tags: [
      { id: "g1", name: "Urgente", color: P.rose },
      { id: "g2", name: "Entregable", color: P.indigo },
      { id: "g3", name: "Reunión", color: P.amber },
      { id: "g4", name: "Revisión", color: P.teal },
    ],
    users: [
      {
        id: "u1", name: "Emmanuel Gotte", email: "ea.gotte@gmail.com", password: "admin123", role: "admin", jornada: "completa",
        teamId: "e1", departmentId: "d1", supervisorId: null, weeklyHours: 40,
        workDays: [1, 2, 3, 4, 5], dayStart: "09:00", dayEnd: "18:00", birthday: "1988-03-14",
        hireDate: "2021-03-01", active: true, online: true,
      },
      {
        id: "u2", name: "Carla Domínguez", email: "carla@quantia.com", password: "carla123", role: "supervisor", jornada: "completa",
        teamId: "e1", departmentId: "d1", supervisorId: "u1", weeklyHours: 40,
        workDays: [1, 2, 3, 4, 5], dayStart: "08:30", dayEnd: "17:30", birthday: "1990-07-28",
        hireDate: "2022-08-15", active: true, online: true,
      },
      {
        id: "u3", name: "Martín Suárez", email: "martin@quantia.com", password: "martin123", role: "empleado", jornada: "completa",
        teamId: "e2", departmentId: "d1", supervisorId: "u2", weeklyHours: 40,
        workDays: [1, 2, 3, 4, 5], dayStart: "09:00", dayEnd: "18:00", birthday: "1995-11-02",
        hireDate: "2024-11-10", active: true, online: false,
      },
      {
        id: "u4", name: "Lucía Ferrer", email: "lucia@quantia.com", password: "lucia123", role: "empleado", jornada: "media",
        teamId: "e3", departmentId: "d2", supervisorId: "u1", weeklyHours: 20,
        workDays: [1, 2, 3, 4], dayStart: "09:00", dayEnd: "14:00", birthday: "1998-07-24",
        hireDate: "2026-01-15", active: true, online: true,
      },
    ],
    teams: [
      { id: "e1", name: "Estructuras" },
      { id: "e2", name: "BIM" },
      { id: "e3", name: "Administración" },
    ],
    departments: [
      { id: "d1", name: "Ingeniería" },
      { id: "d2", name: "Administración" },
    ],
    entries: seedEntries(),
    timers: [],
    absences: seedAbsences(),
    validations: [],
    overtime: [],
    emails: [],
    corpEvents: seedCorpEvents(),
    notifications: [
      {
        id: uid(), kind: "solicitud", title: "Solicitud pendiente",
        body: "Lucía Ferrer solicitó Trabajo remoto.", date: t, read: false,
      },
      {
        id: uid(), kind: "feriado", title: "Feriado próximo",
        body: "Aniversario provincial en 9 días.", date: t, read: false,
      },
      {
        id: uid(), kind: "falta-carga", title: "Falta de carga horaria",
        body: "Martín Suárez cargó 15 h de 40 h esta semana.", date: addDays(t, -1), read: true,
      },
    ],
    audit: [
      { id: uid(), at: new Date().toISOString(), userId: "u1", action: "Inicio de sesión", detail: "OAuth Google" },
    ],
    integrations: [
      { id: "i1", name: "Google Calendar", desc: "Sincronizá tus registros y ausencias con tu calendario.", icon: "calendar", connected: true },
      { id: "i2", name: "Outlook Calendar", desc: "Eventos y reuniones desde Microsoft 365.", icon: "calendar-days", connected: false },
      { id: "i3", name: "Microsoft Teams", desc: "Estado y recordatorios en Teams.", icon: "message", connected: false },
      { id: "i4", name: "Slack", desc: "Notificaciones y comandos /tempo.", icon: "bell", connected: true },
      { id: "i5", name: "Jira", desc: "Importá issues como tareas.", icon: "puzzle", connected: false },
      { id: "i6", name: "Trello", desc: "Tarjetas como tareas de proyecto.", icon: "briefcase", connected: false },
      { id: "i7", name: "Asana", desc: "Tareas y proyectos sincronizados.", icon: "check-circle", connected: false },
      { id: "i8", name: "ClickUp", desc: "Sincronización bidireccional de tareas.", icon: "zap", connected: false },
      { id: "i9", name: "Notion", desc: "Bases de datos de proyectos.", icon: "book", connected: false },
      { id: "i10", name: "GitHub", desc: "Vinculá commits y PRs a registros.", icon: "github", connected: false },
      { id: "i11", name: "Autodesk Construction Cloud", desc: "Proyectos ACC como proyectos de Tempo.", icon: "hard-hat", connected: true },
      { id: "i12", name: "API REST", desc: "Tokens de acceso y documentación de la API.", icon: "plug", connected: true },
      { id: "i13", name: "Webhooks", desc: "Eventos en tiempo real hacia tus sistemas.", icon: "webhook", connected: false },
    ],
  };
}
