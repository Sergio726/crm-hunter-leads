'use client';

import { AtSign, Briefcase, Mail, Phone } from 'lucide-react';
import { linkedinLabel, linkedinUrl } from '@/lib/prospect/types';

/**
 * Todo lo que sirve para contactar a un prospecto, en una sola columna.
 *
 * Antes había una columna fija de "Teléfono" y las redes vivían mezcladas con
 * las señales de Google. Con LinkedIn en el sistema eso se rompe por los dos
 * lados: la columna de teléfono queda vacía —LinkedIn no lo da— y **el email no
 * se muestra en ninguna parte**, aunque se pague por buscarlo.
 *
 * Acá va lo que exista, en orden de utilidad para escribirle: primero el email,
 * después el WhatsApp, después el perfil.
 */
export function ContactCell({
  email,
  whatsappPhone,
  phone,
  instagram,
  linkedin,
}: {
  email?: string | null;
  whatsappPhone?: string | null;
  phone?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
}) {
  const telefono = whatsappPhone ?? phone;
  const hayAlgo = email || telefono || instagram || linkedin;
  if (!hayAlgo) return <span className="text-xs text-muted-foreground">—</span>;

  // `stopPropagation` en todos los enlaces: la fila entera es clickeable para
  // seleccionar, y tocar un contacto no debería además marcar el prospecto.
  const frenar = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={frenar}
          className="inline-flex items-center gap-1 text-primary-deep hover:underline"
          title={email}
        >
          <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{email}</span>
        </a>
      )}
      {telefono && (
        <span
          className="inline-flex items-center gap-1 text-muted-foreground"
          title={whatsappPhone ? 'Parece celular — sirve para WhatsApp' : 'Teléfono de línea'}
        >
          <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
          {telefono}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2">
        {instagram && (
          <a
            href={`https://instagram.com/${instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={frenar}
            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
          >
            <AtSign className="h-3 w-3 shrink-0" aria-hidden="true" />
            {instagram}
          </a>
        )}
        {linkedin && (
          <a
            href={linkedinUrl(linkedin)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={frenar}
            title={`LinkedIn: ${linkedin}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
          >
            <Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" />
            {linkedinLabel(linkedin)}
          </a>
        )}
      </span>
    </div>
  );
}
