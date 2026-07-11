-- PERM-1: rol "viewer" (lector) global. Mismo alcance de lectura que superadmin
-- (clients/interactions/profiles), sin permiso de escritura en ninguna tabla.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = ANY (ARRAY['pending'::text, 'seller'::text, 'superadmin'::text, 'viewer'::text]));

-- Helper: superadmin O viewer (solo para políticas de SELECT; las de
-- INSERT/UPDATE/DELETE siguen usando private.is_superadmin() sin tocar).
create or replace function private.is_read_all()
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('superadmin', 'viewer')
  );
$$;

alter policy "superadmin reads all profiles" on public.profiles
  using (private.is_read_all());

alter policy "sellers read assigned clients" on public.clients
  using ((assigned_to = (select auth.uid())) or private.is_read_all());

alter policy "read own interactions" on public.interactions
  using ((user_id = (select auth.uid())) or private.is_read_all());

-- set_user_role ahora admite promover/degradar a "viewer" (además de seller/superadmin).
-- Guards existentes (anti-autodegradación, anti-último-admin) ya cubren este caso sin cambios.
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
  if new_role not in ('seller', 'superadmin', 'viewer') then
    raise exception 'invalid role %', new_role;
  end if;
  if target_user = (select auth.uid()) and new_role <> 'superadmin' then
    raise exception 'no podés cambiar tu propio rol';
  end if;
  if new_role <> 'superadmin'
     and (select count(*) from public.profiles where role = 'superadmin') <= 1
     and exists (select 1 from public.profiles where id = target_user and role = 'superadmin') then
    raise exception 'debe quedar al menos un administrador';
  end if;
  update public.profiles set role = new_role where id = target_user;
end;
$$;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
