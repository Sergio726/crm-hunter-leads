-- Fix de 0020: el constraint anterior (channel <> 'note' or outcome is null) solo
-- bloqueaba en una dirección — permitía canales no-'note' (whatsapp/sms/email/call)
-- con outcome null, cuando debían seguir exigiéndolo (encontrado probando la migración).
-- Constraint simétrico correcto: outcome es null si y solo si channel = 'note'.

alter table public.interactions drop constraint interactions_note_outcome_check;
alter table public.interactions add constraint interactions_note_outcome_check
  check ((channel = 'note') = (outcome is null));
