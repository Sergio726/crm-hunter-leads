import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { signOut } from '../lib/auth';
import type { Profile } from '../lib/types';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../ui';

export default function PendingApprovalScreen({ profile }: { profile: Profile }) {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[shared.screen, styles.center]}>
      <Text style={styles.emoji}>⏳</Text>
      <Text style={styles.heading}>Esperando autorización</Text>
      <Text style={styles.body}>
        Tu cuenta ({profile.email}) todavía no está habilitada.{'\n\n'}
        Pedile al administrador que te dé acceso. Cuando lo haga, vas a poder entrar cerrando y
        volviendo a abrir la app.
      </Text>
      <TouchableOpacity
        style={[shared.button, { marginTop: 28, backgroundColor: colors.danger }]}
        onPress={() => signOut()}
      >
        <Text style={shared.buttonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center', padding: 28 },
    emoji: { fontSize: 56, marginBottom: 12 },
    heading: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 12 },
    body: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  });
