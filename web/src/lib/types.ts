// Tipos compartidos con la app móvil (mobile/src/lib/types.ts).
// TODO: extraer a un paquete compartido para no duplicar (ver .claude/agents/web-admin.md).

export type Role = 'pending' | 'seller' | 'superadmin' | 'viewer';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  phone: string | null;
  secondary_email: string | null;
  notification_prefs: Record<string, unknown>;
}

export type ClientStatus = 'pending' | 'contacted' | 'won' | 'lost';

/**
 * Origen del lead: cargado desde la app/web, importado desde el CRM externo (GHL),
 * o generado por el módulo de prospección ('hunter').
 *
 * Ojo: `push_to_crm()` (migración 0007) solo empuja a GHL cuando origin='app',
 * así que los leads de prospección quedan deliberadamente fuera de la sync.
 */
export type ClientOrigin = 'app' | 'ghl' | 'hunter';

export interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  phone_2: string | null;
  email_2: string | null;
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

/** Fila de auditoría poblada por trigger en cada UPDATE de clients (PERM-2). */
export interface ClientChange {
  id: string;
  client_id: string;
  changed_by: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
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

/**
 * SEM-1: semáforo de estado unificado (app + web). Antes estaba duplicado en
 * ClientsTable y ClientDrawer, con `lost` en gris en la web vs rojo en la app.
 * Familia cálida en dos tonos para pending/contacted (ámbar claro → sin contactar,
 * naranja pleno → en conversación), verde para ganado, rojo para perdido.
 * Los valores son tonos del componente Badge (`web/src/components/ui/Badge.tsx`).
 */
export const STATUS_TONE: Record<ClientStatus, 'warning' | 'orange' | 'success' | 'danger'> = {
  pending: 'warning',
  contacted: 'orange',
  won: 'success',
  lost: 'danger',
};

export const ORIGIN_LABELS: Record<ClientOrigin, string> = {
  app: 'App/Web',
  ghl: 'GHL',
  hunter: 'Prospección',
};

export interface MyProgress {
  today: number;
  this_week: number;
  pending: number;
  won: number;
  goal: number;
  streak: number;
}

export type Channel = 'whatsapp' | 'sms' | 'email' | 'call' | 'note';

export type Outcome =
  | 'answered'
  | 'no_answer'
  | 'interested'
  | 'not_interested'
  | 'follow_up_scheduled'
  | 'wrong_number'
  | 'other';

export interface Interaction {
  id: string;
  client_id: string;
  user_id: string;
  channel: Channel;
  send_mode: 'deeplink' | 'api';
  /** null solo cuando channel === 'note' (comentario rápido, sin resultado de contacto) */
  outcome: Outcome | null;
  notes: string | null;
  contacted_at: string;
}

/** Adjunto (foto/PDF/nota de voz) de una interacción (PERM-3). No sincroniza a GHL. */
export interface InteractionAttachment {
  id: string;
  interaction_id: string;
  uploaded_by: string | null;
  storage_path: string;
  file_type: string;
  file_size_bytes: number | null;
  created_at: string;
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  call: 'Llamada',
  note: 'Comentario',
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  answered: 'Contestó',
  no_answer: 'No contestó',
  interested: 'Interesado',
  not_interested: 'No interesado',
  follow_up_scheduled: 'Agendó seguimiento',
  wrong_number: 'Número equivocado',
  other: 'Otro',
};
