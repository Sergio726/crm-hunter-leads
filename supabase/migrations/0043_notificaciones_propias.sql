-- 0043 — Las notificaciones dejan de depender del CRM.
--
-- EL PLANTEO ANTERIOR ESTABA MAL
--
-- Un sistema que opera independiente de un CRM no puede depender de ese CRM
-- para avisar cosas suyas. Revisando el camino completo aparecieron cuatro
-- problemas, no uno:
--
--   1. La base de datos salía a la red: `notify_lead_assigned` hacía
--      `net.http_post` a n8n. Eso ata Postgres a que n8n esté vivo.
--   2. La entrega pasaba por GHL — incluido el respaldo por email. Un cliente
--      que no use GHL no tenía avisos.
--   3. `lead.assigned` no dejaba rastro: el disparador leía `n8n_notify_url` y,
--      si no estaba cargada, RETORNABA ANTES de insertar en `notifications`.
--      No se enviaba y no quedaba registro de que debía enviarse.
--   4. Registro y entrega estaban pegados: la fila se escribía solo si el envío
--      salía bien, así que no servía para reintentar ni para mostrar.
--
-- LA FORMA CORRECTA: cuatro responsabilidades separadas.
--
--   Detectar  → el disparador (se conserva: es el único punto que ve los cinco
--               caminos por los que se asigna un cliente)
--   Registrar → `notifications` pasa a ser una COLA
--   Entregar  → la app, por su propio proveedor de mail
--   Mostrar   → el badge del panel, que no depende de que el mail salga
--
-- El CRM queda para lo único que de verdad es integración: sincronizar datos de
-- clientes (`push_to_crm`). Su interruptor sigue apagando eso, y solo eso.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La tabla pasa a ser una cola
-- ─────────────────────────────────────────────────────────────────────────────

-- `sent_at` nulo = pendiente de entrega. Antes era `not null default now()`,
-- o sea que la fila solo podía existir si ya se había enviado.
alter table public.notifications
  alter column sent_at drop not null;

alter table public.notifications
  alter column sent_at drop default;

-- Visto dentro de la app. Es lo que hace que el badge signifique algo y se
-- apague solo.
alter table public.notifications
  add column if not exists read_at timestamptz;

-- Por qué no se pudo entregar. Sin esto, un mail que falla se pierde en los
-- logs del servidor.
alter table public.notifications
  add column if not exists delivery_error text;

create index if not exists notifications_pendientes_idx
  on public.notifications (user_id)
  where sent_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El disparador solo anota. No sale a la red.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_lead_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinatario record;
begin
  if new.assigned_to is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  -- Anti-spam de la 0033: al crear, solo avisa lo cargado a mano en la app.
  -- Promover 50 prospectos no puede disparar 50 avisos.
  if tg_op = 'INSERT' and new.origin <> 'app' then
    return new;
  end if;

  select id, role into destinatario
  from public.profiles
  where id = new.assigned_to;

  if destinatario.id is null
     or destinatario.role not in ('seller', 'superadmin') then
    return new;
  end if;

  -- Ya NO se exige email ni teléfono. El aviso dentro de la app no los
  -- necesita, y esa condición hacía que se perdiera hasta el registro.
  --
  -- `sent_at` queda en null: esto es una cola, no un envío.
  insert into public.notifications
    (user_id, event, ref_id, sent_at)
  values
    (new.assigned_to, 'lead.assigned', new.id, null)
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function public.notify_lead_assigned()
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Encolar los seguimientos vencidos
-- ─────────────────────────────────────────────────────────────────────────────

-- NO mira `crm_sync_enabled`, y es el punto de todo esto: apagar la
-- sincronización con un CRM externo no puede dejar al equipo sin sus avisos.
-- El índice único (user_id, ref_id, sent_on) que ya existía lo deduplica por
-- día, así que correrla dos veces no duplica nada.
create or replace function public.encolar_seguimientos_vencidos()
returns integer
language sql
security definer
set search_path = ''
as $$
  with nuevas as (
    insert into public.notifications
      (user_id, event, ref_id, sent_at)
    select
      c.assigned_to, 'followup.overdue', c.id, null
    from public.clients c
    join public.profiles p on p.id = c.assigned_to
    where c.next_follow_up is not null
      and c.next_follow_up < current_date
      and c.status in ('pending', 'contacted')
      and p.role in ('seller', 'superadmin')
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from nuevas;
$$;

revoke execute on function public.encolar_seguimientos_vencidos()
  from public, anon, authenticated;
grant execute on function public.encolar_seguimientos_vencidos()
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Lo pendiente, agrupado por persona
-- ─────────────────────────────────────────────────────────────────────────────

-- Un mail por persona con todo lo suyo, no uno por evento: alguien con quince
-- pendientes recibiría quince mails y no leería ninguno.
create or replace function public.notificaciones_pendientes()
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
          'id', n.id,
          'evento', n.event,
          'cliente', c.full_name,
          'empresa', c.company,
          'vence', c.next_follow_up
        )
        order by n.event, c.next_follow_up
      ) as items
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    left join public.clients c on c.id = n.ref_id
    where n.sent_at is null
      and p.email is not null
    group by p.id, p.email, p.full_name
  ) fila;
$$;

revoke execute on function public.notificaciones_pendientes()
  from public, anon, authenticated;
grant execute on function public.notificaciones_pendientes()
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Marcar el resultado de la entrega
-- ─────────────────────────────────────────────────────────────────────────────

-- Con error, `sent_at` queda en null a propósito: la notificación sigue
-- pendiente y se reintenta en la próxima corrida.
create or replace function public.marcar_entregadas(
  p_ids uuid[],
  p_error text default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with tocadas as (
    update public.notifications
    set sent_at = case
                    when p_error is null then now()
                    else null
                  end,
        delivery_error = p_error
    where id = any(p_ids)
    returning 1
  )
  select count(*)::integer from tocadas;
$$;

revoke execute on function public.marcar_entregadas(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.marcar_entregadas(uuid[], text)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Marcar como vistas, desde la app
-- ─────────────────────────────────────────────────────────────────────────────

-- La llama el usuario con su sesión: solo puede marcar las suyas. Por eso acá
-- sí se concede a `authenticated`, a diferencia de las de arriba.
create or replace function public.marcar_notificaciones_vistas()
returns integer
language sql
security definer
set search_path = ''
as $$
  with vistas as (
    update public.notifications
    set read_at = now()
    where user_id = (select auth.uid())
      and read_at is null
    returning 1
  )
  select count(*)::integer from vistas;
$$;

revoke execute on function public.marcar_notificaciones_vistas()
  from public, anon;
grant execute on function public.marcar_notificaciones_vistas()
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Consistencia con la 0041
-- ─────────────────────────────────────────────────────────────────────────────

-- Un miembro revocado tampoco lee sus notificaciones. Mismo criterio que
-- clientes, interacciones, prospectos y búsquedas.
alter policy "read own notifications"
  on public.notifications
  using (
    (
      user_id = (select auth.uid())
      and private.is_active_member()
    )
    or private.is_read_all()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Se van las funciones de la 0042
-- ─────────────────────────────────────────────────────────────────────────────

-- Calculaban los vencidos al vuelo y salteaban la cola. Quedan reemplazadas por
-- `encolar_seguimientos_vencidos` + `notificaciones_pendientes`.
drop function if exists public.recordatorios_pendientes();
drop function if exists public.marcar_recordatorios(uuid, uuid[]);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA REVERTIR: reaplicar la 0033 (disparador con n8n) y la 0042, y
--
--   alter table public.notifications
--     alter column sent_at set default now();
--   update public.notifications set sent_at = now() where sent_at is null;
--   alter table public.notifications
--     alter column sent_at set not null;
--
-- ⚠️ Eso da por entregadas las que estaban pendientes. No hay forma de saber
-- cuáles se habían enviado de verdad.
-- ─────────────────────────────────────────────────────────────────────────────
