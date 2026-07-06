export type Role = 'pending' | 'seller' | 'superadmin';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
}

export type ClientStatus = 'pending' | 'contacted' | 'won' | 'lost';

export interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  assigned_to: string | null;
  status: ClientStatus;
  next_follow_up: string | null;
  ghl_contact_id: string | null;
  ghl_synced_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type Channel = 'whatsapp' | 'sms' | 'email' | 'call';

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
  outcome: Outcome;
  notes: string | null;
  contacted_at: string;
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

export interface MyProgress {
  today: number;
  this_week: number;
  pending: number;
  won: number;
  goal: number;
  streak: number;
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  answered: 'Contestó',
  no_answer: 'No contestó',
  interested: 'Interesado',
  not_interested: 'No interesado',
  follow_up_scheduled: 'Agendé seguimiento',
  wrong_number: 'Número equivocado',
  other: 'Otro',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  call: 'Llamada',
};

export const STATUS_LABELS: Record<ClientStatus, string> = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  won: 'Ganado',
  lost: 'Perdido',
};
