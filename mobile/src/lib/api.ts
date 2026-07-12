import { File } from 'expo-file-system';
import { supabase } from './supabase';
import type {
  Channel,
  Client,
  Interaction,
  InteractionAttachment,
  MyProgress,
  Outcome,
  Profile,
  SellerStats,
} from './types';

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single();
  return data;
}

export async function updateMyProfile(
  userId: string,
  patch: Pick<Profile, 'full_name' | 'phone' | 'secondary_email'>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
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
  phone_2?: string;
  email_2?: string;
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
  return data;
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  const { error } = await supabase.from('clients').update(patch).eq('id', id);
  if (error) throw error;
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

/** Comentario rápido (canal 'note'): no cambia el estado del cliente ni el seguimiento. */
export async function addQuickNote(clientId: string, text: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('interactions')
    .insert({ client_id: clientId, channel: 'note', user_id: auth.user!.id, notes: text });
  if (error) throw error;
}

/** Progreso personal del vendedor (meta diaria, racha, totales). */
export async function getMyProgress(): Promise<MyProgress | null> {
  const { data, error } = await supabase.rpc('my_progress');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as MyProgress) ?? null;
}

/** Todos los perfiles del equipo (solo superadmin puede leerlos por RLS). */
export async function getTeamMembers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role')
    .order('role', { ascending: true })
    .order('email', { ascending: true });
  if (error) throw error;
  return (data as Profile[]) ?? [];
}

/** Invita un email a la lista blanca (y promueve si ya inició sesión). */
export async function inviteMember(email: string): Promise<void> {
  const { error } = await supabase.rpc('invite_member', { p_email: email });
  if (error) throw error;
}

/** Revoca el acceso de un vendedor (vuelve a estado pendiente). */
export async function revokeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_member', { p_user: userId });
  if (error) throw error;
}

export async function getSellerStats(): Promise<SellerStats[]> {
  const { data, error } = await supabase
    .from('v_seller_stats')
    .select('*')
    .order('contacts_this_week', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// La sincronización con el CRM (GHL) la dispara un Database Webhook de Supabase
// (trigger clients_push_to_crm → n8n → GHL upsert). La app no llama a GHL directamente.

/** PERM-3: adjuntos (foto/PDF/nota de voz) de una interacción. No sincroniza a GHL. */
export async function uploadInteractionAttachment(
  interactionId: string,
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const file = new File(uri);
  const bytes = await file.bytes();
  const path = `${interactionId}/${Date.now()}-${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('interaction-attachments')
    .upload(path, bytes, { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('interaction_attachments').insert({
    interaction_id: interactionId,
    uploaded_by: auth.user?.id,
    storage_path: path,
    file_type: mimeType,
    file_size_bytes: bytes.byteLength,
  });
  if (insertError) throw insertError;
}

export async function getInteractionAttachments(interactionIds: string[]): Promise<InteractionAttachment[]> {
  if (interactionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('interaction_attachments')
    .select('*')
    .in('interaction_id', interactionIds);
  if (error) throw error;
  return data ?? [];
}

/** El bucket es privado: hace falta una URL firmada para ver/descargar un adjunto. */
export async function getAttachmentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('interaction-attachments').createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
}
