-- 0032 — Matriz de permisos editable: qué rol entra a qué sección del panel web.
--
-- Hasta ahora esto estaba escrito a mano en el código (array LINKS del sidebar
-- + guardas de cada página). Pasa a `app_settings` para que el superadmin lo
-- edite desde Configuración → "Quién ve cada sección".
--
-- ALCANCE, que conviene tener claro: esto controla **a qué pantallas se entra**
-- en el panel web. NO controla los datos: el único límite real sobre qué puede
-- leer cada usuario sigue siendo el RLS, que esta migración no toca. Destildar
-- una casilla esconde una pantalla, no esconde información.
--
-- El valor sembrado replica EXACTAMENTE el comportamiento actual, así que
-- aplicar esta migración no cambia nada visible. Si algo cambia, es un bug.
--
-- No hace falta tocar políticas: `app_settings` ya deja leer a cualquier
-- autenticado (el sidebar lo necesita) y escribir solo al superadmin.

-- superadmin y pending NO se guardan: son invariantes del código (el admin ve
-- todo, la cuenta sin autorizar no ve nada). Al no existir en el dato, no hay
-- forma de que un admin se quite a sí mismo el acceso a Configuración.
insert into public.app_settings (key, value)
values (
  'role_permissions',
  '{
    "version": 1,
    "sections": {
      "clientes":      { "seller": true,  "viewer": true  },
      "prospeccion":   { "seller": true,  "viewer": false },
      "contactos-ghl": { "seller": true,  "viewer": false },
      "reportes":      { "seller": false, "viewer": false }
    }
  }'::jsonb
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Guard en la base, no solo en la interfaz.
--
-- La escritura ya está limitada a superadmin por RLS, pero eso no impide que
-- un admin edite el JSON a mano desde el SQL Editor, o que un bug futuro del
-- front guarde una forma inesperada y deje el panel raro para todos. Este
-- trigger hace que el invariante sea del esquema: descarta lo que no reconoce
-- en vez de confiar en quien escribe. Mismo criterio que el guard de
-- `set_user_role` (migración 0014/0015).
-- ---------------------------------------------------------------------------
create or replace function private.sanitize_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming    jsonb;
  clean       jsonb := '{}'::jsonb;
  section_id  text;
  section_val jsonb;
  -- Únicas secciones configurables. Inicio, Equipo y Configuración quedan
  -- afuera a propósito: sus acciones están bloqueadas en la propia base, así
  -- que otorgarlas daría una pantalla de botones que fallan.
  allowed_sections text[] := array['clientes', 'prospeccion', 'contactos-ghl', 'reportes'];
begin
  if new.key <> 'role_permissions' then
    return new;
  end if;

  if jsonb_typeof(new.value) <> 'object' then
    raise exception 'role_permissions debe ser un objeto JSON';
  end if;

  incoming := coalesce(new.value -> 'sections', '{}'::jsonb);
  if jsonb_typeof(incoming) <> 'object' then
    raise exception 'role_permissions.sections debe ser un objeto JSON';
  end if;

  for section_id, section_val in select * from jsonb_each(incoming) loop
    if section_id = any(allowed_sections) and jsonb_typeof(section_val) = 'object' then
      clean := clean || jsonb_build_object(
        section_id,
        -- Solo seller y viewer, y solo si son booleanos. Cualquier otra clave
        -- (incluidos superadmin y pending) se descarta en silencio.
        (case when jsonb_typeof(section_val -> 'seller') = 'boolean'
              then jsonb_build_object('seller', section_val -> 'seller')
              else '{}'::jsonb end)
        ||
        (case when jsonb_typeof(section_val -> 'viewer') = 'boolean'
              then jsonb_build_object('viewer', section_val -> 'viewer')
              else '{}'::jsonb end)
      );
    end if;
  end loop;

  new.value := jsonb_build_object('version', 1, 'sections', clean);
  return new;
end;
$$;

revoke execute on function private.sanitize_role_permissions() from public, anon, authenticated;

create trigger app_settings_sanitize_role_permissions
  before insert or update on public.app_settings
  for each row
  when (new.key = 'role_permissions')
  execute function private.sanitize_role_permissions();

comment on function private.sanitize_role_permissions() is
  'Normaliza role_permissions: descarta secciones no configurables, roles desconocidos y valores no booleanos.';
