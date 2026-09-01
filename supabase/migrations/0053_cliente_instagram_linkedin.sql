-- 0053 — Instagram y LinkedIn como campos del cliente.
--
-- POR QUÉ
--
-- Los dos datos existían y no se podían usar: la promoción desde prospección
-- los dejaba **dentro del texto de `clients.notes`**, así que no se podían
-- editar, ni filtrar, ni saber si al cliente se le puede escribir por ahí.
-- Medido sobre producción: 135 de los 163 clientes tenían Instagram guardado de
-- esa forma, y ninguno podía abrirse con un clic.
--
-- ESTO REVISA UNA DECISIÓN DE LA 0036
--
-- Aquella migración los mandó a las notas a propósito, con este motivo escrito:
-- «`clients` es el contrato compartido con la app móvil y con n8n, y sumarle
-- columnas obliga a tocar los dos». Sigue siendo cierto que es un contrato
-- compartido, pero **agregar columnas que aceptan nulo no rompe a nadie**: quien
-- hace `select *` recibe dos campos más y quien inserta sin ellas sigue
-- funcionando igual. El costo de mantenerlas es menor que el de tener el dato
-- muerto. Ver D71.
--
-- El bloque de notas NO se toca: se sigue escribiendo igual, y la pantalla
-- "De dónde salió" sigue leyéndolo. La columna es la fuente para los botones de
-- contacto; las notas quedan como estaban para no romper lo que ya se ve.

alter table public.clients
  add column if not exists instagram text;

alter table public.clients
  add column if not exists linkedin text;

comment on column public.clients.instagram is
  'Usuario de Instagram, sin @. Antes vivía dentro de notes (0053).';

comment on column public.clients.linkedin is
  'Camino del perfil de LinkedIn, sin el dominio. Ej: in/juan-perez.';

-- Backfill: los que ya se promovieron desde un prospecto.
--
-- Solo rellena lo que está vacío, así que se puede correr las veces que haga
-- falta y nunca pisa algo cargado a mano.
update public.clients c
   set instagram = p.instagram
  from public.prospects p
 where p.promoted_client_id = c.id
   and c.instagram is null
   and p.instagram is not null;

update public.clients c
   set linkedin = p.linkedin
  from public.prospects p
 where p.promoted_client_id = c.id
   and c.linkedin is null
   and p.linkedin is not null;

-- Y que de ahora en más viajen solos al promover, como ya viajaba el email.
-- La función es la misma de la 0036 con las dos columnas sumadas al insert.

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
      full_name, phone, email, instagram, linkedin,
      company, assigned_to, status, origin, tags, notes
    )
    values (
      rec.business_name,
      coalesce(rec.whatsapp_phone, rec.phone),
      rec.email,
      rec.instagram,
      rec.linkedin,
      coalesce(rec.company_name, rec.business_name),
      p_assigned_to,
      'pending',
      'hunter',
      array_remove(array[rec.niche, rec.area], null),
      nullif(
        concat_ws(
          E'\n',
          'Prospecto detectado por búsqueda.',
          nullif(concat('Score: ', rec.score), 'Score: '),
          nullif(concat('Cargo: ', rec.role_title), 'Cargo: '),
          nullif(concat('Instagram: @', rec.instagram), 'Instagram: @'),
          nullif(concat('LinkedIn: https://www.linkedin.com/', rec.linkedin), 'LinkedIn: https://www.linkedin.com/'),
          nullif(concat('Ficha: ', rec.maps_url), 'Ficha: '),
          nullif(concat('Sitio: ', rec.website), 'Sitio: '),
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
