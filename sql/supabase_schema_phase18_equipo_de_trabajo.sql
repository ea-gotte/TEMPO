-- Fase 18: "Equipo de trabajo" (España / LATAM), restringe el acceso además
-- del rol, sin cambiar el rol de nadie. Todos los usuarios existentes quedan
-- en LATAM (comportamiento actual, sin cambios) hasta que el admin pase a
-- alguien a España desde Equipo. Ver conversación del 2026-08-29 para el
-- detalle de qué puede ver/hacer cada equipo (implementado en el cliente,
-- en canSeePage de src/components/Shell.tsx).

alter table public.profiles
  add column if not exists team text not null default 'latam' check (team in ('espana', 'latam'));
