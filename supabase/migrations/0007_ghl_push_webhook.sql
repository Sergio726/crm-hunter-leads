-- Database Webhook: al crear/editar un cliente cargado en app/web (origin='app'),
-- empujar el contacto a n8n → GHL (upsert). Usa pg_net (net.http_post, asíncrono).

create extension if not exists pg_net;

-- URL del webhook push de n8n (no es secreto). Editable sin tocar código.
insert into public.app_settings (key, value)
values ('n8n_push_url', to_jsonb('https://n8n.stlabs.ar/webhook/crm-push'::text))
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.push_to_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  push_url text;
  payload  jsonb;
begin
  -- Solo leads propios (app/web). Los importados de GHL no se re-empujan.
  if new.origin <> 'app' then
    return new;
  end if;
  -- GHL necesita al menos email o teléfono.
  if coalesce(new.email, '') = '' and coalesce(new.phone, '') = '' then
    return new;
  end if;

  select value #>> '{}' into push_url from public.app_settings where key = 'n8n_push_url';
  if push_url is null then
    return new;
  end if;

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
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  return new;
end;
$$;

drop trigger if exists clients_push_to_crm on public.clients;
create trigger clients_push_to_crm
  after insert or update on public.clients
  for each row execute function public.push_to_crm();
