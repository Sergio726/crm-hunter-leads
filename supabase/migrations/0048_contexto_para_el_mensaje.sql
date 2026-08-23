-- MSG-1 · Fase 1 — Que el cliente pueda recordar de dónde salió.
--
-- El plan (docs/PRIMER-MENSAJE.md) pedía agregar `clients.prospect_id`. No hace
-- falta: el vínculo YA existe, en la dirección contraria —
-- `prospects.promoted_client_id`, que escribe `promote_prospects`. Agregar la
-- columna del otro lado sería duplicar la relación y arriesgarse a que las dos
-- se desincronicen.
--
-- Lo que sí falta son dos cosas.
--
-- 1) Un índice: sin él, ir del cliente a su prospecto es un scan de la tabla.
--
-- 2) Una forma de leerlo. El RLS de `prospects` es "los míos o soy superadmin",
--    así que en el caso más común —el superadmin busca, guarda y le asigna los
--    leads a un vendedor— **el vendedor no puede leer el prospecto de su propio
--    cliente**. Sin esto, el mensaje personalizado le saldría genérico justo a
--    quien lo necesita.
--
-- Se resuelve con una función y no abriendo la tabla: así el vendedor accede al
-- contexto del cliente que tiene asignado, y a nada más.

create index if not exists prospects_promoted_client_idx
  on public.prospects (promoted_client_id)
  where promoted_client_id is not null;


-- Todo lo que hace falta para escribirle a un cliente, en una sola consulta.
--
-- Devuelve el cliente, los datos del prospecto del que salió (si salió de uno)
-- y su historial reciente. Lo usan el panel de contexto de la ficha y el
-- redactor del primer mensaje.
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
      'ig_category', pro.ig_category,
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

comment on function public.client_message_context(uuid)
  is 'Cliente + prospecto de origen + historial reciente, para redactar el mensaje.';

revoke execute on function public.client_message_context(uuid) from public, anon;

grant execute on function public.client_message_context(uuid) to authenticated;


-- ============================================================
-- COMPROBACIÓN — devuelve 2 filas, las dos con ok = true
-- ============================================================

select
  '0048: indice del vinculo creado' as paso,
  count(*) = 1 as ok
from pg_indexes
where schemaname = 'public'
  and indexname = 'prospects_promoted_client_idx'

union all

select
  '0048: funcion de contexto creada',
  count(*) = 1
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'client_message_context';
