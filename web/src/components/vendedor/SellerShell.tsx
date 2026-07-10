'use client';

import type { ReactNode } from 'react';
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
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-6 px-2">
          <Logo />
        </div>
        <SellerNav />
        <p className="mt-auto px-2 text-xs text-muted-foreground">CRM Lite · Vendedor</p>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        <SellerNav variant="bottom" />
      </nav>

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/70 px-4 py-3 backdrop-blur-md">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu profile={profile} />
          </div>
        </header>
        <main className="p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
