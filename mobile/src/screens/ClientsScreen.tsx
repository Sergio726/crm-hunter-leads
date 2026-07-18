import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import ClientCard from '../components/ClientCard';
import { getAllClients } from '../lib/api';
import type { Client } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';

/** Minúsculas sin acentos, para que la búsqueda ignore tildes ("jose" ↔ "José"). */
function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export default function ClientsScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setClients(await getAllClients());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return clients;
    return clients.filter((c) => {
      const haystack = normalize(
        [c.full_name, c.company, c.phone, c.email, c.phone_2, c.email_2, ...(c.tags ?? [])].join(' '),
      );
      return haystack.includes(q);
    });
  }, [clients, query]);

  return (
    <View style={shared.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre, teléfono, email…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            onPress={() => navigation.navigate('ClientDetail', { clientId: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          clients.length > 0 ? (
            <Text style={styles.count}>
              {query.trim()
                ? `${filtered.length} de ${clients.length} clientes`
                : `${clients.length} clientes`}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <Text style={shared.emptyText}>
            {query.trim()
              ? `Sin resultados para “${query.trim()}”.`
              : 'Todavía no tenés clientes.'}
          </Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddClient')}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginHorizontal: 12,
      marginTop: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    count: {
      fontSize: 12,
      color: colors.textMuted,
      marginHorizontal: 16,
      marginBottom: 4,
    },
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
  });
