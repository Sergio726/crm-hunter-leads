-- Control del enriquecimiento de contacto (PROSP-12 Fase 0 / PROSP-6 Fase 1).
--
-- La 0036 ya agregó `prospects.email`. Faltan las columnas de control, calcadas
-- de las `ig_*` que ya existen, para poder distinguir "todavía no se consultó"
-- de "se consultó y el sitio no publica nada". Sin eso no hay forma de saber a
-- quién falta procesar, y se termina pagando dos veces por el mismo sitio.
--
-- `unreachable` es un estado propio y no un `error`: el sitio existe pero
-- bloqueó al scraper o depende de JavaScript. Se midió en 1 de cada 5 sitios
-- reales del ICP (ver PROSPECCION-CONTACTOS.md). Distinguirlo permite decidir
-- más adelante, con datos, si vale la pena reintentarlo con navegador — que
-- cuesta más y encarecería todas las corridas.

alter table public.prospects
  add column if not exists contact_enriched_at timestamptz,
  add column if not exists contact_status      text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.prospects'::regclass
      and conname = 'prospects_contact_status_check'
  ) then
    alter table public.prospects
      add constraint prospects_contact_status_check
      check (contact_status in ('ok', 'not_found', 'unreachable', 'error'));
  end if;
end $$;

-- Índice parcial: la consulta que importa es "a cuáles todavía no les buscamos
-- el contacto", no "cuáles ya procesamos".
create index if not exists prospects_contact_pending_idx
  on public.prospects (created_by)
  where contact_enriched_at is null and website is not null;
