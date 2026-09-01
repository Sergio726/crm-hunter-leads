-- Datos sintéticos para probar el ciclo de restauración de punta a punta
-- sin bajar una sola fila de clientes reales.
--
-- La pregunta que TRV-3 tiene que contestar es "¿el backup se puede restaurar?".
-- Contestarla con datos inventados es igual de válido que con datos reales —lo
-- que se prueba es la cañería, no el contenido— y además evita sacar datos de
-- personas de la base para meterlos en una prueba.
--
-- Cubre a propósito los casos que suelen romper una restauración:
--   · foreign keys encadenadas (auth.users -> profiles -> clients -> interactions)
--   · acentos, eñes, comillas y apóstrofos, que es donde se ve si la
--     codificación sobrevivió al viaje
--   · jsonb, arrays de texto (`tags`) y timestamptz con zona
--   · valores null en columnas opcionales
--
-- `session_replication_role = replica` apaga triggers y comprobaciones de FK
-- durante la carga. Sin eso, el trigger de push a n8n se dispararía y el orden
-- de inserción tendría que ser exacto.

set session_replication_role = replica;

insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@ejemplo.test',
   '{"full_name":"Admín de Prueba","name":"Admín"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'vendedora@ejemplo.test',
   '{"full_name":"María Ñandú"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'admin@ejemplo.test', 'Admín de Prueba', 'superadmin'),
  ('22222222-2222-2222-2222-222222222222', 'vendedora@ejemplo.test', 'María Ñandú', 'seller')
on conflict (id) do nothing;

insert into public.clients (id, full_name, email, phone, company, assigned_to, status, tags, notes)
values
  ('33333333-3333-3333-3333-333333333333',
   'Gimnasio "El Ñu" — Sucursal Córdoba',
   'contacto@elnu.test', '+54 351 555 0001', 'El Ñu S.R.L.',
   '22222222-2222-2222-2222-222222222222', 'contacted',
   array['gimnasios', 'córdoba'],
   'Acentuación, comillas "dobles" y apóstrofo'' incluidos a propósito.'),
  ('44444444-4444-4444-4444-444444444444',
   'Inmobiliaria Sin Teléfono',
   null, null, null,
   '22222222-2222-2222-2222-222222222222', 'pending',
   array[]::text[], null)
on conflict (id) do nothing;

-- `outcome` no puede ir en null salvo que el canal sea 'note' (la 0022 lo
-- exige con un check). Se cargan las dos variantes para que la prueba pase por
-- las dos ramas de esa condición.
insert into public.interactions (id, client_id, user_id, channel, outcome, notes, contacted_at)
values
  ('55555555-5555-5555-5555-555555555555',
   '33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222',
   'whatsapp', 'follow_up_scheduled',
   'Primer contacto por WhatsApp. Quedó en llamar el jueves.',
   now()),
  ('77777777-7777-7777-7777-777777777777',
   '33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222',
   'note', null,
   'Nota interna sin resultado asociado.',
   now())
on conflict (id) do nothing;

-- `kind` lo deriva un trigger de la 0037 a partir de `source`. Con los triggers
-- apagados hay que traerlo explícito — y ese es justamente el caso real: un
-- backup restaura el valor que ya estaba calculado, no lo vuelve a calcular.
insert into public.prospects (id, business_name, source, source_ref, kind, area, country, niche, source_data)
values
  ('66666666-6666-6666-6666-666666666666',
   'Prospecto de Prueba', 'google_places', 'places/PRUEBA-0001', 'business',
   'Bahía Blanca', 'Argentina', 'gimnasios',
   '{"nota":"jsonb con acentos: ñ á é"}'::jsonb)
on conflict (id) do nothing;

set session_replication_role = origin;
