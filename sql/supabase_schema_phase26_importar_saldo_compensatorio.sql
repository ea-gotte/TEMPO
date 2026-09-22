-- Fase 26: importación ÚNICA del saldo de días compensatorios (festivos/fines
-- de semana trabajados, menos recuperados) que venía llevándose en la
-- planilla "Vacaciones Quantia LATAM 2025-26.xlsx" (hojas "Vacaciones 2025
-- (V2)" y "Vacaciones 2026 (V2)"), calculado el 2026-09-22.
--
-- No se crea ninguna tabla ni mecanismo nuevo: TEMPO ya lleva este saldo con
-- overtimeBalance() (src/store.tsx), que suma los registros "Aprobado" de
-- overtime_requests y les resta lo ya usado con ausencias de tipo
-- "Compensación de horas". Este script simplemente carga UN registro
-- "Aprobado" por persona con el saldo acumulado hasta hoy, para que no
-- arranquen de cero. Se puede correr una sola vez: los ids son fijos
-- ('ot-import-<id de la persona>') y el ON CONFLICT evita duplicarlos si se
-- corre por error una segunda vez.
--
-- IMPORTANTE — antes de correr el INSERT de abajo, correr este SELECT y
-- revisar que las 22 personas aparezcan (columna "encontrado" = 1). Si falta
-- alguna, es porque su nombre en profiles.name no coincide exactamente con el
-- de la planilla (mayúsculas, tildes, "Mª" vs "Ma", etc.) — corregir el
-- nombre en la lista de VALUES más abajo antes de insertar.
--
-- select v.nombre, count(p.id) as encontrado
-- from (values
--   ('Emmanuel Gotte'),('Agustin Arenas'),('Alfredo Natera'),('Diego Hernan'),
--   ('Nadia Agulles'),('Agustina Torres'),('Danae Tedin'),('Sebastian Gastiazoro'),
--   ('Angel Grueso'),('Belen Huanca'),('Martin Moreno'),('Hugo Santucho'),
--   ('Lorena Manrique'),('Nicolas Franco'),('Lucrecia Villasuso'),('Rafael Cárdenas'),
--   ('Camila Vivas'),('Guido Pedroni'),('Juan David Achiardi'),('Fernando Franco'),
--   ('Fabricio Beccacece'),('Paula Zecchin')
-- ) as v(nombre)
-- left join public.profiles p on p.name = v.nombre
-- group by v.nombre
-- order by encontrado, v.nombre;
--
-- NO SE IMPORTAN (saldo negativo en la planilla — TEMPO no representa un
-- saldo en contra; si corresponde, resolver a mano con cada persona):
--   Ana Garelli (-3.0), Jeremías Newen (-2.0), Martín Orta (-2.0),
--   Luciano Amoreti (-1.0).

insert into public.overtime_requests (id, user_id, week_start, minutes, status, created_at, resolved_at, supervisor_comment)
select
  'ot-import-' || p.id::text,
  p.id,
  (date_trunc('week', current_date) - interval '8 weeks')::date, -- ~10 meses de vigencia antes de vencer (regla de 1 año), y no coincide con la semana real de hoy
  round(
    v.dias * (case when p.jornada = 'media' then 4 * 60.0
                    else (p.weekly_hours * 60.0) / greatest(1, array_length(p.work_days, 1)) end)
  )::integer,
  'Aprobado',
  current_date,
  current_date,
  'Importado el 2026-09-22 desde la planilla "Vacaciones Quantia LATAM 2025-26.xlsx" (saldo acumulado 2025-2026, festivos/FDS trabajados menos recuperados).'
from (values
  ('Emmanuel Gotte', 33.0),
  ('Agustin Arenas', 18.0),
  ('Alfredo Natera', 14.0),
  ('Diego Hernan', 13.5),
  ('Nadia Agulles', 13.5),
  ('Agustina Torres', 10.0),
  ('Danae Tedin', 8.5),
  ('Sebastian Gastiazoro', 8.5),
  ('Angel Grueso', 7.0),
  ('Belen Huanca', 6.5),
  ('Martin Moreno', 6.5),
  ('Hugo Santucho', 6.0),
  ('Lorena Manrique', 5.5),
  ('Nicolas Franco', 5.5),
  ('Lucrecia Villasuso', 4.0),
  ('Rafael Cárdenas', 4.0),
  ('Camila Vivas', 3.5),
  ('Guido Pedroni', 2.0),
  ('Juan David Achiardi', 2.0),
  ('Fernando Franco', 1.5),
  ('Fabricio Beccacece', 1.0),
  ('Paula Zecchin', 1.0)
) as v(nombre, dias)
join public.profiles p on p.name = v.nombre
on conflict (id) do nothing;
