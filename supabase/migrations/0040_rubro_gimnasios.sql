-- 0040 — Etiquetar como "gimnasios" a los 41 que decían "generico".
--
-- QUÉ PASÓ
--
-- El usuario lo reportó como "tengo mezclados inmobiliarias con gimnasios".
-- El diagnóstico sobre los datos reales dio esto:
--
--     inmobiliarias  122 clientes   122 ya tienen la etiqueta
--     generico        41 clientes    41 ya tienen la etiqueta
--
-- O sea que NO se perdió ninguna etiqueta: los 41 tienen una, pero dice
-- "generico", que no significa nada. En el filtro de Clientes aparecen como una
-- bolsa donde está todo lo que no es inmobiliaria.
--
-- Los 41 salieron de UNA sola búsqueda en Google Maps, con este avatar:
--
--     "Coaches fitness y entrenadores personales de Colombia que podrían
--      escalar su mentoría con una aplicación"
--
-- La causa no fue un bug puntual: en Google el rubro tenía que ser uno de los
-- packs predefinidos, y **no existe un pack de gimnasios**. Elegir "a medida"
-- era lo correcto, y aun así el rubro se guardaba con la palabra "generico".
-- Le pasaba a cualquier rubro sin pack. Arreglado en el código; esta migración
-- ordena lo que ya estaba guardado.
--
-- ES IDEMPOTENTE y no toca a nadie más: solo alcanza a clientes que vinieron de
-- un prospecto con `niche = 'generico'`.

-- El push a GHL se apaga mientras corre.
--
-- `clients_push_to_crm` dispara en cada UPDATE de `clients`. Se saltea a los que
-- YA se sincronizaron, pero un cliente de origen `app` nunca sincronizado y con
-- email o teléfono **sí se empujaría**. Un cambio de etiquetas no puede mandar
-- decenas de contactos al CRM externo.
alter table public.clients
  disable trigger clients_push_to_crm;

-- Se saca "generico" y se pone el rubro real adelante, que es donde lo escribe
-- `promote_prospects`.
update public.clients c
set tags = array_prepend(
  'gimnasios',
  array_remove(c.tags, 'generico')
)
from public.prospects p
where p.promoted_client_id = c.id
  and p.niche = 'generico'
  and not ('gimnasios' = any(c.tags));

-- El prospecto también queda corregido, para que el dato coincida con el
-- cliente y para que una promoción futura del mismo prospecto no vuelva a
-- escribir "generico".
update public.prospects
set niche = 'gimnasios'
where niche = 'generico'
  and promoted_client_id is not null;

alter table public.clients
  enable trigger clients_push_to_crm;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARA REVERTIR (no se ejecuta):
--
--   alter table public.clients disable trigger clients_push_to_crm;
--
--   update public.clients c
--   set tags = array_prepend(
--     'generico',
--     array_remove(c.tags, 'gimnasios')
--   )
--   from public.prospects p
--   where p.promoted_client_id = c.id
--     and p.niche = 'gimnasios';
--
--   update public.prospects
--   set niche = 'generico'
--   where niche = 'gimnasios';
--
--   alter table public.clients enable trigger clients_push_to_crm;
--
-- ⚠️ Revertir toca también a los que se hubieran etiquetado a mano después.
-- ─────────────────────────────────────────────────────────────────────────────
