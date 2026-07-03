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
  if (!client.phone) throw new Error('El cliente no tiene teléfono cargado');
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
  if (!client.phone) throw new Error('El cliente no tiene teléfono cargado');
  const sep = message ? `?body=${encodeURIComponent(message)}` : '';
  await Linking.openURL(`sms:${client.phone}${sep}`);
  return { mode: 'deeplink', needsManualOutcome: true };
}

export async function sendEmail(client: Client, subject = ''): Promise<SendResult> {
  if (!client.email) throw new Error('El cliente no tiene email cargado');
  const sep = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  await Linking.openURL(`mailto:${client.email}${sep}`);
  return { mode: 'deeplink', needsManualOutcome: true };
}

export async function callClient(client: Client): Promise<SendResult> {
  if (!client.phone) throw new Error('El cliente no tiene teléfono cargado');
  await Linking.openURL(`tel:${client.phone}`);
  return { mode: 'deeplink', needsManualOutcome: true };
}
