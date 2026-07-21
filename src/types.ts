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
  billable: boolean;
  hourlyRate: number; // tarifa facturable por hora
  costRate: number; // costo interno por hora
  budgetHours: number | null; // presupuesto de horas
  tasks: ProjectTask[];
  /** Personas asignadas: los empleados solo ven los proyectos donde están */
  memberIds: ID[];
  /** Link a la página del proyecto en Notion */
  notionUrl?: string;
}

export interface ProjectTask {
  id: ID;
  name: string;
  done?: boolean;
}

export interface Tag {
  id: ID;
  name: string;
  color: string;
}

export type Role = "admin" | "supervisor" | "empleado";

export type Jornada = "completa" | "media";

export interface User {
  id: ID;
  name: string;
  email: string;
  /** Clave de acceso (demo; en producción sería un hash + OAuth) */
  password: string;
  role: Role;
  jornada: Jornada;
  teamId: ID | null;
  departmentId: ID | null;
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

export interface Team {
  id: ID;
  name: string;
}
export interface Department {
  id: ID;
  name: string;
}

export interface TimeEntry {
  id: ID;
  userId: ID;
  projectId: ID | null;
  taskId: ID | null;
  description: string;
  tagIds: ID[];
  date: string; // YYYY-MM-DD
  start: number; // minutos desde 00:00
  end: number; // minutos desde 00:00 (>start)
  billable: boolean;
  favorite?: boolean;
  recurring?: "diario" | "semanal" | null;
}

export interface RunningTimer {
  id: ID;
  projectId: ID | null;
  taskId: ID | null;
  description: string;
  tagIds: ID[];
  billable: boolean;
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
  | "Compensación de horas";

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
  | "Cierre de empresa";

export interface CorpEvent {
  id: ID;
  date: string;
  type: CorpEventType;
  title: string;
}

export interface Notification {
  id: ID;
  kind:
    | "timer-start"
    | "timer-stop"
    | "registro-incompleto"
    | "solicitud"
    | "aprobacion"
    | "feriado"
    | "exceso"
    | "falta-carga"
    | "vencimiento";
  title: string;
  body: string;
  date: string;
  read: boolean;
}

/** Validación semanal de carga de horas por parte del admin/supervisor */
export interface WeekValidation {
  id: ID;
  userId: ID;
  weekStart: string; // YYYY-MM-DD (lunes)
  validatedBy: ID;
  at: string; // ISO
  comment?: string;
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
  currentUserId: ID;
  clients: Client[];
  projects: Project[];
  tags: Tag[];
  users: User[];
  teams: Team[];
  departments: Department[];
  entries: TimeEntry[];
  timers: RunningTimer[];
  absences: AbsenceRequest[];
  validations: WeekValidation[];
  overtime: OvertimeRequest[];
  corpEvents: CorpEvent[];
  notifications: Notification[];
  emails: EmailRecord[];
  audit: AuditLog[];
  integrations: Integration[];
  company: CompanySettings;
  rolePermissions: Record<Role, RolePermission[]>;
  leaveTypeConfig: LeaveTypeConfig[];
}
