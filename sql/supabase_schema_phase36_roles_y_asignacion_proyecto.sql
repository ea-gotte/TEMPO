-- Fase 36: roles por proyecto compartidos y asignación teórica mensual.
--
-- Los roles por proyecto (Project Manager, Líder Funcional, Coordinador...) vivían
-- solo en el navegador de cada persona. Pasan a la base para que el organigrama y
-- los permisos sean iguales para todos. Se agrega además la asignación teórica:
-- qué % de su tiempo del mes le corresponde a cada persona en cada proyecto.
--
-- Quién puede qué:
--   - Roles: los ven el staff y quienes participan del proyecto. Los editan el
--     staff y el Project Manager de ese proyecto.
--   - Asignación y horas por persona: el staff, y el supervisor en los proyectos
--     donde participa. Cada persona ve además su propia asignación.
--   - Horas totales del proyecto (sin detalle por persona): el staff y quienes
--     participan, para que el avance no se calcule solo con las horas propias.
-- Se puede correr más de una vez.

-- ============================================================
-- 1. Roles por proyecto
-- ============================================================
create table if not exists public.project_role_assignments (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (char_length(role_key) between 1 and 64),
  -- Nombre del rol al asignarlo: el catálogo de roles sigue en cada navegador, y
  -- un rol propio creado en otro navegador se tiene que poder leer igual.
  role_label text check (char_length(role_label) <= 120),
  created_at timestamptz not null default now(),
  unique (project_id, user_id, role_key)
);

create index if not exists project_role_assignments_user_idx
  on public.project_role_assignments (user_id);

alter table public.project_role_assignments enable row level security;

-- ============================================================
-- 2. Funciones de permisos. Corren con los permisos de su dueño porque las
--    políticas de la tabla anterior se consultan a sí mismas.
-- ============================================================
create or replace function public.is_project_participant(p_project text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.projects p
      where p.id = p_project and auth.uid()::text = any(p.member_ids)
    )
    or exists (
      select 1 from public.project_role_assignments a
      where a.project_id = p_project and a.user_id = auth.uid()
    );
$$;

create or replace function public.is_project_manager(p_project text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_role_assignments a
    where a.project_id = p_project and a.user_id = auth.uid() and a.role_key = 'lider_proyecto'
  );
$$;

create or replace function public.can_view_project_analytics(p_project text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff(auth.uid())
    or (
      exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'supervisor')
      and public.is_project_participant(p_project)
    );
$$;

revoke all on function public.is_project_participant(text) from public, anon;
revoke all on function public.is_project_manager(text) from public, anon;
revoke all on function public.can_view_project_analytics(text) from public, anon;
grant execute on function public.is_project_participant(text) to authenticated;
grant execute on function public.is_project_manager(text) to authenticated;
grant execute on function public.can_view_project_analytics(text) to authenticated;

-- Las filas no se editan: cambiar un rol es borrar una fila y crear otra.
drop policy if exists "project_roles_select" on public.project_role_assignments;
create policy "project_roles_select" on public.project_role_assignments
  for select to authenticated
  using (public.is_staff(auth.uid()) or public.is_project_participant(project_id));

drop policy if exists "project_roles_insert" on public.project_role_assignments;
create policy "project_roles_insert" on public.project_role_assignments
  for insert to authenticated
  with check (public.is_staff(auth.uid()) or public.is_project_manager(project_id));

drop policy if exists "project_roles_delete" on public.project_role_assignments;
create policy "project_roles_delete" on public.project_role_assignments
  for delete to authenticated
  using (public.is_staff(auth.uid()) or public.is_project_manager(project_id));

revoke all on public.project_role_assignments from public, anon, authenticated;
grant select, insert, delete on public.project_role_assignments to authenticated;

-- ============================================================
-- 3. Asignación teórica mensual
-- ============================================================
create table if not exists public.project_allocations (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Primer día del mes
  month date not null check (extract(day from month) = 1),
  pct numeric(5,2) not null check (pct >= 0 and pct <= 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id, month)
);

create index if not exists project_allocations_user_month_idx
  on public.project_allocations (user_id, month);

alter table public.project_allocations enable row level security;

drop policy if exists "project_allocations_select" on public.project_allocations;
create policy "project_allocations_select" on public.project_allocations
  for select to authenticated
  using (user_id = auth.uid() or public.can_view_project_analytics(project_id));

drop policy if exists "project_allocations_insert" on public.project_allocations;
create policy "project_allocations_insert" on public.project_allocations
  for insert to authenticated
  with check (public.can_view_project_analytics(project_id));

drop policy if exists "project_allocations_update" on public.project_allocations;
create policy "project_allocations_update" on public.project_allocations
  for update to authenticated
  using (public.can_view_project_analytics(project_id))
  with check (public.can_view_project_analytics(project_id));

drop policy if exists "project_allocations_delete" on public.project_allocations;
create policy "project_allocations_delete" on public.project_allocations
  for delete to authenticated
  using (public.can_view_project_analytics(project_id));

revoke all on public.project_allocations from public, anon, authenticated;
grant select, insert, update, delete on public.project_allocations to authenticated;

-- Quién y cuándo lo cambió lo decide la base, no lo que mande el navegador.
create or replace function public.stamp_project_allocation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.stamp_project_allocation() from public, anon, authenticated;

drop trigger if exists trg_stamp_project_allocation on public.project_allocations;
create trigger trg_stamp_project_allocation
  before insert or update on public.project_allocations
  for each row execute function public.stamp_project_allocation();

-- ============================================================
-- 4. Horas reales agregadas. La política de time_entries solo deja ver las propias
--    (y las de la cadena de mando), así que un supervisor no podría calcular el
--    real de su proyecto. Estas funciones devuelven totales, nunca registros.
-- ============================================================
create or replace function public.project_hours_by_month(p_from date, p_to date)
returns table (project_id text, user_id uuid, month date, minutes bigint, user_total_minutes bigint)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select p.id from public.projects p where public.can_view_project_analytics(p.id)
  ),
  entries as (
    select t.project_id, t.user_id, date_trunc('month', t.date)::date as month, (t.end_min - t.start_min) as minutes
    from public.time_entries t
    -- Meses completos, sea cual sea el día que se pida
    where t.date >= date_trunc('month', p_from)::date
      and t.date < (date_trunc('month', p_to) + interval '1 month')::date
  ),
  totals as (
    select e.user_id, e.month, sum(e.minutes)::bigint as total
    from entries e
    group by e.user_id, e.month
  )
  select e.project_id, e.user_id, e.month, sum(e.minutes)::bigint, max(tot.total)::bigint
  from entries e
  join allowed a on a.id = e.project_id
  join totals tot on tot.user_id = e.user_id and tot.month = e.month
  group by e.project_id, e.user_id, e.month;
$$;

create or replace function public.project_total_minutes()
returns table (project_id text, minutes bigint)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select p.id from public.projects p
    where public.is_staff(auth.uid()) or public.is_project_participant(p.id)
  )
  select t.project_id, sum(t.end_min - t.start_min)::bigint
  from public.time_entries t
  join allowed a on a.id = t.project_id
  group by t.project_id;
$$;

revoke all on function public.project_hours_by_month(date, date) from public, anon;
revoke all on function public.project_total_minutes() from public, anon;
grant execute on function public.project_hours_by_month(date, date) to authenticated;
grant execute on function public.project_total_minutes() to authenticated;

-- ============================================================
-- 5. Tiempo real
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'project_role_assignments') then
    alter publication supabase_realtime add table public.project_role_assignments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'project_allocations') then
    alter publication supabase_realtime add table public.project_allocations;
  end if;
end $$;
