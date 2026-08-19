-- 0042 — Recordatorios de seguimiento por mail, sin depender de GHL.
--
-- POR QUÉ EXISTE
--
-- Los recordatorios no llegaban. La causa: el interruptor `crm_sync_enabled` de
-- Configuración estaba apagado, y ese interruptor no apaga solo la
-- sincronización — `n8n_list_overdue_followups` devuelve una lista vacía cuando
-- está en `false` (ver 0027). El flujo de n8n corría todos los días, recibía
-- cero y terminaba sin error. Fallaba en silencio.
--
-- Pero el problema de fondo es otro: **todo el camino pasaba por GHL**. El flujo
-- crea el contacto del vendedor en GHL, manda por su API de conversaciones, y
-- hasta el respaldo por email sale por GHL. Si el cliente no usa GHL, no tiene
-- recordatorios.
--
-- Esta función es el camino propio: la usa la app directamente, no n8n, y **no
-- mira `crm_sync_enabled`** — apagar la sincronización con un CRM externo no
-- tiene por qué apagar los avisos internos del equipo.
--
-- SOLO `service_role`: la llama el servidor de la app desde la tarea
-- programada, donde no hay sesión de usuario. Ningún cliente del navegador
-- puede ejecutarla.

create or replace function public.recordatorios_pendientes()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(fila), '[]'::jsonb)
  from (
    select
      p.id as user_id,
      p.email,
      p.full_name,
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'nombre', c.full_name,
          'empresa', c.company,
          'vence', c.next_follow_up
        )
        order by c.next_follow_up
      ) as clientes
    from public.clients c
    join public.profiles p on p.id = c.assigned_to
    where c.next_follow_up is not null
      and c.next_follow_up < current_date
      and c.status in ('pending', 'contacted')
      and p.role in ('seller', 'superadmin')
      and p.email is not null
      -- Ya avisado hoy por este cliente: se saltea. Es lo que permite correr la
      -- tarea de nuevo sin mandar el mismo mail dos veces.
      and not exists (
        select 1
        from public.notifications n
        where n.user_id = p.id
          and n.ref_id = c.id
          and n.event = 'followup.overdue'
          and n.sent_on = current_date
      )
    group by p.id, p.email, p.full_name
  ) fila;
$$;

revoke execute on function public.recordatorios_pendientes()
  from public, anon, authenticated;
grant execute on function public.recordatorios_pendientes()
  to service_role;

-- Marcar lo enviado.
--
-- `n8n_mark_notified` ya hace esto, pero exige el secreto compartido de n8n y
-- va de a uno. Acá se marcan todos los del vendedor en una sola llamada, y la
-- autorización es el propio `service_role`.
create or replace function public.marcar_recordatorios(
  p_user_id uuid,
  p_client_ids uuid[]
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with nuevas as (
    insert into public.notifications (user_id, event, ref_id, channel)
    select p_user_id, 'followup.overdue', id, 'email'
    from unnest(p_client_ids) as id
    -- El índice único (user_id, ref_id, sent_on) es el que evita el duplicado
    -- si la tarea corriera dos veces el mismo día.
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from nuevas;
$$;

revoke execute on function public.marcar_recordatorios(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.marcar_recordatorios(uuid, uuid[])
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA REVERTIR (no se ejecuta):
--
--   drop function if exists public.recordatorios_pendientes();
--   drop function if exists public.marcar_recordatorios(uuid, uuid[]);
--
-- Nada más queda tocado: no se agregan tablas ni columnas, y `notifications`
-- se usa tal como estaba.
-- ─────────────────────────────────────────────────────────────────────────────
