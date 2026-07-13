-- NOTIF-1 (ajuste): notificar también a superadmins, no solo a vendedores.
-- En la práctica el equipo suele ser mayormente superadmin (que también trabajan
-- leads), así que limitar a role='seller' hacía que las notificaciones casi nunca
-- dispararan. Ahora notifica a cualquier miembro que trabaje leads (seller o
-- superadmin). viewer (solo lectura) y pending (sin acceso) siguen sin notificar.
--
-- Se conserva el guard anti-spam: NO se notifica en la importación inicial de un
-- lead de GHL (INSERT con origin='ghl'), que asigna al superadmin por defecto y
-- llegaría en masa. Las reasignaciones posteriores (UPDATE) sí notifican.

create or replace function public.notify_lead_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_url text;
  webhook_secret text;
  assignee record;
  channel text;
  payload jsonb;
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  -- Anti-spam: no notificar en la importación inicial de un lead de GHL.
  if tg_op = 'INSERT' and new.origin = 'ghl' then
    return new;
  end if;

  select value #>> '{}' into notify_url from public.app_settings where key = 'n8n_notify_url';
  if coalesce(notify_url, '') = '' or notify_url = 'null' then
    return new;
  end if;

  select id, email, phone, full_name, role, notification_prefs
    into assignee
  from public.profiles
  where id = new.assigned_to;

  -- Notifica a quien trabaja leads: vendedor o superadmin.
  if assignee.id is null or assignee.role not in ('seller', 'superadmin') then
    return new;
  end if;
  if coalesce(assignee.email, '') = '' and coalesce(assignee.phone, '') = '' then
    return new;
  end if;

  channel := coalesce(assignee.notification_prefs ->> 'channel', 'email');

  select secret_value into webhook_secret
  from private.integration_secrets where key = 'n8n_webhook_secret';

  payload := jsonb_build_object(
    'event', 'lead.assigned',
    'user', jsonb_strip_nulls(jsonb_build_object(
      'id', assignee.id,
      'email', assignee.email,
      'phone', assignee.phone,
      'name', assignee.full_name
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

-- Mismo criterio para "seguimientos vencidos": incluir superadmins además de sellers.
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
      and p.role in ('seller', 'superadmin')
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

revoke execute on function public.n8n_list_overdue_followups(text, integer) from public;
grant execute on function public.n8n_list_overdue_followups(text, integer) to anon, authenticated, service_role;
