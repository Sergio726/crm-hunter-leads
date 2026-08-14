# 📧 Plantillas de email (Supabase Auth) — en español

> Se pegan en el dashboard: **Authentication → Emails (Templates)**
> Link directo: https://supabase.com/dashboard/project/koyihquworbcxuydyslm/auth/templates
> Variables disponibles: `{{ .ConfirmationURL }}` (el enlace), `{{ .Email }}` (destinatario).

## 1. Plantilla "Invite user" (invitación al equipo)

**Subject:**

```
Te invitaron al equipo Somos More 🎉
```

**Body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <p style="text-align: center; margin: 0 0 20px;">
    <img src="https://crmlite.moremigracion.com/brand/logo.png" alt="Somos More"
         style="max-width: 160px; height: auto;" />
  </p>
  <h2 style="margin: 0 0 8px; color: #111827;">¡Bienvenido/a al equipo Somos More!</h2>
  <p style="margin: 0 0 16px; line-height: 1.6;">
    Te invitaron a usar <strong>CRM Lite</strong>, la herramienta del equipo
    <strong>Somos More</strong> para hacer seguimiento de clientes.
  </p>
  <p style="margin: 0 0 24px; line-height: 1.6;">
    Tocá el botón para entrar por primera vez — no necesitás contraseña:
  </p>
  <p style="text-align: center; margin: 0 0 24px;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold;">
      Entrar a CRM Lite
    </a>
  </p>
  <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; line-height: 1.6;">
    Después vas a poder entrar siempre desde
    <a href="https://crmlite.moremigracion.com" style="color: #2563eb;">crmlite.moremigracion.com</a>
    con tu cuenta de Google (si tu email es de Google) o pidiendo un enlace por email.
  </p>
  <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af;">
    Si no esperabas esta invitación, podés ignorar este correo.
  </p>
  <p style="margin: 16px 0 0; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 12px; color: #6b7280;">
    — Equipo <strong>Somos More</strong>
  </p>
</div>
```

## 2. Plantilla "Magic Link" (enlace de acceso desde el login)

**Subject:**

```
Tu enlace para entrar a CRM Lite — Somos More
```

**Body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <p style="text-align: center; margin: 0 0 20px;">
    <img src="https://crmlite.moremigracion.com/brand/logo.png" alt="Somos More"
         style="max-width: 160px; height: auto;" />
  </p>
  <h2 style="margin: 0 0 8px; color: #111827;">Hola 👋</h2>
  <p style="margin: 0 0 24px; line-height: 1.6;">
    Pediste entrar a <strong>CRM Lite</strong>. Tocá el botón y listo:
  </p>
  <p style="text-align: center; margin: 0 0 24px;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold;">
      Entrar a CRM Lite
    </a>
  </p>
  <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
    El enlace sirve una sola vez y vence pronto. Si no fuiste vos, ignorá este correo.
  </p>
  <p style="margin: 16px 0 0; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 12px; color: #6b7280;">
    — Equipo <strong>Somos More</strong>
  </p>
</div>
```

## Notas

- El logo de los emails sale de `https://crmlite.moremigracion.com/brand/logo.png` —
  existe recién cuando `web/public/brand/logo.png` esté en el repo y la web redeployada.
  Hasta entonces el email muestra el texto alternativo "Somos More" en su lugar.

- El remitente sigue siendo `noreply@mail.app.supabase.io` hasta configurar SMTP propio
  (Resend/Brevo) — pendiente en BACKLOG.
- Guardar con **Save** en cada plantilla. El cambio aplica al próximo email que se envíe.
