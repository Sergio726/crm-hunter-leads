-- 0044 — Avisar por inactividad, y darle fecha de seguimiento a lo que se asigna.
--
-- POR QUÉ EXISTE
--
-- Medido sobre los datos reales: de 163 clientes, **ninguno** tenía fecha de
-- próximo seguimiento. Cero. O sea que el recordatorio de vencidos nunca tuvo
-- nada que recordar — aunque hubiera funcionado perfecto desde el día uno, no
-- habría enviado un solo mail.
--
-- La causa es de uso, no de código: `next_follow_up` solo se carga cuando
-- alguien registra el resultado de un contacto Y elige "Mañana" / "En 3 días" /
-- "Próxima semana". Si ese paso no se usa, no hay fechas, y sin fechas no hay
-- nada que vencer.
--
-- Un recordatorio que depende de que alguien se acuerde de poner una fecha es un
-- recordatorio que no suena nunca. Se ataca por los dos lados:
--
--   1. INACTIVIDAD — avisa por lo que NO pasó. No hay nada que cargar ni que
--      recordar, y es la señal que de verdad importa: un cliente que nadie tocó
--      en diez días se está perdiendo, tenga o no una fecha agendada.
--   2. FECHA AUTOMÁTICA al asignar — para que el circuito de vencidos, que ya
--      está construido, empiece a tener con qué trabajar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El evento nuevo
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notifications
  drop constraint if exists notifications_event_check;

alter table public.notifications
  add constraint notifications_event_check
  check (event in (
    'lead.assigned',
    'followup.overdue',
    'client.stale'
  ));

-- Un aviso de inactividad por (vendedor, cliente, día).
--
-- Índice propio en vez de ampliar el de `followup.overdue`: ese ya existe con
-- datos adentro, y tocarlo podría fallar si hubiera duplicados históricos. Este
-- se crea sobre un evento que todavía no tiene ninguna fila.
create unique index if not exists notifications_stale_daily
  on public.notifications (user_id, ref_id, sent_on)
  where event = 'client.stale';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Encolar los clientes inactivos
-- ─────────────────────────────────────────────────────────────────────────────

-- "Inactivo" = no se registró ningún contacto en `p_dias` días. Si nunca hubo
-- contacto, se cuenta desde que el cliente entró al sistema — un lead que se
-- cargó hace un mes y nadie llamó es exactamente el caso a avisar.
--
-- No mira `crm_sync_enabled`, igual que todo lo de la 0043.
create or replace function public.encolar_clientes_inactivos(
  p_dias integer default 10
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with nuevas as (
    insert into public.notifications
      (user_id, event, ref_id, sent_at)
    select
      c.assigned_to, 'client.stale', c.id, null
    from public.clients c
    join public.profiles p on p.id = c.assigned_to
    left join lateral (
      select max(i.contacted_at) as ultimo
      from public.interactions i
      where i.client_id = c.id
    ) ult on true
    where c.status in ('pending', 'contacted')
      and p.role in ('seller', 'superadmin')
      and coalesce(ult.ultimo, c.created_at)
          < now() - make_interval(days => p_dias)
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from nuevas;
$$;

revoke execute
  on function public.encolar_clientes_inactivos(integer)
  from public, anon, authenticated;
grant execute
  on function public.encolar_clientes_inactivos(integer)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Los pendientes suman los días de inactividad
-- ─────────────────────────────────────────────────────────────────────────────

-- Se reemplaza la de la 0043 para agregar `dias_sin_contacto`: sin ese número
-- el mail diría "hace mucho" en vez de "hace 12 días", que es lo que hace que
-- alguien actúe.
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
          'vence', c.next_follow_up,
          'dias_sin_contacto', ult.dias
        )
        order by n.event, c.next_follow_up
      ) as items
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    left join public.clients c on c.id = n.ref_id
    left join lateral (
      select (
        extract(day from now() - coalesce(
          (select max(i.contacted_at)
             from public.interactions i
            where i.client_id = c.id),
          c.created_at
        ))
      )::integer as dias
    ) ult on true
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
-- 4. Fecha de seguimiento automática al asignar
-- ─────────────────────────────────────────────────────────────────────────────

-- Disparador BEFORE aparte: el de notificación es AFTER y no puede modificar la
-- fila.
--
-- Solo si `next_follow_up` viene vacío: si alguien agendó una fecha a mano, no
-- se pisa.
--
-- Mismo criterio que el aviso de asignación (0033): al CREAR solo se aplica a lo
-- cargado a mano en la app. Ponerle fecha a una importación de 50 clientes
-- generaría 50 vencidos de golpe tres días después. Al REASIGNAR se aplica
-- siempre: ahí alguien decidió "esto es tuyo" sobre un lead puntual.
create or replace function public.fecha_seguimiento_al_asignar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;
  if new.next_follow_up is not null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.origin <> 'app' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  new.next_follow_up := current_date + 3;
  return new;
end;
$$;

drop trigger if exists clients_fecha_seguimiento
  on public.clients;

create trigger clients_fecha_seguimiento
  before insert or update of assigned_to on public.clients
  for each row
  execute function public.fecha_seguimiento_al_asignar();

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA REVERTIR (no se ejecuta):
--
--   drop trigger if exists clients_fecha_seguimiento on public.clients;
--   drop function if exists public.fecha_seguimiento_al_asignar();
--   drop function if exists public.encolar_clientes_inactivos(integer);
--   drop index if exists public.notifications_stale_daily;
--   delete from public.notifications where event = 'client.stale';
--   alter table public.notifications
--     drop constraint if exists notifications_event_check;
--   alter table public.notifications
--     add constraint notifications_event_check
--     check (event in ('lead.assigned', 'followup.overdue'));
--
-- Y reaplicar `notificaciones_pendientes` de la 0043.
--
-- ⚠️ El revert NO borra las fechas de seguimiento que el disparador ya puso:
-- no hay forma de distinguirlas de las que alguien cargó a mano.
-- ─────────────────────────────────────────────────────────────────────────────
