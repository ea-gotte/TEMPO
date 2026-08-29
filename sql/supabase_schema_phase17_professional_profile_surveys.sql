-- Fase 17: Perfil profesional (formación editable directa) + Encuestas
-- (autopercepción/habilidades, distinta de la experiencia real de Horas de
-- vuelo). Ver la conversación del 2026-08-29 para el diseño completo.

-- ============================================================
-- 0. Arreglo de la Fase 16: flight_categories/flight_activities quedaron
-- fuera de la publicación de Realtime (la app las escucha desde store.tsx,
-- pero sin esto los cambios de otra pestaña/usuario no llegan en vivo).
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'flight_categories'
  ) then
    alter publication supabase_realtime add table public.flight_categories;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'flight_activities'
  ) then
    alter publication supabase_realtime add table public.flight_activities;
  end if;
end $$;

-- ============================================================
-- 1. Perfil profesional: una fila por persona. Los años de experiencia
-- (laboral / BIM) se calculan siempre en el cliente desde la fecha de inicio,
-- nunca se guarda un número de años fijo.
-- ============================================================
create table if not exists public.professional_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  work_experience_since date,
  bim_experience_since date,
  education jsonb not null default '[]'::jsonb,
  courses jsonb not null default '[]'::jsonb
);

alter table public.professional_profiles enable row level security;

-- Cada quien ve/edita el propio perfil; el staff (admin/gerente) puede ver y
-- cargar el de cualquiera (p.ej. RR.HH. completando datos por la persona).
create policy "select_own_or_staff_professional_profile" on public.professional_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));

create policy "write_own_or_staff_professional_profile" on public.professional_profiles
  for all to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()))
  with check (id = auth.uid() or public.is_staff(auth.uid()));

grant select, insert, update on public.professional_profiles to authenticated;
alter publication supabase_realtime add table public.professional_profiles;

-- ============================================================
-- 2. Encuestas: preguntas libres por ronda (sin catálogo fijo de
-- habilidades), lanzadas a mano por el admin.
-- ============================================================
create table if not exists public.surveys (
  id text primary key,
  title text not null,
  questions jsonb not null default '[]'::jsonb,
  launched_at timestamptz not null default now(),
  due_date date not null,
  created_by uuid not null references public.profiles(id)
);

alter table public.surveys enable row level security;

create policy "select_surveys" on public.surveys
  for select to authenticated using (true);

create policy "admin_write_surveys" on public.surveys
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

grant select, insert, update on public.surveys to authenticated;
alter publication supabase_realtime add table public.surveys;

-- ============================================================
-- 3. Respuestas: cada persona responde una vez por encuesta (upsert propio);
-- el staff puede leer las de cualquiera para ver el perfil de otra persona.
-- ============================================================
create table if not exists public.survey_responses (
  id text primary key,
  survey_id text not null references public.surveys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (survey_id, user_id)
);

alter table public.survey_responses enable row level security;

create policy "select_own_or_staff_survey_responses" on public.survey_responses
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create policy "insert_own_survey_response" on public.survey_responses
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "update_own_survey_response" on public.survey_responses
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.survey_responses to authenticated;
alter publication supabase_realtime add table public.survey_responses;
