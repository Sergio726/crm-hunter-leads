-- Que el LinkedIn sobreviva a la promoción.
--
-- La 0031 agregó `prospects.linkedin` y la búsqueda ya lo puede exigir como
-- señal, pero `promote_prospects` arma las notas del cliente con el Instagram y
-- la ficha de Google, y el LinkedIn se quedaba en la tabla de prospectos. O
-- sea: el vendedor podía filtrar por LinkedIn, verlo en la pantalla, y no
-- recibirlo cuando el lead le llegaba a su lista. Es el mismo agujero que
-- PROSP-6 describe para el email.
--
-- Va en las notas y no en una columna nueva de `clients` por la misma razón que
-- el Instagram: `clients` es el contrato compartido con la app móvil y con n8n,
-- y sumar una columna obliga a tocar los dos. Cuando PROSP-6 formalice los
-- datos de contacto, esto se puede promover a columna con criterio.
--
-- Se guarda la URL completa y no el slug: la nota la lee una persona, y
-- `company/acme` no se puede clickear desde el detalle del cliente.

create or replace function public.promote_prospects(
  p_prospect_ids uuid[],
  p_assigned_to  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id   uuid := (select auth.uid());
  is_admin    boolean := private.is_superadmin();
  target_role text;
  rec         record;
  new_client  uuid;
  promoted    integer := 0;
  skipped     integer := 0;
begin
  if caller_id is null then
    raise exception 'not authenticated';
  end if;
  if not is_admin and p_assigned_to is distinct from caller_id then
    raise exception 'only superadmins can assign prospects to another user';
  end if;

  select role into target_role from public.profiles where id = p_assigned_to;
  if target_role is null then
    raise exception 'assignee does not exist';
  end if;
  if target_role not in ('seller', 'superadmin') then
    raise exception 'assignee must be a seller or superadmin';
  end if;

  for rec in
    select *
    from public.prospects
    where id = any(p_prospect_ids)
      and (is_admin or created_by = caller_id)
    for update
  loop
    if rec.status <> 'new' then
      skipped := skipped + 1;
      continue;
    end if;

    insert into public.clients (
      full_name, phone, company, assigned_to, status, origin, tags, notes
    )
    values (
      rec.business_name,
      coalesce(rec.whatsapp_phone, rec.phone),
      rec.business_name,
      p_assigned_to,
      'pending',
      'hunter',
      array_remove(array[rec.niche, rec.area], null),
      nullif(
        concat_ws(
          E'\n',
          'Prospecto detectado por búsqueda.',
          nullif(concat('Score: ', rec.score), 'Score: '),
          nullif(concat('Instagram: @', rec.instagram), 'Instagram: @'),
          nullif(concat('LinkedIn: https://www.linkedin.com/', rec.linkedin), 'LinkedIn: https://www.linkedin.com/'),
          nullif(concat('Ficha: ', rec.maps_url), 'Ficha: '),
          rec.notes
        ),
        ''
      )
    )
    returning id into new_client;

    update public.prospects
       set status = 'promoted',
           promoted_client_id = new_client
     where id = rec.id;

    promoted := promoted + 1;
  end loop;

  return jsonb_build_object('promoted', promoted, 'skipped', skipped);
end;
$$;

revoke execute on function public.promote_prospects(uuid[], uuid) from public, anon;
grant execute on function public.promote_prospects(uuid[], uuid) to authenticated;
