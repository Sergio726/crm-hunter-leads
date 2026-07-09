# 🚚 Migración a servidor nuevo (Dokploy): web + n8n

> Guía para desplegar el panel web (Docker) y migrar n8n a un servidor nuevo administrado con Dokploy.
> El repo de deploy es `https://github.com/somosmore/CRM-Lite.git` (copia limpia; el de trabajo sigue siendo el actual).
> Reemplazar `NUEVO-DOMINIO` por el dominio real en todos los pasos.

## Estado

- [ ] Servidor nuevo con Dokploy instalado
- [ ] DNS apuntando (web y n8n)
- [ ] Web desplegada
- [ ] n8n instalado + credenciales + workflows
- [ ] URLs actualizadas (Supabase / web / GHL)
- [ ] Verificación e2e y apagado del n8n viejo

## 0. Requisitos

- Servidor Linux (Ubuntu recomendado, 2+ GB RAM) con puertos 80/443 abiertos.
- Dos subdominios en el DNS apuntando a la IP del servidor, por ejemplo:
  - `crm.NUEVO-DOMINIO` → panel web
  - `n8n.NUEVO-DOMINIO` → n8n

## 1. Instalar Dokploy

```bash
ssh root@IP-DEL-SERVIDOR
curl -sSL https://dokploy.com/install.sh | sh
```

Al terminar muestra la URL del panel (puerto 3000 de la IP). Entrar, crear el usuario admin y, opcionalmente, asignarle un dominio al propio panel.

## 2. Desplegar la web

En Dokploy: **Create Project** → "CRM Lite" → **Create Service → Application**:

| Campo | Valor |
|---|---|
| Source | GitHub → `somosmore/CRM-Lite`, rama `main` |
| Build Type | Dockerfile |
| Docker File | `web/Dockerfile` |
| Docker Context Path | `web` |

**Environment** (pestaña Environment):

```
N8N_BASE_URL=https://n8n.NUEVO-DOMINIO
N8N_WEBHOOK_SECRET=<valor de crm-secrets.local.env>
```

**Build args** (van en Build → Build Args, se inyectan en el bundle):

```
NEXT_PUBLIC_SUPABASE_URL=https://rtvvamemdhbvmyxtxonb.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<valor de web/.env.local>
```

**Domains**: agregar `crm.NUEVO-DOMINIO`, puerto contenedor `3000`, HTTPS con Let's Encrypt. → **Deploy**.

> Mientras n8n no esté migrado, `N8N_BASE_URL` puede apuntar al viejo (`https://n8n.stlabs.ar`) y la web funciona igual.

**Google OAuth**: en Supabase (Auth → URL Configuration) agregar `https://crm.NUEVO-DOMINIO/auth/callback` a las Redirect URLs para que el login funcione desde el dominio nuevo.

## 3. Instalar n8n

En el mismo proyecto de Dokploy: **Create Service → Template** → elegir **n8n** (trae Postgres y volumen). Si no está la plantilla, crear un Compose con `n8nio/n8n` + volumen en `/home/node/.n8n`.

Variables importantes del servicio n8n:

```
N8N_HOST=n8n.NUEVO-DOMINIO
WEBHOOK_URL=https://n8n.NUEVO-DOMINIO/
GENERIC_TIMEZONE=America/Argentina/Buenos_Aires
```

**Domains**: `n8n.NUEVO-DOMINIO` → puerto `5678`, HTTPS. → Deploy y crear el usuario owner.

## 4. Credenciales y API key en el n8n nuevo

En el panel del n8n nuevo:

1. **Settings → n8n API → Create API key** → guardarla.
2. Crear 4 credenciales (los valores están en `crm-secrets.local.env` y `web/.env.local`):

| Credencial (tipo Header Auth salvo Discord) | Header | Valor |
|---|---|---|
| CRM Lite Webhook Secret | `x-crm-lite-webhook-secret` | `N8N_WEBHOOK_SECRET` |
| CRM Lite Integration Secret | `x-crm-lite-webhook-secret` | mismo valor |
| GHL LeadConnector (Authorization) | `Authorization` | `Bearer <GHL_API_KEY>` |
| Discord Webhook (alertas) | — (credencial Discord Webhook) | URL del webhook del canal |

3. Anotar el **ID de cada credencial** (está en la URL al abrirla: `/credential/XXXX`).

## 5. Subir los workflows

En la PC, crear `n8n-ids.nuevo.local` en la raíz del repo (queda git-ignored):

```
n8n_webhook_secret_cred_id=<id>
n8n_integration_secret_cred_id=<id>
n8n_ghl_credential_id=<id>
n8n_discord_cred_id=<id>
```

Agregar la API key nueva en `crm-secrets.local.env` (ej. `apikeyn8n_nuevo=...`) y correr:

```powershell
.\n8n\deploy-workflows.ps1 -BaseUrl https://n8n.NUEVO-DOMINIO -IdsFile n8n-ids.nuevo.local -ApiKeyName apikeyn8n_nuevo
```

El script reemplaza solo los IDs de credenciales y la URL base al importar, no duplica plantillas, y guarda los IDs de workflows en el ids-file.

## 6. Cambiar las URLs (el "switch")

Con el n8n nuevo andando y los flujos activos:

1. **Supabase** (SQL Editor):
   ```sql
   update public.app_settings
   set value = to_jsonb('https://n8n.NUEVO-DOMINIO/webhook/crm-push'::text)
   where key = 'n8n_push_url';
   ```
2. **Web**: en Dokploy cambiar `N8N_BASE_URL=https://n8n.NUEVO-DOMINIO` y redeploy.
3. **GHL**: editar el workflow del webhook inbound → URL `https://n8n.NUEVO-DOMINIO/webhook/crm-ghl-inbound` (el header secreto no cambia).

## 7. Verificar e2e y apagar el viejo

1. Crear un lead de prueba en la app/web → en Supabase debe aparecer `crm_contact_id` y `crm_synced_at`.
2. Editar un contacto en GHL → debe actualizarse en Supabase (inbound).
3. Ver en el panel n8n nuevo que retry/auto-import corran en verde.
4. Recién entonces: **desactivar** los workflows en `n8n.stlabs.ar` (no borrarlos hasta unos días después).

> Todo el circuito de prueba está automatizado en sesiones anteriores (ver `docs/STATE.md` 2026-07-09); pedirle al agente "probá la integración e2e" y lo corre solo.
