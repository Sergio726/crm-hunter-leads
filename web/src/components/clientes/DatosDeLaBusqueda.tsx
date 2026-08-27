'use client';

import { AtSign, Briefcase, ExternalLink, Globe, MapPin } from 'lucide-react';
import { linkedinLabel, linkedinUrl } from '@/lib/prospect/types';
import { separarNotas, tieneDatos } from '@/lib/notas-prospecto';

/**
 * De dónde salió este cliente: la ficha de Google Maps, el sitio, las redes.
 *
 * Lo pidió el usuario probando la app: *"en la sección de notas no puedo
 * acceder directamente al link de Google Maps, sino que tengo que copiar y
 * pegar"*. El motivo era que esos datos viven como texto plano dentro del
 * cuadro de notas —tres renglones con scroll—, así que ni se leían ni se podían
 * tocar.
 *
 * Acá salen a la superficie, cada uno como lo que es: un enlace que se abre.
 */
export function DatosDeLaBusqueda({ notes }: { notes: string | null | undefined }) {
  const { datos } = separarNotas(notes);
  if (!tieneDatos(datos)) return null;

  const enlaces = [
    datos.mapsUrl && {
      href: datos.mapsUrl,
      icon: MapPin,
      label: 'Ver en Google Maps',
    },
    datos.website && {
      href: datos.website.startsWith('http') ? datos.website : `https://${datos.website}`,
      icon: Globe,
      label: 'Sitio web',
    },
    datos.instagram && {
      href: `https://instagram.com/${datos.instagram}`,
      icon: AtSign,
      label: `@${datos.instagram}`,
    },
    datos.linkedin && {
      href: linkedinUrl(datos.linkedin),
      icon: Briefcase,
      label: linkedinLabel(datos.linkedin),
    },
  ].filter((e): e is { href: string; icon: typeof MapPin; label: string } => Boolean(e));

  return (
    <section>
      <p className="eyebrow mb-2 text-muted-foreground">/ de dónde salió</p>

      {enlaces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {enlaces.map(({ href, icon: Icon, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-background/50 px-3 text-sm text-foreground transition-colors hover:bg-muted sm:h-8"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary-deep" aria-hidden="true" />
              {label}
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}

      {(datos.cargo || datos.score !== null) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {datos.cargo}
          {datos.cargo && datos.score !== null ? ' · ' : ''}
          {/* El score se muestra como lo que es: la calificación del día de la
              búsqueda, no algo que se recalcule. */}
          {datos.score !== null ? `calificación ${datos.score} al encontrarlo` : ''}
        </p>
      )}
    </section>
  );
}
