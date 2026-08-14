-- PROSP-1 — Módulo de prospección asistida por IA.
--
-- Objetivo: que el CRM genere sus propios leads además de importarlos. El flujo
-- es: un agente de IA ayuda a definir el avatar (ICP) → se ejecuta la búsqueda
-- contra Google Places → los resultados se muestran en pantalla SIN persistir →
-- el usuario selecciona los que quiere y recién ahí se guardan en `prospects` →
-- desde ahí se promueven a `clients` (bandeja de vendedores).
--
-- Dos tablas nuevas (`prospect_searches`, `prospects`) y ningún cambio en el
-- funcionamiento actual de `clients`, salvo:
--   (a) `origin` acepta el valor nuevo 'hunter';
--   (b) el guard anti-spam de notificaciones cubre también ese origen.
-- GHL queda deliberadamente fuera: `push_to_crm()` sale temprano cuando
-- `origin <> 'app'` (ver 0007/0027), así que un cliente promovido desde
-- prospección NO se empuja a GHL. Es el comportamiento buscado en esta etapa.

-- ---------------------------------------------------------------
-- clients.origin: sumar 'hunter'
-- ---------------------------------------------------------------
-- El CHECK de 0006 se creó sin nombre explícito; se localiza por catálogo para
-- no depender del nombre autogenerado.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'clients'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%origin%';

  if constraint_name is not null then
    execute format('alter table public.clients drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.clients
  add constraint clients_origin_check
  check (origin in ('app', 'ghl', 'hunter'));

-- ---------------------------------------------------------------
-- prospect_searches: una fila por corrida de búsqueda (auditoría del avatar)
-- ---------------------------------------------------------------
create table public.prospect_searches (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references public.profiles(id),
  icp_summary  text,                      -- avatar en una línea, redactado por el agente
  filters      jsonb not null default '{}'::jsonb,  -- filtros efectivos usados
  results_count integer not null default 0,
  saved_count   integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.prospect_searches enable row level security;

create index prospect_searches_created_by_idx on public.prospect_searches (created_by, created_at desc);

create policy "members read own searches" on public.prospect_searches
  for select to authenticated
  using (created_by = (select auth.uid()) or private.is_superadmin());

create policy "members insert own searches" on public.prospect_searches
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "members update own searches" on public.prospect_searches
  for update to authenticated
  using (created_by = (select auth.uid()) or private.is_superadmin())
  with check (created_by = (select auth.uid()) or private.is_superadmin());

-- ---------------------------------------------------------------
-- prospects: candidatos guardados, ANTES de entrar al circuito comercial
-- ---------------------------------------------------------------
create table public.prospects (
  id                 uuid primary key default gen_random_uuid(),
  business_name      text not null,
  address            text,
  area               text,                -- zona tal cual se buscó ("Palermo, Buenos Aires")
  country            text not null default 'AR',
  niche              text not null default 'generico',
  phone              text,
  whatsapp_phone     text,                -- E.164, solo si el número parece celular
  website            text,                -- lo que publica la ficha (puede ser IG/portal)
  instagram          text,                -- handle sin @
  maps_url           text,
  google_place_id    text not null unique,   -- dedupe duro: nunca dos veces el mismo negocio
  rating             numeric(2,1),
  reviews_count      integer not null default 0,
  photos_count       integer not null default 0,
  has_own_website    boolean not null default false,
  score              integer check (score between 0 and 100),
  status             text not null default 'new'
                     check (status in ('new', 'promoted', 'discarded')),
  search_id          uuid references public.prospect_searches(id) on delete set null,
  created_by         uuid references public.profiles(id),
  promoted_client_id uuid references public.clients(id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.prospects enable row level security;

create index prospects_created_by_idx on public.prospects (created_by);
create index prospects_status_idx on public.prospects (status);
create index prospects_score_idx on public.prospects (score desc);
create index prospects_search_idx on public.prospects (search_id);

create trigger prospects_set_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

-- RLS: mismo criterio que clients — cada quien ve lo suyo, superadmin ve todo.
-- viewer (solo lectura del CRM) no participa de prospección.
create policy "members read own prospects" on public.prospects
  for select to authenticated
  using (created_by = (select auth.uid()) or private.is_superadmin());

create policy "members insert own prospects" on public.prospects
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "members update own prospects" on public.prospects
  for update to authenticated
  using (created_by = (select auth.uid()) or private.is_superadmin())
  with check (created_by = (select auth.uid()) or private.is_superadmin());

create policy "members delete own prospects" on public.prospects
  for delete to authenticated
  using (created_by = (select auth.uid()) or private.is_superadmin());

-- ---------------------------------------------------------------
-- prospect_import_status: qué place_ids ya están tomados (por cualquiera)
-- ---------------------------------------------------------------
-- Mismo problema que `ghl_import_status`: por RLS un vendedor no ve los
-- prospectos de otro, así que un negocio ya guardado le parecería "nuevo" y el
-- INSERT chocaría contra el UNIQUE. Esta RPC (security definer) revela lo
-- mínimo: place_id → nombre de quien lo tiene.
create or replace function public.prospect_import_status(p_place_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      p.google_place_id,
      coalesce(pr.full_name, pr.email, 'otro usuario')
    ),
    '{}'::jsonb
  )
  from public.prospects p
  left join public.profiles pr on pr.id = p.created_by
  where p.google_place_id = any(p_place_ids);
$$;
revoke execute on function public.prospect_import_status(text[]) from public, anon;
grant execute on function public.prospect_import_status(text[]) to authenticated;

-- ---------------------------------------------------------------
-- promote_prospects: prospecto → cliente (entra al circuito de vendedores)
-- ---------------------------------------------------------------
-- Atómica y con los chequeos del lado del servidor:
--   * un vendedor solo puede promover a su propia lista; superadmin a cualquiera;
--   * se saltea lo ya promovido y lo descartado;
--   * el cliente nace con origin='hunter' → NO se empuja a GHL (ver 0007/0027).
create or replace function public.promote_prospects(
  p_prospect_ids uuid[],
  p_assigned_to  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id   uuid := (select auth.uid());
  is_admin    boolean := private.is_superadmin();
  target_role text;
  rec         record;
  new_client  uuid;
  promoted    integer := 0;
  skipped     integer := 0;
begin
  if caller_id is null then
    raise exception 'not authenticated';
  end if;
  if not is_admin and p_assigned_to is distinct from caller_id then
    raise exception 'only superadmins can assign prospects to another user';
  end if;

  select role into target_role from public.profiles where id = p_assigned_to;
  if target_role is null then
    raise exception 'assignee does not exist';
  end if;
  if target_role not in ('seller', 'superadmin') then
    raise exception 'assignee must be a seller or superadmin';
  end if;

  for rec in
    select *
    from public.prospects
    where id = any(p_prospect_ids)
      and (is_admin or created_by = caller_id)
    for update
  loop
    if rec.status <> 'new' then
      skipped := skipped + 1;
      continue;
    end if;

    insert into public.clients (
      full_name, phone, company, assigned_to, status, origin, tags, notes
    )
    values (
      rec.business_name,
      coalesce(rec.whatsapp_phone, rec.phone),
      rec.business_name,
      p_assigned_to,
      'pending',
      'hunter',
      array_remove(array[rec.niche, rec.area], null),
      nullif(
        concat_ws(
          E'\n',
          'Prospecto detectado por búsqueda.',
          nullif(concat('Score: ', rec.score), 'Score: '),
          nullif(concat('Instagram: @', rec.instagram), 'Instagram: @'),
          nullif(concat('Ficha: ', rec.maps_url), 'Ficha: '),
          rec.notes
        ),
        ''
      )
    )
    returning id into new_client;

    update public.prospects
       set status = 'promoted',
           promoted_client_id = new_client
     where id = rec.id;

    promoted := promoted + 1;
  end loop;

  return jsonb_build_object('promoted', promoted, 'skipped', skipped);
end;
$$;
revoke execute on function public.promote_prospects(uuid[], uuid) from public, anon;
grant execute on function public.promote_prospects(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------
-- Notificaciones: no avisar por cada lead promovido
-- ---------------------------------------------------------------
-- Mismo criterio que la importación de GHL (ver 0026): la promoción es un alta
-- en lote hecha a mano por el propio usuario, así que notificar cada fila sería
-- ruido. Las reasignaciones posteriores (UPDATE de assigned_to) sí notifican.
create or replace function public.notify_lead_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_url text;
  webhook_secret text;
  assignee record;
  channel text;
  payload jsonb;
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  -- Anti-spam: altas en lote (import de GHL, promoción de prospectos).
  if tg_op = 'INSERT' and new.origin in ('ghl', 'hunter') then
    return new;
  end if;

  select value #>> '{}' into notify_url from public.app_settings where key = 'n8n_notify_url';
  if coalesce(notify_url, '') = '' or notify_url = 'null' then
    return new;
  end if;

  select id, email, phone, full_name, role, notification_prefs
    into assignee
  from public.profiles
  where id = new.assigned_to;

  if assignee.id is null or assignee.role not in ('seller', 'superadmin') then
    return new;
  end if;
  if coalesce(assignee.email, '') = '' and coalesce(assignee.phone, '') = '' then
    return new;
  end if;

  channel := coalesce(assignee.notification_prefs ->> 'channel', 'email');

  select secret_value into webhook_secret
  from private.integration_secrets where key = 'n8n_webhook_secret';

  payload := jsonb_build_object(
    'event', 'lead.assigned',
    'user', jsonb_strip_nulls(jsonb_build_object(
      'id', assignee.id,
      'email', assignee.email,
      'phone', assignee.phone,
      'name', assignee.full_name
    )),
    'preferred_channel', channel,
    'client', jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'full_name', new.full_name,
      'phone', new.phone,
      'company', new.company,
      'status', new.status
    )),
    'message', format('Nuevo cliente asignado: %s', new.full_name)
  );

  perform net.http_post(
    url := notify_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crm-lite-webhook-secret', coalesce(webhook_secret, '')
    )
  );

  insert into public.notifications (user_id, event, ref_id, channel)
  values (new.assigned_to, 'lead.assigned', new.id, channel);

  return new;
end;
$$;

revoke execute on function public.notify_lead_assigned() from public, anon, authenticated;
