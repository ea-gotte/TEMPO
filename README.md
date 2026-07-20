# Tempo — Registro y gestión de horas de trabajo

Aplicación web SPA (React 18 + TypeScript + Vite) inspirada en Clockify (velocidad de carga de horas) y Jibble (gestión de personal), con estética tipo Linear/Notion.

## Cómo ejecutarla

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en /dist
```

Los datos de demostración se cargan automáticamente la primera vez y todo cambio se persiste en `localStorage` del navegador (clave `tempo-state-v1`). Para reiniciar la demo: borrar esa clave desde las DevTools.

## Módulos implementados

| Módulo | Qué incluye |
|---|---|
| **Registro de tiempo** | Cronómetro start/stop (máx. 2 clics), temporizadores múltiples simultáneos, carga manual, favoritos (1 clic), registros recurrentes, copiar día completo, historial agrupado por día, detección de solapamientos. Lo facturable no se elige en la entrada: se hereda de la configuración del proyecto |
| **Calendario** | Vistas Día / Semana / Mes / Timeline (día completo 0–24 h con scroll y encabezados fijos); bloques editables con **drag & drop**, clic en hueco para crear; huso horario principal (ARG) siempre visible y segundo huso opcional (España, Chile, México, etc.) |
| **Clientes y proyectos** | Clientes, proyectos con color, estado, tareas opcionales, horas proyectadas vs. cargadas con barra de avance y alerta ≥90 %, link a Notion, equipo por proyecto, etiquetas |
| **Equipo** | Usuarios, roles (admin/supervisor/empleado), tipo de jornada (completa/media), equipos, departamentos, supervisores, jornada semanal, horario flexible y días laborales por persona, avance semanal |
| **Control de horas** (admin/supervisor) | Vista semanal por persona: carga diaria vs. jornada esperada según tipo (completa/media), estados Sin carga / Incompleto / OK, notificación automática y manual a quien no cargó, **validación semanal** por el admin, detección de horas extra con envío a supervisión |
| **Horas extra** | Detectadas por semana en Control de horas → se informan → aprobación/rechazo del supervisor con comentario → el saldo aprobado queda disponible para recuperar con una ausencia de tipo "Compensación de horas" (pestaña Horas extra en Ausencias) |
| **Ausencias** | 11 tipos (vacaciones, licencias, medio día, remoto, etc.), fecha + franja horaria, motivo, adjuntos, estados Pendiente/Aprobado/Rechazado, flujo de aprobación con comentario del supervisor, saldo de vacaciones |
| **Calendario corporativo** | Cuatro categorías unificadas: Feriado/No laborable, Cumpleaños (automáticos desde la ficha de cada persona), Capacitación y Ausencia (vacaciones, licencias y todo lo aprobado) — filtrables |
| **Vacaciones por antigüedad** | Se calculan desde la **fecha de ingreso**: 1 día laborable por mes trabajado hasta 10 el primer año; luego 10 días laborables por año. Vencen en el aniversario siguiente y se notifica desde 3 meses antes |
| **Proyectos con equipo** | Cada proyecto tiene miembros asignados; los empleados solo ven los proyectos donde participan (admin/supervisor ven todo) |
| **Reportes** | Horas por proyecto/cliente/empleado, extras, utilización, balance, monto facturable; filtros por período/persona/cliente/proyecto; exportación CSV (Excel) y PDF (impresión) |
| **Dashboard** | Tarjetas: hoy/semana/mes, facturables, pendientes, extras, vacaciones disponibles, proyectos activos; gráfico de barras por día, dona por proyecto, conectados, próximas licencias y eventos |
| **Notificaciones** | Panel con recordatorios de cronómetro, solicitudes, aprobaciones, feriados próximos, falta de carga |
| **Administración** | Configuración de empresa (país, zona horaria, moneda, jornada por defecto), roles y permisos, tipos de licencia, **registro de auditoría** de todas las modificaciones |
| **Integraciones** | **Pendiente de implementación** — se listan las herramientas previstas (Google/Outlook Calendar, Teams, Slack, Jira, Notion, ACC, API REST, Webhooks) sin activar |

## Acceso y roles (demo)

Al abrir la app se muestra un **login por email y clave**. Usuarios de demostración (clic en la tarjeta para autocompletar):

| Usuario | Email | Clave | Rol | Vista |
|---|---|---|---|---|
| Emmanuel Gotte | ea.gotte@gmail.com | `admin123` | Admin | Completa (gestión, control de horas, administración, integraciones) |
| Carla Domínguez | carla@quantia.com | `carla123` | Supervisor | Completa + aprobaciones |
| Martín Suárez | martin@quantia.com | `martin123` | Empleado | Básica (tiempo, calendario, dashboard, reportes propios, gestión) |
| Lucía Ferrer | lucia@quantia.com | `lucia123` | Empleado | Básica |

Los empleados solo ven sus propios reportes y solicitudes; el botón ⏻ del lateral cierra la sesión. En **Gestión → Registro** queda la trazabilidad completa de cada solicitud: quién la pidió, quién la aprobó/rechazó/validó y cuándo.

## Características técnicas

- Tema claro/oscuro (toggle en la barra superior), responsive (escritorio/tablet/móvil con menú lateral colapsable), búsqueda global (proyectos, personas, registros, eventos).
- Accesibilidad: roles ARIA en modales/tabs/switches, contraste AA, navegación por teclado en formularios.
- Estado global con reducer + persistencia; componentes reutilizables (`src/components/ui.tsx`).

## Estado actual y camino a producción

Es un **prototipo funcional front-end**: los datos viven en el navegador. Para producción faltaría el backend, para el cual la app ya está modelada:

- **API REST** (p. ej. Node/NestJS o .NET) con las mismas entidades de `src/types.ts`.
- **Base multi-tenant**: PostgreSQL con columna `tenant_id` en todas las tablas + RLS (row-level security).
- **Autenticación OAuth** Google/Microsoft (p. ej. Auth.js o Azure AD B2C) con roles ya definidos.
- **Auditoría**: el patrón ya existe en el reducer (`withAudit`); en backend sería un interceptor.
- Integraciones reales vía OAuth de cada proveedor + webhooks salientes.
