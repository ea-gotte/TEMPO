-- Fase 3 (correcciones): arregla tres problemas detectados al probar en producción.

-- ============================================================
-- 1. overtime_requests — el admin/supervisor informa horas extra de OTRO usuario
-- (desde Control de horas), no las propias. La política de insert solo permitía
-- user_id = auth.uid(), así que esos inserts quedaban rechazados por RLS.
-- ============================================================
drop policy if exists "insert_own_overtime" on public.overtime_requests;

create policy "insert_own_or_staff_overtime"
on public.overtime_requests for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff(auth.uid()));

-- ============================================================
-- 2. audit_log — el cliente sincroniza con upsert (insert ... on conflict do update),
-- que en Postgres requiere permiso de UPDATE aunque nunca se dispare el conflicto.
-- Sin ese grant/policy, todos los upserts fallaban por permisos y nada se guardaba.
-- ============================================================
grant update on public.audit_log to authenticated;

create policy "update_own_audit"
on public.audit_log for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ============================================================
-- 3. corp_events — agrega soporte para "todo el día" vs horario específico
-- ============================================================
alter table public.corp_events add column if not exists all_day boolean not null default true;
alter table public.corp_events add column if not exists time_from text;
alter table public.corp_events add column if not exists time_to text;
