import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import { getClient, getClientInteractions, logInteraction } from '../lib/api';
import { callClient, sendEmail, sendSms, sendWhatsApp } from '../lib/messaging';
import type { Channel, Client, Interaction, Outcome } from '../lib/types';
import { CHANNEL_LABELS, OUTCOME_LABELS, STATUS_LABELS } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { colors, shared } from '../ui';

const OUTCOMES = Object.keys(OUTCOME_LABELS) as Outcome[];

type FollowUpChoice = { label: string; days: number | null };
const FOLLOW_UPS: FollowUpChoice[] = [
  { label: 'Sin seguimiento', days: null },
  { label: 'Mañana', days: 1 },
  { label: 'En 3 días', days: 3 },
  { label: 'Próxima semana', days: 7 },
];

export default function ClientDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ClientDetail'>>();
  const { clientId } = route.params;

  const [client, setClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<Interaction[]>([]);
  const [pendingChannel, setPendingChannel] = useState<Channel | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('answered');
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setClient(await getClient(clientId));
    setHistory(await getClientInteractions(clientId));
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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
        // Modo API: el envío queda registrado automáticamente
        await logInteraction({ client_id: client.id, channel, send_mode: 'api', outcome: 'other' });
        load();
      }
    } catch (e: any) {
      Alert.alert('No se pudo iniciar el contacto', e.message ?? String(e));
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
        nextFollowUp
      );
      setPendingChannel(null);
      load();
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!client) return <View style={shared.screen} />;

  return (
    <ScrollView style={shared.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[shared.card, { marginTop: 12 }]}>
        <Text style={styles.name}>{client.full_name}</Text>
        {client.company ? <Text style={shared.muted}>{client.company}</Text> : null}
        {client.phone ? <Text style={shared.muted}>📞 {client.phone}</Text> : null}
        {client.email ? <Text style={shared.muted}>✉️ {client.email}</Text> : null}
        <Text style={[shared.muted, { marginTop: 6 }]}>
          Estado: {STATUS_LABELS[client.status]}
          {client.next_follow_up ? ` · Próximo seguimiento: ${client.next_follow_up}` : ''}
        </Text>
        {client.notes ? <Text style={[shared.muted, { marginTop: 6 }]}>{client.notes}</Text> : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.whatsapp }]}
          onPress={() => contact('whatsapp')}
        >
          <Text style={shared.buttonText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => contact('sms')}>
          <Text style={shared.buttonText}>SMS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primaryDark }]}
          onPress={() => contact('email')}
        >
          <Text style={shared.buttonText}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.textMuted }]} onPress={() => contact('call')}>
          <Text style={shared.buttonText}>Llamar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Historial de contactos</Text>
      {history.length === 0 ? (
        <Text style={[shared.muted, { marginHorizontal: 16 }]}>Sin contactos registrados todavía.</Text>
      ) : (
        history.map((i) => (
          <View key={i.id} style={shared.card}>
            <Text style={shared.title}>
              {CHANNEL_LABELS[i.channel]} · {OUTCOME_LABELS[i.outcome]}
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
          </View>
        ))
      )}

      {/* Modal: ¿cómo resultó el contacto? */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginVertical: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
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
