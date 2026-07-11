-- PROF-1: columnas para la pantalla "Mi perfil" (app + web).
-- notification_prefs pensado para NOTIF-1 (canal preferido por evento).

alter table public.profiles
  add column phone text,
  add column secondary_email text,
  add column notification_prefs jsonb not null default '{}'::jsonb;

-- Mismo mecanismo que full_name/avatar_url (migración 0001): permiso a nivel
-- de columna, cada uno edita solo su propia fila (RLS "update own profile").
grant update (phone, secondary_email, notification_prefs) on public.profiles to authenticated;
