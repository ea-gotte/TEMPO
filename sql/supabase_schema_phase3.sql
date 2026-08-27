-- Fase 3: horas extra, auditoria y calendario corporativo (capacitaciones/reuniones)
-- en base de datos real. Las notificaciones quedan locales a proposito (son avisos
-- personales que cada cliente genera al vuelo, no datos que deban compartirse).

-- ============================================================
-- overtime_requests — horas extra informadas y su aprobacion
-- ============================================================
create table public.overtime_requests (
    id text primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    week_start date not null,
    minutes integer not null,
    status text not null default 'Pendiente' check (status in ('Pendiente', 'Aprobado', 'Rechazado')),
    created_at date not null default current_date,
    resolved_by uuid references public.profiles(id),
    resolved_at date,
    supervisor_comment text
);

alter table public.overtime_requests enable row level security;

create policy "select_own_or_staff_overtime"
on public.overtime_requests for select
to authenticated
using (user_id = auth.uid() or public.is_staff(auth.uid()));

create policy "insert_own_overtime"
on public.overtime_requests for insert
to authenticated
with check (user_id = auth.uid());

create policy "staff_resolve_overtime"
on public.overtime_requests for update
to authenticated
using (public.is_staff(auth.uid()));

grant select, insert, update on public.overtime_requests to authenticated;
alter publication supabase_realtime add table public.overtime_requests;

-- ============================================================
-- audit_log — auditoria de acciones (hoy vivia solo en localStorage,
-- por lo que cada persona solo veia lo que paso en su propio navegador)
-- ============================================================
create table public.audit_log (
    id text primary key,
    at timestamp with time zone not null,
    user_id uuid not null references public.profiles(id) on delete cascade,
    action text not null,
    detail text not null default ''
);

alter table public.audit_log enable row level security;

-- Solo admin/supervisor pueden ver el historial completo
create policy "select_staff_audit"
on public.audit_log for select
to authenticated
using (public.is_staff(auth.uid()));

-- Cualquier usuario autenticado genera entradas propias (por cualquier accion que haga)
create policy "insert_own_audit"
on public.audit_log for insert
to authenticated
with check (user_id = auth.uid());

grant select, insert on public.audit_log to authenticated;
alter publication supabase_realtime add table public.audit_log;

-- ============================================================
-- corp_events — capacitaciones/reuniones del calendario corporativo
-- (los feriados NO van aca: ya viven en la tabla holidays desde la Fase 1b)
-- ============================================================
create table public.corp_events (
    id text primary key,
    date date not null,
    type text not null,
    title text not null
);

alter table public.corp_events enable row level security;

create policy "select_all_corp_events"
on public.corp_events for select
to authenticated
using (true);

-- Coincide con el gating actual de la UI: solo admin crea eventos corporativos
create policy "admin_write_corp_events"
on public.corp_events for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.corp_events to authenticated;
alter publication supabase_realtime add table public.corp_events;
