-- Protege el webhook Supabase -> n8n con un secreto privado.
-- El valor real NO vive en esta migracion: se carga por SQL operativo en
-- private.integration_secrets con key = 'n8n_webhook_secret'.

create table if not exists private.integration_secrets (
  key text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

alter table private.integration_secrets enable row level security;

revoke all on table private.integration_secrets from public, anon, authenticated;

create or replace function private.set_integration_secret_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists integration_secrets_set_updated_at on private.integration_secrets;
create trigger integration_secrets_set_updated_at
  before update on private.integration_secrets
  for each row execute function private.set_integration_secret_updated_at();

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
  -- Solo leads propios (app/web). Los importados de GHL no se re-empujan.
  if new.origin <> 'app' then
    return new;
  end if;
  -- GHL necesita al menos email o telefono.
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

  payload := jsonb_strip_nulls(jsonb_build_object(
    'name', new.full_name,
    'email', new.email,
    'phone', new.phone,
    'companyName', new.company,
    'tags', new.tags
  ));

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

revoke execute on function private.set_integration_secret_updated_at() from public, anon, authenticated;
revoke execute on function public.push_to_crm() from public, anon, authenticated;
