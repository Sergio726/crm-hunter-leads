-- PERM-2: auditoría automática de ediciones de cliente (campo, valor viejo→nuevo, quién, cuándo).
-- Poblada por trigger en UPDATE de clients, no depende de que cada pantalla lo reporte a mano.

create table public.client_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  changed_by uuid references public.profiles(id),
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index client_changes_client_id_idx on public.client_changes(client_id);

alter table public.client_changes enable row level security;

-- Mismo alcance de lectura que la ficha del cliente: vendedor ve lo suyo,
-- superadmin/viewer ven todo. Sin políticas de INSERT/UPDATE/DELETE para
-- clientes de la app — solo el trigger (security definer) escribe acá.
create policy "read changes of accessible clients"
on public.client_changes for select
using (
  exists (
    select 1 from public.clients c
    where c.id = client_changes.client_id
      and (c.assigned_to = (select auth.uid()) or private.is_read_all())
  )
);

create or replace function private.log_client_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.full_name is distinct from old.full_name then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'full_name', old.full_name, new.full_name);
  end if;
  if new.phone is distinct from old.phone then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'phone', old.phone, new.phone);
  end if;
  if new.email is distinct from old.email then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'email', old.email, new.email);
  end if;
  if new.company is distinct from old.company then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'company', old.company, new.company);
  end if;
  if new.status is distinct from old.status then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'status', old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'assigned_to', old.assigned_to::text, new.assigned_to::text);
  end if;
  if new.next_follow_up is distinct from old.next_follow_up then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'next_follow_up', old.next_follow_up::text, new.next_follow_up::text);
  end if;
  if new.notes is distinct from old.notes then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'notes', old.notes, new.notes);
  end if;
  if new.phone_2 is distinct from old.phone_2 then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'phone_2', old.phone_2, new.phone_2);
  end if;
  if new.email_2 is distinct from old.email_2 then
    insert into public.client_changes (client_id, changed_by, field, old_value, new_value)
    values (old.id, actor, 'email_2', old.email_2, new.email_2);
  end if;
  return new;
end;
$$;

create trigger client_changes_audit
after update on public.clients
for each row execute function private.log_client_changes();
