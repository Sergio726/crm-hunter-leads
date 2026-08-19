-- 0040 — Devolverle el rubro a los clientes que lo perdieron.
--
-- POR QUÉ EXISTE
--
-- El usuario lo reportó como "tengo mezclados inmobiliarias con gimnasios".
-- El rubro viaja de `prospects.niche` a `clients.tags` cuando se promueve un
-- prospecto, pero durante un tiempo TODO lo que salía de LinkedIn o Instagram
-- se guardaba con `niche = 'generico'`: el normalizador resolvía el rubro
-- contra los packs de comercio local, que solo existen para Google Maps, y caía
-- al pack por defecto. Arreglado en el código; esta migración recupera lo que
-- ya se había guardado mal.
--
-- SE PUEDE RECUPERAR porque `prospects.promoted_client_id` guarda a qué cliente
-- dio origen cada prospecto. Los clientes que NUNCA fueron prospectos (alta
-- manual, CSV, importados de GHL) no tienen de dónde sacar el rubro: esos hay
-- que etiquetarlos a mano y esta migración no los toca.
--
-- ES IDEMPOTENTE: el `not (... = any(c.tags))` evita duplicar una etiqueta que
-- ya esté. Se puede correr las veces que haga falta.
--
-- CÓMO REVERTIRLO: al final del archivo, comentado.

-- ─────────────────────────────────────────────────────────────────────────────
-- El push a GHL se apaga mientras corre.
--
-- `clients_push_to_crm` dispara en cada UPDATE de `clients`. Se saltea a los que
-- YA se sincronizaron (`crm_synced_at is not null`), pero un cliente de origen
-- `app` nunca sincronizado y con email o teléfono **sí se empujaría**.
--
-- Un backfill de etiquetas no puede mandar cientos de contactos al CRM externo:
-- sería un efecto que nadie pidió y difícil de deshacer del otro lado.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients
  disable trigger clients_push_to_crm;

-- El rubro va PRIMERO en la lista de etiquetas, igual que cuando lo escribe
-- `promote_prospects`.
--
-- `distinct on` es necesario: si dos prospectos apuntaran al mismo cliente, un
-- UPDATE ... FROM aplicaría uno cualquiera y correrlo de nuevo agregaría el
-- otro. Se elige siempre el prospecto más reciente.
update public.clients c
set tags = array_prepend(r.niche, c.tags)
from (
  select distinct on (promoted_client_id)
         promoted_client_id,
         niche
  from public.prospects
  where promoted_client_id is not null
    and niche is not null
    and niche <> ''
    and niche <> 'generico'
  order by promoted_client_id, created_at desc
) r
where r.promoted_client_id = c.id
  and not (r.niche = any(c.tags));

alter table public.clients
  enable trigger clients_push_to_crm;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA REVERTIR (no se ejecuta; está acá para no tener que reconstruirlo):
--
--   alter table public.clients disable trigger clients_push_to_crm;
--
--   update public.clients c
--   set tags = array_remove(c.tags, r.niche)
--   from (
--     select distinct on (promoted_client_id)
--            promoted_client_id, niche
--     from public.prospects
--     where promoted_client_id is not null
--       and niche not in ('', 'generico')
--     order by promoted_client_id, created_at desc
--   ) r
--   where r.promoted_client_id = c.id;
--
--   alter table public.clients enable trigger clients_push_to_crm;
--
-- ⚠️ Revertir borra la etiqueta AUNQUE alguien la hubiera puesto a mano antes:
-- no hay forma de distinguirlas. Por eso conviene mirar primero la consulta de
-- previsualización que acompaña a esta migración.
-- ─────────────────────────────────────────────────────────────────────────────
