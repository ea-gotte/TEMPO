-- Fase 14: permitir que admin/gerente carguen registros de horas a nombre de
-- otra persona, necesario para la importación masiva desde Clockify (Admin ->
-- Importar -> Registros de horas).
--
-- Hoy la única política de INSERT en time_entries es "Crear solo los propios"
-- (with check user_id = auth.uid()), pensada para que cada quien cargue sus
-- propias horas desde Tracker/Calendario. Un admin importando el historial de
-- otra persona corre con su propio auth.uid(), así que esa política sola
-- rechaza casi todas las filas del import.
--
-- Esta política nueva es adicional (no reemplaza a la anterior): en RLS de
-- Postgres, varias políticas permisivas para el mismo comando se combinan con
-- OR, así que la carga normal de cada usuario sobre sus propias horas sigue
-- funcionando exactamente igual.
create policy "staff_insert_any_entry"
on public.time_entries for insert
to authenticated
with check (public.is_staff(auth.uid()));
