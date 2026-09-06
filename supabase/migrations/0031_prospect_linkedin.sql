-- 0031 — LinkedIn del prospecto.
--
-- La búsqueda ya podía exigir Instagram; se suma LinkedIn como señal opcional
-- (pedido del usuario, 2026-08-15). Acá solo se guarda lo que la búsqueda
-- detecta: el slug de `linkedin.com/company/…` o `/in/…` que aparezca en el
-- enlace publicado en Google Places.
--
-- Expectativa realista: Places expone un único enlace por negocio y en un
-- comercio local casi nunca es LinkedIn, así que esta columna va a venir vacía
-- la mayoría de las veces. Se llenará de verdad con el enriquecimiento de
-- contacto de PROSP-6, que lee las redes desde el sitio del negocio — en la
-- prueba de la Fase 0, el scraper encontró LinkedIn en 2 de 5 sitios.
--
-- No se toca el score: agregarle un peso obligaría a recalcular los 15 packs y
-- rompería la comparabilidad de los prospectos ya guardados (misma razón que D18).

alter table public.prospects
  add column linkedin text;

comment on column public.prospects.linkedin is
  'Slug de LinkedIn (company/… o in/…) detectado en la ficha, sin el dominio. Null es lo habitual.';

-- Índice parcial: casi todas las filas van a tener null, así que solo se indexa
-- lo que existe. Sirve para filtrar "los que tienen LinkedIn" sin recorrer todo.
create index prospects_linkedin_idx on public.prospects (linkedin)
  where linkedin is not null;
