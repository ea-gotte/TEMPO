-- Fase 16: "Horas de vuelo" — experiencia profesional acumulada a partir de la
-- actividad real en proyectos. Ver el diseño completo en la conversación del
-- 2026-08-28 (Categoría -> Actividad como catálogo configurable, sin texto
-- suelto ni datos duplicados: las horas se calculan siempre desde
-- time_entries, nunca se guardan como total).

-- ============================================================
-- 1. Catálogo: categorías y actividades
-- ============================================================
create table if not exists public.flight_categories (
  id text primary key,
  name text not null,
  active boolean not null default true
);

create table if not exists public.flight_activities (
  id text primary key,
  category_id text not null references public.flight_categories(id) on delete cascade,
  name text not null,
  active boolean not null default true
);

alter table public.flight_categories enable row level security;
alter table public.flight_activities enable row level security;

-- Lectura: cualquier autenticado (hace falta para mostrar el perfil profesional
-- y el selector de actividad al editar un proyecto).
create policy "select_flight_categories" on public.flight_categories
  for select to authenticated using (true);
create policy "select_flight_activities" on public.flight_activities
  for select to authenticated using (true);

-- Escritura: solo admin (el enunciado pide específicamente "un administrador").
create policy "admin_write_flight_categories" on public.flight_categories
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin_write_flight_activities" on public.flight_activities
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

grant select on public.flight_categories, public.flight_activities to authenticated;
grant insert, update on public.flight_categories, public.flight_activities to authenticated;

-- ============================================================
-- 2. Proyectos: a qué actividad de horas de vuelo suman sus horas cargadas
-- ============================================================
alter table public.projects
  add column if not exists flight_activity_id text references public.flight_activities(id) on delete set null;

-- ============================================================
-- 3. Catálogo inicial (mismo que el seed local en src/data.ts, para que
-- coincidan los ids entre el fallback local y la base real)
-- ============================================================
insert into public.flight_categories (id, name, active) values
  ('cat-modelado-bim', 'Modelado BIM', true),
  ('cat-gestion-bim', 'Gestión BIM', true)
on conflict (id) do nothing;

insert into public.flight_activities (id, category_id, name, active) values
  ('act-general', 'cat-modelado-bim', 'Modelado BIM - General', true),
  ('act-hospitales', 'cat-modelado-bim', 'Modelado BIM - Hospitales', true),
  ('act-scan-to-bim', 'cat-modelado-bim', 'Modelado BIM - Scan to BIM', true),
  ('act-data-centers', 'cat-modelado-bim', 'Modelado BIM - Data Centers', true),
  ('act-obra-civil', 'cat-modelado-bim', 'Modelado BIM - Obra Civil', true),
  ('act-viales', 'cat-modelado-bim', 'Modelado BIM - Viales', true),
  ('act-ferroviario', 'cat-modelado-bim', 'Modelado BIM - Ferroviario', true),
  ('act-hidraulica', 'cat-modelado-bim', 'Modelado BIM - Hidráulica', true),
  ('act-documentacion', 'cat-gestion-bim', 'Gestión BIM - Documentación', true),
  ('act-4d5d', 'cat-gestion-bim', 'Gestión BIM - 4D / 5D', true)
on conflict (id) do nothing;
