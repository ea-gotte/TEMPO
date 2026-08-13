-- Elimina el concepto de "Tareas" y las columnas de tarifa facturable / costo
-- interno de proyectos y subproyectos. Irreversible: borra esos datos.

alter table public.time_entries drop column if exists task_id;

alter table public.projects drop column if exists billable;
alter table public.projects drop column if exists hourly_rate;
alter table public.projects drop column if exists cost_rate;
alter table public.projects drop column if exists tasks;

alter table public.sub_projects drop column if exists billable;
alter table public.sub_projects drop column if exists hourly_rate;
alter table public.sub_projects drop column if exists cost_rate;
