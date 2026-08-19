'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Contact,
  Users,
  Download,
  BarChart3,
  Settings,
  Radar,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { TurboGlyph } from '@/components/brand/TurboAvatar';
import { SECTIONS, type SectionId } from '@/lib/sections';

/**
 * Contador de urgencia del sidebar.
 *
 * `overdue` sale de `clients` en vivo; `sinVer` de `notifications` (0043). Los
 * dos se suman en el mismo badge porque para el vendedor son lo mismo: "hay
 * algo que mirar en Clientes". Separarlos en dos números obligaría a decidir
 * cuál es cuál sin ganar nada.
 *
 * El badge existe para que el aviso NO dependa de que el mail salga: si Resend
 * falla, si no hay dominio verificado o si el cliente no usa ningún CRM, el
 * número está igual.
 */
export type SidebarCounts = { overdue: number; sinVer: number };

/**
 * Los íconos viven acá y no en el registro de secciones: ese módulo lo importa
 * también el servidor, y tiene que quedar libre de dependencias de React.
 */
const ICONS: Record<SectionId, LucideIcon> = {
  inicio: LayoutDashboard,
  clientes: Contact,
  prospeccion: Radar,
  'contactos-ghl': Download,
  reportes: BarChart3,
  equipo: Users,
  configuracion: Settings,
};

export function SidebarNav({
  onNavigate,
  sections,
  counts,
}: {
  onNavigate?: () => void;
  /**
   * Secciones permitidas, calculadas por la guarda de la página. Es obligatorio
   * a propósito: si una página nueva se olvida de pasarlo, falla el build en vez
   * de mostrar un menú de más.
   */
  sections: SectionId[];
  counts?: SidebarCounts;
}) {
  const pathname = usePathname();
  const links = SECTIONS.filter((s) => s.inNav && sections.includes(s.id));

  // Badge de urgencia en Clientes: vencidos + novedades sin ver. "Pendiente" es
  // el estado normal de un CRM — un número naranja permanente se deja de ver.
  const badgeFor = (href: string): { value: number; tone: 'danger' } | null => {
    if (!counts) return null;
    if (href !== '/clientes') return null;
    const total = counts.overdue + counts.sinVer;
    return total > 0 ? { value: total, tone: 'danger' } : null;
  };

  return (
    <nav className="space-y-1">
      {links.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        const Icon = ICONS[l.id];
        const badge = badgeFor(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
          >
            {/* Prospección es la casa de Turbo: lleva su marca en vez de un ícono. */}
            {l.id === 'prospeccion' ? (
              <TurboGlyph className="h-4 w-4" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            {l.label}
            {badge && (
              <Badge tone={badge.tone} className="ml-auto" title="Seguimientos vencidos">
                {badge.value}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
