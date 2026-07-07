-- Multi-CRM: renombrar campos de sincronización ghl_* -> crm_* (base agnóstica al CRM).
-- clients está vacía; el rename es seguro. Ver docs/PLAN.md y ARCHITECTURE.md §Integraciones.

alter table public.clients rename column ghl_contact_id to crm_contact_id;
alter table public.clients rename column ghl_synced_at to crm_synced_at;

-- El índice de "pendientes de sync": renombrar (el predicado se actualiza solo a crm_synced_at)
alter index if exists public.clients_ghl_pending_idx rename to clients_crm_pending_idx;

-- Recrear función/trigger con nombres nuevos. Misma lógica: marcar dirty (crm_synced_at = null)
-- solo si cambian los datos de contacto, para no romper el write-back de n8n.
create or replace function public.mark_crm_dirty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.company is distinct from old.company then
    new.crm_synced_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_mark_ghl_dirty on public.clients;
drop function if exists public.mark_ghl_dirty();

drop trigger if exists clients_mark_crm_dirty on public.clients;
create trigger clients_mark_crm_dirty
  before update on public.clients
  for each row execute function public.mark_crm_dirty();
