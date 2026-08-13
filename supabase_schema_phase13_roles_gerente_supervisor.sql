-- Fase 13: rediseño de roles (admin / gerente / supervisor / usuario).
-- El rol "supervisor" pasa a ser una vista acotada de Control de horas sobre
-- su propio equipo (profiles.supervisor_id), en vez del rol amplio de antes.
-- Ese rol amplio ahora lo cubre "gerente" (todo lo de admin salvo Administración).

-- ============================================================
-- 1. is_staff(): ahora es admin/gerente (antes admin/supervisor).
--    Se reutiliza en todas las políticas existentes que ya llamaban a esta
--    función, así que no hace falta tocarlas una por una.
-- ============================================================
create or replace function public.is_staff(check_uid uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = check_uid and role in ('admin', 'gerente')
  );
end;
$$;

-- ============================================================
-- 2. time_entries: el supervisor necesita ver las horas de su equipo
--    (Control de horas), no solo las propias.
-- ============================================================
drop policy if exists "Ver propios o de todo el equipo si es staff" on public.time_entries;

create policy "Ver propios, de todo el equipo si es staff, o del equipo si es supervisor"
on public.time_entries for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
    or exists (
        select 1 from public.profiles emp
        where emp.id = time_entries.user_id and emp.supervisor_id = auth.uid()
    )
);

-- ============================================================
-- 3. overtime_requests: el supervisor ve e informa horas extra de su equipo
--    (botón "A supervisión" en Control de horas inserta a nombre de otra persona).
-- ============================================================
drop policy if exists "select_own_or_staff_overtime" on public.overtime_requests;

create policy "select_own_or_staff_overtime"
on public.overtime_requests for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
    or exists (
        select 1 from public.profiles emp
        where emp.id = overtime_requests.user_id and emp.supervisor_id = auth.uid()
    )
);

drop policy if exists "insert_own_or_staff_overtime" on public.overtime_requests;

create policy "insert_own_or_staff_overtime"
on public.overtime_requests for insert
to authenticated
with check (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
    or exists (
        select 1 from public.profiles emp
        where emp.id = overtime_requests.user_id and emp.supervisor_id = auth.uid()
    )
);

-- staff_resolve_overtime (aprobar/rechazar) queda solo para is_staff() (admin/gerente):
-- el supervisor ya no aprueba horas extra, per diseño.

-- ============================================================
-- 4. notifications: el supervisor notifica a su equipo (recordatorio de carga
--    manual y el aviso automático de "sin carga") a nombre de otra persona.
-- ============================================================
drop policy if exists "insert_own_or_staff_notifications" on public.notifications;

create policy "insert_own_or_staff_notifications"
on public.notifications for insert
to authenticated
with check (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
    or exists (
        select 1 from public.profiles emp
        where emp.id = notifications.user_id and emp.supervisor_id = auth.uid()
    )
);

-- ============================================================
-- 5. absence_requests: estas dos políticas quedaron con el chequeo de rol
--    escrito a mano (role in ('admin','supervisor')) en vez de is_staff(), así
--    que la redefinición del punto 1 no las alcanza — hay que tocarlas directo.
--    El supervisor ya no aprueba ni ve las ausencias de su equipo (solo las
--    propias, como cualquier usuario); eso ahora es exclusivo de admin/gerente.
-- ============================================================
drop policy if exists "Ver propias o de todo el equipo si es staff" on public.absence_requests;

create policy "Ver propias o de todo el equipo si es staff"
on public.absence_requests for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
);

drop policy if exists "Staff puede resolver solicitudes" on public.absence_requests;

create policy "Staff puede resolver solicitudes"
on public.absence_requests for update
to authenticated
using (public.is_staff(auth.uid()));

-- ============================================================
-- 6. corp_events: gerente también puede crear eventos corporativos, no solo admin.
-- ============================================================
drop policy if exists "admin_write_corp_events" on public.corp_events;

create policy "staff_write_corp_events"
on public.corp_events for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

-- ============================================================
-- 7. Migrar cuentas existentes: el "supervisor" de antes tenía permisos
--    amplios (equivalentes al nuevo "gerente"), no la vista acotada de ahora.
-- ============================================================
update public.profiles set role = 'gerente' where role = 'supervisor';
