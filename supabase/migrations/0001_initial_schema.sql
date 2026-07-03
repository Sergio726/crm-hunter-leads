-- CRM Lite — esquema inicial
-- Tablas: profiles, clients, interactions, app_settings
-- Seguridad: RLS por vendedor + rol superadmin

-- ---------------------------------------------------------------
-- Esquema privado para funciones internas (no expuesto por la API)
-- ---------------------------------------------------------------
create schema if not exists private;

-- ---------------------------------------------------------------
-- app_settings: configuración global (switch de WhatsApp, admins)
-- ---------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values
  ('whatsapp_mode', '"deeplink"'),
  ('superadmin_emails', '["sergio.sebass03@gmail.com"]'),
  ('timezone', '"America/Argentina/Buenos_Aires"');

-- ---------------------------------------------------------------
-- profiles: un perfil por usuario de auth (creado por trigger)
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role text not null default 'seller' check (role in ('seller', 'superadmin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- El rol del usuario se consulta con security definer para evitar
-- recursión de RLS sobre profiles. Vive en "private" y solo revela
-- el rol del propio usuario autenticado.
create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'superadmin'
  );
$$;
revoke execute on function private.is_superadmin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_superadmin() to authenticated;

-- Crea el perfil al primer login. El rol inicial sale de
-- app_settings.superadmin_emails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_emails jsonb;
begin
  select value into admin_emails
  from public.app_settings where key = 'superadmin_emails';

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    case when coalesce(admin_emails, '[]'::jsonb) ? new.email
         then 'superadmin' else 'seller' end
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Los usuarios no pueden editar su propio rol: solo columnas de perfil.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "superadmin reads all profiles" on public.profiles
  for select to authenticated
  using (private.is_superadmin());

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Cambio de rol: solo superadmin, vía RPC (security definer con chequeo interno).
create or replace function public.set_user_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can change roles';
  end if;
  if new_role not in ('seller', 'superadmin') then
    raise exception 'invalid role %', new_role;
  end if;
  update public.profiles set role = new_role where id = target_user;
end;
$$;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,                -- E.164: +5491122334455
  email text,
  company text,
  assigned_to uuid references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'won', 'lost')),
  next_follow_up date,
  ghl_contact_id text,
  ghl_synced_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clients enable row level security;

create index clients_assigned_to_idx on public.clients (assigned_to);
create index clients_status_idx on public.clients (status);
create index clients_ghl_pending_idx on public.clients (updated_at)
  where ghl_synced_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create policy "sellers read assigned clients" on public.clients
  for select to authenticated
  using (assigned_to = (select auth.uid()) or private.is_superadmin());

create policy "sellers insert own clients" on public.clients
  for insert to authenticated
  with check (assigned_to = (select auth.uid()) or private.is_superadmin());

create policy "sellers update assigned clients" on public.clients
  for update to authenticated
  using (assigned_to = (select auth.uid()) or private.is_superadmin())
  with check (assigned_to = (select auth.uid()) or private.is_superadmin());

create policy "superadmin deletes clients" on public.clients
  for delete to authenticated
  using (private.is_superadmin());

-- ---------------------------------------------------------------
-- interactions: registro inmutable de cada contacto
-- ---------------------------------------------------------------
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'call')),
  send_mode text not null default 'deeplink' check (send_mode in ('deeplink', 'api')),
  outcome text not null check (outcome in
    ('answered', 'no_answer', 'interested', 'not_interested',
     'follow_up_scheduled', 'wrong_number', 'other')),
  notes text,
  contacted_at timestamptz not null default now()
);
alter table public.interactions enable row level security;

create index interactions_client_idx on public.interactions (client_id);
create index interactions_user_date_idx on public.interactions (user_id, contacted_at);

create policy "read own interactions" on public.interactions
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_superadmin());

-- Solo se pueden registrar interacciones propias y sobre clientes
-- visibles para el usuario (la subconsulta respeta el RLS de clients).
create policy "insert own interactions" on public.interactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.clients c where c.id = client_id)
  );

-- ---------------------------------------------------------------
-- app_settings: lectura para todos, escritura solo superadmin
-- ---------------------------------------------------------------
create policy "authenticated read settings" on public.app_settings
  for select to authenticated
  using (true);

create policy "superadmin updates settings" on public.app_settings
  for update to authenticated
  using (private.is_superadmin())
  with check (private.is_superadmin());

create policy "superadmin inserts settings" on public.app_settings
  for insert to authenticated
  with check (private.is_superadmin());

-- ---------------------------------------------------------------
-- Vistas (security_invoker: respetan el RLS del usuario que consulta)
-- ---------------------------------------------------------------
create view public.v_pending_clients
with (security_invoker = true) as
  select *
  from public.clients
  where status = 'pending'
     or (status not in ('won', 'lost')
         and next_follow_up is not null
         and next_follow_up <= current_date);

create view public.v_contacts_daily
with (security_invoker = true) as
  select
    user_id,
    (contacted_at at time zone 'America/Argentina/Buenos_Aires')::date as day,
    channel,
    count(*) as total,
    count(distinct client_id) as unique_clients
  from public.interactions
  group by 1, 2, 3;

create view public.v_contacts_weekly
with (security_invoker = true) as
  select
    user_id,
    date_trunc('week', contacted_at at time zone 'America/Argentina/Buenos_Aires')::date as week_start,
    count(*) as total,
    count(distinct client_id) as unique_clients
  from public.interactions
  group by 1, 2;

-- Dashboard superadmin: resumen por vendedor
create view public.v_seller_stats
with (security_invoker = true) as
  select
    p.id as user_id,
    p.full_name,
    p.email,
    count(distinct c.id) as clients_assigned,
    count(distinct c.id) filter (where c.status = 'pending') as clients_pending,
    count(distinct c.id) filter (where c.status = 'won') as clients_won,
    count(i.id) filter (
      where (i.contacted_at at time zone 'America/Argentina/Buenos_Aires')::date
            = (now() at time zone 'America/Argentina/Buenos_Aires')::date
    ) as contacts_today,
    count(i.id) filter (
      where i.contacted_at >= date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')
            at time zone 'America/Argentina/Buenos_Aires'
    ) as contacts_this_week,
    max(i.contacted_at) as last_contact_at
  from public.profiles p
  left join public.clients c on c.assigned_to = p.id
  left join public.interactions i on i.user_id = p.id
  where p.role = 'seller'
  group by p.id, p.full_name, p.email;
