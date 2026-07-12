-- NOTIF-1: notificaciones al vendedor (email/WhatsApp/SMS) vía n8n → CRM (hoy GHL).
-- La app y la base son agnósticas al canal y al CRM: solo emiten un payload NORMALIZADO
-- y n8n decide cómo enviarlo (mismo principio multi-CRM de ARCHITECTURE.md).
--
-- Dos eventos para empezar (el resto se suma después con el mismo mecanismo):
--   1. lead.assigned    — se asigna un cliente a un vendedor  → trigger inmediato (pg_net)
--   2. followup.overdue — seguimiento vencido                 → cron n8n consulta esta lista
--
-- SAFE-BY-DEFAULT: sin `n8n_notify_url` configurada, el trigger no dispara nada y las RPC
-- solo devuelven datos si n8n las llama con el secreto. Aplicar esta migración NO cambia
-- ningún comportamiento observable hasta que se configure la URL y se despliegue el workflow.

-- URL del webhook de notificaciones en n8n (no es secreto, editable). 'null' = desactivado.
insert into public.app_settings (key, value)
values ('n8n_notify_url', 'null'::jsonb)
on conflict (key) do nothing;

-- Log de notificaciones enviadas: dedupe del cron de vencidos (no re-notificar el mismo
-- cliente el mismo día) + auditoría / feed de actividad futuro. ref_id = client relacionado.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event text not null check (event in ('lead.assigned', 'followup.overdue')),
  ref_id uuid,                 -- cliente relacionado (nullable para eventos globales futuros)
  channel text,                -- canal elegido al enviar (informativo: email/sms/whatsapp)
  sent_at timestamptz not null default now(),
  -- Columna de fecha explícita para el dedupe diario: `sent_at::date` no sirve en un índice
  -- (el cast timestamptz→date depende de la zona horaria, no es IMMUTABLE). Un default
  -- `current_date` sí se evalúa por-inserción sin problema.
  sent_on date not null default current_date
);

-- Un followup.overdue por (vendedor, cliente, día): el cron corre seguido pero no spamea.
create unique index if not exists notifications_overdue_daily
  on public.notifications (user_id, ref_id, sent_on)
  where event = 'followup.overdue';

create index if not exists notifications_user_idx on public.notifications (user_id, sent_at desc);

alter table public.notifications enable row level security;

-- Cada uno ve sus propias notificaciones; superadmin/viewer ven todo (mismo criterio que
-- clients/interactions). Sin políticas de INSERT/UPDATE/DELETE para authenticated: las filas
-- las crea el trigger/RPC (security definer) o n8n con el secreto; nadie las escribe desde la app.
create policy "read own notifications" on public.notifications
  for select using (user_id = (select auth.uid()) or private.is_read_all());

-- ─────────────────────────────────────────────────────────────────────────────
-- Evento 1: lead.assigned — trigger inmediato al asignar un cliente a un vendedor.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_lead_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_url text;
  webhook_secret text;
  seller record;
  channel text;
  payload jsonb;
begin
  -- Solo cuando se asigna a alguien nuevo (INSERT con assigned_to, o cambia el assigned_to).
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  select value #>> '{}' into notify_url from public.app_settings where key = 'n8n_notify_url';
  if coalesce(notify_url, '') = '' or notify_url = 'null' then
    return new;  -- desactivado hasta configurar la URL
  end if;

  select id, email, phone, full_name, role, notification_prefs
    into seller
  from public.profiles
  where id = new.assigned_to;

  -- Solo notificamos a vendedores (evita ruido al importar leads de GHL, que caen en el
  -- superadmin por defecto). Superadmins/viewers no reciben este aviso.
  if seller.id is null or seller.role <> 'seller' then
    return new;
  end if;
  if coalesce(seller.email, '') = '' and coalesce(seller.phone, '') = '' then
    return new;  -- sin canal de contacto no hay a dónde enviar
  end if;

  channel := coalesce(seller.notification_prefs ->> 'channel', 'email');

  select secret_value into webhook_secret
  from private.integration_secrets where key = 'n8n_webhook_secret';

  payload := jsonb_build_object(
    'event', 'lead.assigned',
    'user', jsonb_strip_nulls(jsonb_build_object(
      'id', seller.id,
      'email', seller.email,
      'phone', seller.phone,
      'name', seller.full_name
    )),
    'preferred_channel', channel,
    'client', jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'full_name', new.full_name,
      'phone', new.phone,
      'company', new.company,
      'status', new.status
    )),
    'message', format('Nuevo cliente asignado: %s', new.full_name)
  );

  perform net.http_post(
    url := notify_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crm-lite-webhook-secret', coalesce(webhook_secret, '')
    )
  );

  insert into public.notifications (user_id, event, ref_id, channel)
  values (new.assigned_to, 'lead.assigned', new.id, channel);

  return new;
end;
$$;

revoke execute on function public.notify_lead_assigned() from public, anon, authenticated;

drop trigger if exists clients_notify_lead_assigned on public.clients;
create trigger clients_notify_lead_assigned
  after insert or update of assigned_to on public.clients
  for each row execute function public.notify_lead_assigned();

-- ─────────────────────────────────────────────────────────────────────────────
-- Evento 2: followup.overdue — el cron de n8n consulta esta lista y envía.
-- Devuelve payloads normalizados ya listos para el workflow de envío, saltando los
-- que ya se notificaron hoy (dedupe vía la tabla notifications).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.n8n_list_overdue_followups(
  p_secret text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rows jsonb;
begin
  if not private.verify_n8n_integration_secret(coalesce(p_secret, private.n8n_request_secret())) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into rows
  from (
    select jsonb_build_object(
      'event', 'followup.overdue',
      'user', jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'email', p.email, 'phone', p.phone, 'name', p.full_name
      )),
      'preferred_channel', coalesce(p.notification_prefs ->> 'channel', 'email'),
      'client', jsonb_build_object(
        'id', c.id, 'full_name', c.full_name, 'phone', c.phone,
        'company', c.company, 'status', c.status, 'next_follow_up', c.next_follow_up
      ),
      'message', format('Seguimiento vencido: %s (venció el %s)', c.full_name, to_char(c.next_follow_up, 'DD/MM'))
    ) as x
    from public.clients c
    join public.profiles p on p.id = c.assigned_to
    where c.next_follow_up is not null
      and c.next_follow_up < current_date
      and c.status not in ('won', 'lost')
      and p.role = 'seller'
      and (coalesce(p.email, '') <> '' or coalesce(p.phone, '') <> '')
      and not exists (
        select 1 from public.notifications n
        where n.event = 'followup.overdue'
          and n.ref_id = c.id
          and n.user_id = p.id
          and n.sent_on = current_date
      )
    order by c.next_follow_up asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) s;

  return rows;
end;
$$;

-- Marca una notificación como enviada (n8n la llama tras un envío exitoso). Idempotente:
-- el índice único diario de followup.overdue evita duplicados aunque el cron reintente.
create or replace function public.n8n_mark_notified(
  p_user_id uuid,
  p_event text,
  p_ref_id uuid default null,
  p_channel text default null,
  p_secret text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.verify_n8n_integration_secret(coalesce(p_secret, private.n8n_request_secret())) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_event not in ('lead.assigned', 'followup.overdue') then
    raise exception 'invalid event %', p_event using errcode = '22023';
  end if;

  insert into public.notifications (user_id, event, ref_id, channel)
  values (p_user_id, p_event, p_ref_id, p_channel)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.n8n_list_overdue_followups(text, integer) from public;
grant execute on function public.n8n_list_overdue_followups(text, integer) to anon, authenticated, service_role;
revoke execute on function public.n8n_mark_notified(uuid, text, uuid, text, text) from public;
grant execute on function public.n8n_mark_notified(uuid, text, uuid, text, text) to anon, authenticated, service_role;
