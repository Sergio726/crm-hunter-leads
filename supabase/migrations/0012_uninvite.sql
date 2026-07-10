-- Des-invitar por email: quita de allowed_emails a alguien que todavía no entró
-- (revoke_member solo funciona por user id, sirve recién cuando existe el profile).

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
  where key = 'allowed_emails';

  -- Si ya había entrado como vendedor, vuelve a pending (igual que revoke_member).
  update public.profiles
  set role = 'pending'
  where lower(email) = norm_email and role = 'seller';
end;
$$;

revoke execute on function public.uninvite_member(text) from public, anon;
grant execute on function public.uninvite_member(text) to authenticated;
