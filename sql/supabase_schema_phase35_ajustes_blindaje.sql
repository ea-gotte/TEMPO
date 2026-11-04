-- Fase 35: ajustes al blindaje de la fase 34.
--   1. Nadie puede pasarse a sí mismo una solicitud ya resuelta cambiando la persona
--      (antes un admin/gerente podía cargarla aprobada a nombre de otro y después
--      reasignársela).
--   2. El supervisor que envía las horas extra de su equipo desde Control de horas
--      también puede crear la solicitud de Gestión que las acompaña (solo Pendiente).
--   3. Las horas cargadas a mano como saldo (festivo/FDS trabajado) quedan marcadas
--      (kind = 'saldo') para no confundirse con una solicitud mensual.
-- Nota: al reenviar, la persona puede cambiar las horas (minutes); siempre vuelve a
-- Pendiente y Recursos Humanos ve el aviso si no coinciden con los registros.
-- Ejecutar a mano en el SQL Editor de Supabase (después de la fase 34).

-- ============================================================
-- 1. Trigger: la persona de la solicitud no se cambia para quedársela uno mismo
-- ============================================================
create or replace function public.guard_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
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

    -- Nadie se asigna a sí mismo una solicitud de otra persona
    if new.user_id = me and old.user_id is distinct from me then
        raise exception 'No se puede pasar a nombre propio una solicitud de otra persona';
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

-- ============================================================
-- 2. Solicitud de Gestión creada por el supervisor de la persona (solo Pendiente)
-- ============================================================
drop policy if exists "Crear propias o staff a nombre de otro" on public.absence_requests;
create policy "Crear propias o staff a nombre de otro"
on public.absence_requests for insert
to authenticated
with check (
    (
        user_id = auth.uid()
        or public.is_staff(auth.uid())
        or exists (
            select 1 from public.profiles emp
            where emp.id = absence_requests.user_id and emp.supervisor_id = auth.uid()
        )
    )
    and (
        (status = 'Pendiente' and resolved_by is null)
        or (public.is_staff(auth.uid()) and user_id <> auth.uid())
    )
);

-- ============================================================
-- 3. Saldo cargado a mano: marca propia
-- ============================================================
alter table public.overtime_requests add column if not exists kind text;

-- Las cargas a mano anteriores (las que tienen el texto automático del panel "Cargar saldo")
update public.overtime_requests
set kind = 'saldo'
where kind is null and supervisor_comment like 'Saldo cargado a mano:%';
