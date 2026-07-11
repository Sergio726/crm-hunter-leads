-- WEB-18: invitar colaborador con selector de rol (vendedor/lector/administrador).

insert into public.app_settings (key, value)
values ('viewer_emails', '[]'::jsonb)
on conflict (key) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_emails   jsonb;
  allowed_emails jsonb;
  viewer_emails  jsonb;
  computed_role  text;
begin
  select value into admin_emails from public.app_settings where key = 'superadmin_emails';
  select value into allowed_emails from public.app_settings where key = 'allowed_emails';
  select value into viewer_emails from public.app_settings where key = 'viewer_emails';

  computed_role := case
    when coalesce(admin_emails, '[]'::jsonb) ? new.email then 'superadmin'
    when coalesce(allowed_emails, '[]'::jsonb) ? new.email then 'seller'
    when coalesce(viewer_emails, '[]'::jsonb) ? new.email then 'viewer'
    else 'pending'
  end;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    computed_role
  );
  return new;
end;
$$;

drop function if exists public.invite_member(text);
create function public.invite_member(p_email text, p_role text default 'seller')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm_email text := lower(trim(p_email));
  target_key text;
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can invite members';
  end if;
  if norm_email = '' or position('@' in norm_email) = 0 then
    raise exception 'invalid email';
  end if;
  if p_role not in ('seller', 'superadmin', 'viewer') then
    raise exception 'invalid role %', p_role;
  end if;

  target_key := case p_role
    when 'superadmin' then 'superadmin_emails'
    when 'viewer' then 'viewer_emails'
    else 'allowed_emails'
  end;

  update public.app_settings
  set value = value || to_jsonb(norm_email), updated_at = now()
  where key = target_key
    and not (value ? norm_email);

  -- Si esa persona ya inició sesión (rol pending), promoverla directo al rol invitado.
  update public.profiles
  set role = p_role
  where lower(email) = norm_email and role = 'pending';
end;
$$;
revoke execute on function public.invite_member(text, text) from public, anon;
grant execute on function public.invite_member(text, text) to authenticated;

-- revoke_member y uninvite_member: sacar de las 3 listas, no solo allowed_emails,
-- y devolver a pending desde cualquier rol activo (no solo seller). Mismo guard de
-- "al menos un admin" que ya tiene set_user_role.
create or replace function public.revoke_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  target_role text;
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can revoke members';
  end if;

  select email, role into target_email, target_role from public.profiles where id = p_user;
  if target_email is null then
    return;
  end if;

  if target_role = 'superadmin'
     and (select count(*) from public.profiles where role = 'superadmin') <= 1 then
    raise exception 'debe quedar al menos un administrador';
  end if;

  update public.app_settings
  set value = value - lower(target_email), updated_at = now()
  where key in ('allowed_emails', 'superadmin_emails', 'viewer_emails');

  update public.profiles
  set role = 'pending'
  where id = p_user and role in ('seller', 'superadmin', 'viewer');
end;
$$;

create or replace function public.uninvite_member(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm_email text := lower(trim(p_email));
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can uninvite members';
  end if;
  if norm_email = '' or position('@' in norm_email) = 0 then
    raise exception 'invalid email';
  end if;

  update public.app_settings
  set value = value - norm_email, updated_at = now()
  where key in ('allowed_emails', 'superadmin_emails', 'viewer_emails');

  update public.profiles
  set role = 'pending'
  where lower(email) = norm_email and role in ('seller', 'superadmin', 'viewer');
end;
$$;
