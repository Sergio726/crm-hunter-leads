# 📧 Plantillas de email (Supabase Auth) — en español

> Se pegan en el dashboard: **Authentication → Emails (Templates)**
> Link directo: https://supabase.com/dashboard/project/koyihquworbcxuydyslm/auth/templates
> Variables disponibles: `{{ .ConfirmationURL }}` (el enlace), `{{ .Email }}` (destinatario).
>
> Identidad: ST Labs · Hunter Leads. Ver [`IDENTIDAD-VISUAL.md`](IDENTIDAD-VISUAL.md).
> El fondo de los clientes de correo es claro, así que se usa el **logotipo
> positivo** (`st-labs-logo-light.png`) y el verde eléctrico solo en el botón,
> con texto oscuro encima (el mint no contrasta con blanco).

## 1. Plantilla "Invite user" (invitación al equipo)

**Subject:**

```
Te invitaron a Hunter Leads
```

**Body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <p style="text-align: center; margin: 0 0 20px;">
    <img src="https://crmlite.moremigracion.com/brand/st-labs-logo-light.png" alt="ST Labs"
         style="max-width: 140px; height: auto;" />
  </p>
  <h2 style="margin: 0 0 8px; color: #070908;">Bienvenido/a a Hunter Leads</h2>
  <p style="margin: 0 0 16px; line-height: 1.6;">
    Te invitaron a usar <strong>Hunter Leads</strong>, el CRM de prospección de <strong>ST Labs</strong>
    para hacer seguimiento de clientes.
  </p>
  <p style="margin: 0 0 24px; line-height: 1.6;">
    Tocá el botón para entrar por primera vez — no necesitás contraseña:
  </p>
  <p style="text-align: center; margin: 0 0 24px;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #02ffc4; color: #00130d; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold;">
      Entrar a Hunter Leads
    </a>
  </p>
  <p style="margin: 0 0 8px; font-size: 13px; color: #5e7067; line-height: 1.6;">
    Después vas a poder entrar siempre desde
    <a href="https://crmlite.moremigracion.com" style="color: #08785f;">crmlite.moremigracion.com</a>
    con tu cuenta de Google (si tu email es de Google) o pidiendo un enlace por email.
  </p>
  <p style="margin: 16px 0 0; font-size: 12px; color: #91a59d;">
    Si no esperabas esta invitación, podés ignorar este correo.
  </p>
  <p style="margin: 16px 0 0; border-top: 1px solid #dce7e1; padding-top: 12px; font-size: 12px; color: #5e7067;">
    — <strong>ST Labs</strong> · Hunter Leads
  </p>
</div>
```

## 2. Plantilla "Magic Link" (enlace de acceso desde el login)

**Subject:**

```
Tu enlace para entrar a Hunter Leads
```

**Body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <p style="text-align: center; margin: 0 0 20px;">
    <img src="https://crmlite.moremigracion.com/brand/st-labs-logo-light.png" alt="ST Labs"
         style="max-width: 140px; height: auto;" />
  </p>
  <h2 style="margin: 0 0 8px; color: #070908;">Hola</h2>
  <p style="margin: 0 0 24px; line-height: 1.6;">
    Pediste entrar a <strong>Hunter Leads</strong>. Tocá el botón y listo:
  </p>
  <p style="text-align: center; margin: 0 0 24px;">
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; background: #02ffc4; color: #00130d; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold;">
      Entrar a Hunter Leads
    </a>
  </p>
  <p style="margin: 0; font-size: 12px; color: #91a59d; line-height: 1.6;">
    El enlace sirve una sola vez y vence pronto. Si no fuiste vos, ignorá este correo.
  </p>
  <p style="margin: 16px 0 0; border-top: 1px solid #dce7e1; padding-top: 12px; font-size: 12px; color: #5e7067;">
    — <strong>ST Labs</strong> · Hunter Leads
  </p>
</div>
```

## Notas

- El logo de los emails sale de `https://crmlite.moremigracion.com/brand/st-labs-logo-light.png`,
  que existe en el repo (`web/public/brand/`) pero **necesita un redeploy de la web**
  para estar disponible en esa URL. Hasta entonces el email muestra el texto
  alternativo "ST Labs" en su lugar.
  ⚠️ El logo anterior (`/brand/logo.png`, de More Migraciones) **fue eliminado**:
  si estas plantillas no se actualizan en el dashboard, los emails ya enviados y
  los nuevos van a mostrar una imagen rota.
- El **dominio** `crmlite.moremigracion.com` es infraestructura (el servidor donde
  está desplegada la web), no marca: se mantiene hasta que se migre el dominio.
- El remitente sigue siendo `noreply@mail.app.supabase.io` hasta configurar SMTP propio
  (Resend/Brevo) — pendiente en BACKLOG.
- Guardar con **Save** en cada plantilla. El cambio aplica al próximo email que se envíe.
