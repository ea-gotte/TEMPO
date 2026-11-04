-- Fase 34: blindaje de solicitudes (Gestión y horas extra) del lado del servidor.
-- Hasta ahora las reglas "nadie resuelve lo propio" y "el historial no se borra" las cumplía
-- solo la aplicación; con la API de Supabase alguien podía saltearlas. Esta fase:
--   1. Al crear: una solicitud propia (o de cualquiera, si no sos admin/gerente) solo puede
--      nacer Pendiente y sin resolución.
--   2. Al modificar: nadie puede aprobar, rechazar ni devolver una solicitud propia.
--   3. Al reenviar una devuelta, la persona solo puede tocar lo que corrige (horas, fechas,
--      motivo); el historial y los adjuntos solo crecen: no se puede borrar una observación
--      de Recursos Humanos ni un informe anterior.
-- Ejecutar a mano en el SQL Editor de Supabase (después de las fases 32 y 33).
-- Desde el SQL Editor o con la service role (auth.uid() nulo) las reglas no aplican.

-- ============================================================
-- 1. Crear: Pendiente salvo que un admin/gerente la cargue a nombre de otra persona
-- ============================================================
drop policy if exists "insert_own_or_staff_overtime" on public.overtime_requests;
create policy "insert_own_or_staff_overtime"
on public.overtime_requests for insert
to authenticated
with check (
    (
        user_id = auth.uid()
        or public.is_staff(auth.uid())
        or exists (
            select 1 from public.profiles emp
            where emp.id = overtime_requests.user_id and emp.supervisor_id = auth.uid()
        )
    )
    and (
        (status = 'Pendiente' and resolved_by is null)
        or (public.is_staff(auth.uid()) and user_id <> auth.uid())
    )
);

drop policy if exists "Crear propias o staff a nombre de otro" on public.absence_requests;
create policy "Crear propias o staff a nombre de otro"
on public.absence_requests for insert
to authenticated
with check (
    (user_id = auth.uid() or public.is_staff(auth.uid()))
    and (
        (status = 'Pendiente' and resolved_by is null)
        or (public.is_staff(auth.uid()) and user_id <> auth.uid())
    )
);

-- ============================================================
-- 2 y 3. Modificar: control por trigger (las políticas no pueden comparar old y new)
-- ============================================================
create or replace function public.guard_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
    -- columnas que la persona puede cambiar al reenviar una solicitud devuelta
    editable text[] := case tg_table_name
        when 'overtime_requests' then array['status', 'minutes', 'history']
        else array['status', 'date_from', 'date_to', 'time_from', 'time_to', 'reason', 'attachments', 'history']
    end;
    old_hist jsonb := coalesce(old.history, '[]'::jsonb);
    new_hist jsonb := coalesce(new.history, '[]'::jsonb);
    last_event jsonb;
    old_files jsonb;
    new_files jsonb;
begin
    -- SQL Editor / service role: sin restricciones
    if me is null then
        return new;
    end if;

    -- Nadie resuelve su propia solicitud
    if new.user_id = me and new.status is distinct from old.status and new.status <> 'Pendiente' then
        raise exception 'No se puede aprobar, rechazar ni devolver una solicitud propia';
    end if;

    -- Admin/gerente sobre solicitudes de otra persona: sin más controles
    if public.is_staff(me) and old.user_id <> me then
        return new;
    end if;

    -- La propia persona: solo reenviar una devuelta
    if old.user_id <> me then
        raise exception 'Solo la persona que hizo la solicitud puede reenviarla';
    end if;
    if old.status <> 'Devuelto' or new.status <> 'Pendiente' then
        raise exception 'Solo se puede reenviar una solicitud devuelta, y queda pendiente';
    end if;
    if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
        raise exception 'Al reenviar solo se pueden corregir horas, fechas y motivo';
    end if;

    -- Historial: se suma exactamente una respuesta de la persona, sin tocar lo anterior
    if jsonb_array_length(new_hist) <> jsonb_array_length(old_hist) + 1
       or (new_hist - (jsonb_array_length(new_hist) - 1)) is distinct from old_hist then
        raise exception 'El historial de la solicitud no se puede modificar, solo sumar la respuesta';
    end if;
    last_event := new_hist -> (jsonb_array_length(new_hist) - 1);
    if last_event ->> 'by' is distinct from me::text or last_event ->> 'action' is distinct from 'Reenviada' then
        raise exception 'La respuesta del historial tiene que ser de la propia persona';
    end if;

    -- Adjuntos (solo ausencias): se pueden sumar, nunca quitar ni reemplazar
    if tg_table_name = 'absence_requests' then
        old_files := coalesce(old.attachments, '[]'::jsonb);
        new_files := coalesce(new.attachments, '[]'::jsonb);
        if jsonb_array_length(new_files) < jsonb_array_length(old_files)
           or coalesce((
                select jsonb_agg(e order by i)
                from jsonb_array_elements(new_files) with ordinality as t(e, i)
                where i <= jsonb_array_length(old_files)
              ), '[]'::jsonb) is distinct from old_files then
            raise exception 'Los adjuntos anteriores no se pueden quitar ni reemplazar';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists guard_overtime_update on public.overtime_requests;
create trigger guard_overtime_update
before update on public.overtime_requests
for each row execute function public.guard_request_update();

drop trigger if exists guard_absence_update on public.absence_requests;
create trigger guard_absence_update
before update on public.absence_requests
for each row execute function public.guard_request_update();
