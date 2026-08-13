-- PROSP-3 — El asistente de prospección pasa a OpenRouter, con la API key
-- cargada desde Configuración en vez de una variable de entorno.
--
-- Problema de seguridad a resolver: la key tiene que poder guardarse desde la UI
-- (rol superadmin) pero NO tiene que poder leerla un vendedor autenticado, que
-- podría llamar cualquier RPC con `grant to authenticated` y quedarse con ella.
--
-- Solución: el secreto vive en `private.integration_secrets` (ya existía, ver
-- 0010) y se separan los permisos:
--   * `set_integration_secret`   → authenticated, con chequeo interno de superadmin
--   * `integration_secret_status`→ authenticated (superadmin), devuelve solo booleanos
--   * `get_integration_secret`   → SOLO service_role: la usa el route handler del
--     servidor Next. Ningún usuario del navegador puede ejecutarla.

-- ---------------------------------------------------------------
-- Ajustes del asistente (no secretos) — van en app_settings
-- ---------------------------------------------------------------
insert into public.app_settings (key, value) values
  -- Modelo de OpenRouter, ej. "anthropic/claude-sonnet-4.5". Vacío = openrouter/auto.
  ('ai_model', to_jsonb(''::text)),
  -- Interruptor: apagado, /prospeccion sigue funcionando en modo guiado.
  ('ai_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- Escritura del secreto: solo superadmin, solo claves conocidas
-- ---------------------------------------------------------------
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

  -- Allowlist explícita: esta RPC no debe convertirse en un escritorio genérico
  -- sobre la tabla de secretos (ahí vive también el secreto de n8n).
  if p_key not in ('openrouter_api_key', 'google_places_api_key') then
    raise exception 'unknown secret key: %', p_key;
  end if;

  -- Cadena vacía = borrar la key configurada.
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

-- ---------------------------------------------------------------
-- Estado (para la UI): qué claves están cargadas, sin revelar el valor
-- ---------------------------------------------------------------
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
      -- Últimos 4 caracteres, para reconocer cuál key está cargada sin exponerla.
      'hint', right(secret_value, 4),
      'updated_at', updated_at
    )),
    '{}'::jsonb
  ) into result
  from private.integration_secrets
  where key in ('openrouter_api_key', 'google_places_api_key');

  return result;
end;
$$;
revoke execute on function public.integration_secret_status() from public, anon;
grant execute on function public.integration_secret_status() to authenticated;

-- ---------------------------------------------------------------
-- Lectura del secreto: SOLO para el servidor (service_role)
-- ---------------------------------------------------------------
-- Sin grant a `authenticated`: un vendedor logueado no puede ejecutarla ni
-- aunque conozca el nombre. El route handler de Next la llama con la
-- service_role key, que vive solo en el entorno del servidor.
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
    and p_key in ('openrouter_api_key', 'google_places_api_key');
$$;
revoke execute on function public.get_integration_secret(text) from public, anon, authenticated;
grant execute on function public.get_integration_secret(text) to service_role;
