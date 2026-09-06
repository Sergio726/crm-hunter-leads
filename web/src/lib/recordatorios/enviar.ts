// Enviar un mail — SOLO servidor.
//
// Hoy sale por Resend, y está aislado acá a propósito: cambiar de proveedor es
// reescribir esta función, no buscar llamadas repartidas por el proyecto.
//
// Por qué un servicio de mail y no lo que ya había:
//
//   · GHL → es de lo que se venía dependiendo, y era el problema. Si el cliente
//     no usa GHL, no tiene recordatorios.
//   · El mail de invitación usa el sistema de Supabase, que tiene un tope por
//     hora y está pensado solo para autenticación.

import 'server-only';

export interface Mail {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** Por qué falló, en castellano y sin filtrar la clave. */
  error?: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Manda un mail. **No lanza**: un envío fallido no puede tumbar la tarea entera
 * ni impedir que se le avise al resto del equipo.
 */
export async function enviarMail(mail: Mail): Promise<ResultadoEnvio> {
  const apiKey = process.env.RESEND_API_KEY;
  // El remitente tiene que ser de un dominio verificado. Sin dominio propio,
  // Resend presta `onboarding@resend.dev`, que sirve para probar pero le cae en
  // spam a un cliente real.
  const from = process.env.REMINDER_FROM ?? 'Hunter Leads <onboarding@resend.dev>';

  if (!apiKey) {
    return { ok: false, error: 'Falta RESEND_API_KEY en el entorno.' };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [mail.para],
        subject: mail.asunto,
        text: mail.texto,
        html: mail.html,
      }),
      cache: 'no-store',
    });

    if (res.ok) return { ok: true };

    // El cuerpo del error de Resend es informativo y no trae la clave.
    const detalle = await res.text().catch(() => '');
    return { ok: false, error: `El servicio de mail respondió ${res.status}. ${detalle.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo conectar.' };
  }
}
