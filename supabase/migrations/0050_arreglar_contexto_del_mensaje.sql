-- Arregla `client_message_context`, que fallaba al usarla.
--
-- Síntoma: al apretar "Escribir mensaje" en la ficha del cliente aparecía
-- "No se pudo leer el cliente".
--
-- Causa: la `0048` leía `pro.ig_category` como si fuera una columna de
-- `prospects`, y no lo es — ese dato viaja dentro del JSON `source_data`, que
-- es como ya lo leía `/api/prospect/approach`. La función se creó igual porque
-- **plpgsql no valida los nombres de columna al crearla**, solo al ejecutarla:
-- por eso la migración dijo "ok" y el error apareció recién al apretar el
-- botón.
--
-- Se cambia solo esa línea. El resto queda idéntico a la `0048`.

create or replace function public.client_message_context(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  cli       record;
  pro       record;
  historial jsonb;
  ultimo    record;
  cuantos   integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  -- Misma regla que la policy "sellers read assigned clients" (0015): el
  -- cliente propio, o cualquiera si el rol puede leer todo. Está repetida a
  -- mano porque `security definer` saltea el RLS; si esa policy cambia, esta
  -- condición hay que cambiarla con ella.
  select *
    into cli
    from public.clients
   where id = p_client_id
     and (assigned_to = (select auth.uid()) or private.is_read_all());

  if cli.id is null then
    raise exception 'client not found or not allowed';
  end if;

  -- De qué prospecto salió. Puede no haber ninguno: los clientes cargados a
  -- mano, importados por CSV o traídos de GHL no vienen de una búsqueda.
  select *
    into pro
    from public.prospects
   where promoted_client_id = cli.id
   limit 1;

  select count(*)
    into cuantos
    from public.interactions
   where client_id = cli.id;

  select *
    into ultimo
    from public.interactions
   where client_id = cli.id
     and channel <> 'note'
   order by contacted_at desc
   limit 1;

  -- Los últimos cinco alcanzan para no repetir lo ya dicho, que es para lo que
  -- se usa. Traer el historial entero de un cliente viejo sería pagarle al
  -- modelo por contexto que no va a leer.
  select coalesce(jsonb_agg(x order by x.contacted_at desc), '[]'::jsonb)
    into historial
    from (
      select i.contacted_at, i.channel, i.outcome, i.notes
        from public.interactions i
       where i.client_id = cli.id
       order by i.contacted_at desc
       limit 5
    ) x;

  return jsonb_build_object(
    'client', jsonb_build_object(
      'id', cli.id,
      'full_name', cli.full_name,
      'company', cli.company,
      'email', cli.email,
      'phone', cli.phone,
      'status', cli.status,
      'next_follow_up', cli.next_follow_up,
      'tags', to_jsonb(coalesce(cli.tags, array[]::text[])),
      'notes', cli.notes,
      'created_at', cli.created_at
    ),
    'prospect', case when pro.id is null then null else jsonb_build_object(
      'id', pro.id,
      'source', pro.source,
      'kind', pro.kind,
      'niche', pro.niche,
      'area', pro.area,
      'role_title', pro.role_title,
      'company_name', pro.company_name,
      'website', pro.website,
      'has_own_website', pro.has_own_website,
      'instagram', pro.instagram,
      'linkedin', pro.linkedin,
      'ig_bio', pro.ig_bio,
      -- Acá estaba el error: NO es una columna, viaja en `source_data`.
      'ig_category', pro.source_data ->> 'ig_category',
      'audience_size', coalesce(pro.audience_size, pro.ig_followers),
      'audience_activity', coalesce(pro.audience_activity, pro.ig_activity),
      'rating', pro.rating,
      'reviews_count', pro.reviews_count,
      'score', pro.score
    ) end,
    'history', jsonb_build_object(
      'total', cuantos,
      'last_contact_at', ultimo.contacted_at,
      'last_channel', ultimo.channel,
      'last_outcome', ultimo.outcome,
      'recent', historial
    )
  );
end;
$$;


-- ============================================================
-- COMPROBACIÓN — devuelve 1 fila con ok = true
--
-- No se puede EJECUTAR la función acá: el editor SQL de Supabase corre sin
-- sesión de usuario, así que `auth.uid()` es null y la función responde
-- "not authenticated", que es exactamente lo que tiene que hacer.
--
-- Lo que sí se puede comprobar sin sesión es que el cuerpo quedó con el
-- arreglo: que lea `ig_category` del JSON y no como columna. Eso es más que
-- mirar si la función existe —que fue el agujero de la 0048— y funciona en el
-- único lugar donde estas migraciones se corren.
-- ============================================================

select
  '0050: lee ig_category del JSON, no como columna' as paso,
  pg_get_functiondef(p.oid) like '%source_data ->> ''ig_category''%' as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'client_message_context';
