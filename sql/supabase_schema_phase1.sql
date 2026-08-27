-- Fase 1 de migración a base de datos real: registro de horas y ausencias.
-- Ejecutar en el SQL Editor de Supabase, después de supabase_schema.sql (requiere la tabla public.profiles).

-- ============================================================
-- 1. time_entries — registro de horas
-- ============================================================
create table public.time_entries (
    id text primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    project_id text,
    task_id text,
    description text not null default '',
    tag_ids text[] not null default '{}',
    date date not null,
    start_min integer not null,
    end_min integer not null,
    billable boolean not null default true,
    favorite boolean not null default false,
    recurring text check (recurring in ('diario', 'semanal')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.time_entries enable row level security;

-- Cada persona ve sus propios registros; admin/supervisor ven todos (para Control de horas y Reportes)
create policy "Ver propios o de todo el equipo si es staff"
on public.time_entries for select
to authenticated
using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'supervisor'))
);

-- Solo se crean/editan/borran los propios registros (igual que hoy en la UI)
create policy "Crear solo los propios"
on public.time_entries for insert
to authenticated
with check (user_id = auth.uid());

create policy "Editar solo los propios"
on public.time_entries for update
to authenticated
using (user_id = auth.uid());

create policy "Borrar solo los propios"
on public.time_entries for delete
to authenticated
using (user_id = auth.uid());

-- ============================================================
-- 2. absence_requests — solicitudes de ausencia
-- ============================================================
create table public.absence_requests (
    id text primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null,
    date_from date not null,
    date_to date not null,
    time_from text,
    time_to text,
    reason text not null default '',
    -- Los adjuntos se guardan como en el estado local (name/url/size); los url son data URLs en base64.
    -- Para archivos grandes conviene migrar a Supabase Storage más adelante.
    attachments jsonb not null default '[]',
    status text not null default 'Pendiente' check (status in ('Pendiente', 'Aprobado', 'Rechazado')),
    supervisor_comment text,
    created_at date not null default current_date,
    resolved_by uuid references public.profiles(id),
    resolved_at date
);

alter table public.absence_requests enable row level security;

-- Cada persona ve las propias; admin/supervisor ven todas (para aprobar, igual que hoy)
create policy "Ver propias o de todo el equipo si es staff"
on public.absence_requests for select
to authenticated
using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'supervisor'))
);

create policy "Crear solo las propias"
on public.absence_requests for insert
to authenticated
with check (user_id = auth.uid());

-- Solo admin/supervisor resuelven (aprueban/rechazan) solicitudes
create policy "Staff puede resolver solicitudes"
on public.absence_requests for update
to authenticated
using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'supervisor'))
);

-- ============================================================
-- 3. Habilitar Realtime: para que los cambios se reflejen entre usuarios sin recargar
-- ============================================================
alter publication supabase_realtime add table public.time_entries;
alter publication supabase_realtime add table public.absence_requests;
