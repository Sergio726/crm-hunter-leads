-- PROSP-5 — Enriquecimiento de prospectos con datos reales de Instagram (Apify).
--
-- Problema que resuelve: hasta ahora la señal "Instagram" solo decía que el
-- handle aparecía en la ficha de Google. Un negocio con una cuenta abandonada
-- hace tres años puntuaba igual que uno que publica todas las semanas.
--
-- El enriquecimiento es un paso APARTE y posterior al guardado, no parte de la
-- búsqueda: cada scrape se paga, así que solo tiene sentido pagarlo por los
-- prospectos que ya te interesaron lo suficiente como para guardarlos.
--
-- Decisión: NO se recalcula `score`. Un mismo número tiene que seguir
-- significando lo mismo para todos los prospectos, enriquecidos o no. La señal
-- nueva vive en `ig_activity`, que es accionable por sí sola.

alter table public.prospects
  add column ig_followers      integer,
  add column ig_posts_count    integer,
  add column ig_last_post_at   timestamptz,
  add column ig_bio            text,
  add column ig_is_business    boolean,
  -- Qué tan viva está la cuenta, derivado de la última publicación:
  --   activo  = publicó hace menos de 60 días
  --   tibio   = entre 60 y 180 días
  --   dormido = más de 180 días, o sin publicaciones
  add column ig_activity       text check (ig_activity in ('activo', 'tibio', 'dormido')),
  add column enriched_at       timestamptz,
  add column enrichment_status text check (
    enrichment_status in ('ok', 'not_found', 'private', 'error')
  );

-- Para filtrar/ordenar por lo que más importa: cuentas vivas y con audiencia.
create index prospects_ig_activity_idx on public.prospects (ig_activity)
  where ig_activity is not null;
create index prospects_ig_followers_idx on public.prospects (ig_followers desc nulls last);

-- ---------------------------------------------------------------
-- Sumar el token de Apify a la allowlist de secretos (ver 0029)
-- ---------------------------------------------------------------
-- Las tres RPC llevan la lista de claves permitidas escrita a mano a propósito:
-- así esta familia de funciones no se vuelve un escritorio genérico sobre la
-- tabla de secretos, donde también vive el secreto de n8n.

create or replace function public.set_integration_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can set integration secrets';
  end if;

  if p_key not in ('openrouter_api_key', 'google_places_api_key', 'apify_api_token') then
    raise exception 'unknown secret key: %', p_key;
  end if;

  if coalesce(trim(p_value), '') = '' then
    delete from private.integration_secrets where key = p_key;
    return;
  end if;

  insert into private.integration_secrets (key, secret_value)
  values (p_key, trim(p_value))
  on conflict (key) do update set secret_value = excluded.secret_value;
end;
$$;
revoke execute on function public.set_integration_secret(text, text) from public, anon;
grant execute on function public.set_integration_secret(text, text) to authenticated;

create or replace function public.integration_secret_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can read integration secret status';
  end if;

  select coalesce(
    jsonb_object_agg(key, jsonb_build_object(
      'configured', true,
      'hint', right(secret_value, 4),
      'updated_at', updated_at
    )),
    '{}'::jsonb
  ) into result
  from private.integration_secrets
  where key in ('openrouter_api_key', 'google_places_api_key', 'apify_api_token');

  return result;
end;
$$;
revoke execute on function public.integration_secret_status() from public, anon;
grant execute on function public.integration_secret_status() to authenticated;

-- Lectura del valor: sigue concedida SOLO a service_role (el servidor Next).
create or replace function public.get_integration_secret(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select secret_value
  from private.integration_secrets
  where key = p_key
    and p_key in ('openrouter_api_key', 'google_places_api_key', 'apify_api_token');
$$;
revoke execute on function public.get_integration_secret(text) from public, anon, authenticated;
grant execute on function public.get_integration_secret(text) to service_role;
