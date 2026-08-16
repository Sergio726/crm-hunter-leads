-- Fundación multi-fuente de `prospects` (PROSP-12, Fase 1).
--
-- Hoy la tabla asume Google Maps: `google_place_id` es NOT NULL UNIQUE y es la
-- identidad del prospecto. Una persona de LinkedIn no tiene uno, y ya hubo que
-- falsificarlo para importar el Excel de 119 inmobiliarias (`xlsx:ticket1500:…`).
-- Esta migración cambia la identidad a `source` + `source_ref`, que sirve para
-- cualquier fuente, y agrega las columnas que necesitan las personas y las
-- cuentas sociales.
--
-- ── Regla que gobierna toda esta migración ────────────────────────────────────
-- La app que está desplegada AHORA sigue insertando `google_place_id` y sigue
-- llamando a `prospect_import_status(p_place_ids)`. La migración se aplica en
-- producción antes de que el código nuevo se mergee, así que **nada de lo viejo
-- puede dejar de funcionar**. Por eso:
--   · `google_place_id` no se borra: pasa a admitir NULL y se conserva.
--   · Un trigger mantiene sincronizados `google_place_id` y `source_ref`, así
--     insertar por cualquiera de los dos caminos deja la fila consistente.
--   · La firma vieja de `prospect_import_status` se mantiene intacta y la nueva
--     entra como sobrecarga con otra firma.
-- El borrado de `google_place_id` queda para una migración posterior, recién
-- cuando esté confirmado que nadie lo usa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Identidad de fuente
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.prospects
  add column if not exists source     text,
  add column if not exists source_ref text,
  add column if not exists kind       text;

-- Backfill. Los importados del Excel se reconocen por el prefijo sintético que
-- se les puso justamente porque no venían de Google.
update public.prospects
   set source = case when google_place_id like 'xlsx:%' then 'import' else 'google_places' end,
       source_ref = case
                      when google_place_id like 'xlsx:%' then substring(google_place_id from 6)
                      else google_place_id
                    end,
       kind = 'business'
 where source is null;

alter table public.prospects
  alter column source     set not null,
  alter column source_ref set not null,
  alter column kind       set not null,
  alter column source     set default 'google_places',
  alter column kind       set default 'business';

-- `google_place_id` deja de ser obligatorio: un prospecto de LinkedIn no tiene.
-- Se conserva la columna y su UNIQUE — en Postgres varios NULL no chocan entre
-- sí, así que las fuentes nuevas conviven sin tocar la restricción vieja.
alter table public.prospects alter column google_place_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_source_check'
  ) then
    alter table public.prospects
      add constraint prospects_source_check
      check (source in ('google_places', 'linkedin', 'instagram', 'tiktok', 'import'));
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_kind_check'
  ) then
    alter table public.prospects
      add constraint prospects_kind_check
      check (kind in ('business', 'person', 'account'));
  end if;

  -- La identidad nueva. Reemplaza en la práctica al UNIQUE de google_place_id,
  -- que se mantiene solo por compatibilidad hasta que se borre la columna.
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_source_ref_key'
  ) then
    alter table public.prospects
      add constraint prospects_source_ref_key unique (source, source_ref);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Columnas que las fuentes nuevas necesitan
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `business_name` sigue siendo el nombre que se muestra, sea un comercio o una
-- persona: así ninguna pantalla existente deja de funcionar. Para una persona
-- se completa con su nombre, y el empleador va en `company_name`.

alter table public.prospects
  add column if not exists role_title   text,
  add column if not exists company_name text,
  -- PROSP-6: `clients.email` existe desde la 0001 pero `prospects` nunca tuvo
  -- dónde guardarlo, así que TODO lead de prospección llegaba sin email.
  add column if not exists email        text,
  -- Tamaño y actividad de audiencia SIN importar la red, para poder ordenar una
  -- lista que mezcla Instagram con TikTok. Las columnas `ig_*` siguen siendo el
  -- detalle específico de Instagram.
  add column if not exists audience_size     integer,
  add column if not exists audience_activity text,
  -- Todo lo propio de cada fuente que no merece una columna: verificado, rubro
  -- declarado, cantidad de seguidos, antigüedad en el cargo, etc.
  add column if not exists source_data  jsonb not null default '{}'::jsonb;

update public.prospects
   set audience_size = ig_followers
 where audience_size is null and ig_followers is not null;

update public.prospects
   set audience_activity = ig_activity
 where audience_activity is null and ig_activity is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_audience_activity_check'
  ) then
    alter table public.prospects
      add constraint prospects_audience_activity_check
      check (audience_activity in ('activo', 'tibio', 'dormido'));
  end if;
end $$;

create index if not exists prospects_source_idx
  on public.prospects (source, kind);
create index if not exists prospects_audience_size_idx
  on public.prospects (audience_size desc nulls last);
create index if not exists prospects_email_idx
  on public.prospects (email) where email is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. El puente de compatibilidad
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La app desplegada inserta `google_place_id` y no sabe que existe `source_ref`.
-- El código nuevo va a hacer lo contrario. Este trigger deja las dos columnas
-- coherentes venga por donde venga la fila, que es lo que permite aplicar la
-- migración hoy y mergear el código cuando esté.

create or replace function private.prospects_sync_source_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source is null then
    new.source := case when new.google_place_id like 'xlsx:%' then 'import' else 'google_places' end;
  end if;

  -- Camino viejo: llega el place_id, falta la referencia.
  if new.source_ref is null and new.google_place_id is not null then
    new.source_ref := case
                        when new.google_place_id like 'xlsx:%' then substring(new.google_place_id from 6)
                        else new.google_place_id
                      end;
  end if;

  -- Camino nuevo: llega la referencia y la fuente es Google, así que el
  -- place_id se puede reconstruir y el dedupe viejo sigue funcionando.
  if new.google_place_id is null and new.source = 'google_places' then
    new.google_place_id := new.source_ref;
  end if;

  if new.kind is null then
    new.kind := case when new.source in ('linkedin') then 'person'
                     when new.source in ('instagram', 'tiktok') then 'account'
                     else 'business' end;
  end if;

  return new;
end;
$$;

drop trigger if exists prospects_sync_source_ref on public.prospects;
create trigger prospects_sync_source_ref
  before insert or update on public.prospects
  for each row execute function private.prospects_sync_source_ref();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Ejecuciones asíncronas (Fase 3)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El plan Hobby de Vercel corta cualquier petición a los 60 s y un raspado de
-- LinkedIn puede tardar minutos. Se arranca el trabajo, se guarda acá, y la
-- pantalla pregunta cómo viene. También cierra la trampa del 408 de Apify, que
-- corta la conexión pero sigue facturando el run: guardando `external_run_id`
-- el resultado se puede recuperar en vez de pagarlo dos veces.

create table if not exists public.prospect_runs (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references public.profiles(id),
  search_id       uuid references public.prospect_searches(id) on delete set null,
  source          text not null,
  job             text not null default 'search' check (job in ('search', 'enrich', 'contacts')),
  status          text not null default 'running' check (status in ('running', 'done', 'error', 'cancelled')),
  external_run_id text,
  params          jsonb not null default '{}'::jsonb,
  result          jsonb,
  error           text,
  items_total     integer not null default 0,
  items_done      integer not null default 0,
  cost_usd        numeric(10, 4),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists prospect_runs_created_by_idx
  on public.prospect_runs (created_by, created_at desc);
create index if not exists prospect_runs_status_idx
  on public.prospect_runs (status) where status = 'running';

drop trigger if exists prospect_runs_set_updated_at on public.prospect_runs;
create trigger prospect_runs_set_updated_at
  before update on public.prospect_runs
  for each row execute function public.set_updated_at();

alter table public.prospect_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'prospect_runs' and policyname = 'members read own runs') then
    create policy "members read own runs" on public.prospect_runs
      for select using (created_by = (select auth.uid()) or private.is_superadmin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'prospect_runs' and policyname = 'members insert own runs') then
    create policy "members insert own runs" on public.prospect_runs
      for insert with check (created_by = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'prospect_runs' and policyname = 'members update own runs') then
    create policy "members update own runs" on public.prospect_runs
      for update using (created_by = (select auth.uid()) or private.is_superadmin())
             with check (created_by = (select auth.uid()) or private.is_superadmin());
  end if;
end $$;

grant select, insert, update on public.prospect_runs to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. El plan aprobado (Fase 4)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Turbo muestra el Plan de Caza y el usuario lo aprueba o lo edita. Guardarlo
-- permite saber después qué se prometió y qué se entregó.

alter table public.prospect_searches
  add column if not exists plan        jsonb,
  add column if not exists approved_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Funciones
-- ─────────────────────────────────────────────────────────────────────────────

-- Sobrecarga nueva por (fuente, referencias). La firma vieja
-- `prospect_import_status(p_place_ids text[])` NO se toca: la app desplegada la
-- sigue llamando y tiene que seguir andando hasta que se mergee el código nuevo.
create or replace function public.prospect_import_status(
  p_source text,
  p_refs   text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      p.source_ref,
      coalesce(pr.full_name, pr.email, 'otro usuario')
    ),
    '{}'::jsonb
  )
  from public.prospects p
  left join public.profiles pr on pr.id = p.created_by
  where p.source = p_source
    and p.source_ref = any(p_refs);
$$;

revoke execute on function public.prospect_import_status(text, text[]) from public, anon;
grant execute on function public.prospect_import_status(text, text[]) to authenticated;

-- `promote_prospects`: que el email y los datos de la persona lleguen al cliente.
--
-- Hasta ahora el email no viajaba porque `prospects` no tenía la columna — es el
-- agujero que describe PROSP-6. Ahora sí. El cargo y la empresa van a las notas
-- por la misma razón que el Instagram y el LinkedIn: `clients` es el contrato
-- compartido con la app móvil y con n8n, y sumarle columnas obliga a tocar los dos.
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
      full_name, phone, email, company, assigned_to, status, origin, tags, notes
    )
    values (
      rec.business_name,
      coalesce(rec.whatsapp_phone, rec.phone),
      rec.email,
      coalesce(rec.company_name, rec.business_name),
      p_assigned_to,
      'pending',
      'hunter',
      array_remove(array[rec.niche, rec.area], null),
      nullif(
        concat_ws(
          E'\n',
          'Prospecto detectado por búsqueda.',
          nullif(concat('Score: ', rec.score), 'Score: '),
          nullif(concat('Cargo: ', rec.role_title), 'Cargo: '),
          nullif(concat('Instagram: @', rec.instagram), 'Instagram: @'),
          nullif(concat('LinkedIn: https://www.linkedin.com/', rec.linkedin), 'LinkedIn: https://www.linkedin.com/'),
          nullif(concat('Ficha: ', rec.maps_url), 'Ficha: '),
          nullif(concat('Sitio: ', rec.website), 'Sitio: '),
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
