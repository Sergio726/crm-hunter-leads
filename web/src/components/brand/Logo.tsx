'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Logo de marca. Toma la imagen de /brand/logo.png (public/brand/logo.png).
 * Si ese archivo no existe, cae al wordmark por defecto. Ver README (sección Logo).
 */
export function Logo({ className }: { className?: string }) {
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

  if (imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src="/brand/logo.png"
        alt="CRM Lite"
        onError={() => setImgOk(false)}
        className={cn('h-8 w-auto max-w-[160px] object-contain', className)}
      />
    );
  }

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        C
      </span>
      <span className="text-base font-semibold tracking-tight text-foreground">CRM Lite</span>
    </span>
  );
}
