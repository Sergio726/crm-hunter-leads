-- El link de agenda del equipo (Cal.com, Calendly, el que usen).
--
-- Turbo pasó a escribir mensajes que **empujan a una llamada** en vez de pedir
-- una respuesta corta. Para que eso funcione hace falta poder ofrecer un lugar
-- donde reservarla: sin link, el mensaje tiene que pedir la llamada sin
-- proponer horarios, porque el modelo no sabe la disponibilidad de nadie y un
-- horario inventado es peor que no proponer ninguno.
--
-- Va en `app_settings`, que ya es `key`/`jsonb` y tiene el RLS que hace falta:
-- todo autenticado lee, solo el superadmin escribe (`0001`).

insert into public.app_settings (key, value)
values ('agenda_url', '""'::jsonb)
on conflict (key) do nothing;


-- ============================================================
-- COMPROBACIÓN — devuelve 1 fila con ok = true
-- ============================================================

select
  '0051: fila del link de agenda creada' as paso,
  count(*) = 1 as ok
from public.app_settings
where key = 'agenda_url';
