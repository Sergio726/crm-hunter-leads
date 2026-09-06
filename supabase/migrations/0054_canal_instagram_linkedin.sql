-- 0054 — Instagram y LinkedIn pasan a ser canales de contacto registrables.
--
-- POR QUÉ
--
-- Instagram es hoy el único canal alternativo real: 135 de los 163 clientes lo
-- tienen y ninguno tiene email ni LinkedIn. Importa más desde WA-2 — WhatsApp
-- bloqueó la cuenta seis horas después de UN mensaje en frío.
--
-- La ficha ya abre el chat de Instagram, pero el circuito quedaba cortado por
-- la mitad: este `check` no aceptaba el canal, así que contactar por ahí **no
-- quedaba en el historial, no pasaba el cliente a Contactado, no programaba el
-- próximo seguimiento y no contaba para las métricas del vendedor**. Todo eso
-- lo hace el registro de la interacción.
--
-- LinkedIn entra ahora aunque hoy no lo tenga ningún cliente: el costo es cero
-- y evita repetir esta misma migración el día que una búsqueda lo traiga.
--
-- Se sigue el patrón de la 0020, que amplió este mismo `check` cuando se sumó
-- el canal 'note'.
--
-- ⚠️ Instagram también restringe cuentas por mensajes en frío a gente que no te
-- sigue. Que la app lo registre no lo vuelve seguro: es el mismo patrón que
-- disparó WA-2. Ver el tablero.

alter table public.interactions
  drop constraint if exists interactions_channel_check;

alter table public.interactions
  add constraint interactions_channel_check
  check (channel in ('whatsapp', 'sms', 'email', 'call', 'note', 'instagram', 'linkedin'));

-- El otro `check` de la tabla no se toca: dice que solo 'note' puede venir sin
-- resultado, y un contacto por Instagram sí lleva resultado como los demás.

comment on column public.interactions.channel is
  'Por dónde se contactó: whatsapp, sms, email, call, instagram, linkedin. El valor note es un comentario, no un contacto (0020).';
