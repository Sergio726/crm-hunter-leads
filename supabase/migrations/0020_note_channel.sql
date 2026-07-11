-- NOTE-1: comentario rápido (nota libre) en el seguimiento. Reutiliza
-- interactions en vez de tabla/vista nueva: canal 'note' + outcome opcional
-- para ese canal (los demás canales lo siguen exigiendo).

alter table public.interactions drop constraint interactions_channel_check;
alter table public.interactions add constraint interactions_channel_check
  check (channel = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'call'::text, 'note'::text]));

alter table public.interactions alter column outcome drop not null;

alter table public.interactions add constraint interactions_note_outcome_check
  check (channel <> 'note' or outcome is null);
