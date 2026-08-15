'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, MessageCircle, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { invokeInvite } from './invite';

/**
 * Copiar enlace · WhatsApp · Reenviar email.
 *
 * Va en TODAS las listas de miembros, no solo en "invitaciones pendientes".
 * Ese era el bug: invitar crea el usuario en auth, el trigger le crea el perfil,
 * y la persona se cae de la lista de pendientes — que era el único lugar donde
 * vivía el botón de reenviar. Alguien cuya invitación nunca llegó terminaba
 * figurando como miembro activo y sin forma de reintentarlo.
 */
export function MemberAccessActions({
  email,
  phone,
  name,
}: {
  email: string;
  phone?: string | null;
  name?: string | null;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState<'link' | 'send' | null>(null);
  // Solo se muestra si el portapapeles falla (contexto no seguro, permisos).
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  async function getLink(): Promise<string | null> {
    const data = await invokeInvite(supabase, {
      email,
      mode: 'link',
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    return (data?.link as string) ?? null;
  }

  async function copyLink() {
    setBusy('link');
    try {
      const link = await getLink();
      if (!link) throw new Error('No se recibió el enlace.');
      try {
        await navigator.clipboard.writeText(link);
        toast.success(`Enlace de acceso de ${email} copiado.`, {
          description:
            'Quien lo tenga entra como esa persona. Es de un solo uso y vence en aproximadamente una hora.',
        });
      } catch {
        // clipboard falla fuera de https o sin permiso: mostrarlo para copiar a mano.
        setFallbackLink(link);
        toast.info('No se pudo copiar solo. Copialo del campo de abajo.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el enlace.');
    } finally {
      setBusy(null);
    }
  }

  async function sendWhatsapp() {
    if (!phone) return;
    setBusy('link');
    try {
      const link = await getLink();
      if (!link) throw new Error('No se recibió el enlace.');
      const text = `Hola${name ? ` ${name}` : ''}, este es tu acceso a Hunter Leads: ${link}\n\nEs de un solo uso y vence en un rato, avisame si no te funciona.`;
      window.open(
        `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el enlace.');
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setBusy('send');
    try {
      await invokeInvite(supabase, {
        email,
        mode: 'send',
        redirectTo: `${window.location.origin}/auth/confirm`,
      });
      toast.success(`Email de acceso enviado a ${email}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el email.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={copyLink} disabled={busy !== null}>
          <Copy className="h-3.5 w-3.5" /> Copiar enlace
        </Button>
        {phone && (
          <Button size="sm" variant="outline" onClick={sendWhatsapp} disabled={busy !== null}>
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={resend} disabled={busy !== null}>
          <Send className="h-3.5 w-3.5" /> Reenviar email
        </Button>
      </div>
      {fallbackLink && (
        <Input
          readOnly
          value={fallbackLink}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Enlace de acceso de ${email}`}
        />
      )}
    </div>
  );
}
