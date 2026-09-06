-- Andamio mínimo para reconstruir el esquema de Hunter Leads en un Postgres
-- pelado (Docker), sin la infraestructura de Supabase.
--
-- Por qué existe: las migraciones de `supabase/migrations/` dan por sentado
-- todo lo que Supabase pone alrededor de la base — los roles `anon`,
-- `authenticated` y `service_role`, el esquema `auth` con sus usuarios, el
-- esquema `storage`, y la extensión `pg_net`. Sin eso, la primera migración
-- falla en la línea 29 y no se puede comprobar nada.
--
-- Lo que este archivo NO hace: reimplementar Supabase. Crea la superficie
-- exacta que las migraciones tocan y nada más. Si mañana una migración usa una
-- columna nueva de `auth.users`, la verificación va a fallar acá — y eso es lo
-- que queremos que pase, en Docker y no en producción.

-- ---------------------------------------------------------------
-- Roles. Las migraciones les dan grants; sin ellos, todo falla.
-- ---------------------------------------------------------------
do $andamio$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$andamio$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- auth: solo las columnas que las migraciones leen de verdad.
--   0001 -> id, email, raw_user_meta_data (trigger de alta de perfil)
--   0034 -> last_sign_in_at, email_confirmed_at
-- ---------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

-- `auth.uid()` es el corazón de las políticas RLS del proyecto. En Supabase
-- sale del JWT; acá sale de una variable de sesión que la prueba puede fijar
-- con `set local request.jwt.claim.sub = '<uuid>'`, que es justamente lo que
-- permite verificar el aislamiento entre vendedores sin levantar GoTrue.
create or replace function auth.uid()
returns uuid
language sql
stable
as $andamio$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$andamio$;

create or replace function auth.role()
returns text
language sql
stable
as $andamio$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$andamio$;

grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- storage: dos tablas y una función. Las usan 0019 y 0024.
-- ---------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

-- Parte el path "<carpeta>/<archivo>" y devuelve las carpetas. Las políticas
-- de avatares comparan `(storage.foldername(name))[1]` contra el uid.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $andamio$
  select string_to_array(name, '/');
$andamio$;

grant usage on schema storage to anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- pg_net: la extensión real no existe en la imagen oficial de Postgres.
-- Se reemplaza por una función con la misma firma que no llama a nadie.
-- La verificación NO prueba los webhooks a n8n — y no debería: mandar
-- pedidos reales desde una prueba de restauración sería peor que no probarla.
-- ---------------------------------------------------------------
create schema if not exists net;

create or replace function net.http_post(
  url         text,
  body        jsonb   default '{}'::jsonb,
  params      jsonb   default '{}'::jsonb,
  headers     jsonb   default '{}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language sql
as $andamio$
  select 0::bigint;
$andamio$;

grant usage on schema net to postgres, service_role;
