'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Contact, Users, Download, BarChart3, Settings, Radar } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import type { Role } from '@/lib/types';

/** Contadores para los badges de urgencia del sidebar (WEB-7/UXR-7). */
export type SidebarCounts = { pending: number; overdue: number };

const LINKS = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard, roles: ['seller', 'superadmin', 'viewer'] as Role[] },
  { href: '/clientes', label: 'Clientes', icon: Contact, roles: ['seller', 'superadmin', 'viewer'] as Role[] },
  { href: '/equipo', label: 'Equipo', icon: Users, roles: ['superadmin'] as Role[] },
  {
    href: '/prospeccion',
    label: 'Prospección',
    icon: Radar,
    roles: ['seller', 'superadmin'] as Role[],
  },
  {
    href: '/contactos-ghl',
    label: 'Contactos GHL',
    icon: Download,
    roles: ['seller', 'superadmin'] as Role[],
  },
  { href: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['superadmin'] as Role[] },
  { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['superadmin'] as Role[] },
];

export function SidebarNav({
  onNavigate,
  role,
  counts,
}: {
  onNavigate?: () => void;
  role: Role;
  counts?: SidebarCounts;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => l.roles.includes(role));

  // Badge de urgencia por link: pendientes en Inicio, vencidos (seguimientos
  // atrasados) en Clientes. Solo se muestra si el contador es > 0.
  const badgeFor = (href: string): { value: number; tone: 'warning' | 'danger' } | null => {
    if (!counts) return null;
    if (href === '/' && counts.pending > 0) return { value: counts.pending, tone: 'warning' };
    if (href === '/clientes' && counts.overdue > 0) return { value: counts.overdue, tone: 'danger' };
    return null;
  };

  return (
    <nav className="space-y-1">
      {links.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        const Icon = l.icon;
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
            <Icon className="h-4 w-4" />
            {l.label}
            {badge && (
              <Badge tone={badge.tone} className="ml-auto" title={badge.tone === 'danger' ? 'Seguimientos vencidos' : 'Clientes pendientes'}>
                {badge.value}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
