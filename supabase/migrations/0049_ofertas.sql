-- MSG-1 · Fase 2 — Varias ofertas, una por rubro.
--
-- Arregla un bug reportado por el usuario: el mensaje hablaba del rubro
-- equivocado. "Qué vendés" era UNA sola frase global guardada en el navegador,
-- compartida entre Prospección y Clientes, y encima la sobreescribía el chat de
-- Turbo con el avatar de la última búsqueda. Si esa búsqueda había sido de
-- inmobiliarias, la frase quedaba pegada y aparecía en el mensaje de un
-- gimnasio.
--
-- Con la lista acá, cada oferta declara para qué rubros sirve y la app elige
-- sola la que corresponde al lead. Forma de cada una:
--
--   { "id": "...", "nombre": "...", "texto": "...", "rubros": ["fitness"] }
--
-- `rubros` vacío = sirve para cualquier lead.
--
-- No hace falta tabla nueva ni tocar el RLS: `app_settings` ya es `key`/`jsonb`
-- y sus policies (`0001`) dicen justo lo que hace falta — **todo autenticado
-- lee, solo el superadmin escribe**. El vendedor elige entre las cargadas; la
-- lista la mantiene quien administra.

insert into public.app_settings (key, value)
values ('offers', '[]'::jsonb)
on conflict (key) do nothing;


-- ============================================================
-- COMPROBACIÓN — devuelve 1 fila con ok = true
-- ============================================================

select
  '0049: fila de ofertas creada' as paso,
  count(*) = 1 as ok
from public.app_settings
where key = 'offers';
