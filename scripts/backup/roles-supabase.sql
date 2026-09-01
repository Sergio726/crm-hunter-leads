-- Los roles que Supabase crea y que un Postgres pelado no tiene.
--
-- Van aparte del andamio completo por un motivo concreto: para restaurar un
-- `pg_dump` de la base entera esto es lo ÚNICO que hace falta de antemano —los
-- esquemas `auth`, `storage` y las tablas vienen dentro del dump—. Correr el
-- andamio entero antes de un `pg_restore` lo hace fallar con
-- «schema "auth" already exists».
--
-- Sin estos roles, en cambio, el restore falla en la primera política RLS que
-- diga `to authenticated`.

do $roles$
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
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin nologin noinherit;
  end if;
end
$roles$;
