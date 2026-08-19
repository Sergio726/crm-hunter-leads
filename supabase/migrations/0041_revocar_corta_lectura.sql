-- 0041 — Revocarle el acceso a alguien también le corta la lectura.
--
-- EL AGUJERO
--
-- `revoke_member` (0003) le devuelve el rol a `pending`, pero **no le desasigna
-- los clientes**. Y la política de lectura solo pregunta si la fila es suya:
--
--     using (assigned_to = auth.uid() or private.is_read_all())
--
-- El panel web sí lo rebota (`web/src/lib/auth.ts`), pero eso es una defensa de
-- la aplicación, no de la base. Con su token todavía vigente, un vendedor
-- revocado podía pedir `GET /rest/v1/clients` directo a Supabase y recibir sus
-- filas de siempre. Lo mismo con sus interacciones y sus prospectos.
--
-- Importa especialmente si este sistema se le vende a alguien más: "saqué a esa
-- persona del equipo" tiene que significar que dejó de ver los datos, no que
-- dejó de verlos *en la pantalla*.
--
-- EL ARREGLO
--
-- La rama de "es mía" pasa a exigir además ser miembro activo. Las funciones ya
-- existen y dicen cosas distintas a propósito:
--
--     private.is_active_member()  → seller | superadmin   (puede operar)
--     private.is_read_all()       → superadmin | viewer   (ve todo)
--
-- El lector (`viewer`) NO es miembro activo, así que sigue entrando por
-- `is_read_all()` y no pierde nada. El vendedor normal sí es miembro activo y
-- tampoco cambia. El único que pierde acceso es el revocado, que es el punto.
--
-- No mueve un solo dato: las asignaciones quedan como están, así que si esa
-- persona vuelve al equipo recupera su cartera sin reconstruir nada.

alter policy "sellers read assigned clients"
  on public.clients
  using (
    (
      assigned_to = (select auth.uid())
      and private.is_active_member()
    )
    or private.is_read_all()
  );

alter policy "read own interactions"
  on public.interactions
  using (
    (
      user_id = (select auth.uid())
      and private.is_active_member()
    )
    or private.is_read_all()
  );

-- En prospectos el lector no ve nada, y es a propósito (ver 0028): son datos de
-- trabajo en curso, no la cartera. Por eso acá la segunda rama es superadmin.
alter policy "members read own prospects"
  on public.prospects
  using (
    (
      created_by = (select auth.uid())
      and private.is_active_member()
    )
    or private.is_superadmin()
  );

alter policy "members read own searches"
  on public.prospect_searches
  using (
    (
      created_by = (select auth.uid())
      and private.is_active_member()
    )
    or private.is_superadmin()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- CÓMO COMPROBAR QUE FUNCIONA (con dos sesiones reales, no mirando el esquema):
--
--   1. Un vendedor con clientes asignados entra al panel y los ve.
--   2. El superadmin lo revoca desde Equipo.
--   3. El vendedor recarga: el panel lo saca. Eso ya pasaba antes.
--   4. Lo que cambia: con su token todavía vigente, un GET directo a
--      `/rest/v1/clients` ahora devuelve **cero filas** en vez de su cartera.
--
-- PARA REVERTIR: volver a dejar cada política sin la condición de miembro
-- activo, tal como estaban en 0015 y 0028.
-- ─────────────────────────────────────────────────────────────────────────────
