import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { signInWithGoogle } from '../lib/auth';
import { colors, shared } from '../ui';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Error al iniciar sesión', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>CRM Lite</Text>
      <Text style={styles.subtitle}>Seguimiento de clientes para tu equipo</Text>
      <TouchableOpacity style={[shared.button, styles.google]} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={shared.buttonText}>Continuar con Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: { fontSize: 34, fontWeight: '800', color: colors.primaryDark },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 8, marginBottom: 40 },
  google: { alignSelf: 'stretch' },
});
