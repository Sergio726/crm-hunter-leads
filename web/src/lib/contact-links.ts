import type { Channel } from '@/lib/types';

const digits = (phone: string | null) => (phone ?? '').replace(/\D/g, '');

/** Abre el canal de contacto (deeplink). Devuelve false si faltan datos. */
export function openContactChannel(
  channel: Channel,
  contact: { phone: string | null; email: string | null },
): boolean {
  const d = digits(contact.phone);
  if (channel === 'whatsapp') {
    if (!d) return false;
    window.open(`https://wa.me/${d}`, '_blank');
    return true;
  }
  if (channel === 'sms') {
    if (!contact.phone) return false;
    window.location.assign(`sms:${contact.phone}`);
    return true;
  }
  if (channel === 'call') {
    if (!contact.phone) return false;
    window.location.assign(`tel:${contact.phone}`);
    return true;
  }
  if (!contact.email) return false;
  window.location.assign(`mailto:${contact.email}`);
  return true;
}
