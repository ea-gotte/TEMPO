-- Script SQL para ejecutar en el SQL Editor de Supabase
-- Esto creará la tabla de perfiles de usuario vinculada a la autenticación interna de Supabase.

-- 1. Crear la tabla de perfiles públicos vinculada a auth.users
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    name text not null,
    email text not null constraint check_valid_email check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    role text not null check (role in ('admin', 'supervisor', 'usuario')) default 'usuario',
    jornada text not null check (jornada in ('completa', 'media')) default 'completa',
    weekly_hours integer not null default 40,
    team_id text,
    department_id text,
    supervisor_id uuid references public.profiles(id) on delete set null,
    day_start text not null default '09:00',
    day_end text not null default '18:00',
    birthday date,
    hire_date date default current_date,
    active boolean not null default true,
    online boolean not null default false,
    must_change_password boolean not null default false,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitar Seguridad a Nivel de Fila (RLS)
alter table public.profiles enable row level security;

-- 3. Crear Políticas de Seguridad
-- Permite a cualquier usuario autenticado leer los perfiles (necesario para ver compañeros de equipo)
create policy "Cualquier usuario autenticado puede ver perfiles"
on public.profiles for select
to authenticated
using (true);

-- Permite a cada usuario actualizar sus propios datos de perfil
create policy "Los usuarios pueden actualizar su propio perfil"
on public.profiles for update
to authenticated
using (auth.uid() = id);

-- Permite a los administradores hacer cualquier operación en todos los perfiles
create policy "Los administradores tienen control total"
on public.profiles for all
to authenticated
using (
    exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    )
);

-- 4. Función Trigger para crear el perfil automáticamente al registrarse en Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (
        id,
        name,
        email,
        role,
        jornada,
        weekly_hours,
        team_id,
        department_id,
        day_start,
        day_end,
        birthday,
        hire_date,
        must_change_password
    )
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email,
        coalesce(new.raw_user_meta_data->>'role', 'usuario'),
        coalesce(new.raw_user_meta_data->>'jornada', 'completa'),
        coalesce((new.raw_user_meta_data->>'weekly_hours')::integer, 40),
        new.raw_user_meta_data->>'team_id',
        new.raw_user_meta_data->>'department_id',
        coalesce(new.raw_user_meta_data->>'day_start', '09:00'),
        coalesce(new.raw_user_meta_data->>'day_end', '18:00'),
        (new.raw_user_meta_data->>'birthday')::date,
        coalesce((new.raw_user_meta_data->>'hire_date')::date, current_date),
        coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false)
    );
    return new;
end;
$$ language plpgsql security definer;

-- 5. Crear el trigger para enlazar auth.users con public.profiles
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
