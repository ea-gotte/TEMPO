export type ID = string;

export interface Client {
  id: ID;
  name: string;
  color: string;
  archived?: boolean;
}

export type ProjectStatus = "activo" | "pausado" | "completado" | "archivado";

export interface Project {
  id: ID;
  clientId: ID | null;
  name: string;
  color: string;
  status: ProjectStatus;
  budgetHours: number | null; // presupuesto de horas; si tiene subproyectos, es la suma de sus horas proyectadas
  /** Personas asignadas: los empleados solo ven los proyectos donde están */
  memberIds: ID[];
  /** Link a la página del proyecto en Notion */
  notionUrl?: string;
  /** Actividad de "Horas de vuelo" a la que suman las horas cargadas en este proyecto */
  flightActivityId: ID | null;
}

/** Subproyecto: entidad propia dentro de un proyecto, con su propio presupuesto de horas. */
export interface SubProject {
  id: ID;
  projectId: ID;
  name: string;
  status: ProjectStatus;
  budgetHours: number | null;
}

export interface Tag {
  id: ID;
  name: string;
  color: string;
}

/**
 * Horas de vuelo: experiencia profesional acumulada a partir de la actividad
 * real en proyectos (no de encuestas ni autopercepción). Categoría/Actividad
 * son entidades propias (no texto suelto) para poder ampliar el catálogo sin
 * tocar código — ver computeFlightHours() en flightHours.ts.
 */
export interface FlightCategory {
  id: ID;
  name: string;
  /** Desactivada: no se ofrece para asignar a proyectos nuevos, pero el historial ya cargado no se borra */
  active: boolean;
}

export interface FlightActivity {
  id: ID;
  categoryId: ID;
  name: string;
  active: boolean;
}

/**
 * Perfil profesional: formación y experiencia de cada persona, editable
 * directamente (no depende de las encuestas). Los años de experiencia se
 * calculan siempre desde la fecha de inicio, nunca se guardan como número fijo.
 */
export interface ProfessionalEntry {
  id: ID;
  title: string;
  institution?: string;
  year?: number;
  /** Link al certificado/archivo (ej. Google Drive), si vino de una importación */
  fileUrl?: string;
}

export interface ProfessionalProfile {
  /** = el id del usuario (una fila por persona) */
  id: ID;
  workExperienceSince: string | null; // YYYY-MM-DD
  bimExperienceSince: string | null; // YYYY-MM-DD
  education: ProfessionalEntry[]; // Formación profesional
  courses: ProfessionalEntry[]; // Formación complementaria
}

/**
 * Encuestas: la fuente de la sección "Habilidades" del perfil profesional
 * (autopercepción, no experiencia real — ver flightHours.ts para la
 * distinción). El admin arma y lanza cada ronda a mano; las preguntas son
 * libres por encuesta, no hay un catálogo fijo de habilidades.
 */
export type SurveyQuestionType = "rating5" | "text" | "yesno" | "choice" | "checkbox";

export interface SurveyQuestion {
  id: ID;
  label: string;
  type: SurveyQuestionType;
  /** Solo para "choice" (elegir una) y "checkbox" (elegir varias) */
  options?: string[];
}

export interface Survey {
  id: ID;
  title: string;
  questions: SurveyQuestion[];
  launchedAt: string; // ISO
  dueDate: string; // YYYY-MM-DD — se refleja como evento en el calendario corporativo
  createdBy: ID;
}

export interface SurveyAnswer {
  questionId: ID;
  value: string;
}

export interface SurveyResponse {
  id: ID;
  surveyId: ID;
  userId: ID;
  answers: SurveyAnswer[];
  submittedAt: string; // ISO
}

export type Role = "admin" | "gerente" | "supervisor" | "usuario";

export type Jornada = "completa" | "media";

/**
 * Equipo de trabajo: fijo por ahora (Fase 18). Restringe el acceso además del
 * rol — Equipo España queda en consulta (ver canSeePage en Shell.tsx) sin
 * cambiar el rol de la persona; los usuarios existentes sin equipo asignado
 * se tratan como LATAM (comportamiento actual, sin cambios).
 */
export type Team = "espana" | "latam";

export interface User {
  id: ID;
  name: string;
  email: string;
  /** Clave de acceso (demo; en producción sería un hash + OAuth) */
  password: string;
  mustChangePassword?: boolean;
  recoveryCode?: string | null;
  recoveryExpires?: string | null;
  role: Role;
  team: Team;
  jornada: Jornada;
  supervisorId: ID | null;
  weeklyHours: number; // jornada semanal
  workDays: number[]; // 1=Lun ... 7=Dom
  dayStart: string; // "09:00" horario flexible: inicio referencia
  dayEnd: string;
  birthday: string; // YYYY-MM-DD (se agrega solo al calendario corporativo)
  hireDate: string; // YYYY-MM-DD fecha de ingreso — base del cálculo de vacaciones
  /** Preferencias de calendario guardadas por usuario */
  calendarTz?: string; // huso horario base (default: el de la empresa)
  calendarTz2?: string; // huso horario adicional opcional
  active: boolean;
  online?: boolean;
}


export interface TimeEntry {
  id: ID;
  userId: ID;
  projectId: ID | null;
  subProjectId: ID | null;
  description: string;
  tagIds: ID[];
  date: string; // YYYY-MM-DD
  start: number; // minutos desde 00:00
  end: number; // minutos desde 00:00 (>start)
  favorite?: boolean;
  recurring?: "diario" | "semanal" | null;
}

export interface RunningTimer {
  id: ID;
  projectId: ID | null;
  subProjectId: ID | null;
  description: string;
  tagIds: ID[];
  startedAt: number; // epoch ms
  paused?: boolean;
}

export type AbsenceType =
  | "Vacaciones"
  | "Día personal"
  | "Licencia médica"
  | "Salida médica"
  | "Licencia por estudio"
  | "Maternidad/Paternidad"
  | "Trabajo remoto"
  | "Permiso especial"
  | "Medio día"
  | "Horario reducido"
  | "Compensación de horas"
  | "Horas extra";

export type AbsenceStatus = "Pendiente" | "Aprobado" | "Rechazado";

export interface Attachment {
  name: string;
  url?: string; // data URL del archivo cargado (para previsualizar/descargar)
  size?: number;
}

export interface AbsenceRequest {
  id: ID;
  userId: ID;
  type: AbsenceType;
  dateFrom: string;
  dateTo: string;
  timeFrom?: string;
  timeTo?: string;
  reason: string;
  attachments: Attachment[];
  status: AbsenceStatus;
  supervisorComment?: string;
  createdAt: string;
  resolvedBy?: ID;
  resolvedAt?: string;
}

export type CorpEventType =
  | "Feriado nacional"
  | "Feriado provincial"
  | "Día no laborable"
  | "Cumpleaños"
  | "Capacitación"
  | "Reunión"
  | "Horario especial"
  | "Home office"
  | "Cierre de empresa"
  | "Encuesta";

export interface CorpEvent {
  id: ID;
  date: string;
  type: CorpEventType;
  title: string;
  allDay: boolean;
  timeFrom?: string;
  timeTo?: string;
}

export type HolidayType = "Feriado nacional" | "Feriado provincial" | "Día no laborable";

/** Feriado gestionado por el administrador (persistido en base de datos, no local) */
export interface Holiday {
  id: ID;
  date: string; // YYYY-MM-DD
  type: HolidayType;
  title: string;
}

export interface Notification {
  id: ID;
  /** Destinatario: a quién le corresponde ver esta notificación (persistida en el servidor). */
  userId: ID;
  kind:
    | "timer-start"
    | "timer-stop"
    | "registro-incompleto"
    | "solicitud"
    | "aprobacion"
    | "feriado"
    | "exceso"
    | "exceso-pendiente"
    | "falta-carga"
    | "vencimiento"
    | "encuesta"
    | "error";
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export type OvertimeStatus = "Pendiente" | "Aprobado" | "Rechazado";

/** Horas extra de una semana, informadas y enviadas a supervisión */
export interface OvertimeRequest {
  id: ID;
  userId: ID;
  weekStart: string; // lunes de la semana
  minutes: number; // minutos por encima de la jornada
  status: OvertimeStatus;
  createdAt: string;
  resolvedBy?: ID;
  resolvedAt?: string;
  supervisorComment?: string;
}

/** Copia por correo de una notificación (bandeja de salida) */
export interface EmailRecord {
  id: ID;
  to: string;
  subject: string;
  body: string;
  at: string; // ISO
}

export interface AuditLog {
  id: ID;
  at: string; // ISO
  userId: ID;
  action: string;
  detail: string;
}

export interface Integration {
  id: ID;
  name: string;
  desc: string;
  icon: string;
  connected: boolean;
}

export interface CompanySettings {
  name: string;
  country: string;
  timezone: string;
  defaultDayStart: string;
  defaultDayEnd: string;
  defaultWeeklyHours: number;
  currency: string;
  passwordResetExpireMin?: number;
}

/** Permiso individual dentro de un rol, configurable desde Administración */
export interface RolePermission {
  label: string;
  enabled: boolean;
}

/** Tipo de ausencia habilitado o no para solicitarse, configurable desde Administración */
export interface LeaveTypeConfig {
  type: AbsenceType;
  enabled: boolean;
}

export interface AppState {
  theme: "light" | "dark";
  /** true cuando hay una sesión iniciada; si es false se muestra el login */
  authenticated: boolean;
  /** true tras abrir un enlace de recuperación de contraseña; muestra el formulario de nueva clave en vez de la app */
  passwordRecovery: boolean;
  currentUserId: ID;
  clients: Client[];
  projects: Project[];
  subProjects: SubProject[];
  tags: Tag[];
  flightCategories: FlightCategory[];
  flightActivities: FlightActivity[];
  professionalProfiles: ProfessionalProfile[];
  surveys: Survey[];
  surveyResponses: SurveyResponse[];
  users: User[];
  entries: TimeEntry[];
  timers: RunningTimer[];
  absences: AbsenceRequest[];
  overtime: OvertimeRequest[];
  corpEvents: CorpEvent[];
  holidays: Holiday[];
  notifications: Notification[];
  emails: EmailRecord[];
  audit: AuditLog[];
  integrations: Integration[];
  company: CompanySettings;
  rolePermissions: Record<Role, RolePermission[]>;
  leaveTypeConfig: LeaveTypeConfig[];
}
