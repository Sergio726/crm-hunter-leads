-- Endurece set_user_role (definida sin uso en 0001_initial_schema.sql):
-- evita que un superadmin se degrade a sí mismo, y evita dejar el sistema
-- sin ningún superadmin.

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
