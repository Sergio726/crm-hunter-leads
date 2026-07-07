import type { ReactNode } from 'react';
import type { Profile } from '@/lib/types';
import { SidebarNav } from './SidebarNav';
import { LogoutButton } from './LogoutButton';

export function AppShell({
  profile,
  title,
  children,
}: {
  profile: Profile;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            C
          </div>
          <span className="font-semibold text-slate-900">CRM Lite</span>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{profile.email}</span>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
