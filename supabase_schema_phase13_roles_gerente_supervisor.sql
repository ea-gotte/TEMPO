-- Fase 13: rediseño de roles (admin / gerente / supervisor / usuario).
-- El rol "supervisor" pasa a ser una vista acotada de Control de horas sobre
-- su propio equipo (profiles.supervisor_id), en vez del rol amplio de antes.
-- Ese rol amplio ahora lo cubre "gerente" (todo lo de admin salvo Administración).
-- El equipo de cada supervisor lo arma un admin/gerente desde Equipo (campo
-- "Supervisor" en el perfil de cada persona) — el supervisor NO elige su
-- propio equipo, solo lo consulta en Control de horas.
--
-- Este archivo es seguro de correr más de una vez (por si hay que repetirlo
-- después de corregir algo): todos los "create policy"/"create or replace
-- function" van precedidos de su "drop ... if exists" correspondiente, con el
-- MISMO nombre final.

-- ============================================================
-- 0. profiles.role todavía tiene el check constraint original
--    (admin/supervisor/usuario) — hay que sumarle 'gerente' antes que
--    nada, si no cualquier UPDATE/INSERT con ese rol falla.
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
    check (role in ('admin', 'gerente', 'supervisor', 'usuario'));

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
drop policy if exists "time_entries_select_scope" on public.time_entries;

create policy "time_entries_select_scope"
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
drop policy if exists "staff_write_corp_events" on public.corp_events;

create policy "staff_write_corp_events"
on public.corp_events for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));

-- ============================================================
-- 7. profiles: revertir el intento de que el supervisor arme su propio
--    equipo — quedó decidido que eso lo sigue haciendo solo un admin/gerente
--    desde Equipo. Se limpia lo que se haya llegado a crear (política y
--    función is_supervisor()) y se deja el trigger de guarda de la fase 10
--    (fix P0) tal como estaba, sin la rama para supervisores.
--
--    De paso, se exime al trigger cuando auth.uid() es null: eso pasa cuando
--    la actualización se corre directo desde el SQL Editor (o cualquier
--    conexión con credenciales de servidor), no a través de la app — ahí no
--    hay sesión de Supabase Auth, así que is_staff(null) siempre da false y
--    el trigger terminaba bloqueando hasta las migraciones del propio admin
--    (como el UPDATE del punto 8 más abajo, supervisor -> gerente).
--
--    También se saca "name" de la lista de campos bloqueados: ahora cualquier
--    persona puede cambiar su propio nombre desde "Mi Perfil". La única forma
--    de llegar acá sin ser staff es la política "own profile" (auth.uid() =
--    id), así que este chequeo siempre es sobre la propia fila — no hace
--    falta distinguir "editando la mía" de "editando la de otro".
-- ============================================================
drop policy if exists "supervisor_manage_team_membership" on public.profiles;
drop function if exists public.is_supervisor(uuid);

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.must_change_password is distinct from old.must_change_password
     or new.online is distinct from old.online
     or new.email is distinct from old.email
     or new.jornada is distinct from old.jornada
     or new.weekly_hours is distinct from old.weekly_hours
     or new.work_days is distinct from old.work_days
     or new.day_start is distinct from old.day_start
     or new.day_end is distinct from old.day_end
     or new.birthday is distinct from old.birthday
     or new.hire_date is distinct from old.hire_date
     or new.supervisor_id is distinct from old.supervisor_id
  then
    raise exception 'No tenés permiso para modificar ese campo de tu perfil.';
  end if;

  return new;
end;
$$;

-- ============================================================
-- 8. Migrar cuentas existentes: el "supervisor" de antes tenía permisos
--    amplios (equivalentes al nuevo "gerente"), no la vista acotada de ahora.
-- ============================================================
update public.profiles set role = 'gerente' where role = 'supervisor';
