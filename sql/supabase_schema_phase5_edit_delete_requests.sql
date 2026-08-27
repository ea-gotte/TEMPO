-- Permite a admin/supervisor editar y eliminar solicitudes de ausencia y de horas
-- extra. La política de UPDATE ya existente ("staff_resolve_overtime" y "Staff puede
-- resolver solicitudes") no tenía "with check", así que Postgres reutiliza el mismo
-- "using" para el chequeo — el UPDATE completo (no solo status) ya estaba permitido.
-- Lo que faltaba era DELETE: ninguna de las dos tablas tenía esa política.

create policy "staff_delete_absences"
on public.absence_requests for delete
to authenticated
using (public.is_staff(auth.uid()));

grant delete on public.absence_requests to authenticated;

create policy "staff_delete_overtime"
on public.overtime_requests for delete
to authenticated
using (public.is_staff(auth.uid()));

grant delete on public.overtime_requests to authenticated;
