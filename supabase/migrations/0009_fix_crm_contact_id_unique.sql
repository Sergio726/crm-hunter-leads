-- Fix del bug de importación: ON CONFLICT (crm_contact_id) no puede usar un índice único PARCIAL.
-- Se reemplaza por un índice único TOTAL: Postgres trata los NULL como distintos, así que los
-- leads app-origin (crm_contact_id NULL) conviven sin chocar, y los de GHL quedan únicos.
drop index if exists public.clients_crm_contact_id_key;
create unique index clients_crm_contact_id_key on public.clients (crm_contact_id);
