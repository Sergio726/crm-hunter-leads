-- Saber quién nunca entró.
--
-- El caso que lo motivó: se invitó a alguien, el email nunca llegó, y en la
-- pantalla de Equipo esa persona figuraba como vendedor activo igual que el
-- resto. Nada distinguía a un miembro que trabaja todos los días de uno que
-- jamás pudo iniciar sesión, así que el problema era invisible.
--
-- El dato (`last_sign_in_at`) vive en `auth.users`, que el cliente de la app no
-- puede leer. De ahí la RPC security definer.
--
-- El chequeo de superadmin va como `where` y no como `raise exception` a
-- propósito: si algún día la llama un vendedor, devuelve cero filas y la página
-- se dibuja sin la columna, en vez de romperse entera por un dato accesorio.
create or replace function public.member_access_status()
returns table (
  user_id uuid,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.last_sign_in_at, u.email_confirmed_at
  from auth.users u
  where private.is_superadmin();
$$;

revoke execute on function public.member_access_status() from public, anon;
grant execute on function public.member_access_status() to authenticated;
