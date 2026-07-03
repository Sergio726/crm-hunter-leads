import React, { useCallback, useState } from 'react';
import { Alert, Text, TouchableOpacity, View, StyleSheet, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { signOut } from '../lib/auth';
import { getWhatsAppMode } from '../lib/messaging';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { colors, shared } from '../ui';

export default function ProfileScreen({ profile }: { profile: Profile }) {
  const [apiMode, setApiMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getWhatsAppMode().then((m) => setApiMode(m === 'api'));
    }, [])
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

  return (
    <View style={shared.screen}>
      <View style={[shared.card, { marginTop: 12 }]}>
        <Text style={shared.title}>{profile.full_name ?? profile.email}</Text>
        <Text style={shared.muted}>{profile.email}</Text>
        <Text style={[styles.roleBadge]}>
          {profile.role === 'superadmin' ? 'Superadmin' : 'Vendedor'}
        </Text>
      </View>

      {profile.role === 'superadmin' && (
        <View style={shared.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={shared.title}>WhatsApp por API</Text>
              <Text style={shared.muted}>
                Apagado: se abre la app de WhatsApp del teléfono. Encendido: envío directo por
                WhatsApp Business API (requiere configurar credenciales en el servidor).
              </Text>
            </View>
            <Switch value={apiMode} onValueChange={toggleMode} />
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[shared.button, { margin: 16, backgroundColor: colors.danger }]}
        onPress={() => signOut()}
      >
        <Text style={shared.buttonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  roleBadge: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  settingRow: { flexDirection: 'row', alignItems: 'center' },
});
