-- CRM Lite — equipo por invitación (lista blanca de emails)
-- Solo los emails autorizados por el superadmin entran como vendedores.
-- El resto queda en rol 'pending' (sin acceso a datos) hasta ser aprobado.

-- ---------------------------------------------------------------
-- Nuevo setting: lista blanca de emails permitidos
-- ---------------------------------------------------------------
insert into public.app_settings (key, value)
values ('allowed_emails', '[]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- Rol 'pending' para usuarios que iniciaron sesión pero no están invitados
-- ---------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('pending', 'seller', 'superadmin'));

-- ---------------------------------------------------------------
-- handle_new_user: asigna rol según superadmin_emails / allowed_emails
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_emails   jsonb;
  allowed_emails jsonb;
  computed_role  text;
begin
  select value into admin_emails
  from public.app_settings where key = 'superadmin_emails';
  select value into allowed_emails
  from public.app_settings where key = 'allowed_emails';

  computed_role := case
    when coalesce(admin_emails, '[]'::jsonb) ? new.email then 'superadmin'
    when coalesce(allowed_emails, '[]'::jsonb) ? new.email then 'seller'
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

-- ---------------------------------------------------------------
-- Helper: ¿es miembro activo? (vendedor o superadmin, NO pending)
-- security definer para no recursar el RLS de profiles.
-- ---------------------------------------------------------------
create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('seller', 'superadmin')
  );
$$;
revoke execute on function private.is_active_member() from public;
grant execute on function private.is_active_member() to authenticated;

-- ---------------------------------------------------------------
-- Endurecer políticas: solo miembros activos crean/editan datos
-- ---------------------------------------------------------------
drop policy if exists "sellers insert own clients" on public.clients;
create policy "sellers insert own clients" on public.clients
  for insert to authenticated
  with check (
    private.is_active_member()
    and (assigned_to = (select auth.uid()) or private.is_superadmin())
  );

drop policy if exists "sellers update assigned clients" on public.clients;
create policy "sellers update assigned clients" on public.clients
  for update to authenticated
  using (assigned_to = (select auth.uid()) or private.is_superadmin())
  with check (
    private.is_active_member()
    and (assigned_to = (select auth.uid()) or private.is_superadmin())
  );

drop policy if exists "insert own interactions" on public.interactions;
create policy "insert own interactions" on public.interactions
  for insert to authenticated
  with check (
    private.is_active_member()
    and user_id = (select auth.uid())
    and exists (select 1 from public.clients c where c.id = client_id)
  );

-- ---------------------------------------------------------------
-- RPC: invitar miembro (agrega email a la lista y promueve si ya existe)
-- ---------------------------------------------------------------
create or replace function public.invite_member(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm_email text := lower(trim(p_email));
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can invite members';
  end if;
  if norm_email = '' or position('@' in norm_email) = 0 then
    raise exception 'invalid email';
  end if;

  update public.app_settings
  set value = value || to_jsonb(norm_email), updated_at = now()
  where key = 'allowed_emails'
    and not (value ? norm_email);

  -- Si esa persona ya inició sesión (rol pending), promoverla a vendedor.
  update public.profiles
  set role = 'seller'
  where lower(email) = norm_email and role = 'pending';
end;
$$;
revoke execute on function public.invite_member(text) from public, anon;
grant execute on function public.invite_member(text) to authenticated;

-- ---------------------------------------------------------------
-- RPC: revocar acceso (saca de la lista y vuelve a pending)
-- ---------------------------------------------------------------
create or replace function public.revoke_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  if not private.is_superadmin() then
    raise exception 'only superadmins can revoke members';
  end if;

  select email into target_email from public.profiles where id = p_user;
  if target_email is null then
    return;
  end if;

  update public.app_settings
  set value = value - lower(target_email), updated_at = now()
  where key = 'allowed_emails';

  update public.profiles
  set role = 'pending'
  where id = p_user and role = 'seller';
end;
$$;
revoke execute on function public.revoke_member(uuid) from public, anon;
grant execute on function public.revoke_member(uuid) to authenticated;
