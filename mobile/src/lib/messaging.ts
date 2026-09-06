import { Linking } from 'react-native';
import { supabase } from './supabase';
import type { Client } from './types';

/**
 * Capa de mensajería con switch de modo.
 *
 * - 'deeplink' (hoy): abre la app de WhatsApp del teléfono; el vendedor
 *   confirma el resultado al volver y la interacción se registra manualmente.
 * - 'api' (futuro): envía por WhatsApp Cloud API vía la Edge Function
 *   `send-whatsapp`, sin salir de la app.
 *
 * El modo vive en app_settings.whatsapp_mode — cambiarlo NO requiere
 * actualizar la app.
 */

export type WhatsAppMode = 'deeplink' | 'api';

export interface SendResult {
  mode: WhatsAppMode;
  /** true si el vendedor debe confirmar el resultado manualmente */
  needsManualOutcome: boolean;
  messageId?: string;
}

export async function getWhatsAppMode(): Promise<WhatsAppMode> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'whatsapp_mode')
    .single();
  return data?.value === 'api' ? 'api' : 'deeplink';
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
}

export async function sendWhatsApp(client: Client, message = ''): Promise<SendResult> {
  if (!client.phone) throw new Error('El lead no tiene teléfono cargado');
  const mode = await getWhatsAppMode();

  if (mode === 'api') {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: { clientId: client.id, message },
    });
    if (error) throw error;
    return { mode, needsManualOutcome: false, messageId: data?.messageId };
  }

  const url =
    `whatsapp://send?phone=${normalizePhone(client.phone)}` +
    (message ? `&text=${encodeURIComponent(message)}` : '');
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    // Sin app de WhatsApp instalada: fallback a wa.me en el navegador
    await Linking.openURL(`https://wa.me/${normalizePhone(client.phone)}`);
  }
  return { mode, needsManualOutcome: true };
}

export async function sendSms(client: Client, message = ''): Promise<SendResult> {
  if (!client.phone) throw new Error('El lead no tiene teléfono cargado');
  const sep = message ? `?body=${encodeURIComponent(message)}` : '';
  await Linking.openURL(`sms:${client.phone}${sep}`);
  return { mode: 'deeplink', needsManualOutcome: true };
}

export async function sendEmail(client: Client, subject = ''): Promise<SendResult> {
  if (!client.email) throw new Error('El lead no tiene email cargado');
  const sep = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  await Linking.openURL(`mailto:${client.email}${sep}`);
  return { mode: 'deeplink', needsManualOutcome: true };
}

/** El perfil puede venir como usuario suelto o como URL entera; sirven los dos. */
function perfil(base: string, valor: string): string {
  const v = valor.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^\/+/, '')}`;
}

/**
 * Abre el chat de Instagram.
 *
 * Primero intenta la app instalada y si no está cae al enlace web, igual que
 * WhatsApp. `ig.me/m/` abre la conversación en vez del perfil, que es un clic
 * menos para el vendedor.
 *
 * ⚠️ Instagram restringe cuentas por mensajes en frío a gente que no te sigue,
 * igual que WhatsApp (WA-2). Que la app lo abra no lo vuelve seguro.
 */
export async function openInstagram(client: Client): Promise<SendResult> {
  if (!client.instagram) throw new Error('El lead no tiene Instagram cargado');
  const usuario = client.instagram.trim().replace(/^@/, '');
  const app = `instagram://user?username=${encodeURIComponent(usuario)}`;
  if (await Linking.canOpenURL(app)) {
    await Linking.openURL(app);
  } else {
    await Linking.openURL(perfil('https://ig.me/m/', client.instagram));
  }
  return { mode: 'deeplink', needsManualOutcome: true };
}

/** Abre el perfil de LinkedIn. Mismo criterio: la app si está, el navegador si no. */
export async function openLinkedin(client: Client): Promise<SendResult> {
  if (!client.linkedin) throw new Error('El lead no tiene LinkedIn cargado');
  const web = perfil('https://www.linkedin.com/', client.linkedin);
  const app = web.replace(/^https?:\/\/(www\.)?linkedin\.com\//i, 'linkedin://');
  if (await Linking.canOpenURL(app)) {
    await Linking.openURL(app);
  } else {
    await Linking.openURL(web);
  }
  return { mode: 'deeplink', needsManualOutcome: true };
}

export async function callClient(client: Client): Promise<SendResult> {
  if (!client.phone) throw new Error('El lead no tiene teléfono cargado');
  await Linking.openURL(`tel:${client.phone}`);
  return { mode: 'deeplink', needsManualOutcome: true };
}
