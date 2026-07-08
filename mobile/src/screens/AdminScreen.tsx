import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSellerStats, getTeamMembers, inviteMember, revokeMember } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Profile, SellerStats } from '../lib/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';

function Stat({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stats, setStats] = useState<SellerStats[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, m, settings] = await Promise.all([
        getSellerStats(),
        getTeamMembers(),
        supabase.from('app_settings').select('value').eq('key', 'allowed_emails').single(),
      ]);
      setStats(s);
      setMembers(m);
      setAllowedEmails(((settings.data?.value as string[]) ?? []).map((e) => e.toLowerCase()));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pending = useMemo(() => members.filter((m) => m.role === 'pending'), [members]);
  const statsById = useMemo(() => new Map(stats.map((s) => [s.user_id, s])), [stats]);
  const joinedEmails = useMemo(
    () => new Set(members.map((m) => m.email.toLowerCase())),
    [members],
  );
  const invitedNotJoined = useMemo(
    () => allowedEmails.filter((e) => !joinedEmails.has(e)),
    [allowedEmails, joinedEmails],
  );
  void statsById;

  const handleInvite = async () => {
    const value = email.trim();
    if (!value || !value.includes('@')) {
      Alert.alert('Email inválido', 'Ingresá un email válido.');
      return;
    }
    setInviting(true);
    try {
      await inviteMember(value);
      setEmail('');
      Alert.alert('Invitación enviada', `${value} ya puede entrar como vendedor.`);
      await load();
    } catch (e) {
      Alert.alert('No se pudo invitar', e instanceof Error ? e.message : String(e));
    } finally {
      setInviting(false);
    }
  };

  const approve = (member: Profile) => {
    Alert.alert('Aprobar acceso', `¿Dar acceso de vendedor a ${member.email}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprobar',
        onPress: async () => {
          try {
            await inviteMember(member.email);
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const revoke = (member: { user_id: string; email: string }) => {
    Alert.alert('Quitar acceso', `¿Quitar el acceso de ${member.email}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeMember(member.user_id);
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <View style={shared.screen}>
      <FlatList
        data={stats}
        keyExtractor={(s) => s.user_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            <View style={shared.card}>
              <Text style={shared.title}>Invitar vendedor</Text>
              <Text style={[shared.muted, { marginTop: 2 }]}>
                Cargá el email de la persona. Cuando inicie sesión con Google, entra directo.
              </Text>
              <View style={styles.inviteRow}>
                <TextInput
                  style={[shared.input, { flex: 1 }]}
                  placeholder="email@ejemplo.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!inviting}
                />
                <TouchableOpacity
                  style={[shared.button, styles.inviteBtn]}
                  onPress={handleInvite}
                  disabled={inviting}
                >
                  {inviting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={shared.buttonText}>Invitar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {pending.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Esperando aprobación</Text>
                {pending.map((m) => (
                  <View key={m.id} style={shared.card}>
                    <Text style={shared.title}>{m.full_name ?? m.email}</Text>
                    <Text style={shared.muted}>{m.email}</Text>
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[shared.button, { flex: 1, backgroundColor: colors.success }]}
                        onPress={() => approve(m)}
                      >
                        <Text style={shared.buttonText}>Aprobar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {invitedNotJoined.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Invitados (aún no ingresaron)</Text>
                <View style={shared.card}>
                  {invitedNotJoined.map((e) => (
                    <Text key={e} style={[shared.muted, { paddingVertical: 3 }]}>
                      • {e}
                    </Text>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Vendedores</Text>
          </View>
        }
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
            <TouchableOpacity
              style={styles.revokeLink}
              onPress={() => revoke({ user_id: item.user_id, email: item.email })}
            >
              <Text style={styles.revokeText}>Quitar acceso</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={shared.emptyText}>
            Todavía no hay vendedores activos.{'\n'}Invitá a alguien con su email arriba.
          </Text>
        }
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    inviteBtn: { paddingHorizontal: 18 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      marginTop: 18,
      marginBottom: 2,
      marginHorizontal: 16,
      textTransform: 'uppercase',
    },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    revokeLink: { marginTop: 12, alignItems: 'center' },
    revokeText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  });
