'use client';

import { useEffect, useState } from 'react';
import { Table2, Kanban } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ClientsTable } from './ClientsTable';
import { ClientsBoard } from './ClientsBoard';
import type { Client, Role } from '@/lib/types';

type Seller = { id: string; name: string };
type View = 'tabla' | 'tablero';

const STORAGE_KEY = 'crm-lite:clientes-view';

/** Alterna entre la Tabla (WEB-8) y el Tablero Kanban (WEB-27), recordando la elección. */
export function ClientsView(props: {
  clients: Client[];
  sellers: Seller[];
  role: Role;
  currentUserId: string;
  contactedThisWeekIds?: string[];
}) {
  const [view, setView] = useState<View>('tabla');

  // Se lee en efecto (no en el estado inicial) para no romper la hidratación SSR.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tabla' || saved === 'tablero') setView(saved);
  }, []);

  function change(v: View) {
    setView(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // localStorage puede fallar en modo privado; la vista igual cambia en memoria.
    }
  }

  const tabs: { id: View; label: string; icon: typeof Table2 }[] = [
    { id: 'tabla', label: 'Tabla', icon: Table2 },
    { id: 'tablero', label: 'Tablero', icon: Kanban },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => change(t.id)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {view === 'tabla' ? (
        <ClientsTable
          clients={props.clients}
          sellers={props.sellers}
          role={props.role}
          currentUserId={props.currentUserId}
          contactedThisWeekIds={props.contactedThisWeekIds}
        />
      ) : (
        <ClientsBoard
          clients={props.clients}
          sellers={props.sellers}
          role={props.role}
          currentUserId={props.currentUserId}
        />
      )}
    </div>
  );
}
