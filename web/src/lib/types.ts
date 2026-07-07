// Tipos compartidos con la app móvil (mobile/src/lib/types.ts).
// TODO: extraer a un paquete compartido para no duplicar (ver .claude/agents/web-admin.md).

export type Role = 'pending' | 'seller' | 'superadmin';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
}

export type ClientStatus = 'pending' | 'contacted' | 'won' | 'lost';

/** Origen del lead: cargado desde la app/web, o importado desde el CRM externo (GHL). */
export type ClientOrigin = 'app' | 'ghl';

export interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  assigned_to: string | null;
  status: ClientStatus;
  next_follow_up: string | null;
  origin: ClientOrigin;
  tags: string[];
  crm_contact_id: string | null;
  crm_synced_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SellerStats {
  user_id: string;
  full_name: string | null;
  email: string;
  clients_assigned: number;
  clients_pending: number;
  clients_won: number;
  contacts_today: number;
  contacts_this_week: number;
  last_contact_at: string | null;
}

export const STATUS_LABELS: Record<ClientStatus, string> = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  won: 'Ganado',
  lost: 'Perdido',
};

export const ORIGIN_LABELS: Record<ClientOrigin, string> = {
  app: 'App/Web',
  ghl: 'GHL',
};
