import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { signInWithGoogle } from '../lib/auth';
import { useTheme } from '../theme/ThemeProvider';
import Logo from '../components/Logo';

export default function LoginScreen() {
  const { colors, shared } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      Alert.alert('Error al iniciar sesión', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[shared.screen, styles.container]}>
      <Logo />
      <Text style={[shared.muted, styles.subtitle]}>Seguimiento de clientes para tu equipo</Text>
      <TouchableOpacity
        style={[shared.button, styles.google, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={[shared.buttonText, { color: colors.text }]}>Continuar con Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  subtitle: { fontSize: 15, marginTop: 12, marginBottom: 40 },
  google: { alignSelf: 'stretch', borderWidth: 1 },
});
