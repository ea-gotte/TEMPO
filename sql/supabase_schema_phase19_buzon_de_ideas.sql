-- Fase 19: Buzón de ideas — reporte de errores y mejoras, visible a todo el
-- mundo (no solo al admin). El admin cambia el estado y puede responder;
-- quien lo reportó recibe una notificación cuando eso pasa (ver store.tsx).

create table if not exists public.feedback_items (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('bug', 'mejora')),
  title text not null,
  description text not null default '',
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_progreso', 'implementado', 'futuras_versiones', 'rechazado')),
  created_at timestamptz not null default now(),
  admin_response text,
  responded_by uuid references public.profiles(id),
  responded_at timestamptz
);

alter table public.feedback_items enable row level security;

-- Lectura: cualquier autenticado ve todo el registro (es el punto: que lo vea
-- todo el mundo, no un buzón privado solo para el admin).
create policy "select_all_feedback_items" on public.feedback_items
  for select to authenticated using (true);

-- Cada quien crea las suyas.
create policy "insert_own_feedback_item" on public.feedback_items
  for insert to authenticated with check (user_id = auth.uid());

-- Editar: el propio autor (para corregir su idea) o el admin (para
-- cambiar estado/responder). No se restringe por columna a nivel de base —
-- la UI es la que solo le muestra los controles de estado/respuesta al admin.
create policy "update_own_or_admin_feedback_item" on public.feedback_items
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Borrar: solo el propio autor (retractarse de su idea).
create policy "delete_own_feedback_item" on public.feedback_items
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.feedback_items to authenticated;
alter publication supabase_realtime add table public.feedback_items;
