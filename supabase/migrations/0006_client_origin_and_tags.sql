-- Origen del lead (app/web vs GHL) + tags (para filtrar contactos de GHL).
-- Conviven en la misma tabla clients, diferenciados por 'origin'. Tabla vacía → seguro.

alter table public.clients
  add column origin text not null default 'app' check (origin in ('app', 'ghl')),
  add column tags text[] not null default '{}';

-- Evitar importar dos veces el mismo contacto de GHL (id externo único cuando existe)
create unique index if not exists clients_crm_contact_id_key
  on public.clients (crm_contact_id)
  where crm_contact_id is not null;

-- Filtrado por tags (búsqueda en la web)
create index if not exists clients_tags_idx on public.clients using gin (tags);

-- Recrear la vista de pendientes: toma columnas nuevas y corrige nombres viejos (ghl_* -> crm_*)
drop view if exists public.v_pending_clients;
create view public.v_pending_clients
with (security_invoker = true) as
  select *
  from public.clients
  where status = 'pending'
     or (status not in ('won', 'lost')
         and next_follow_up is not null
         and next_follow_up <= current_date);
