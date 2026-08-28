-- La última publicación del perfil, guardada.
--
-- Es lo que más mejora un mensaje frío: mencionar algo que la persona escribió
-- esta semana no se parece en nada a "vi tu perfil".
--
-- Se guarda en vez de usarse y tirarse: un post traído hoy sirve para el primer
-- mensaje, para el seguimiento de la semana que viene y para la ficha cuando el
-- prospecto se promueva a cliente. Volver a pagarlo cada vez sería tirar plata
-- (~US$ 0,002 por post).
--
-- `last_post_at` se guarda aparte del texto porque **la fecha decide si el post
-- se usa**: mencionar algo de hace ocho meses delata el bot más que no
-- mencionar nada.

alter table public.prospects
  add column if not exists last_post_text text,
  add column if not exists last_post_at   timestamptz,
  add column if not exists last_post_url  text,
  add column if not exists posts_enriched_at timestamptz;

comment on column public.prospects.last_post_text is
  'Ultima publicacion propia del perfil, recortada.';

comment on column public.prospects.last_post_at is
  'Cuando se publico. Decide si el post todavia sirve para mencionarlo.';

comment on column public.prospects.posts_enriched_at is
  'Cuando se consulto por ultima vez, haya traido post o no.';

-- Para no volver a pagar por los que ya se consultaron.
create index if not exists prospects_sin_post_idx
  on public.prospects (posts_enriched_at)
  where posts_enriched_at is null;


-- ------------------------------------------------------------
-- El contexto del cliente también lleva el post
--
-- Un prospecto promovido sigue teniendo su publicación: sirve igual para el
-- primer mensaje que para el seguimiento. Se agregan dos campos al JSON que ya
-- devolvía la función; el resto queda idéntico a la `0050`.
-- ------------------------------------------------------------

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

  select *
    into cli
    from public.clients
   where id = p_client_id
     and (assigned_to = (select auth.uid()) or private.is_read_all());

  if cli.id is null then
    raise exception 'client not found or not allowed';
  end if;

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
      'ig_category', pro.source_data ->> 'ig_category',
      'audience_size', coalesce(pro.audience_size, pro.ig_followers),
      'audience_activity', coalesce(pro.audience_activity, pro.ig_activity),
      'rating', pro.rating,
      'reviews_count', pro.reviews_count,
      'score', pro.score,
      'last_post_text', pro.last_post_text,
      'last_post_at', pro.last_post_at
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
-- ============================================================

select
  '0052: columnas del ultimo post creadas' as paso,
  count(*) = 4 as ok
from information_schema.columns
where table_schema = 'public'
  and table_name = 'prospects'
  and column_name in
    ('last_post_text', 'last_post_at', 'last_post_url', 'posts_enriched_at')

union all

select
  '0052: el contexto del cliente lleva el post',
  pg_get_functiondef(p.oid) like '%last_post_text%'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'client_message_context';
