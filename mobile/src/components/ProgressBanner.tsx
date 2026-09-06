import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { MyProgress } from '../lib/types';
import { useTheme } from '../theme/ThemeProvider';
import TurboPresence from './TurboPresence';

function message(p: MyProgress): string {
  const remaining = p.goal - p.today;
  if (p.today >= p.goal) return '🎉 ¡Meta del día cumplida! Seguí sumando.';
  if (p.today === 0) return '¡Arrancá el día! Cada contacto suma.';
  if (remaining <= 2) return `¡Casi! Te faltan ${remaining} para la meta.`;
  return `Vas bien, te faltan ${remaining} para la meta de hoy.`;
}

export default function ProgressBanner({ progress }: { progress: MyProgress | null }) {
  const { colors } = useTheme();
  if (!progress) return null;
  const pct = Math.max(0, Math.min(1, progress.goal > 0 ? progress.today / progress.goal : 0));
  const reached = progress.today >= progress.goal;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <View style={styles.signal}>
          <TurboPresence size="sm" state={reached ? 'ready' : 'talking'} />
          <Text style={[styles.streak, { color: colors.text }]}>
          {progress.streak > 0
            ? `Racha ${progress.streak} ${progress.streak === 1 ? 'día' : 'días'}`
            : 'Activá tu racha'}
          </Text>
        </View>
        <Text style={[styles.week, { color: colors.textMuted }]}>SEMANA / {progress.this_week}</Text>
      </View>

      <Text style={[styles.count, { color: colors.textMuted }]}>HOY / <Text style={[styles.countBig, { color: colors.text }]}>{progress.today}</Text>
        <Text style={[styles.countGoal, { color: colors.textMuted }]}>/{progress.goal}</Text> contactos
      </Text>

      <View style={styles.barBg}>
        <View
          style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: colors.primary }]}
        />
      </View>

      <Text style={[styles.msg, { color: colors.text }]}>{message(progress)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, marginHorizontal: 12, marginTop: 10, marginBottom: 4, borderWidth: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streak: { fontWeight: '800', fontSize: 13, fontFamily: 'monospace' },
  week: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  count: { fontSize: 11, fontFamily: 'monospace', letterSpacing: 0.3, marginTop: 14 },
  countBig: { fontSize: 29, fontWeight: '900', letterSpacing: -1.4 },
  countGoal: { fontSize: 18, fontWeight: '700' },
  barBg: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(145,165,157,0.2)',
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 6 },
  msg: { fontSize: 13, marginTop: 10, fontWeight: '600' },
});
