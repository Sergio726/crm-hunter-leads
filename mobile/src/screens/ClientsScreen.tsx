import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import ClientCard from '../components/ClientCard';
import ScreenEnter from '../components/ScreenEnter';
import TurboPresence from '../components/TurboPresence';
import { getAllClients } from '../lib/api';
import type { Client } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';

function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function ClientsScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { setRefreshing(true); try { setClients(await getAllClients()); } finally { setRefreshing(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return clients;
    return clients.filter((c) => normalize([c.full_name, c.company, c.phone, c.email, c.phone_2, c.email_2, ...(c.tags ?? [])].join(' ')).includes(q));
  }, [clients, query]);

  return (
    <ScreenEnter style={shared.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput style={styles.searchInput} placeholder="Nombre, teléfono o empresa…" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
        {query.length > 0 ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ClientCard client={item} onPress={() => navigation.navigate('ClientDetail', { clientId: item.id })} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={clients.length > 0 ? <Text style={styles.count}>{query.trim() ? `${filtered.length} de ${clients.length} clientes` : `${clients.length} clientes`}</Text> : null}
        ListEmptyComponent={<View style={styles.empty}><TurboPresence state={query.trim() ? 'thinking' : 'idle'} size="lg" /><Text style={styles.emptyTitle}>{query.trim() ? 'No encontré esa señal.' : 'Tu lista todavía está vacía.'}</Text><Text style={styles.emptyCopy}>{query.trim() ? 'Probá con otro dato o revisá la escritura.' : 'Creá tu primer cliente y Turbo te ayuda a seguirlo.'}</Text></View>}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddClient')} activeOpacity={0.8} accessibilityLabel="Agregar cliente"><Ionicons name="add" size={26} color={colors.primaryText} /></TouchableOpacity>
    </ScreenEnter>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, marginHorizontal: 12, marginTop: 12 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  count: { fontSize: 11, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 0.3, color: colors.textMuted, marginHorizontal: 16, marginBottom: 4 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.34, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  empty: { alignItems: 'center', paddingHorizontal: 36, paddingTop: 60 },
  emptyTitle: { color: colors.text, fontFamily: 'monospace', fontWeight: '800', fontSize: 19, letterSpacing: -0.8, marginTop: 22, textAlign: 'center' },
  emptyCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});
