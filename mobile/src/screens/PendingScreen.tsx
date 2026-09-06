import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import ClientCard from '../components/ClientCard';
import ProgressBanner from '../components/ProgressBanner';
import ScreenEnter from '../components/ScreenEnter';
import TurboPresence from '../components/TurboPresence';
import { getPendingClients, getMyProgress } from '../lib/api';
import type { Client, MyProgress } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';

export default function PendingScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [clients, setClients] = useState<Client[]>([]);
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [list, prog] = await Promise.all([getPendingClients(), getMyProgress()]);
      setClients(list);
      setProgress(prog);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScreenEnter style={shared.screen}>
      <FlatList
        data={clients}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ClientCard client={item} onPress={() => navigation.navigate('ClientDetail', { clientId: item.id })} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primaryDark} />}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 96 }}
        ListHeaderComponent={<ProgressBanner progress={progress} />}
        ListEmptyComponent={<View style={styles.empty}><TurboPresence state="ready" size="lg" /><Text style={styles.emptyTitle}>Todo claro por ahora.</Text><Text style={styles.emptyCopy}>No tenés seguimientos pendientes. Cuando llegue uno, Turbo lo deja primero.</Text></View>}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddClient')} activeOpacity={0.8} accessibilityLabel="Agregar lead">
        <Ionicons name="add" size={26} color={colors.onPrimary} />
      </TouchableOpacity>
    </ScreenEnter>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: colors.primary, shadowOpacity: 0.34, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
  empty: { alignItems: 'center', paddingHorizontal: 36, paddingTop: 70 },
  emptyTitle: { color: colors.text, fontFamily: 'monospace', fontWeight: '800', fontSize: 20, letterSpacing: -0.8, marginTop: 22 },
  emptyCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});
