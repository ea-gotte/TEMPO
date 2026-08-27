-- Fase 1b: tabla de feriados gestionada por el administrador desde la web.
-- Se usa tanto para mostrarlos en el Calendario corporativo como para excluirlos
-- del cálculo de días de vacaciones y de compensación de horas.

create table public.holidays (
    id text primary key,
    date date not null,
    type text not null check (type in ('Feriado nacional', 'Feriado provincial', 'Día no laborable')),
    title text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.holidays enable row level security;

-- Cualquier usuario autenticado puede ver los feriados (los necesita para su propio cálculo de vacaciones)
create policy "Cualquier usuario autenticado puede ver feriados"
on public.holidays for select
to authenticated
using (true);

-- Solo el administrador puede agregar o borrar feriados
create policy "Solo admin puede crear feriados"
on public.holidays for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy "Solo admin puede borrar feriados"
on public.holidays for delete
to authenticated
using (public.is_admin(auth.uid()));

grant select, insert, delete on public.holidays to authenticated;

alter publication supabase_realtime add table public.holidays;
