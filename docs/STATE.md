# 🧭 STATE — Empezá acá

> **Este es el primer archivo que lee cualquier agente al iniciar el proyecto.**
> Da el estado actual, el próximo paso y lo urgente. Al terminar una sesión, **actualizá este archivo**.

_Última actualización: 2026-07-07_

---

## ✅ Estado actual (qué funciona hoy)

- App móvil **RN + Expo SDK 54** corriendo en celular real vía Expo Go.
- **Login con Google** funcionando contra **Supabase Cloud** (proyecto `CRM.LITE`).
- Migración **self-hosted → cloud completada** (base + 4 migraciones + auth). El self-hosted (VPS Hostinger) queda como **respaldo**.
- Features listas: Pendientes, Contactados (día/semana), ficha con WhatsApp/SMS/Email/Llamar + resultado, alta de cliente, **equipo por invitación**, **banner motivacional** (meta + racha).
- `ARCHITECTURE.md` actualizado con el plan **multi-CRM vía n8n** + web admin.
- **Panel web de administración v1** (`web/`, Next.js 16): Login+gate superadmin, Inicio (métricas), Equipo, Clientes (filtros + importar CSV + reasignar + editar), **Contactos GHL** (buscar por tag → importar), Reportes (+ exportar CSV).
- **Sincronización GHL bidireccional funcionando**: PUSH (lead app/web → n8n → GHL upsert, vía Database Webhook) y PULL (traer contactos de GHL por tag). Probado end-to-end. n8n en `https://n8n.stlabs.ar`.
- `clients` con `origin` (app/ghl) + `tags`; badges de origen/tags en la app.

## 👉 Próximo paso (lo que sigue ahora)

**Entregable "Panel web + Sync GHL" — parte autónoma COMPLETA** (ver `docs/PLAN.md` e `docs/INTEGRACION-GHL.md`).
Web admin v1 en `web/` (5 secciones) + sincronización GHL bidireccional (push + pull) probada.

Lo que sigue (requiere al usuario):
- Agregar `http://localhost:3000/**` al allow-list de Supabase para **probar el login web** (Auth → URL Configuration).
- Arrancar la web con `iniciar-web.bat` y recorrerla.
- Elegir hosting y **hacer el deploy** (Vercel/VPS).
- Cuando quiera: WhatsApp (Evolution API ya corre en el VPS), y commitear/pushear.

## 🔴 Urgente / no olvidar

- **Seguridad**: ✅ SEC-1 (secreto Google) y ✅ SEC-2 (contraseña VPS) hechos. Falta lo menor: **SEC-4** (borrar archivos de secretos del escritorio, acción del usuario) y **SEC-3** (`JWT_SECRET` del respaldo, baja urgencia).
- Hay **cambios sin commitear** en git (docs/, lanzador `iniciar-app.bat`).

## 🧱 Bloqueos actuales

- Ninguno crítico. (El acceso MCP de Supabase quedó apuntando a la cuenta **SEBAS** del cliente.)

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
