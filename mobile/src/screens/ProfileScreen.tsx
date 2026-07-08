import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../lib/auth';
import { getWhatsAppMode } from '../lib/messaging';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { useTheme } from '../theme/ThemeProvider';

export default function ProfileScreen({ profile }: { profile: Profile }) {
  const { colors, shared, name: themeName, toggle } = useTheme();
  const [apiMode, setApiMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getWhatsAppMode().then((m) => setApiMode(m === 'api'));
    }, []),
  );

  const toggleMode = async (value: boolean) => {
    setApiMode(value);
    const { error } = await supabase
      .from('app_settings')
      .update({ value: value ? 'api' : 'deeplink' })
      .eq('key', 'whatsapp_mode');
    if (error) {
      setApiMode(!value);
      Alert.alert('No se pudo cambiar el modo', error.message);
    }
  };

  const initial = (profile.full_name ?? profile.email).trim()[0]?.toUpperCase() ?? 'U';

  return (
    <ScrollView style={shared.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[shared.card, { marginTop: 12, alignItems: 'center', paddingVertical: 20 }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={[shared.title, { marginTop: 10, fontSize: 18 }]}>
          {profile.full_name ?? profile.email}
        </Text>
        <Text style={shared.muted}>{profile.email}</Text>
        <Text style={[styles.roleBadge, { color: colors.primary, backgroundColor: colors.accentSoft }]}>
          {profile.role === 'superadmin' ? 'Superadmin' : 'Vendedor'}
        </Text>
      </View>

      <View style={shared.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Ionicons name="moon" size={20} color={colors.textMuted} />
            <Text style={shared.title}>Modo oscuro</Text>
          </View>
          <Switch value={themeName === 'dark'} onValueChange={toggle} />
        </View>
      </View>

      {profile.role === 'superadmin' && (
        <View style={shared.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={styles.settingLabel}>
                <Ionicons name="logo-whatsapp" size={20} color={colors.whatsapp} />
                <Text style={shared.title}>WhatsApp por API</Text>
              </View>
              <Text style={[shared.muted, { marginTop: 6 }]}>
                Apagado: se abre la app de WhatsApp del teléfono. Encendido: envío directo por
                WhatsApp Business API (requiere configurar credenciales en el servidor).
              </Text>
            </View>
            <Switch value={apiMode} onValueChange={toggleMode} />
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[shared.button, styles.signOut, { backgroundColor: colors.danger }]}
        onPress={() => signOut()}
      >
        <Ionicons name="log-out-outline" size={18} color="#fff" />
        <Text style={shared.buttonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: { height: 64, width: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  roleBadge: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center' },
  settingLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signOut: { margin: 16, flexDirection: 'row', gap: 8 },
});
