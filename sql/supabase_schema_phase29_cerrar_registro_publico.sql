-- Fase 29: cerrar el alta de cuentas con rol elegido por quien se registra.
--
-- Problema (auditoría de seguridad, punto 1): el registro público de Supabase
-- estaba activo ("disable_signup": false) y handle_new_user() tomaba el rol de
-- raw_user_meta_data, que lo arma quien se registra. Cualquiera, con la clave
-- publicable que viaja en el JS, podía hacer
--   supabase.auth.signUp({ email, password, options: { data: { role: "admin" } } })
-- confirmar su propio correo y entrar como administrador.
--
-- La app nunca usa signUp: las cuentas se crean desde el panel de Supabase
-- (Authentication -> Users -> Add user) y el rol se asigna después en Equipo.
-- Por eso:
--   1. En el panel: Authentication -> Sign In / Providers -> desactivar
--      "Allow new users to sign up". Crear usuarios desde el panel sigue andando.
--   2. Este script: handle_new_user() crea SIEMPRE con rol 'usuario' y toma de
--      los metadatos solo el nombre. Mantiene el horario por defecto de la
--      versión que corría en producción (07:00-15:00); el resto de las columnas
--      usa los valores por defecto de la tabla (jornada completa, 40 h, team
--      latam, hire_date = hoy, must_change_password = false).
--
-- Reemplaza la versión de producción (editada en el panel, fuera del repo), que
-- tomaba de los metadatos role, jornada, weekly_hours, horario, birthday,
-- hire_date y must_change_password.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, day_start, day_end)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 120),
    new.email,
    'usuario',
    '07:00',
    '15:00'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El trigger on_auth_user_created (after insert on auth.users) ya apunta a esta
-- función: no hace falta recrearlo. Para comprobarlo:
--   select tgname, tgfoid::regproc from pg_trigger
--   where tgrelid = 'auth.users'::regclass and not tgisinternal;
