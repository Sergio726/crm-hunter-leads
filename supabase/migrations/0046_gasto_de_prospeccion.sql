-- 0046 — Que el gasto de prospección se pueda contar de verdad (PROSP-4)
--
-- EL PROBLEMA
-- El panel ya mostraba "vas por ~N de 1000 consultas gratis del mes", y ese
-- número estaba MAL en dos sentidos distintos:
--
--   1. Se calculaba sobre `prospect_searches`, que solo se escribe cuando el
--      vendedor GUARDA prospectos. Una búsqueda que no se guarda —incluidas
--      todas las que devuelven cero— gastaba consultas sin aparecer en la
--      cuenta. El consumo real siempre fue mayor que el mostrado.
--
--   2. `prospect_request_log` sí registra todas, pero su RLS deja que cada
--      vendedor lea SOLO las suyas. El plan gratis de Google es de la CUENTA,
--      no de cada persona, así que un vendedor veía una fracción del consumo y
--      creía que sobraba margen.
--
-- LA FUNCIÓN
-- Devuelve los filtros de las búsquedas de Google del mes en curso, de todo el
-- equipo. Se devuelven los FILTROS y no un total ya sumado a propósito: la
-- fórmula que traduce filtros a consultas vive en `budget.ts` y la usa también
-- el Plan de Caza para prometer el costo. Si se reescribiera acá en SQL, el
-- número prometido y el número contado podrían separarse sin que nadie se
-- entere.
--
-- Qué expone: zona, rubro, país y términos de búsqueda. Ningún dato de
-- prospectos ni de clientes, y ni siquiera de quién buscó.

create or replace function public.prospect_google_filters_this_month()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(l.filters), '[]'::jsonb)
  from public.prospect_request_log l
  where l.source = 'google_places'
    and l.created_at >= date_trunc('month', now())
    and private.is_active_member();
$$;

comment on function public.prospect_google_filters_this_month() is
  'Filtros de las busquedas de Google del mes, de todo el equipo.';

-- Solo los miembros activos, y solo a través de esta función. El `where` de
-- arriba ya corta si quien llama no es miembro: sin la condición, una función
-- `security definer` le devolvería los datos a cualquiera con sesión.

revoke execute on function public.prospect_google_filters_this_month()
  from public, anon;

grant execute on function public.prospect_google_filters_this_month()
  to authenticated, service_role;
