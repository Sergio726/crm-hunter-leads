'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Contact, Users, Download, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/types';

const LINKS = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard, roles: ['seller', 'superadmin', 'viewer'] as Role[] },
  { href: '/clientes', label: 'Clientes', icon: Contact, roles: ['seller', 'superadmin', 'viewer'] as Role[] },
  { href: '/equipo', label: 'Equipo', icon: Users, roles: ['superadmin'] as Role[] },
  {
    href: '/contactos-ghl',
    label: 'Contactos GHL',
    icon: Download,
    roles: ['seller', 'superadmin'] as Role[],
  },
  { href: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['superadmin'] as Role[] },
  { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['superadmin'] as Role[] },
];

export function SidebarNav({ onNavigate, role }: { onNavigate?: () => void; role: Role }) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => l.roles.includes(role));

  return (
    <nav className="space-y-1">
      {links.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        const Icon = l.icon;
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
          </Link>
        );
      })}
    </nav>
  );
}
