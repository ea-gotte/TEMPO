-- Fase 31: privacidad de las ausencias y auditoría no editable
-- (auditoría de seguridad, hallazgos CSO-1 y CSO-2).
--
-- Correr DESPUÉS de publicar el front que lee absences_calendar: el front
-- anterior lee las ausencias ajenas directo de la tabla y, con esta fase,
-- dejaría de verlas en el calendario hasta publicar.

-- ============================================================
-- 1. Ausencias (CSO-1): el resto del personal ve QUE alguien está ausente
--    (quién, tipo, fechas y horas), pero no el motivo, los adjuntos
--    (certificados médicos) ni el comentario del supervisor.
-- ============================================================
-- La fase 15 dejaba leer la fila COMPLETA de cualquier ausencia aprobada.
-- Se vuelve a la regla de la fase 13: la tabla completa, solo el dueño y el staff.
drop policy if exists "Ver propias o de todo el equipo si es staff" on public.absence_requests;

create policy "Ver propias o de todo el equipo si es staff"
on public.absence_requests for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_staff(auth.uid())
);

-- Las ausencias aprobadas de todos, sin datos sensibles, para el calendario
-- compartido. Corre con los permisos de su dueño (por eso ve todas las filas):
-- es intencional, y por eso expone solo estas columnas y solo las aprobadas.
-- security_barrier impide que un filtro del que consulta se evalúe antes que
-- el where de la vista y deje ver filas no aprobadas.
create or replace view public.absences_calendar
with (security_barrier = true)
as
select id, user_id, type, date_from, date_to, time_from, time_to, status, created_at
from public.absence_requests
where status = 'Aprobado';

-- Solo lectura y solo con sesión: una vista simple es actualizable, y con los
-- permisos de su dueño un UPDATE a través de ella saltearía las políticas.
revoke all on public.absences_calendar from public, anon, authenticated;
grant select on public.absences_calendar to authenticated;

-- ============================================================
-- 2. Auditoría (CSO-2): nadie puede editar sus propias filas de auditoría.
-- ============================================================
-- La fase 3_fix agregó UPDATE porque el front subía la auditoría con un
-- upsert "on conflict do update". Hoy la sube con ignoreDuplicates, que es
-- "on conflict do nothing" y solo necesita permiso de INSERT.
drop policy if exists "update_own_audit" on public.audit_log;
revoke update, delete, truncate on public.audit_log from authenticated, anon;
