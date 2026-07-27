-- Corrección: "Días laborales" y "Huso horario base/adicional" (Calendario) se
-- editan en la UI pero nunca se guardaban en el servidor.
--
-- - work_days: la tabla profiles no tenía esta columna, y el mapeo de perfiles al
--   cargar la app pisaba siempre con [1,2,3,4,5] sin importar lo guardado.
-- - calendar_tz / calendar_tz2 ("Huso horario base" en Calendario): se guardaban
--   solo en memoria local (nunca se mandaban a Supabase), así que se perdían al
--   recargar o entrar desde otro dispositivo.

alter table public.profiles add column if not exists work_days integer[] not null default '{1,2,3,4,5}';
alter table public.profiles add column if not exists calendar_tz text;
alter table public.profiles add column if not exists calendar_tz2 text;
