-- Fase 15: las ausencias APROBADAS de cualquier persona vuelven a ser visibles
-- para todos, no solo para admin/gerente.
--
-- La fase 13 restringió "Ver propias o de todo el equipo si es staff" a
-- (user_id = auth.uid() or is_staff(auth.uid())), pensando en que solo
-- admin/gerente necesitan ver y aprobar las solicitudes de otras personas
-- (Gestión -> Por aprobar / Registro). Pero esa misma tabla también alimenta
-- el Calendario corporativo (categoría "Ausencia") y el Dashboard ("Próximas
-- licencias y ausencias") para TODOS los roles — y con esa política, una
-- cuenta usuario/supervisor deja de recibir por RLS hasta las ausencias ya
-- APROBADAS de sus compañeros, así que directamente desaparecen de esas dos
-- pantallas (no es un bug de UI: la fila nunca llega a la app).
--
-- La solución: sumar "status = 'Aprobado'" como otra condición válida — así
-- cualquiera ve las ausencias ya aprobadas de cualquier persona (uso social/
-- informativo del calendario), pero las pendientes o rechazadas de otros
-- siguen siendo privadas salvo para admin/gerente (que las necesitan para
-- aprobarlas).
drop policy if exists "Ver propias o de todo el equipo si es staff" on public.absence_requests;

create policy "Ver propias o de todo el equipo si es staff"
on public.absence_requests for select
to authenticated
using (
    user_id = auth.uid()
    or status = 'Aprobado'
    or public.is_staff(auth.uid())
);
