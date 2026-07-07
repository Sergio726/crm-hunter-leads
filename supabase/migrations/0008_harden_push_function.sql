-- push_to_crm() es una función de TRIGGER: no debe exponerse como endpoint RPC.
-- Se revoca EXECUTE para anon/authenticated (el trigger sigue funcionando: corre como dueño de la tabla).
revoke execute on function public.push_to_crm() from public, anon, authenticated;

-- Nota: el aviso "pg_net in public" queda aceptado. Mover la extensión en la infra del cliente
-- podría romper la integración ya funcionando; el EXECUTE de net.* está restringido a roles privilegiados.
