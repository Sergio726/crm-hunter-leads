import { supabase } from './supabase';
import type { Channel, Client, Interaction, Outcome, Profile, SellerStats } from './types';

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single();
  return data;
}

export async function getPendingClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('v_pending_clients')
    .select('*')
    .order('next_follow_up', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Clientes contactados en un rango, con su última interacción del rango. */
export async function getContactedInRange(fromIso: string, toIso: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select('*, clients(*)')
    .gte('contacted_at', fromIso)
    .lt('contacted_at', toIso)
    .order('contacted_at', { ascending: false });
  if (error) throw error;
  return (data as Interaction[]) ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getClientInteractions(clientId: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('client_id', clientId)
    .order('contacted_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface NewClient {
  full_name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  next_follow_up?: string;
}

export async function createClient(input: NewClient): Promise<Client> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, assigned_to: auth.user!.id })
    .select()
    .single();
  if (error) throw error;
  triggerGhlSync();
  return data;
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  const { error } = await supabase.from('clients').update(patch).eq('id', id);
  if (error) throw error;
  triggerGhlSync();
}

export interface NewInteraction {
  client_id: string;
  channel: Channel;
  send_mode?: 'deeplink' | 'api';
  outcome: Outcome;
  notes?: string;
}

/** Registra la interacción y marca el cliente como contactado. */
export async function logInteraction(input: NewInteraction, nextFollowUp?: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('interactions')
    .insert({ ...input, user_id: auth.user!.id });
  if (error) throw error;

  const patch: Partial<Client> = { status: 'contacted' };
  if (nextFollowUp) patch.next_follow_up = nextFollowUp;
  await updateClient(input.client_id, patch);
}

export async function getSellerStats(): Promise<SellerStats[]> {
  const { data, error } = await supabase
    .from('v_seller_stats')
    .select('*')
    .order('contacts_this_week', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Dispara la sincronización con GoHighLevel (fire-and-forget).
 * La Edge Function procesa TODOS los clientes pendientes de sync,
 * así una falla puntual se recupera en el próximo disparo.
 */
export function triggerGhlSync(): void {
  supabase.functions.invoke('sync-ghl').catch(() => {
    // Sin conexión o GHL caído: el próximo trigger reintenta.
  });
}
