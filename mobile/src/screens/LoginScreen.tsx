import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithGoogle } from '../lib/auth';
import { useTheme } from '../theme/ThemeProvider';
import Logo from '../components/Logo';
import TurboPresence from '../components/TurboPresence';
import ScreenEnter from '../components/ScreenEnter';

export default function LoginScreen() {
  const { colors, shared } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    <ScreenEnter style={[shared.screen, styles.container]}>
      <View style={styles.grid} pointerEvents="none">
        {Array.from({ length: 7 }).map((_, index) => <View key={index} style={styles.gridLine} />)}
      </View>
      <View style={styles.top}><Logo size="sm" /><Text style={styles.system}>/ SALES OS</Text></View>
      <View style={styles.hero}>
        <TurboPresence state={loading ? 'thinking' : 'talking'} size="lg" />
        <Text style={styles.eyebrow}>TU COPILOTO DE VENTAS</Text>
        <Text style={styles.title}>Vendé con el{`\n`}pulso claro.</Text>
        <Text style={styles.subtitle}>Turbo ordena tus próximos pasos para que cada conversación avance.</Text>
      </View>
      <View style={styles.authCard}>
        <View style={styles.authHeader}>
          <Ionicons name="sparkles-outline" size={17} color={colors.primaryDark} />
          <Text style={styles.authLabel}>EMPEZAR / SEGURO Y RÁPIDO</Text>
        </View>
        <TouchableOpacity style={[shared.button, styles.google]} onPress={handleLogin} disabled={loading} activeOpacity={0.84}>
          {loading ? <ActivityIndicator color={colors.onPrimary} /> : <><Ionicons name="logo-google" size={18} color={colors.onPrimary} /><Text style={shared.buttonText}>Continuar con Google</Text></>}
        </TouchableOpacity>
        <Text style={styles.legal}>Al continuar, entrás al espacio de trabajo de tu equipo.</Text>
      </View>
    </ScreenEnter>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  container: { padding: 24, justifyContent: 'space-between', overflow: 'hidden' },
  grid: { ...StyleSheet.absoluteFillObject, opacity: 0.2, transform: [{ rotate: '-15deg' }], justifyContent: 'space-around' },
  gridLine: { height: 1, width: '160%', marginLeft: '-30%', backgroundColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 28 },
  system: { color: colors.textMuted, fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.9 },
  hero: { alignItems: 'flex-start', marginTop: 'auto', marginBottom: 'auto' },
  eyebrow: { color: colors.primaryDark, fontFamily: 'monospace', fontWeight: '800', fontSize: 11, letterSpacing: 1.1, marginTop: 30 },
  title: { color: colors.text, fontFamily: 'monospace', fontSize: 37, lineHeight: 39, letterSpacing: -2.4, fontWeight: '800', marginTop: 12 },
  subtitle: { color: colors.textMuted, fontSize: 16, lineHeight: 23, maxWidth: 330, marginTop: 16 },
  authCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 16, marginBottom: 16 },
  authHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  authLabel: { color: colors.textMuted, fontFamily: 'monospace', fontWeight: '700', fontSize: 10, letterSpacing: 0.75 },
  google: { flexDirection: 'row', alignSelf: 'stretch', gap: 10, justifyContent: 'center' },
  legal: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 },
});
