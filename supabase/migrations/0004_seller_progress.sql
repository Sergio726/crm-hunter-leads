-- CRM Lite — progreso personal del vendedor (meta diaria + racha)
-- Banner motivacional en la pantalla de Pendientes.

-- Meta diaria de contactos (configurable por el superadmin más adelante).
insert into public.app_settings (key, value)
values ('daily_goal', '10'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- my_progress(): números del usuario actual para el banner.
-- security definer + filtro explícito por auth.uid() (solo lo propio).
-- ---------------------------------------------------------------
create or replace function public.my_progress()
returns table (today int, this_week int, pending int, won int, goal int, streak int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  tz  text := 'America/Argentina/Buenos_Aires';
  g   int;
  cur date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  d   date;
  cnt int;
  i   int := 1;
begin
  select coalesce((value #>> '{}')::int, 10) into g
  from public.app_settings where key = 'daily_goal';
  if g is null or g < 1 then g := 10; end if;
  goal := g;

  select count(*) into today from public.interactions
   where user_id = uid and (contacted_at at time zone tz)::date = cur;

  select count(*) into this_week from public.interactions
   where user_id = uid
     and contacted_at >= (date_trunc('week', now() at time zone tz) at time zone tz);

  select count(*) into pending from public.clients
   where assigned_to = uid and status = 'pending';
  select count(*) into won from public.clients
   where assigned_to = uid and status = 'won';

  -- Racha: días consecutivos cumpliendo la meta. Si hoy ya la cumplió,
  -- cuenta hoy; si no, muestra la racha previa (viva, "en riesgo").
  streak := 0;
  if today >= g then streak := 1; end if;
  loop
    d := cur - i;
    select count(*) into cnt from public.interactions
     where user_id = uid and (contacted_at at time zone tz)::date = d;
    exit when cnt < g or i > 365;
    streak := streak + 1;
    i := i + 1;
  end loop;

  return next;
end;
$$;
revoke execute on function public.my_progress() from public, anon;
grant execute on function public.my_progress() to authenticated;
