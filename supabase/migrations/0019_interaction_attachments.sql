-- PERM-3: adjuntos (fotos/PDF/notas de voz) al seguimiento. Bucket privado +
-- tabla de metadata. Reglas de acceso calcadas de clients/interactions.
-- No sincroniza a GHL (queda interno, no se suma al contrato normalizado de n8n).

insert into storage.buckets (id, name, public)
values ('interaction-attachments', 'interaction-attachments', false)
on conflict (id) do nothing;

create table public.interaction_attachments (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  uploaded_by uuid references public.profiles(id),
  storage_path text not null unique,
  file_type text not null,
  file_size_bytes bigint,
  created_at timestamptz not null default now()
);

create index interaction_attachments_interaction_id_idx on public.interaction_attachments(interaction_id);

alter table public.interaction_attachments enable row level security;

create policy "read attachments of accessible interactions"
on public.interaction_attachments for select
using (
  exists (
    select 1 from public.interactions i
    join public.clients c on c.id = i.client_id
    where i.id = interaction_attachments.interaction_id
      and (c.assigned_to = (select auth.uid()) or private.is_read_all())
  )
);

create policy "insert attachments on own interactions"
on public.interaction_attachments for insert
with check (
  private.is_active_member()
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.interactions i
    join public.clients c on c.id = i.client_id
    where i.id = interaction_attachments.interaction_id
      and (c.assigned_to = (select auth.uid()) or private.is_superadmin())
  )
);

create policy "delete own or superadmin attachments"
on public.interaction_attachments for delete
using (
  uploaded_by = (select auth.uid()) or private.is_superadmin()
);

-- Storage: mismo criterio, referenciando la fila de metadata por storage_path.
create policy "read attachment files of accessible interactions"
on storage.objects for select
using (
  bucket_id = 'interaction-attachments'
  and exists (
    select 1 from public.interaction_attachments a
    join public.interactions i on i.id = a.interaction_id
    join public.clients c on c.id = i.client_id
    where a.storage_path = storage.objects.name
      and (c.assigned_to = (select auth.uid()) or private.is_read_all())
  )
);

-- Sin dependencia de la fila de metadata (todavía no existe al momento del upload).
create policy "upload attachment files as active member"
on storage.objects for insert
with check (
  bucket_id = 'interaction-attachments'
  and private.is_active_member()
);

create policy "delete own attachment files"
on storage.objects for delete
using (
  bucket_id = 'interaction-attachments'
  and exists (
    select 1 from public.interaction_attachments a
    where a.storage_path = storage.objects.name
      and (a.uploaded_by = (select auth.uid()) or private.is_superadmin())
  )
);
