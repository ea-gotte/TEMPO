-- Elimina por completo el concepto de Equipos (Estructuras, BIM, Administración) y
-- Departamentos: las tablas y las columnas en profiles que los referenciaban.
-- Irreversible: borra los datos de esas dos tablas.

drop table if exists public.teams;
drop table if exists public.departments;

alter table public.profiles drop column if exists team_id;
alter table public.profiles drop column if exists department_id;
