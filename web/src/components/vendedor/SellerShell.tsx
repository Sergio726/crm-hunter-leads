'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { SellerNav } from './SellerNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { Logo } from '@/components/brand/Logo';

export function SellerShell({
  profile,
  title,
  children,
}: {
  profile: Profile;
  title: string;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-6 px-2">
          <Logo />
        </div>
        <SellerNav />
        <p className="mt-auto px-2 text-xs text-muted-foreground">CRM Lite · Vendedor</p>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo />
              <button onClick={() => setDrawer(false)} aria-label="Cerrar menú">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <SellerNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/70 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menú">
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
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
