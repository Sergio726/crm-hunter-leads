-- 0055 — Lo que necesita la extensión de Chrome (MSG-8, fase A).
--
-- POR QUÉ
--
-- La extensión corre dentro del Chrome del vendedor, en linkedin.com, y tiene
-- que hablar con el CRM para dos cosas: pedir el mensaje que le corresponde al
-- perfil que tiene abierto, y avisar que lo mandó. Para eso hacen falta dos
-- piezas que hoy no existen:
--
--   1. UN BORRADOR. Hoy el mensaje que escribe Turbo se copia y se anota como
--      comentario; no queda guardado como "pendiente de envío" en ningún lado.
--      La extensión necesita poder preguntar "¿qué le tenía que decir a este
--      lead?" y encontrar la respuesta.
--
--   2. UN TOKEN. La extensión no puede usar la sesión del panel: vive en otro
--      origen (chrome-extension://) y el navegador trata esas cookies como de
--      terceros. Un token por vendedor, generado una vez y revocable, es lo que
--      ya hace el sistema con n8n: un secreto propio por integración en vez de
--      reutilizar la sesión de una persona.
--
-- El token se guarda HASHEADO. Si alguien lee esta tabla no consigue nada que
-- sirva: el valor en claro se muestra una sola vez, al generarlo, y no se
-- vuelve a ver.

-- ---------------------------------------------------------------------------
-- 1. Borradores de mensajes listos para enviar
-- ---------------------------------------------------------------------------

create table if not exists public.outbound_drafts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  created_by  uuid not null references public.profiles(id),
  channel     text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  -- Null = pendiente. Con fecha = ya se mandó, y por dónde.
  sent_at     timestamptz,
  sent_via    text
);

alter table public.outbound_drafts
  drop constraint if exists outbound_drafts_channel_check;

alter table public.outbound_drafts
  add constraint outbound_drafts_channel_check
  check (channel in ('whatsapp', 'instagram', 'email', 'linkedin'));

alter table public.outbound_drafts
  drop constraint if exists outbound_drafts_sent_via_check;

alter table public.outbound_drafts
  add constraint outbound_drafts_sent_via_check
  check (sent_via is null or sent_via in ('extension', 'manual'));

-- Un solo borrador PENDIENTE por lead y canal: regenerar el mensaje reemplaza
-- al anterior en vez de acumular versiones que nadie va a mandar.
create unique index if not exists outbound_drafts_pendiente_unico
  on public.outbound_drafts (client_id, channel)
  where sent_at is null;

create index if not exists outbound_drafts_pendientes_por_vendedor
  on public.outbound_drafts (created_by, created_at desc)
  where sent_at is null;

alter table public.outbound_drafts enable row level security;

drop policy if exists "vendedor lee sus borradores"
  on public.outbound_drafts;

create policy "vendedor lee sus borradores"
  on public.outbound_drafts
  for select
  using (created_by = (select auth.uid()) or private.is_superadmin());

drop policy if exists "vendedor escribe sus borradores"
  on public.outbound_drafts;

create policy "vendedor escribe sus borradores"
  on public.outbound_drafts
  for insert
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.clients c where c.id = client_id)
  );

drop policy if exists "vendedor actualiza sus borradores"
  on public.outbound_drafts;

create policy "vendedor actualiza sus borradores"
  on public.outbound_drafts
  for update
  using (created_by = (select auth.uid()) or private.is_superadmin());

drop policy if exists "vendedor borra sus borradores"
  on public.outbound_drafts;

create policy "vendedor borra sus borradores"
  on public.outbound_drafts
  for delete
  using (created_by = (select auth.uid()) or private.is_superadmin());

grant select, insert, update, delete on public.outbound_drafts to authenticated;

-- La extensión entra con service_role (no tiene sesión) y el servidor filtra a
-- mano por el vendedor del token. Ver `lib/extension/auth.ts`.
grant select, update on public.outbound_drafts to service_role;

-- ---------------------------------------------------------------------------
-- 2. Tokens de la extensión, uno por vendedor
-- ---------------------------------------------------------------------------

create table if not exists public.extension_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- sha256 del token en hexadecimal. El valor en claro nunca se guarda.
  token_hash   text not null unique,
  -- Para reconocerlo en la lista: "Chrome de la notebook".
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists extension_tokens_por_usuario
  on public.extension_tokens (user_id, created_at desc);

alter table public.extension_tokens enable row level security;

drop policy if exists "cada uno ve sus tokens"
  on public.extension_tokens;

create policy "cada uno ve sus tokens"
  on public.extension_tokens
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "cada uno crea sus tokens"
  on public.extension_tokens;

create policy "cada uno crea sus tokens"
  on public.extension_tokens
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "cada uno revoca sus tokens"
  on public.extension_tokens;

create policy "cada uno revoca sus tokens"
  on public.extension_tokens
  for update
  using (user_id = (select auth.uid()));

grant select, insert, update on public.extension_tokens to authenticated;

-- Validar un token es buscar su hash sin sesión: solo el servidor.
grant select, update on public.extension_tokens to service_role;

-- La extensión también crea interacciones y mueve el lead, siempre en nombre
-- del vendedor del token. Con service_role no aplica RLS: el filtro por
-- vendedor lo hace el servidor y está cubierto por tests.
grant select, insert on public.interactions to service_role;
grant select, update on public.clients to service_role;
