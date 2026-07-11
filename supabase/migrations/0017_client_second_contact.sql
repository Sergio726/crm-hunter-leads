-- CONT-1: segundo teléfono/email del cliente. Dato exclusivo de CRM Lite por
-- ahora (no confirmado si GHL v2 soporta additionalEmails/phones) — no viaja
-- al contrato normalizado de n8n hasta verificarlo.

alter table public.clients
  add column phone_2 text,
  add column email_2 text;
