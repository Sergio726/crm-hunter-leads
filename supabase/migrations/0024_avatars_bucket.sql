-- PROF-1: bucket de Storage para que cada uno suba su propia foto de perfil.
-- Público de lectura (son avatares, se muestran en toda la UI sin pedir sesión
-- a Storage cada vez); solo el dueño puede subir/reemplazar/borrar la suya.
-- Convención de path: "<user_id>/<archivo>".

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar files are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "users upload their own avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "users replace their own avatar"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "users delete their own avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);
