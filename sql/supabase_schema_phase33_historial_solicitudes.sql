-- Fase 33: historial de devoluciones y respuestas en solicitudes de Gestión y horas extra.
-- Guarda cada observación de Recursos Humanos, la respuesta de la persona y la decisión final,
-- con quién y cuándo, para que la trazabilidad no pierda el ida y vuelta.
-- Ejecutar a mano en el SQL Editor de Supabase (después de la fase 32).

alter table public.absence_requests add column if not exists history jsonb not null default '[]';
alter table public.overtime_requests add column if not exists history jsonb not null default '[]';
