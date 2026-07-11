import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';
import {
  addQuickNote,
  getAttachmentSignedUrl,
  getClient,
  getClientInteractions,
  getInteractionAttachments,
  logInteraction,
  updateClient,
  uploadInteractionAttachment,
} from '../lib/api';
import { callClient, sendEmail, sendSms, sendWhatsApp } from '../lib/messaging';
import type { Channel, Client, Interaction, InteractionAttachment, Outcome } from '../lib/types';
import { CHANNEL_LABELS, OUTCOME_LABELS, STATUS_LABELS, ORIGIN_LABELS } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];

type FollowUpChoice = { label: string; days: number | null };
const FOLLOW_UPS: FollowUpChoice[] = [
  { label: 'Sin seguimiento', days: null },
  { label: 'Mañana', days: 1 },
  { label: 'En 3 días', days: 3 },
  { label: 'Próxima semana', days: 7 },
];

const ACTIONS: { channel: Channel; label: string; icon: keyof typeof Ionicons.glyphMap; color: (c: ThemeColors) => string }[] = [
  { channel: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: (c) => c.whatsapp },
  { channel: 'sms', label: 'SMS', icon: 'chatbubble-ellipses-outline', color: (c) => c.primary },
  { channel: 'email', label: 'Email', icon: 'mail-outline', color: (c) => c.primaryDark },
  { channel: 'call', label: 'Llamar', icon: 'call-outline', color: (c) => c.textMuted },
];

export default function ClientDetailScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<RouteProp<RootStackParamList, 'ClientDetail'>>();
  const { clientId } = route.params;

  const [client, setClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<Interaction[]>([]);
  const [pendingChannel, setPendingChannel] = useState<Channel | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    phone_2: '',
    email_2: '',
    company: '',
    tags: '',
    notes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, InteractionAttachment[]>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [recordingForId, setRecordingForId] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    if (history.length === 0) return;
    getInteractionAttachments(history.map((h) => h.id)).then((rows) => {
      const grouped: Record<string, InteractionAttachment[]> = {};
      for (const a of rows) (grouped[a.interaction_id] ??= []).push(a);
      setAttachments(grouped);
    });
  }, [history]);

  const refreshAttachmentsFor = async (interactionId: string) => {
    const rows = await getInteractionAttachments([interactionId]);
    setAttachments((prev) => ({ ...prev, [interactionId]: rows }));
  };

  const pickPhoto = async (interactionId: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Sin permiso', 'Habilitá el acceso a fotos para adjuntar una imagen.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingFor(interactionId);
    try {
      await uploadInteractionAttachment(
        interactionId,
        asset.uri,
        asset.fileName ?? `foto-${Date.now()}.jpg`,
        asset.mimeType ?? 'image/jpeg',
      );
      await refreshAttachmentsFor(interactionId);
    } catch (e) {
      Alert.alert('No se pudo subir la foto', e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingFor(null);
    }
  };

  const pickPdf = async (interactionId: string) => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingFor(interactionId);
    try {
      await uploadInteractionAttachment(interactionId, asset.uri, asset.name, asset.mimeType ?? 'application/pdf');
      await refreshAttachmentsFor(interactionId);
    } catch (e) {
      Alert.alert('No se pudo subir el PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingFor(null);
    }
  };

  const toggleRecording = async (interactionId: string) => {
    if (recordingForId === interactionId) {
      // Detener y subir.
      await recorder.stop();
      setRecordingForId(null);
      const uri = recorder.uri;
      if (!uri) return;
      setUploadingFor(interactionId);
      try {
        await uploadInteractionAttachment(interactionId, uri, `nota-de-voz-${Date.now()}.m4a`, 'audio/m4a');
        await refreshAttachmentsFor(interactionId);
      } catch (e) {
        Alert.alert('No se pudo subir la nota de voz', e instanceof Error ? e.message : String(e));
      } finally {
        setUploadingFor(null);
      }
      return;
    }
    if (recordingForId) return; // ya grabando otra cosa
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) return Alert.alert('Sin permiso', 'Habilitá el acceso al micrófono para grabar.');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingForId(interactionId);
  };

  const viewAttachment = async (path: string) => {
    const url = await getAttachmentSignedUrl(path);
    if (!url) return Alert.alert('No se pudo abrir el archivo');
    Linking.openURL(url);
  };

  const load = useCallback(async () => {
    setClient(await getClient(clientId));
    setHistory(await getClientInteractions(clientId));
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const contact = async (channel: Channel) => {
    if (!client) return;
    try {
      const result =
        channel === 'whatsapp'
          ? await sendWhatsApp(client)
          : channel === 'sms'
            ? await sendSms(client)
            : channel === 'email'
              ? await sendEmail(client)
              : await callClient(client);

      if (result.needsManualOutcome) {
        setOutcome('answered');
        setFollowUpDays(null);
        setNotes('');
        setPendingChannel(channel);
      } else {
        await logInteraction({ client_id: client.id, channel, send_mode: 'api', outcome: 'other' });
        load();
      }
    } catch (e) {
      Alert.alert('No se pudo iniciar el contacto', e instanceof Error ? e.message : String(e));
    }
  };

  const saveOutcome = async () => {
    if (!client || !pendingChannel) return;
    setSaving(true);
    try {
      let nextFollowUp: string | undefined;
      if (followUpDays !== null) {
        const d = new Date();
        d.setDate(d.getDate() + followUpDays);
        nextFollowUp = d.toISOString().slice(0, 10);
      }
      await logInteraction(
        {
          client_id: client.id,
          channel: pendingChannel,
          send_mode: 'deeplink',
          outcome,
          notes: notes.trim() || undefined,
        },
        nextFollowUp,
      );
      setPendingChannel(null);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!client || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await addQuickNote(client.id, noteText.trim());
      setNoteText('');
      setNoteOpen(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingNote(false);
    }
  };

  const openEdit = () => {
    if (!client) return;
    setEditForm({
      full_name: client.full_name,
      phone: client.phone ?? '',
      email: client.email ?? '',
      phone_2: client.phone_2 ?? '',
      email_2: client.email_2 ?? '',
      company: client.company ?? '',
      tags: (client.tags ?? []).join(', '),
      notes: client.notes ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!client) return;
    if (!editForm.full_name.trim()) {
      Alert.alert('Falta el nombre', 'Ingresá al menos el nombre del cliente.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateClient(client.id, {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        phone_2: editForm.phone_2.trim() || null,
        email_2: editForm.email_2.trim() || null,
        company: editForm.company.trim() || null,
        tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: editForm.notes.trim() || null,
      });
      setEditOpen(false);
      load();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEdit(false);
    }
  };

  if (!client) return <View style={shared.screen} />;

  return (
    <ScrollView style={shared.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[shared.card, { marginTop: 12 }]}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{client.full_name}</Text>
          <TouchableOpacity onPress={openEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="pencil" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {client.company ? <Text style={shared.muted}>{client.company}</Text> : null}
        {client.phone ? <Text style={shared.muted}>📞 {client.phone}</Text> : null}
        {client.email ? <Text style={shared.muted}>✉️ {client.email}</Text> : null}
        <Text style={[shared.muted, { marginTop: 6 }]}>
          Estado: {STATUS_LABELS[client.status]}
          {client.next_follow_up ? ` · Próximo seguimiento: ${client.next_follow_up}` : ''}
        </Text>
        <View style={styles.chipsRow}>
          <Text
            style={[styles.originChip, client.origin === 'ghl' ? styles.originGhl : styles.originApp]}
          >
            {ORIGIN_LABELS[client.origin]}
          </Text>
          {(client.tags ?? []).map((t) => (
            <Text key={t} style={styles.tagChip}>
              {t}
            </Text>
          ))}
        </View>
        {client.notes ? <Text style={[shared.muted, { marginTop: 6 }]}>{client.notes}</Text> : null}
      </View>

      <View style={styles.actions}>
        {ACTIONS.map((a) => (
          <TouchableOpacity
            key={a.channel}
            style={[styles.actionBtn, { backgroundColor: a.color(colors) }]}
            onPress={() => contact(a.channel)}
          >
            <Ionicons name={a.icon} size={18} color="#fff" />
            <Text style={styles.actionText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {noteOpen ? (
        <View style={[shared.card, styles.noteCard]}>
          <Text style={shared.label}>Comentario rápido</Text>
          <TextInput
            style={shared.input}
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Escribí una nota…"
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
          />
          <View style={styles.noteActions}>
            <TouchableOpacity
              style={styles.cancel}
              onPress={() => {
                setNoteOpen(false);
                setNoteText('');
              }}
            >
              <Text style={{ color: colors.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[shared.button, styles.noteSaveBtn]}
              onPress={saveNote}
              disabled={savingNote || !noteText.trim()}
            >
              <Text style={shared.buttonText}>{savingNote ? 'Guardando…' : 'Guardar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.noteToggle} onPress={() => setNoteOpen(true)}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Comentario rápido</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Historial de contactos</Text>
      {history.length === 0 ? (
        <Text style={[shared.muted, { marginHorizontal: 16 }]}>Sin contactos registrados todavía.</Text>
      ) : (
        history.map((i) => (
          <View key={i.id} style={shared.card}>
            <Text style={shared.title}>
              {CHANNEL_LABELS[i.channel]}
              {i.outcome ? ` · ${OUTCOME_LABELS[i.outcome]}` : ''}
            </Text>
            <Text style={shared.muted}>
              {new Date(i.contacted_at).toLocaleString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {i.notes ? <Text style={shared.muted}>{i.notes}</Text> : null}

            {(attachments[i.id] ?? []).length > 0 && (
              <View style={{ marginTop: 6, gap: 2 }}>
                {attachments[i.id].map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.attachmentRow}
                    onPress={() => viewAttachment(a.storage_path)}
                  >
                    <Ionicons name="attach" size={14} color={colors.primary} />
                    <Text style={{ fontSize: 12, color: colors.primary }} numberOfLines={1}>
                      {a.storage_path.split('/').pop()}
                      {a.file_size_bytes ? ` (${formatBytes(a.file_size_bytes)})` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.attachActions}>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => pickPhoto(i.id)}
                disabled={uploadingFor === i.id}
              >
                <Ionicons name="image-outline" size={16} color={colors.textMuted} />
                <Text style={styles.attachBtnText}>Foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachBtn} onPress={() => pickPdf(i.id)} disabled={uploadingFor === i.id}>
                <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
                <Text style={styles.attachBtnText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => toggleRecording(i.id)}
                disabled={uploadingFor === i.id || (recordingForId !== null && recordingForId !== i.id)}
              >
                <Ionicons
                  name={recordingForId === i.id ? 'stop-circle' : 'mic-outline'}
                  size={16}
                  color={recordingForId === i.id ? colors.danger : colors.textMuted}
                />
                <Text style={[styles.attachBtnText, recordingForId === i.id && { color: colors.danger }]}>
                  {recordingForId === i.id ? 'Detener' : 'Nota de voz'}
                </Text>
              </TouchableOpacity>
              {uploadingFor === i.id && <Text style={styles.attachBtnText}>Subiendo…</Text>}
            </View>
          </View>
        ))
      )}

      <Modal visible={pendingChannel !== null} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              ¿Cómo resultó el {pendingChannel ? CHANNEL_LABELS[pendingChannel] : ''}?
            </Text>

            <View style={styles.chips}>
              {OUTCOMES.map((o) => (
                <TouchableOpacity
                  key={o}
                  style={[styles.chip, outcome === o && styles.chipActive]}
                  onPress={() => setOutcome(o)}
                >
                  <Text style={[styles.chipText, outcome === o && styles.chipTextActive]}>
                    {OUTCOME_LABELS[o]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={shared.label}>Próximo seguimiento</Text>
            <View style={styles.chips}>
              {FOLLOW_UPS.map((f) => (
                <TouchableOpacity
                  key={f.label}
                  style={[styles.chip, followUpDays === f.days && styles.chipActive]}
                  onPress={() => setFollowUpDays(f.days)}
                >
                  <Text style={[styles.chipText, followUpDays === f.days && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={shared.label}>Notas (opcional)</Text>
            <TextInput
              style={shared.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ej: pidió que lo llame el lunes"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <TouchableOpacity style={[shared.button, { marginTop: 16 }]} onPress={saveOutcome} disabled={saving}>
              <Text style={shared.buttonText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={() => setPendingChannel(null)}>
              <Text style={{ color: colors.textMuted }}>No se concretó el contacto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: 16 }}>
            <Text style={styles.modalTitle}>Editar cliente</Text>

            <Text style={shared.label}>Nombre *</Text>
            <TextInput
              style={shared.input}
              value={editForm.full_name}
              onChangeText={(v) => setEditForm((f) => ({ ...f, full_name: v }))}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Teléfono</Text>
            <TextInput
              style={shared.input}
              value={editForm.phone}
              onChangeText={(v) => setEditForm((f) => ({ ...f, phone: v }))}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Email</Text>
            <TextInput
              style={shared.input}
              value={editForm.email}
              onChangeText={(v) => setEditForm((f) => ({ ...f, email: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Teléfono secundario</Text>
            <TextInput
              style={shared.input}
              value={editForm.phone_2}
              onChangeText={(v) => setEditForm((f) => ({ ...f, phone_2: v }))}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Email secundario</Text>
            <TextInput
              style={shared.input}
              value={editForm.email_2}
              onChangeText={(v) => setEditForm((f) => ({ ...f, email_2: v }))}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Empresa</Text>
            <TextInput
              style={shared.input}
              value={editForm.company}
              onChangeText={(v) => setEditForm((f) => ({ ...f, company: v }))}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Tags (separados por coma)</Text>
            <TextInput
              style={shared.input}
              value={editForm.tags}
              onChangeText={(v) => setEditForm((f) => ({ ...f, tags: v }))}
              placeholder="warm, evento…"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={shared.label}>Notas</Text>
            <TextInput
              style={shared.input}
              value={editForm.notes}
              onChangeText={(v) => setEditForm((f) => ({ ...f, notes: v }))}
              multiline
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity style={[shared.button, { marginTop: 16 }]} onPress={saveEdit} disabled={savingEdit}>
              <Text style={shared.buttonText}>{savingEdit ? 'Guardando…' : 'Guardar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={() => setEditOpen(false)}>
              <Text style={{ color: colors.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    name: { fontSize: 22, fontWeight: '700', color: colors.text },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    attachActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
    attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    attachBtnText: { fontSize: 12, color: colors.textMuted },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    originChip: {
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    originGhl: { color: colors.accent, backgroundColor: colors.accentSoft },
    originApp: { color: colors.textMuted, backgroundColor: colors.surface2 },
    tagChip: {
      fontSize: 11,
      color: colors.textMuted,
      backgroundColor: colors.surface2,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    actions: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginVertical: 10 },
    noteToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginHorizontal: 16,
      marginBottom: 4,
    },
    noteCard: { marginTop: 0 },
    noteActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 10 },
    noteSaveBtn: { flex: 0, paddingHorizontal: 20 },
    actionBtn: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      gap: 4,
    },
    actionText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 6,
    },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 36,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, color: colors.text },
    chipTextActive: { color: '#fff', fontWeight: '600' },
    cancel: { alignItems: 'center', marginTop: 14 },
  });
