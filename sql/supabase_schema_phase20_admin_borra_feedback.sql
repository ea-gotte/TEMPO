-- Fase 20: el admin puede borrar cualquier idea del buzón (moderación).
-- Antes solo el propio autor podía borrar la suya, y solo mientras seguía
-- "pendiente" — el admin no tenía forma de limpiar el registro.

create policy "delete_admin_feedback_item" on public.feedback_items
  for delete to authenticated using (public.is_admin(auth.uid()));
