-- Cuando cambian los datos de contacto de un cliente, se marca para
-- re-sincronizar con GoHighLevel (ghl_synced_at = null). La Edge Function
-- sync-ghl procesa todos los clientes con ghl_synced_at IS NULL.
create or replace function public.mark_ghl_dirty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.company is distinct from old.company then
    new.ghl_synced_at := null;
  end if;
  return new;
end;
$$;

create trigger clients_mark_ghl_dirty
  before update on public.clients
  for each row execute function public.mark_ghl_dirty();
