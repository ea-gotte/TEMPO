-- Fase 4: configuración global de la app (empresa, permisos por rol, tipos de
-- licencia habilitados y etiquetas) en base de datos real. Hoy vivían solo en
-- localStorage: cada navegador tenía su propia copia y los cambios de un admin
-- no se veían en otra cuenta ni en otro dispositivo.

create table public.app_settings (
    id text primary key default 'global',
    company jsonb not null,
    role_permissions jsonb not null,
    leave_type_config jsonb not null,
    tags jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.app_settings enable row level security;

-- Cualquier usuario autenticado necesita leerla (permisos por rol, tipos de licencia, etc.)
create policy "select_all_settings"
on public.app_settings for select
to authenticated
using (true);

-- Solo el admin la edita
create policy "admin_write_settings"
on public.app_settings for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update on public.app_settings to authenticated;
alter publication supabase_realtime add table public.app_settings;

-- No se inserta la fila semilla acá: el cliente la crea la primera vez que alguien
-- se conecta y no la encuentra, usando los valores que ya tenía ese navegador
-- (los mismos por defecto de data.ts), para no pisar nada.

-- ============================================================
-- Corrección preventiva: la política original de profiles ("Los administradores
-- tienen control total") se consulta a sí misma dentro de su propia condición
-- (select ... from public.profiles where ...), el mismo patrón de recursión
-- infinita (42P17) que ya se corrigió en tablas posteriores con is_admin()/is_staff().
-- Si esto seguía así, cada guardado de un usuario desde Equipo fallaba en el
-- servidor pero la app no lo mostraba (quedaba solo en memoria) y se perdía al
-- recargar. Se reemplaza por is_staff(), que no tiene ese problema y coincide con
-- que Equipo deja editar tanto a admin como a supervisor.
-- ============================================================
drop policy if exists "Los administradores tienen control total" on public.profiles;

create policy "staff_write_profiles"
on public.profiles for all
to authenticated
using (public.is_staff(auth.uid()))
with check (public.is_staff(auth.uid()));
