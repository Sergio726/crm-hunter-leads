import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ClientCard from '../components/ClientCard';
import ProgressBanner from '../components/ProgressBanner';
import { getPendingClients, getMyProgress } from '../lib/api';
import type { Client, MyProgress } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { colors, shared } from '../ui';

export default function PendingScreen() {
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={shared.screen}>
      <FlatList
        data={clients}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            onPress={() => navigation.navigate('ClientDetail', { clientId: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 96 }}
        ListHeaderComponent={<ProgressBanner progress={progress} />}
        ListEmptyComponent={
          <Text style={shared.emptyText}>
            No tenés clientes pendientes.{'\n'}¡Buen trabajo! 🎉
          </Text>
        }
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddClient')}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
});
