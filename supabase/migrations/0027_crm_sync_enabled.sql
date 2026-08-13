-- Interruptor maestro para pausar sync automática CRM Lite ↔ n8n/GHL.
-- Flag booleano (no vaciar URLs) para no perder configuración al pausar.
-- Default true: no corta producción al aplicar la migración.

insert into public.app_settings (key, value)
values ('crm_sync_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function private.is_crm_sync_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value from public.app_settings where key = 'crm_sync_enabled'),
    'true'::jsonb
  )::text::boolean;
$$;

revoke execute on function private.is_crm_sync_enabled() from public, anon, authenticated;

-- Push: no llama a n8n si sync pausada (los cambios siguen marcando dirty vía mark_crm_dirty).
create or replace function public.push_to_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  push_url text;
  webhook_secret text;
  payload  jsonb;
begin
  if new.origin <> 'app' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.crm_synced_at is not null then
    return new;
  end if;
  if coalesce(new.email, '') = '' and coalesce(new.phone, '') = '' then
    return new;
  end if;
  if not private.is_crm_sync_enabled() then
    return new;
  end if;

  select value #>> '{}' into push_url from public.app_settings where key = 'n8n_push_url';
  if push_url is null then
    return new;
  end if;

  select secret_value into webhook_secret
  from private.integration_secrets
  where key = 'n8n_webhook_secret';

  payload := jsonb_build_object(
    'event', 'contact.upserted',
    'contact', jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'full_name', new.full_name,
      'phone', new.phone,
      'email', new.email,
      'company', new.company,
      'status', new.status,
      'tags', new.tags
    ))
  );

  perform net.http_post(
    url := push_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crm-lite-webhook-secret', coalesce(webhook_secret, '')
    )
  );

  return new;
end;
$$;

revoke execute on function public.push_to_crm() from public, anon, authenticated;

-- Notify lead.assigned (lógica 0026 + guard de sync).
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
  if tg_op = 'INSERT' and new.origin = 'ghl' then
    return new;
  end if;
  if not private.is_crm_sync_enabled() then
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

-- Overdue list: vacío si sync pausada.
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

  if not private.is_crm_sync_enabled() then
    return '[]'::jsonb;
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

-- Retry: sin pendientes mientras sync esté pausada.
create or replace function public.n8n_crm_list_pending(
  p_secret text default null,
  p_limit integer default 50
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

  if not private.is_crm_sync_enabled() then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'full_name', c.full_name,
    'phone', c.phone,
    'email', c.email,
    'company', c.company,
    'status', c.status,
    'tags', c.tags
  )), '[]'::jsonb)
  into rows
  from (
    select id, full_name, phone, email, company, status, tags
    from public.clients
    where origin = 'app'
      and crm_synced_at is null
      and (coalesce(email, '') <> '' or coalesce(phone, '') <> '')
    order by updated_at asc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) c;

  return rows;
end;
$$;

revoke execute on function public.n8n_crm_list_pending(text, integer) from public, anon, authenticated;
grant execute on function public.n8n_crm_list_pending(text, integer) to anon, authenticated, service_role;

-- Inbound: skip silencioso (ok) para no disparar alertas Discord.
create or replace function public.n8n_crm_upsert_inbound(
  p_payload jsonb,
  p_secret text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_crm_id text;
  v_full_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_tags text[];
  v_existing_tags text[];
  v_merged_tags text[];
  v_client_id uuid;
  v_default_assignee uuid;
begin
  if not private.verify_n8n_integration_secret(coalesce(p_secret, private.n8n_request_secret())) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if not private.is_crm_sync_enabled() then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'crm_sync_disabled');
  end if;

  v_crm_id := nullif(trim(p_payload #>> '{crm_contact_id}'), '');
  if v_crm_id is null then
    raise exception 'crm_contact_id required' using errcode = '22023';
  end if;

  v_full_name := coalesce(
    nullif(trim(p_payload #>> '{full_name}'), ''),
    nullif(trim(p_payload #>> '{contactName}'), '')
  );
  v_email := nullif(trim(p_payload #>> '{email}'), '');
  v_phone := nullif(trim(p_payload #>> '{phone}'), '');
  v_company := nullif(trim(p_payload #>> '{company}'), '');
  v_tags := coalesce(
    (select array_agg(t) from jsonb_array_elements_text(coalesce(p_payload -> 'tags', '[]'::jsonb)) as t),
    '{}'::text[]
  );

  select id, tags into v_client_id, v_existing_tags
  from public.clients
  where crm_contact_id = v_crm_id
  limit 1;

  if v_client_id is not null then
    select coalesce(array_agg(t), '{}'::text[]) into v_merged_tags
    from (
      select t from unnest(coalesce(v_existing_tags, '{}'::text[])) as t where t like 'crm-lite:%'
      union
      select t from unnest(v_tags) as t
    ) s(t);

    update public.clients
    set full_name = coalesce(v_full_name, full_name),
        email = coalesce(v_email, email),
        phone = coalesce(v_phone, phone),
        company = coalesce(v_company, company),
        tags = v_merged_tags,
        crm_synced_at = now()
    where id = v_client_id;
  else
    select p.id into v_default_assignee
    from public.profiles p
    where p.role = 'superadmin'
    order by p.created_at asc
    limit 1;

    insert into public.clients (
      full_name, email, phone, company, assigned_to,
      status, origin, tags, crm_contact_id, crm_synced_at
    )
    values (
      coalesce(v_full_name, 'Sin nombre'), v_email, v_phone, v_company, v_default_assignee,
      'pending', 'ghl', v_tags, v_crm_id, now()
    )
    returning id into v_client_id;
  end if;

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'crm_contact_id', v_crm_id);
end;
$$;

revoke execute on function public.n8n_crm_upsert_inbound(jsonb, text) from public, anon, authenticated;
grant execute on function public.n8n_crm_upsert_inbound(jsonb, text) to anon, authenticated, service_role;

-- Auto-import: enabled efectivo = setting AND crm_sync_enabled.
create or replace function public.n8n_get_integration_settings(p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled boolean;
  tags jsonb;
  stage_map jsonb;
  max_attempts integer;
  sync_on boolean;
begin
  if not private.verify_n8n_integration_secret(coalesce(p_secret, private.n8n_request_secret())) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  sync_on := private.is_crm_sync_enabled();
  select coalesce((select value from public.app_settings where key = 'ghl_auto_import_enabled'), 'false'::jsonb)::text::boolean into enabled;
  select coalesce((select value from public.app_settings where key = 'ghl_auto_import_tags'), '[]'::jsonb) into tags;
  select coalesce((select value from public.app_settings where key = 'ghl_status_stage_map'), '{}'::jsonb) into stage_map;
  select coalesce((select value from public.app_settings where key = 'n8n_retry_max_attempts'), '5'::jsonb)::text::integer into max_attempts;

  return jsonb_build_object(
    'ghl_auto_import_enabled', enabled and sync_on,
    'ghl_auto_import_tags', tags,
    'ghl_status_stage_map', stage_map,
    'n8n_retry_max_attempts', max_attempts,
    'crm_sync_enabled', sync_on
  );
end;
$$;

revoke execute on function public.n8n_get_integration_settings(text) from public;
grant execute on function public.n8n_get_integration_settings(text) to anon, authenticated, service_role;
