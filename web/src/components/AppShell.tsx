'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { SidebarNav, type SidebarCounts } from './SidebarNav';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { Logo } from './brand/Logo';

export function AppShell({
  profile,
  title,
  children,
}: {
  profile: Profile;
  title: string;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [counts, setCounts] = useState<SidebarCounts | undefined>(undefined);

  // Contadores de urgencia para los badges del sidebar (WEB-7/UXR-7). El RLS de
  // `clients` recorta por rol (el vendedor cuenta los suyos; admin/viewer, todos).
  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);
    let active = true;
    (async () => {
      const [pendingRes, overdueRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .lt('next_follow_up', today)
          .not('status', 'in', '("won","lost")'),
      ]);
      if (active) setCounts({ pending: pendingRes.count ?? 0, overdue: overdueRes.count ?? 0 });
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-6 px-2">
          <Logo />
        </div>
        <SidebarNav role={profile.role} counts={counts} />
        <p className="eyebrow mt-auto px-2 text-muted-foreground">ST Labs / Hunter Leads</p>
      </aside>

      {/* Drawer (mobile) */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70 md:backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo />
              <button onClick={() => setDrawer(false)} aria-label="Cerrar menú">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <SidebarNav role={profile.role} counts={counts} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      {/* Contenido */}
      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:bg-card/70 md:backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menú">
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
            {/* Sin tracking-tight: el h1 ya trae el interletrado de marca (-0.055em). */}
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu profile={profile} />
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
