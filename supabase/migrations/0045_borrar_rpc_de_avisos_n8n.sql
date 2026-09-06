-- 0045 — Borrar las dos RPC de avisos que n8n ya no necesita (SEC-5)
--
-- CONTEXTO
-- Cuando las notificaciones se mudaron adentro del sistema (D46), los dos flujos
-- de n8n que avisaban por GoHighLevel quedaron sin trabajo. Con ellos quedaron
-- sin uso las dos funciones que leían:
--
--   n8n_list_overdue_followups  ← la leía el flujo "Notify Overdue"
--   n8n_mark_notified           ← la escribía el flujo "Notify User"
--
-- Se comprobó en los workflows versionados (n8n/workflows/crm-lite/ghl/) que
-- ninguna otra cosa las llama. Las otras cuatro RPC de n8n siguen vivas porque
-- el flujo "auto-import" y la sincronización de clientes sí las usan.
--
-- POR QUÉ SE BORRAN Y NO SE DEJAN AHÍ
-- Las seis RPC están concedidas a `anon` y `authenticated`, y lo único que las
-- tapa es un secreto compartido. Ese es el punto de SEC-5: el secreto filtrado
-- expone lo que las funciones devuelven. `n8n_list_overdue_followups` es la peor
-- de las seis, porque es la única que devuelve datos del VENDEDOR —email,
-- teléfono y nombre de `profiles`— además de los del cliente. Borrarla saca ese
-- dato del alcance del secreto para siempre.
--
-- De paso se lleva una trampa: esa función tiene el guard
-- `is_crm_sync_enabled()` y devuelve una lista vacía con la sincronización
-- apagada. Es exactamente el bug de D46 — apagar el CRM apagaba los avisos en
-- silencio, sin error. Al borrarla no queda ninguna copia de ese guard viva.
--
-- ⚠️ ORDEN DE APLICACIÓN
-- Correr esta migración DESPUÉS de desactivar en el panel de n8n los flujos
-- "Notify User" y "Notify Overdue" (OPS-4 en el backlog). Si siguen activos
-- cuando esto corra, van a empezar a fallar con "function does not exist" en
-- vez de terminar en silencio. No rompe nada del sistema —esos avisos hoy los
-- manda la app por su cuenta— pero conviene no llenar de errores el panel.
--
-- No hay nada que revertir: si algún día hicieran falta, las definiciones están
-- en las migraciones 0025, 0026 y 0027.

drop function if exists public.n8n_list_overdue_followups(text, integer);

drop function if exists public.n8n_mark_notified(uuid, text, uuid, text, text);
