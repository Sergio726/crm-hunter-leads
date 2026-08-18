-- 0039 — Log de solicitudes de búsqueda, para poder auditar un cero.
--
-- POR QUÉ EXISTE
--
-- Una búsqueda de LinkedIn devolvió 0 y no había con qué diagnosticarla. El
-- motivo real estaba en el log del actor de Apify, que no se guardaba en
-- ninguna parte:
--
--     [Status message]: free user run limit reached
--
-- La cuenta había llegado al tope de corridas del plan gratis: el actor arranca,
-- no busca nada, termina como SUCCEEDED y cobra US$ 0. Indistinguible de "busqué
-- y no encontré a nadie" salvo por ese mensaje.
--
-- Además había dos agujeros de registro:
--
--   · Las búsquedas de Google Maps NO dejaban rastro. `prospect_searches` solo
--     se escribe cuando el vendedor guarda prospectos, así que una búsqueda que
--     da cero —justo la que hay que investigar— no existía para la base.
--   · Las de LinkedIn/Instagram dejaban un `prospect_runs`, pero sin lo que dijo
--     el proveedor ni el input exacto que se le mandó.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UNA COLUMNA EN `prospect_searches`
--
-- Esa tabla registra búsquedas de las que se guardó algo, y alimenta la
-- estimación de gasto de Google. Meterle los intentos fallidos le cambiaría el
-- significado a `saved_count` y a esa estimación.

create table if not exists public.prospect_request_log (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references public.profiles(id),
  source          text not null,
  job             text not null default 'search',

  -- Qué se pidió ------------------------------------------------------------
  filters         jsonb not null default '{}'::jsonb,
  -- Lo EXACTO que se le mandó al proveedor. Es el dato que más faltó: sin él no
  -- se puede distinguir "el filtro lo mató" de "el proveedor no devolvió nada".
  provider_input  jsonb,

  -- Qué volvió --------------------------------------------------------------
  --   ok               → trajo resultados
  --   empty            → buscó de verdad y no encontró a nadie
  --   provider_skipped → el proveedor NUNCA buscó (tope de plan, sin crédito)
  --   error            → falló
  outcome         text not null check (outcome in ('ok', 'empty', 'provider_skipped', 'error')),
  returned_count  integer not null default 0,
  matched_count   integer not null default 0,
  discarded       jsonb,
  -- Si hubo que ensanchar la búsqueda para encontrar algo (ver linkedin.ts).
  relaxed         text,

  -- Qué dijo el proveedor ---------------------------------------------------
  provider_run_id  text,
  provider_status  text,
  -- Acá vive "free user run limit reached". Es el campo por el que existe todo
  -- este archivo.
  provider_message text,
  cost_usd         numeric(10, 4),
  error            text,
  duration_ms      integer,

  created_at      timestamptz not null default now()
);

create index if not exists prospect_request_log_created_by_idx
  on public.prospect_request_log (created_by, created_at desc);

-- Índice parcial: lo que se consulta al auditar son las que NO salieron bien.
create index if not exists prospect_request_log_problemas_idx
  on public.prospect_request_log (created_at desc)
  where outcome <> 'ok';

alter table public.prospect_request_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'prospect_request_log' and policyname = 'members read own log') then
    create policy "members read own log" on public.prospect_request_log
      for select using (created_by = (select auth.uid()) or private.is_superadmin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'prospect_request_log' and policyname = 'members insert own log') then
    create policy "members insert own log" on public.prospect_request_log
      for insert with check (created_by = (select auth.uid()));
  end if;
end $$;

-- Sin update ni delete a propósito: un log que se puede editar no sirve para
-- auditar.
grant select, insert on public.prospect_request_log to authenticated;

-- El servidor tiene que poder leerlo. Las migraciones de este proyecto otorgan
-- permisos solo a `authenticated`, y por eso leer `prospect_runs` con la clave
-- de servicio devolvía "permission denied" — que es exactamente lo que impedía
-- diagnosticar el cero sin depender de lo que el usuario contara.
--
-- Solo SELECT y solo sobre esta tabla: guarda filtros, conteos y mensajes del
-- proveedor. Ningún dato de prospectos ni de clientes.
grant select on public.prospect_request_log to service_role;
