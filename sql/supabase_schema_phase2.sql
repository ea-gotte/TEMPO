-- Fase 2: clientes, proyectos, equipos y departamentos en base de datos real.
-- Se siembran con los mismos datos que hoy viven en el estado local (data.ts)
-- para que la migracion no deje la pantalla en blanco.

create table public.clients (
    id text primary key,
    name text not null,
    color text not null,
    archived boolean not null default false
);

create table public.teams (
    id text primary key,
    name text not null
);

create table public.departments (
    id text primary key,
    name text not null
);

create table public.projects (
    id text primary key,
    client_id text references public.clients(id) on delete set null,
    name text not null,
    color text not null,
    status text not null check (status in ('activo', 'pausado', 'completado', 'archivado')),
    billable boolean not null default true,
    hourly_rate numeric not null default 0,
    cost_rate numeric not null default 0,
    budget_hours numeric,
    tasks jsonb not null default '[]',
    member_ids text[] not null default '{}',
    notion_url text
);

alter table public.clients enable row level security;
alter table public.teams enable row level security;
alter table public.departments enable row level security;
alter table public.projects enable row level security;

-- Lectura: cualquier usuario autenticado (el filtrado por "solo mis proyectos" ya lo hace el cliente)
create policy "select_all_clients" on public.clients for select to authenticated using (true);
create policy "select_all_teams" on public.teams for select to authenticated using (true);
create policy "select_all_departments" on public.departments for select to authenticated using (true);
create policy "select_all_projects" on public.projects for select to authenticated using (true);

-- Escritura: solo admin/supervisor (reutiliza is_admin/is_staff ya creadas en fases anteriores)
create policy "staff_write_clients" on public.clients for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "staff_write_teams" on public.teams for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "staff_write_departments" on public.departments for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "staff_write_projects" on public.projects for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.projects to authenticated;

alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.departments;
alter publication supabase_realtime add table public.projects;

-- Datos semilla (mismos ids que data.ts, para que time_entries existentes sigan coincidiendo)
insert into public.clients (id, name, color) values
  ('c1', 'Constructora Andes', '#0ea5e9'),
  ('c2', 'Grupo Meridiano', '#f97316'),
  ('c3', 'Interno', '#8b5cf6');

insert into public.teams (id, name) values
  ('e1', 'Estructuras'),
  ('e2', 'BIM'),
  ('e3', 'Administración');

insert into public.departments (id, name) values
  ('d1', 'Ingeniería'),
  ('d2', 'Administración');

-- Nota: member_ids se siembra vacio porque los ids demo (u1..u4) no corresponden a
-- las cuentas reales de Supabase Auth; hay que reasignar el equipo desde la web.
insert into public.projects (id, client_id, name, color, status, billable, hourly_rate, cost_rate, budget_hours, tasks, member_ids, notion_url) values
  ('p1', 'c1', 'Nave industrial — Parque Sur', '#5b6cff', 'activo', true, 55, 30, 320,
    '[{"id":"t1","name":"Modelado estructural"},{"id":"t2","name":"Memoria de cálculo"},{"id":"t3","name":"Planos de detalle"}]', '{}', null),
  ('p2', 'c2', 'Edificio Meridiano 24', '#12b5a5', 'activo', true, 60, 32, 480,
    '[{"id":"t4","name":"Instalaciones"},{"id":"t5","name":"Cómputo y presupuesto"}]', '{}', null),
  ('p3', 'c1', 'Coordinación BIM — Hospital Norte', '#f5a524', 'activo', true, 48, 28, 200,
    '[{"id":"t6","name":"Documentación BIM"}]', '{}', null),
  ('p4', 'c3', 'Gestión interna', '#f0446c', 'activo', false, 0, 25, null, '[]', '{}', null),
  ('p5', 'c2', 'Auditoría estructural — Depósitos', '#84cc16', 'completado', true, 52, 30, 120, '[]', '{}', null);
