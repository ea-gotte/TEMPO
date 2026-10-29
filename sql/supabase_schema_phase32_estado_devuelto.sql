-- Fase 32: estado "Devuelto" en solicitudes de Gestión y horas extra.
-- Admin y gerente pueden aprobar, rechazar o devolver la solicitud con un comentario;
-- la persona la corrige y la reenvía (vuelve a "Pendiente").
-- Ejecutar a mano en el SQL Editor de Supabase antes de usar "Devolver con comentario".

-- 1. El estado "Devuelto" pasa a ser válido
alter table public.absence_requests drop constraint if exists absence_requests_status_check;
alter table public.absence_requests
    add constraint absence_requests_status_check check (status in ('Pendiente', 'Aprobado', 'Rechazado', 'Devuelto'));

alter table public.overtime_requests drop constraint if exists overtime_requests_status_check;
alter table public.overtime_requests
    add constraint overtime_requests_status_check check (status in ('Pendiente', 'Aprobado', 'Rechazado', 'Devuelto'));

-- 2. La persona solo puede tocar su propia solicitud mientras está devuelta, y únicamente
--    para volver a dejarla pendiente (no puede aprobarse a sí misma).
drop policy if exists "owner_resubmit_absences" on public.absence_requests;
create policy "owner_resubmit_absences"
on public.absence_requests for update
to authenticated
using (user_id = auth.uid() and status = 'Devuelto')
with check (user_id = auth.uid() and status = 'Pendiente');

drop policy if exists "owner_resubmit_overtime" on public.overtime_requests;
create policy "owner_resubmit_overtime"
on public.overtime_requests for update
to authenticated
using (user_id = auth.uid() and status = 'Devuelto')
with check (user_id = auth.uid() and status = 'Pendiente');
