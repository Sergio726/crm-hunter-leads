'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Lockup de marca: logotipo ST Labs + nombre del producto.
 *
 * El manual (03 / Logos) define dos variantes que NO son intercambiables:
 * la positiva va sobre fondos claros y la negativa sobre fondos Dead Pixel.
 * Se renderizan las dos y el tema decide cuál se ve, así el cambio de tema
 * no depende de JavaScript ni parpadea en la hidratación.
 *
 * Assets en `public/brand/`, copiados del repositorio de identidad:
 * https://github.com/Sergio726/crm-hunter-leads-brand
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  const [imgOk, setImgOk] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // El <img> viene en el HTML de SSR: el navegador puede intentar cargarlo
    // (y fallar) antes de que React hidrate y conecte onError, perdiendo el
    // evento. Si al montar ya terminó en error, activamos el fallback acá.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setImgOk(false);
    }
  }, []);

  if (!imgOk) {
    // Respaldo tipográfico: isotipo mint con el bracket de la marca.
    return (
      <span className={cn('flex items-center gap-2.5', className)}>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
          /
        </span>
        {showWordmark && (
          <span className="font-mono text-sm font-bold tracking-tight text-foreground">
            ST LABS
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('flex items-center gap-3', className)}>
      {/* Los PNG del manual vienen con fondo sólido (blanco el positivo, negro
          el negativo), así que sobre una tarjeta forman un parche visible. Los
          modos de fusión lo eliminan sin reeditar los assets: `multiply` funde
          el blanco en fondos claros y `screen` funde el negro en oscuros.
          Válido acá porque el logotipo es blanco y negro puros. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src="/brand/st-labs-logo-light.png"
        alt="ST Labs"
        onError={() => setImgOk(false)}
        className="h-7 w-auto max-w-[112px] object-contain object-left mix-blend-multiply dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/st-labs-logo-dark.png"
        alt=""
        aria-hidden="true"
        className="hidden h-7 w-auto max-w-[112px] object-contain object-left mix-blend-screen dark:block"
      />
      {showWordmark && (
        <span className="font-mono text-sm font-bold tracking-tight text-foreground">
          Hunter Leads
        </span>
      )}
    </span>
  );
}
