import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import TurboPresence from './TurboPresence';

export default function AppLoadingScreen({ loadingProfile = false }: { loadingProfile?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.screen}>
      <View style={styles.grid}><View style={styles.gridLine} /><View style={styles.gridLine} /></View>
      <TurboPresence state="thinking" size="lg" label={loadingProfile ? '/ sincronizando tu espacio' : '/ iniciando CRM Lite'} />
      <Text style={styles.title}>{loadingProfile ? 'Un segundo, estoy ordenando tus señales.' : 'Preparando el ritmo del día.'}</Text>
      <Text style={styles.copy}>Turbo revisa lo esencial para que puedas volver a vender.</Text>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  grid: { ...StyleSheet.absoluteFillObject, opacity: 0.22, alignItems: 'center', justifyContent: 'space-around' },
  gridLine: { width: '130%', height: 1, backgroundColor: colors.border, transform: [{ rotate: '-18deg' }] },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', fontFamily: 'monospace', letterSpacing: -0.8, textAlign: 'center', marginTop: 30 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 290, marginTop: 10 },
});
