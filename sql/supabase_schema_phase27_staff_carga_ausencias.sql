-- Fase 27: permite que el staff (admin/gerente) cree una ausencia a nombre de
-- OTRA persona. Hasta ahora la política de insert de absence_requests exigía
-- user_id = auth.uid(), pensada para que cada quien pida sus propias
-- ausencias; el nuevo panel "Cargar saldo" (festivos trabajados o vacaciones)
-- necesita poder cargar vacaciones históricas a nombre de cualquiera, igual
-- que ya podía hacerlo con horas extra (overtime_requests, fase 3).

drop policy if exists "Crear solo las propias" on public.absence_requests;

create policy "Crear propias o staff a nombre de otro"
on public.absence_requests for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff(auth.uid()));
