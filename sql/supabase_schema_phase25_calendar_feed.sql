-- Fase 25: enlace de suscripción del Calendario (iCal) para verlo en Google
-- Calendar, Outlook, etc. Cada persona tiene como máximo UN enlace privado: el
-- "token" es la llave; quien lo tenga puede ver sus registros de horas, y
-- regenerarlo invalida el anterior. La función de borde `calendar-feed` (ver
-- supabase/functions/calendar-feed/index.ts) lee esta tabla con la clave de
-- servicio, por eso la app no necesita exponer los registros de nadie.

create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

-- Cada quien ve y administra únicamente su propio enlace.
drop policy if exists "calendar_feeds_own" on public.calendar_feeds;
create policy "calendar_feeds_own" on public.calendar_feeds
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.calendar_feeds to authenticated;
