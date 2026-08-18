'use client';

import { ExternalLink, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ContactCell } from './ContactCell';
import { QualityCell } from './Quality';
import { labelsFor } from '@/lib/prospect/columns';
// `SOURCES` se toma de `types` y no de `sources/index`: ese último es
// server-only (arrastra los ejecutores) y esto es un componente de cliente.
import { SOURCES, type ProspectKind, type SourceId } from '@/lib/prospect/types';

/**
 * Todo lo que se sabe de un prospecto, en un panel.
 *
 * La tabla muestra lo que sirve para **decidir de un vistazo** y por eso deja
 * cosas afuera: la biografía, el sitio web, la cantidad de fotos, los motivos
 * del puntaje más allá de los dos primeros, y todo lo propio de cada fuente.
 * Eso se paga en cada búsqueda y hasta ahora no se veía en ningún lado.
 *
 * Acá se muestra **todo lo que trajo la API**, sin recortar: lo que tiene un
 * lugar propio va en su sección, y lo que no lo tiene cae en "Lo que trajo la
 * fuente" en crudo. Es preferible mostrar un campo con nombre técnico a
 * esconder un dato por el que ya se pagó.
 */
export interface ProspectDetailData {
  nombre: string;
  kind?: ProspectKind;
  source?: SourceId;

  // Identidad
  roleTitle?: string | null;
  companyName?: string | null;
  address?: string | null;
  area?: string | null;

  // Contacto
  email?: string | null;
  phone?: string | null;
  whatsappPhone?: string | null;
  website?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  mapsUrl?: string | null;

  // Señales de la fuente
  rating?: number | null;
  reviewsCount?: number | null;
  photosCount?: number | null;
  hasOwnWebsite?: boolean | null;
  audienceSize?: number | null;
  audienceActivity?: 'activo' | 'tibio' | 'dormido' | null;

  /** El "Acerca de" de LinkedIn o la bio de Instagram. */
  bio?: string | null;

  score?: number | null;
  reasons?: string[];

  /** Lo propio de cada fuente que no tiene un lugar fijo. */
  sourceData?: Record<string, unknown> | null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="eyebrow mb-2 font-mono text-[0.6875rem] tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** Una fila etiqueta → valor. No se dibuja si no hay valor. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{children}</span>
    </div>
  );
}

/** Formatea un valor crudo de la fuente sin romper el layout. */
function crudo(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  // Un objeto o lista se muestra como JSON corto: es feo, pero es un dato real
  // que alguien pagó por traer y esconderlo sería peor.
  const texto = JSON.stringify(value);
  return texto.length > 240 ? `${texto.slice(0, 240)}…` : texto;
}

/** Nombres legibles para las claves que sabemos que aparecen. */
const CLAVES: Record<string, string> = {
  verified: 'Cuenta verificada',
  premium: 'LinkedIn Premium',
  openProfile: 'Perfil abierto',
  isBusiness: 'Cuenta de empresa',
  category: 'Rubro declarado',
  follows: 'Sigue a',
  externalUrl: 'Enlace en la bio',
  tenureYears: 'Años en el cargo',
  postsCount: 'Publicaciones',
};

export function ProspectDetail({
  data,
  onClose,
}: {
  data: ProspectDetailData;
  onClose: () => void;
}) {
  const labels = labelsFor(data.kind);
  const inicial = data.nombre.trim()[0]?.toUpperCase() ?? '?';
  const subtitulo =
    labels.subtitulo === 'cargo'
      ? [data.roleTitle, data.companyName].filter(Boolean).join(' · ')
      : data.address;

  const hayContacto = Boolean(
    data.email || data.phone || data.whatsappPhone || data.instagram || data.linkedin,
  );
  const haySenales =
    data.rating != null ||
    (data.reviewsCount ?? 0) > 0 ||
    (data.photosCount ?? 0) > 0 ||
    data.audienceSize != null ||
    data.hasOwnWebsite != null;

  const extras = Object.entries(data.sourceData ?? {})
    .map(([k, v]) => [k, crudo(v)] as const)
    .filter(([, v]) => v !== null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/70 animate-in fade-in md:backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={`Detalle de ${data.nombre}`}
        className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary-deep">
              {inicial}
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">{data.nombre}</h2>
              {subtitulo && <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{labels.nombre}</Badge>
                {data.source && <Badge tone="accent">{SOURCES[data.source].label}</Badge>}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {data.score != null && (
            <section>
              <SectionLabel>Calificación</SectionLabel>
              {/* Los motivos completos, no los dos primeros que entran en la tabla. */}
              <QualityCell score={data.score} reasons={data.reasons} maxReasons={Infinity} />
            </section>
          )}

          {hayContacto && (
            <section>
              <SectionLabel>Cómo contactarlo</SectionLabel>
              <ContactCell
                email={data.email}
                whatsappPhone={data.whatsappPhone}
                phone={data.phone}
                instagram={data.instagram}
                linkedin={data.linkedin}
              />
            </section>
          )}

          {data.bio && (
            <section>
              <SectionLabel>Sobre el prospecto</SectionLabel>
              {/* Es lo que la propia persona escribió: el mejor material para
                  redactar el primer mensaje sin sonar a plantilla. */}
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
                {data.bio}
              </p>
            </section>
          )}

          <section>
            <SectionLabel>Dónde está</SectionLabel>
            <div>
              <Dato label="Zona">{data.area}</Dato>
              <Dato label="Dirección">{data.address}</Dato>
              <Dato label="Empresa">{data.companyName}</Dato>
              <Dato label="Cargo">{data.roleTitle}</Dato>
            </div>
            {data.mapsUrl && (
              <a
                href={data.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary-deep hover:underline"
              >
                Ver la ficha en Google Maps <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </section>

          {haySenales && (
            <section>
              <SectionLabel>Señales</SectionLabel>
              <div>
                <Dato label="Rating">{data.rating != null ? `★ ${data.rating}` : null}</Dato>
                <Dato label="Reseñas">{data.reviewsCount || null}</Dato>
                <Dato label="Fotos">{data.photosCount || null}</Dato>
                <Dato label="Sitio web propio">
                  {data.hasOwnWebsite == null ? null : data.hasOwnWebsite ? 'sí' : 'no'}
                </Dato>
                <Dato label="Seguidores">{data.audienceSize}</Dato>
                <Dato label="Actividad">{data.audienceActivity}</Dato>
              </div>
              {data.website && (
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm break-all text-primary-deep hover:underline"
                >
                  {data.website} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              )}
            </section>
          )}

          {extras.length > 0 && (
            <section>
              <SectionLabel>Lo que trajo la fuente</SectionLabel>
              {/* Todo lo demás que devolvió la API, tal cual. Puede tener nombres
                  técnicos: es a propósito, porque esconder un dato pago es peor
                  que mostrarlo con un nombre feo. */}
              <div>
                {extras.map(([clave, valor]) => (
                  <Dato key={clave} label={CLAVES[clave] ?? clave}>
                    {valor}
                  </Dato>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
