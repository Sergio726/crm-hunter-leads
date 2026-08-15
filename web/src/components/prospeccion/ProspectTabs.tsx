'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Buscar ↔ Guardados.
 *
 * El contador viene del servidor a propósito: es la única señal de que hay
 * prospectos esperando. Antes, guardar dejaba los resultados en memoria y al
 * recargar no quedaba rastro de ellos en ninguna pantalla.
 */
export function ProspectTabs({ savedCount }: { savedCount: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: '/prospeccion', label: 'Buscar' },
    {
      href: '/prospeccion/guardados',
      label: savedCount > 0 ? `Guardados (${savedCount})` : 'Guardados',
    },
  ];

  return (
    <nav className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => {
        // Comparación exacta: /prospeccion es prefijo de /prospeccion/guardados,
        // así que con startsWith se encenderían las dos a la vez.
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
