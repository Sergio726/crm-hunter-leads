-- El guard anti-spam de `notify_lead_assigned` solo cubría los leads de GHL.
--
-- Con la pantalla de prospectos guardados eso se vuelve un problema concreto:
-- promover un lote de 50 prospectos inserta 50 clientes ya asignados y dispara
-- 50 notificaciones de golpe (50 llamadas a n8n + 50 filas en `notifications`).
-- Es exactamente el caso que el guard de 0026 quería evitar, con otro origin.
--
-- En vez de sumar 'hunter' a la lista, se invierte la condición: en un INSERT
-- solo notifica lo que se cargó A MANO en la app (origin='app'). Todo lo que
-- entra importado o en lote —hoy 'ghl' y 'hunter', mañana lo que sea— no
-- notifica al crearse. Así el próximo origin que aparezca hereda el criterio
-- correcto sin necesidad de otra migración.
--
-- Lo que NO cambia: las reasignaciones posteriores (UPDATE de assigned_to)
-- siguen notificando siempre, sea cual sea el origen. Es el caso en que alguien
-- decide de verdad "esto es tuyo" sobre un lead puntual.
--
-- Consecuencia visible, dicha también en la pantalla de prospección: al promover
-- prospectos, el vendedor NO recibe aviso. Se entera al abrir su lista de
-- clientes, o cuando se le reasigna un lead concreto.

create or replace function public.notify_lead_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notify_url text;
  webhook_secret text;
  assignee record;
  channel text;
  payload jsonb;
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  -- Anti-spam: al crear, solo notifica lo cargado a mano en la app.
  -- Las importaciones en lote ('ghl', 'hunter') llegarían en masa.
  if tg_op = 'INSERT' and new.origin <> 'app' then
    return new;
  end if;

  select value #>> '{}' into notify_url from public.app_settings where key = 'n8n_notify_url';
  if coalesce(notify_url, '') = '' or notify_url = 'null' then
    return new;
  end if;

  select id, email, phone, full_name, role, notification_prefs
    into assignee
  from public.profiles
  where id = new.assigned_to;

  -- Notifica a quien trabaja leads: vendedor o superadmin.
  if assignee.id is null or assignee.role not in ('seller', 'superadmin') then
    return new;
  end if;
  if coalesce(assignee.email, '') = '' and coalesce(assignee.phone, '') = '' then
    return new;
  end if;

  channel := coalesce(assignee.notification_prefs ->> 'channel', 'email');

  select secret_value into webhook_secret
  from private.integration_secrets where key = 'n8n_webhook_secret';

  payload := jsonb_build_object(
    'event', 'lead.assigned',
    'user', jsonb_strip_nulls(jsonb_build_object(
      'id', assignee.id,
      'email', assignee.email,
      'phone', assignee.phone,
      'name', assignee.full_name
    )),
    'preferred_channel', channel,
    'client', jsonb_strip_nulls(jsonb_build_object(
      'id', new.id,
      'full_name', new.full_name,
      'phone', new.phone,
      'company', new.company,
      'status', new.status
    )),
    'message', format('Nuevo cliente asignado: %s', new.full_name)
  );

  perform net.http_post(
    url := notify_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-crm-lite-webhook-secret', coalesce(webhook_secret, '')
    )
  );

  insert into public.notifications (user_id, event, ref_id, channel)
  values (new.assigned_to, 'lead.assigned', new.id, channel);

  return new;
end;
$$;

revoke execute on function public.notify_lead_assigned() from public, anon, authenticated;
