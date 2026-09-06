import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getContactedInRange } from '../lib/api';
import type { Client, Interaction } from '../lib/types';
import { CHANNEL_LABELS, OUTCOME_LABELS } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';
import ScreenEnter from '../components/ScreenEnter';
import TurboPresence from '../components/TurboPresence';

type Range = 'today' | 'week';

function rangeToIso(range: Range): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  if (range === 'today') start.setHours(0, 0, 0, 0);
  else { const day = (now.getDay() + 6) % 7; start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0); }
  const end = new Date(now); end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function ContactedScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [range, setRange] = useState<Range>('today');
  const [items, setItems] = useState<Interaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { setRefreshing(true); try { const { from, to } = rangeToIso(range); setItems(await getContactedInRange(from, to)); } finally { setRefreshing(false); } }, [range]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScreenEnter style={shared.screen}>
      <View style={styles.segment}>
        {(['today', 'week'] as Range[]).map((r) => <TouchableOpacity key={r} style={[styles.segmentItem, range === r && styles.segmentActive]} onPress={() => setRange(r)}><Text style={[styles.segmentText, range === r && styles.segmentTextActive]}>{r === 'today' ? 'Hoy' : 'Esta semana'}</Text></TouchableOpacity>)}
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => {
          const client = (item as Interaction & { clients?: Client }).clients;
          return <TouchableOpacity style={shared.card} onPress={() => navigation.navigate('ClientDetail', { clientId: item.client_id })} activeOpacity={0.78}><Text style={shared.title}>{client?.full_name ?? 'Cliente'}</Text><Text style={shared.muted}>{CHANNEL_LABELS[item.channel]}{item.outcome ? ` · ${OUTCOME_LABELS[item.outcome]}` : ''} · {new Date(item.contacted_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>{item.notes ? <Text style={[shared.muted, { marginTop: 5 }]}>{item.notes}</Text> : null}</TouchableOpacity>;
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={<View style={styles.empty}><TurboPresence state="idle" size="lg" /><Text style={styles.emptyTitle}>{range === 'today' ? 'Todavía no hubo contactos hoy.' : 'Semana tranquila por ahora.'}</Text><Text style={styles.emptyCopy}>Cada conversación registrada aparece acá para que no pierdas el hilo.</Text></View>}
      />
    </ScreenEnter>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  segment: { flexDirection: 'row', margin: 12, backgroundColor: colors.surface2, borderRadius: 14, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segmentText: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  segmentTextActive: { color: colors.text },
  empty: { alignItems: 'center', paddingHorizontal: 36, paddingTop: 62 },
  emptyTitle: { color: colors.text, fontFamily: 'monospace', fontWeight: '800', fontSize: 19, textAlign: 'center', marginTop: 22 },
  emptyCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});
