-- Fase 38: lectura rápida de time_entries.
--
-- La regla de lectura (fase 22) llamaba a is_staff() y a is_in_supervisor_chain()
-- POR CADA FILA: con más de 12.000 registros, cada página de 1.000 tardaba de 1 a 3
-- segundos. Ahora las dos preguntas se resuelven una sola vez por consulta:
--   · "¿soy admin o gerente?"           → (select public.is_staff(auth.uid()))
--   · "¿quiénes están por debajo mío?"  → public.my_downline_ids()
-- Ve lo mismo que antes cada rol; solo cambia cuántas veces se calcula.
--
-- ANTES de correrla: comprobar que la regla actual sea la del repo (ver el bloque de
-- diagnóstico en la conversación). Si producción tiene otra, no correr esto tal cual.

begin;

-- Personas por debajo de quien consulta en la cadena de mando (directas e indirectas).
-- No recibe parámetros a propósito: solo revela la propia línea, nunca la de otro.
create or replace function public.my_downline_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive down as (
    select id from public.profiles where supervisor_id = auth.uid()
    union
    select p.id from public.profiles p join down d on p.supervisor_id = d.id
  )
  select id from down;
$$;

revoke all on function public.my_downline_ids() from public, anon;
grant execute on function public.my_downline_ids() to authenticated;

drop policy if exists "time_entries_select_scope" on public.time_entries;
create policy "time_entries_select_scope"
on public.time_entries for select
to authenticated
using (
    user_id = (select auth.uid())
    or (select public.is_staff(auth.uid()))
    or user_id in (select public.my_downline_ids())
);

-- Para quien solo ve lo suyo o lo de su equipo: búsqueda directa por persona y fecha
create index if not exists time_entries_user_date_idx on public.time_entries (user_id, date);

commit;
