-- Subproyectos: entidad propia dentro de un proyecto (nombre, estado, presupuesto de
-- horas y tarifa propia), seleccionable al cargar tiempo junto con el proyecto.

create table public.sub_projects (
    id text primary key,
    project_id text not null references public.projects(id) on delete cascade,
    name text not null,
    status text not null check (status in ('activo', 'pausado', 'completado', 'archivado')),
    billable boolean not null default true,
    hourly_rate numeric not null default 0,
    cost_rate numeric not null default 0,
    budget_hours numeric
);

alter table public.sub_projects enable row level security;

-- Mismo esquema de permisos que projects: lectura para cualquier autenticado,
-- escritura solo para admin/supervisor.
create policy "select_all_sub_projects" on public.sub_projects for select to authenticated using (true);
create policy "staff_write_sub_projects" on public.sub_projects for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

grant select, insert, update, delete on public.sub_projects to authenticated;
alter publication supabase_realtime add table public.sub_projects;

-- time_entries necesita la nueva columna para poder asociar un registro a un subproyecto
alter table public.time_entries add column if not exists sub_project_id text references public.sub_projects(id) on delete set null;
