-- Estado global de importación GHL: qué crm_contact_id ya están tomados y por quién.
-- security definer porque el SELECT de clients con RLS solo muestra al seller sus
-- propias filas, y necesita ver también los contactos tomados por otros vendedores
-- (solo lectura de nombre asignado; no expone datos del cliente).

create or replace function public.ghl_import_status(p_crm_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_active_member() then
    raise exception 'only active members can check import status';
  end if;

  select coalesce(
    jsonb_object_agg(c.crm_contact_id, coalesce(p.full_name, p.email, 'Sin asignar')),
    '{}'::jsonb
  )
  into result
  from public.clients c
  left join public.profiles p on p.id = c.assigned_to
  where c.crm_contact_id = any(p_crm_ids);

  return result;
end;
$$;

revoke execute on function public.ghl_import_status(text[]) from public, anon;
grant execute on function public.ghl_import_status(text[]) to authenticated;
