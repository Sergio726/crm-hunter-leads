-- Índices de FK sugeridos por el advisor de performance tras 0018/0019.
create index client_changes_changed_by_idx on public.client_changes(changed_by);
create index interaction_attachments_uploaded_by_idx on public.interaction_attachments(uploaded_by);
