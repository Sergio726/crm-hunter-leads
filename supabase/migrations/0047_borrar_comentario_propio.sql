-- 0047 — Poder borrar un comentario propio mal cargado
--
-- `interactions` es deliberadamente inmutable: desde la 0001 solo tiene
-- políticas de SELECT e INSERT. Es correcto y no se toca — un contacto
-- registrado es un hecho, y un vendedor no debería poder borrar la evidencia
-- de que llamó o de cómo le fue.
--
-- Pero ahí adentro conviven dos cosas distintas. El canal 'note' no es un
-- contacto: es el comentario rápido que alguien escribe en la ficha. Ese sí se
-- carga mal —un dedazo, el cliente equivocado, un texto a medio escribir— y
-- hasta ahora quedaba para siempre, sin forma de corregirlo.
--
-- Esta política abre la puerta más chica posible:
--
--   · solo el canal 'note', nunca un contacto real
--   · solo los propios (`user_id = auth.uid()`)
--   · solo miembros activos, igual que el resto (0041)
--
-- No se permite EDITAR, solo borrar. Un comentario editable deja un registro
-- que dice una cosa hoy y otra mañana sin rastro del cambio; borrarlo y
-- escribirlo de nuevo es más honesto y deja la fecha real de cuándo se escribió
-- lo que ahora se lee.

drop policy if exists "delete own note" on public.interactions;

create policy "delete own note"
  on public.interactions
  for delete
  using (
    channel = 'note'
    and user_id = (select auth.uid())
    and private.is_active_member()
  );

-- Sin este grant la política no alcanza: en un proyecto nuevo las tablas
-- creadas por SQL no reciben privilegios, y PostgREST devolvería 42501 aunque
-- el RLS diga que sí. Es el mismo tropiezo que documenta la 0039.
grant delete on public.interactions to authenticated;
