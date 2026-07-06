# 🧭 STATE — Empezá acá

> **Este es el primer archivo que lee cualquier agente al iniciar el proyecto.**
> Da el estado actual, el próximo paso y lo urgente. Al terminar una sesión, **actualizá este archivo**.

_Última actualización: 2026-07-06_

---

## ✅ Estado actual (qué funciona hoy)

- App móvil **RN + Expo SDK 54** corriendo en celular real vía Expo Go.
- **Login con Google** funcionando contra **Supabase Cloud** (proyecto `CRM.LITE`).
- Migración **self-hosted → cloud completada** (base + 4 migraciones + auth). El self-hosted (VPS Hostinger) queda como **respaldo**.
- Features listas: Pendientes, Contactados (día/semana), ficha con WhatsApp/SMS/Email/Llamar + resultado, alta de cliente, **equipo por invitación**, **banner motivacional** (meta + racha).
- `ARCHITECTURE.md` actualizado con el plan **multi-CRM vía n8n** + web admin.

## 👉 Próximo paso (lo que sigue ahora)

**Commitear el trabajo pendiente** (ARCHITECTURE.md, `.env` cloud, esta estructura de trabajo) y luego decidir entre:
- Migrar la sincronización a **n8n** (paso 2 del roadmap), o
- Empezar la **web admin**.

Ver `BACKLOG.md` para el detalle y prioridades.

## 🔴 Urgente / no olvidar

- **Seguridad — rotar secretos expuestos** (ver BACKLOG `SEC-*`): secreto de Google, contraseña root del VPS, `JWT_SECRET` del self-hosted; borrar archivos de secretos del escritorio.
- Hay **cambios sin commitear** en git.

## 🧱 Bloqueos actuales

- Ninguno crítico. (El acceso MCP de Supabase quedó apuntando a la cuenta **SEBAS** del cliente.)

## 🔗 Datos clave (referencia rápida)

| Qué | Valor |
|---|---|
| Supabase Cloud — proyecto | `CRM.LITE` ref `rtvvamemdhbvmyxtxonb` (org SEBAS, São Paulo) |
| Supabase Cloud — URL | `https://rtvvamemdhbvmyxtxonb.supabase.co` |
| Self-hosted (respaldo) | `https://supabase.stlabs.ar` (VPS `82.29.59.178`, Dokploy) |
| App config | `mobile/.env` (URL + publishable key — valores públicos) |
| Superadmin | `sergio.sebass03@gmail.com` |
| Metro (testing) | `exp://192.168.0.159:8081` — arrancar con `REACT_NATIVE_PACKAGER_HOSTNAME=192.168.0.159 npx expo start --host lan` |

> Detalles sensibles de infra y credenciales: en la memoria del agente (`~/.claude/.../memory/`), NO en el repo.
