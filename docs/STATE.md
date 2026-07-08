# 🧭 STATE — Empezá acá

> **Este es el primer archivo que lee cualquier agente al iniciar el proyecto.**
> Da el estado actual, el próximo paso y lo urgente. Al terminar una sesión, **actualizá este archivo**.

_Última actualización: 2026-07-08 (sesión 2)_

---

## ✅ Estado actual (qué funciona hoy)

- App móvil **RN + Expo SDK 54** corriendo en celular real vía Expo Go.
- **Login con Google** funcionando contra **Supabase Cloud** (proyecto `CRM.LITE`).
- Migración **self-hosted → cloud completada** (base + 4 migraciones + auth). El self-hosted (VPS Hostinger) queda como **respaldo**.
- Features listas: Pendientes, Contactados (día/semana), ficha con WhatsApp/SMS/Email/Llamar + resultado, alta de cliente, **equipo por invitación**, **banner motivacional** (meta + racha).
- `ARCHITECTURE.md` actualizado con el plan **multi-CRM vía n8n** + web admin.
- **Panel web de administración v1** (`web/`, Next.js 16): Login+gate superadmin, Inicio (métricas), Equipo, Clientes (filtros + importar CSV + reasignar + editar), **Contactos GHL** (buscar por tag → importar), Reportes (+ exportar CSV).
- **Sincronización GHL bidireccional funcionando**: PUSH (lead app/web → n8n → GHL upsert, vía Database Webhook) y PULL (traer contactos de GHL por tag). Probado end-to-end. n8n en `https://n8n.stlabs.ar`.
- **N8N-4 parcialmente vivo**: migración `0010` aplicada en Supabase Cloud (`private.integration_secrets` creada) y el secreto real ya cargado ahí, así que `push_to_crm()` manda `x-crm-lite-webhook-secret` de verdad. Web ya envía el header. **Falta**: crear la credencial `httpHeaderAuth` en n8n y activarla en los 3 webhooks (la API de credenciales de n8n rechazó la creación; hacerlo a mano desde el panel de n8n).
- `clients` con `origin` (app/ghl) + `tags`; badges de origen/tags en la app.
- **Rediseño UX/UI** (2026-07-07): web y app con estilo **SaaS moderno** y **modo claro/oscuro con toggle** (web: arriba a la derecha; app: Perfil). Web con kit de componentes, iconos (lucide), toasts y responsive; app con iconos (@expo/vector-icons) y pulido. **Logo configurable desde archivo** (`web/public/brand/logo.png`, `mobile/assets/logo.png`) con fallback a wordmark. `tsc` + `lint` OK.

## 👉 Próximo paso (lo que sigue ahora)

**N8N-4 (cerrar)**: entrar al panel de `https://n8n.stlabs.ar`, crear a mano una credencial `Header Auth` (nombre `CRM Lite Webhook Secret`, header `x-crm-lite-webhook-secret`, valor = el de `N8N_WEBHOOK_SECRET` en `crm-secrets.local.env`/`web/.env.local`), reemplazar el placeholder `__N8N_WEBHOOK_SECRET_CRED_ID__` en los 3 workflows importados y activarla en cada webhook node. Después probar que los 3 webhooks siguen funcionando con el header.

**Entregable "Panel web + Sync GHL" — parte autónoma COMPLETA** (ver `docs/PLAN.md` e `docs/INTEGRACION-GHL.md`).
Web admin v1 en `web/` (5 secciones) + sincronización GHL bidireccional (push + pull) probada.

Lo que sigue (requiere al usuario):
- Agregar `http://localhost:3000/**` al allow-list de Supabase para **probar el login web** (Auth → URL Configuration).
- Arrancar la web con `iniciar-web.bat` y recorrerla.
- Elegir hosting y **hacer el deploy** (Vercel/VPS).
- Cuando quiera: WhatsApp (Evolution API ya corre en el VPS), y commitear/pushear.

## 🔴 Urgente / no olvidar

- **Seguridad**: ✅ SEC-1 (secreto Google) y ✅ SEC-2 (contraseña VPS) hechos. **N8N-4: DB lista y en vivo, falta credencial en n8n**. Falta lo menor: **SEC-4** (borrar archivos de secretos del escritorio, acción del usuario) y **SEC-3** (`JWT_SECRET` del respaldo, baja urgencia).
- Todo commiteado y pusheado a `main` (último: `1fff17a`, 2026-07-08).

## 🧱 Bloqueos actuales

- N8N-4 vivo (solo n8n): la Public API de n8n rechazó crear la credencial `httpHeaderAuth` (`request.body.data is not of a type(s) string`). Hacerlo a mano desde el panel de n8n (ver "Próximo paso").
- El acceso MCP de Supabase en esta sesión apuntó correctamente a `CRM.LITE` (org `cfkuufekfgnfbizisobv`), ya no a la cuenta SEBAS del cliente.

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Supabase Cloud — proyecto | `CRM.LITE` ref `rtvvamemdhbvmyxtxonb` (org SEBAS, São Paulo) |
| Supabase Cloud — URL | `https://rtvvamemdhbvmyxtxonb.supabase.co` |
| Self-hosted (respaldo) | `https://supabase.stlabs.ar` (VPS `82.29.59.178`, Dokploy) |
| n8n (integraciones) | `https://n8n.stlabs.ar` (VPS Dokploy, API pública habilitada). API key en `crm-secrets.local.env` |
| App config | `mobile/.env` (URL + publishable key — valores públicos) |
| Superadmin | `sergio.sebass03@gmail.com` |
| Metro (testing) | **Arrancar con doble clic en `iniciar-app.bat`** (raíz del repo). Detecta IP WiFi + modo offline (`EXPO_OFFLINE=1` evita el crash de arranque) + `--host lan`. Nota: arrancar Metro en segundo plano desde el agente NO sobrevive; correrlo en ventana propia. |

> Detalles sensibles de infra y credenciales: en la memoria del agente (`~/.claude/.../memory/`), NO en el repo.
