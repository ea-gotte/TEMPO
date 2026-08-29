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
    description: string,
    dayOffset: number,
    start: number,
    end: number,
    tagIds: string[] = [],
  ): TimeEntry => ({
    id: uid(),
    userId,
    projectId,
    subProjectId: null,
    description,
    tagIds,
    date: addDays(ws, dayOffset),
    start,
    end,
  });

  const out: TimeEntry[] = [];
  // Semana actual — usuaria actual (u1)
  out.push(mk("u1", "p1", "Modelado estructural nave industrial", 0, 9 * 60, 12 * 60 + 30, ["g1"]));
  out.push(mk("u1", "p2", "Revisión de planos de instalación", 0, 13 * 60 + 30, 17 * 60));
  out.push(mk("u1", "p1", "Memoria de cálculo — fundaciones", 1, 9 * 60, 13 * 60, ["g2"]));
  out.push(mk("u1", "p3", "Reunión de coordinación BIM", 1, 14 * 60, 15 * 60 + 30, ["g3"]));
  out.push(mk("u1", "p2", "Cómputo y presupuesto", 2, 9 * 60 + 15, 12 * 60 + 45));
  out.push(mk("u1", "p1", "Ajustes de modelo por revisión cliente", 2, 14 * 60, 18 * 60));
  out.push(mk("u1", "p3", "Documentación de obra", 3, 9 * 60, 12 * 60));
  out.push(mk("u1", "p4", "Capacitación interna Revit", 3, 15 * 60, 17 * 60, ["g3"]));
  out.push(mk("u1", "p1", "Planos de detalle — entrega parcial", 4, 9 * 60, 13 * 60 + 15, ["g2"]));

  // Semana pasada u1 (para reportes/balance)
  for (let d = -7; d <= -3; d++) {
    out.push(mk("u1", d % 2 ? "p1" : "p2", "Desarrollo de ingeniería de detalle", d, 9 * 60, 13 * 60));
    out.push(mk("u1", d % 2 ? "p2" : "p3", "Coordinación y documentación", d, 14 * 60, 17 * 60 + 30));
  }

  // Otros usuarios, esta semana
  out.push(mk("u2", "p1", "Cálculo de estructuras metálicas", 0, 8 * 60 + 30, 12 * 60 + 30));
  out.push(mk("u2", "p1", "Verificación sísmica", 1, 9 * 60, 13 * 60));
  out.push(mk("u2", "p2", "Soporte a obra", 2, 9 * 60, 12 * 60));
  out.push(mk("u3", "p3", "Documentación BIM", 0, 9 * 60, 13 * 60));
  out.push(mk("u3", "p3", "Modelado MEP", 1, 9 * 60, 14 * 60));
  out.push(mk("u3", "p2", "Planos de instalaciones", 3, 10 * 60, 16 * 60));
  out.push(mk("u4", "p4", "Gestión administrativa", 0, 9 * 60, 12 * 60));
  out.push(mk("u4", "p2", "Presupuestos y compras", 1, 9 * 60, 13 * 60 + 30));
  return out;
}

function seedCorpEvents(): CorpEvent[] {
  const y = new Date().getFullYear();
  const t = today();
  const e = (date: string, type: CorpEvent["type"], title: string): CorpEvent => ({ id: uid(), date, type, title, allDay: true });
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
    passwordRecovery: false,
    currentUserId: "u1",
    company: {
      name: "Quantia Ingeniería",
      country: "Argentina",
      timezone: "America/Argentina/Buenos_Aires",
      defaultDayStart: "09:00",
      defaultDayEnd: "18:00",
      defaultWeeklyHours: 40,
      currency: "USD",
      passwordResetExpireMin: 30,
    },
    clients: [
      { id: "c1", name: "Constructora Andes", color: P.sky },
      { id: "c2", name: "Grupo Meridiano", color: P.orange },
      { id: "c3", name: "Interno", color: P.violet },
    ],
    projects: [
      {
        id: "p1", clientId: "c1", name: "Nave industrial — Parque Sur", color: P.indigo, status: "activo",
        budgetHours: 320, memberIds: ["u1", "u2"], flightActivityId: "act-obra-civil",
      },
      {
        id: "p2", clientId: "c2", name: "Edificio Meridiano 24", color: P.teal, status: "activo",
        budgetHours: 480, memberIds: ["u1", "u2", "u3", "u4"], flightActivityId: "act-general",
      },
      {
        id: "p3", clientId: "c1", name: "Coordinación BIM — Hospital Norte", color: P.amber, status: "activo",
        budgetHours: 200, memberIds: ["u1", "u3"], flightActivityId: "act-hospitales",
      },
      {
        id: "p4", clientId: "c3", name: "Gestión interna", color: P.rose, status: "activo",
        budgetHours: null, memberIds: ["u1", "u2", "u3", "u4"], flightActivityId: null,
      },
      {
        id: "p5", clientId: "c2", name: "Auditoría estructural — Depósitos", color: P.lime, status: "completado",
        budgetHours: 120, memberIds: ["u2"], flightActivityId: "act-obra-civil",
      },
    ],
    subProjects: [],
    tags: [
      { id: "g1", name: "Urgente", color: P.rose },
      { id: "g2", name: "Entregable", color: P.indigo },
      { id: "g3", name: "Reunión", color: P.amber },
      { id: "g4", name: "Revisión", color: P.teal },
    ],
    // Catálogo inicial de "Horas de vuelo" — configurable desde Administración,
    // sin tocar código (ver sql/supabase_schema_phase16_flight_hours.sql).
    flightCategories: [
      { id: "cat-modelado-bim", name: "Modelado BIM", active: true },
      { id: "cat-gestion-bim", name: "Gestión BIM", active: true },
    ],
    flightActivities: [
      { id: "act-general", categoryId: "cat-modelado-bim", name: "Modelado BIM - General", active: true },
      { id: "act-hospitales", categoryId: "cat-modelado-bim", name: "Modelado BIM - Hospitales", active: true },
      { id: "act-scan-to-bim", categoryId: "cat-modelado-bim", name: "Modelado BIM - Scan to BIM", active: true },
      { id: "act-data-centers", categoryId: "cat-modelado-bim", name: "Modelado BIM - Data Centers", active: true },
      { id: "act-obra-civil", categoryId: "cat-modelado-bim", name: "Modelado BIM - Obra Civil", active: true },
      { id: "act-viales", categoryId: "cat-modelado-bim", name: "Modelado BIM - Viales", active: true },
      { id: "act-ferroviario", categoryId: "cat-modelado-bim", name: "Modelado BIM - Ferroviario", active: true },
      { id: "act-hidraulica", categoryId: "cat-modelado-bim", name: "Modelado BIM - Hidráulica", active: true },
      { id: "act-documentacion", categoryId: "cat-gestion-bim", name: "Gestión BIM - Documentación", active: true },
      { id: "act-4d5d", categoryId: "cat-gestion-bim", name: "Gestión BIM - 4D / 5D", active: true },
    ],
    professionalProfiles: [],
    surveys: [],
    surveyResponses: [],
    users: [],
    entries: seedEntries(),
    timers: [],
    absences: seedAbsences(),
    overtime: [],
    emails: [],
    corpEvents: seedCorpEvents(),
    holidays: [],
    notifications: [
      {
        id: uid(), userId: "u1", kind: "solicitud", title: "Solicitud pendiente",
        body: "EA Gotte solicitó Trabajo remoto.", date: t, read: false,
      },
      {
        id: uid(), userId: "u1", kind: "feriado", title: "Feriado próximo",
        body: "Aniversario provincial en 9 días.", date: t, read: false,
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
    rolePermissions: {
      admin: [
        { label: "Configuración de empresa", enabled: true },
        { label: "Gestión de usuarios y roles", enabled: true },
        { label: "Aprobación de ausencias y horas extra", enabled: true },
        { label: "Reportes globales", enabled: true },
        { label: "Integraciones", enabled: true },
        { label: "Auditoría", enabled: true },
      ],
      gerente: [
        { label: "Creación y edición de proyectos y clientes", enabled: true },
        { label: "Gestión de equipo (altas, bajas, datos de perfil)", enabled: true },
        { label: "Aprobación de ausencias y horas extra", enabled: true },
        { label: "Control de horas de todo el equipo", enabled: true },
        { label: "Reportes globales", enabled: true },
      ],
      supervisor: [
        { label: "Control de horas de su equipo asignado", enabled: true },
        { label: "Informar horas extra de su equipo (sin aprobar)", enabled: true },
      ],
      usuario: [
        { label: "Registro de tiempo propio", enabled: true },
        { label: "Solicitud de ausencias", enabled: true },
        { label: "Reportes propios", enabled: true },
      ],
    },
    leaveTypeConfig: [
      { type: "Vacaciones", enabled: true },
      { type: "Día personal", enabled: true },
      { type: "Licencia médica", enabled: true },
      { type: "Salida médica", enabled: true },
      { type: "Licencia por estudio", enabled: true },
      { type: "Maternidad/Paternidad", enabled: true },
      { type: "Trabajo remoto", enabled: true },
      { type: "Permiso especial", enabled: true },
      { type: "Medio día", enabled: true },
      { type: "Horario reducido", enabled: true },
      { type: "Compensación de horas", enabled: true },
      { type: "Horas extra", enabled: true },
    ],
  };
}
