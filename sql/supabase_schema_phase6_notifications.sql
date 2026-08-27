-- Fase 6: notificaciones dirigidas a un usuario específico, en base de datos real.
-- Hasta ahora vivían solo en localStorage: cuando un admin notificaba a alguien
-- (recordatorio de carga, solicitud resuelta, horas extra resueltas), la notificación
-- solo quedaba en el propio navegador del admin — nunca le llegaba a la otra persona.

create table public.notifications (
    id text primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    kind text not null,
    title text not null,
    body text not null,
    date date not null,
    read boolean not null default false,
    created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.notifications enable row level security;

-- Cada persona ve solo sus propias notificaciones
create policy "select_own_notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

-- Cualquier usuario puede generar una notificación propia (recordatorios automáticos,
-- confirmaciones); admin/supervisor también pueden generarlas para otra persona
-- (recordatorio de carga, resolución de solicitudes).
create policy "insert_own_or_staff_notifications"
on public.notifications for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff(auth.uid()));

-- Solo el propio destinatario marca sus notificaciones como leídas
create policy "update_own_notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.notifications to authenticated;
alter publication supabase_realtime add table public.notifications;
