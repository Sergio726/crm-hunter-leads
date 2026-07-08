'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListTodo, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/vendedor', label: 'Mis pendientes', icon: ListTodo },
  { href: '/vendedor/contactados', label: 'Contactados', icon: CheckCheck },
];

export function SellerNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

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
