'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListTodo, CheckCheck, CloudDownload } from 'lucide-react';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/vendedor', label: 'Mis pendientes', icon: ListTodo },
  { href: '/vendedor/contactados', label: 'Contactados', icon: CheckCheck },
  { href: '/vendedor/contactos-ghl', label: 'Contactos GHL', icon: CloudDownload },
];

export function SellerNav({
  onNavigate,
  variant = 'sidebar',
}: {
  onNavigate?: () => void;
  variant?: 'sidebar' | 'bottom';
}) {
  const pathname = usePathname();

  if (variant === 'bottom') {
    return (
      <nav className="flex w-full">
        {LINKS.map((l) => {
          const active =
            l.href === '/vendedor' ? pathname === '/vendedor' : pathname.startsWith(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {l.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-1">
      {LINKS.map((l) => {
        const active =
          l.href === '/vendedor' ? pathname === '/vendedor' : pathname.startsWith(l.href);
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
