-- Fase 22: el supervisor puede VER (nunca editar) el calendario de quienes
-- tiene por debajo en su cadena de mando — directos e indirectos, no solo
-- sus reportes directos (ver Calendar.tsx, que ya reutiliza el mismo
-- getDownlineIds() de la Cadena de mando de Control de horas).
--
-- La policy de time_entries que ya existía (fase 13) solo dejaba ver al
-- supervisor los registros de sus reportes DIRECTOS (profiles.supervisor_id
-- = auth.uid()) — un supervisor de otros supervisores no recibía los
-- registros de los reportes indirectos. Esto ya era una limitación latente
-- para Control de horas con cadenas de más de un nivel; con el calendario
-- se vuelve más visible, así que de paso se corrige acá para los dos casos.

create or replace function public.is_in_supervisor_chain(supervisor_uid uuid, employee_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, supervisor_id from public.profiles where id = employee_uid
    union all
    select p.id, p.supervisor_id from public.profiles p
    join chain c on p.id = c.supervisor_id
  )
  select exists (select 1 from chain where supervisor_id = supervisor_uid);
$$;

drop policy if exists "time_entries_select_scope" on public.time_entries;
create policy "time_entries_select_scope"
on public.time_entries for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
    or public.is_in_supervisor_chain(auth.uid(), user_id)
);
