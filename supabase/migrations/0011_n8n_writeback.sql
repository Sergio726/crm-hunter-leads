-- N8N-5/6/7/9: contacto normalizado en push + RPCs seguros para n8n.
-- El secreto viaja en el header x-crm-lite-webhook-secret (n8n no puede leer
-- credenciales en expresiones, así que los nodos HTTP usan Header Auth nativa
-- y los RPC lo leen de request.headers). p_secret queda como fallback manual.

create or replace function private.verify_n8n_integration_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.integration_secrets
    where key in ('n8n_integration_secret', 'n8n_webhook_secret')
      and secret_value = p_secret
  );
$$;

revoke execute on function private.verify_n8n_integration_secret(text) from public, anon, authenticated;

create or replace function private.n8n_request_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-crm-lite-webhook-secret',
    ''
  );
$$;

revoke execute on function private.n8n_request_secret() from public, anon, authenticated;

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
  -- Anti-loop: el write-back de n8n actualiza crm_synced_at; ese UPDATE no debe
  -- re-disparar el push. Solo se empuja si el registro está "dirty" (synced_at
  -- null, que mark_crm_dirty repone cuando cambian los datos de contacto).
  if tg_op = 'UPDATE' and new.crm_synced_at is not null then
    return new;
  end if;
  if coalesce(new.email, '') = '' and coalesce(new.phone, '') = '' then
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

-- Los cambios de tags también deben re-sincronizarse (N8N-11).
create or replace function public.mark_crm_dirty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.company is distinct from old.company
     or new.tags is distinct from old.tags then
    new.crm_synced_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.n8n_crm_writeback(
  p_client_id uuid,
  p_crm_contact_id text,
  p_secret text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_id uuid;
begin
  if not private.verify_n8n_integration_secret(coalesce(p_secret, private.n8n_request_secret())) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if coalesce(p_crm_contact_id, '') = '' then
    raise exception 'crm_contact_id required' using errcode = '22023';
  end if;

  update public.clients
  set crm_contact_id = p_crm_contact_id,
      crm_synced_at = now()
  where id = p_client_id
    and origin = 'app'
  returning id into updated_id;

  if updated_id is null then
    raise exception 'client not found or not app origin' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'client_id', updated_id, 'crm_contact_id', p_crm_contact_id);
end;
$$;

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

  v_crm_id := nullif(trim(p_payload #>> '{crm_contact_id}'), '');
  if v_crm_id is null then
    raise exception 'crm_contact_id required' using errcode = '22023';
  end if;

  -- null si el payload no trae nombre: en update se conserva el existente.
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
    -- Los tags con prefijo crm-lite: son propios de la app (N8N-11): se
    -- preservan al mergear con los que manda GHL.
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

revoke execute on function public.n8n_crm_writeback(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.n8n_crm_list_pending(text, integer) from public, anon, authenticated;
revoke execute on function public.n8n_crm_upsert_inbound(jsonb, text) from public, anon, authenticated;

grant execute on function public.n8n_crm_writeback(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.n8n_crm_list_pending(text, integer) to anon, authenticated, service_role;
grant execute on function public.n8n_crm_upsert_inbound(jsonb, text) to anon, authenticated, service_role;

insert into public.app_settings (key, value)
values
  ('ghl_auto_import_enabled', 'false'::jsonb),
  ('ghl_auto_import_tags', '[]'::jsonb),
  ('ghl_status_stage_map', '{}'::jsonb),
  ('n8n_retry_max_attempts', '5'::jsonb)
on conflict (key) do nothing;

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
begin
  if not private.verify_n8n_integration_secret(coalesce(p_secret, private.n8n_request_secret())) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select coalesce((select value from public.app_settings where key = 'ghl_auto_import_enabled'), 'false'::jsonb)::text::boolean into enabled;
  select coalesce((select value from public.app_settings where key = 'ghl_auto_import_tags'), '[]'::jsonb) into tags;
  select coalesce((select value from public.app_settings where key = 'ghl_status_stage_map'), '{}'::jsonb) into stage_map;
  select coalesce((select value from public.app_settings where key = 'n8n_retry_max_attempts'), '5'::jsonb)::text::integer into max_attempts;

  return jsonb_build_object(
    'ghl_auto_import_enabled', enabled,
    'ghl_auto_import_tags', tags,
    'ghl_status_stage_map', stage_map,
    'n8n_retry_max_attempts', max_attempts
  );
end;
$$;

revoke execute on function public.n8n_get_integration_settings(text) from public;
grant execute on function public.n8n_get_integration_settings(text) to anon, authenticated, service_role;
