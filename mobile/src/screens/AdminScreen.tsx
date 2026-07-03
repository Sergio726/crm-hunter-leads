import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSellerStats } from '../lib/api';
import type { SellerStats } from '../lib/types';
import { colors, shared } from '../ui';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setStats(await getSellerStats());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={shared.screen}>
      <FlatList
        data={stats}
        keyExtractor={(s) => s.user_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <View style={shared.card}>
            <Text style={shared.title}>{item.full_name ?? item.email}</Text>
            <Text style={shared.muted}>
              {item.last_contact_at
                ? `Último contacto: ${new Date(item.last_contact_at).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Sin contactos todavía'}
            </Text>
            <View style={styles.statsRow}>
              <Stat value={item.contacts_today} label="Hoy" />
              <Stat value={item.contacts_this_week} label="Semana" />
              <Stat value={item.clients_pending} label="Pendientes" />
              <Stat value={item.clients_assigned} label="Asignados" />
              <Stat value={item.clients_won} label="Ganados" />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={shared.emptyText}>
            Todavía no hay vendedores.{'\n'}Cuando tu equipo inicie sesión con Google van a aparecer acá.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.primaryDark },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
