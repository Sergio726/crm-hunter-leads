'use client';

import { useEffect, useState } from 'react';
import { List, Kanban, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/Field';
import { ClientsTable } from './ClientsTable';
import { ClientsBoard } from './ClientsBoard';
import { AddClientDialog } from './AddClientDialog';
import { ImportCsvDialog } from './ImportCsv';
import type { Client, ClientStatus, Role } from '@/lib/types';

type Seller = { id: string; name: string };
type View = 'tabla' | 'tablero';

const STORAGE_KEY = 'crm-lite:clientes-view';

/**
 * Barra única de la página de Clientes (WEB-28): buscador + selector de vista +
 * Nuevo/Importar. Alterna entre la Tabla (WEB-8) y el Tablero Kanban (WEB-27),
 * recordando la elección. El buscador es compartido por ambas vistas.
 */
export function ClientsView(props: {
  clients: Client[];
  sellers: Seller[];
  role: Role;
  currentUserId: string;
  contactedThisWeekIds?: string[];
  /** UXR-5: filtro inicial desde la URL (llegando desde una tarjeta del Inicio). */
  initialStatus?: ClientStatus;
  initialOverdue?: boolean;
}) {
  const isAdmin = props.role === 'superadmin';
  const forcedTable = Boolean(props.initialStatus) || Boolean(props.initialOverdue);

  const [view, setView] = useState<View>('tabla');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (forcedTable) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tabla' || saved === 'tablero') setView(saved);
  }, [forcedTable]);

  function change(v: View) {
    setView(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // localStorage puede fallar en modo privado; la vista igual cambia en memoria.
    }
  }

  const tabs: { id: View; label: string; icon: typeof List }[] = [
    { id: 'tabla', label: 'Lista', icon: List },
    { id: 'tablero', label: 'Tablero', icon: Kanban },
  ];

  return (
    <div className="space-y-4">
      {/* Barra única de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:min-w-56 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
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
                  title={t.id === 'tablero' ? 'Vista de tablero (Kanban)' : 'Vista de lista'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
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

          {isAdmin && <ImportCsvDialog sellers={props.sellers} existingClients={props.clients} />}
          {props.role !== 'viewer' && (
            <AddClientDialog sellers={props.sellers} defaultAssignedTo={isAdmin ? undefined : props.currentUserId} />
          )}
        </div>
      </div>

      {view === 'tabla' ? (
        <ClientsTable
          clients={props.clients}
          sellers={props.sellers}
          role={props.role}
          currentUserId={props.currentUserId}
          contactedThisWeekIds={props.contactedThisWeekIds}
          initialStatus={props.initialStatus}
          initialOverdue={props.initialOverdue}
          search={search}
        />
      ) : (
        <ClientsBoard
          clients={props.clients}
          sellers={props.sellers}
          role={props.role}
          currentUserId={props.currentUserId}
          search={search}
        />
      )}
    </div>
  );
}
