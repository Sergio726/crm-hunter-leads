import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { MyProgress } from '../lib/types';
import { useTheme } from '../theme/ThemeProvider';

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
    <View style={[styles.card, { backgroundColor: colors.primary }]}>
      <View style={styles.topRow}>
        <Text style={styles.streak}>
          {progress.streak > 0
            ? `🔥 Racha: ${progress.streak} ${progress.streak === 1 ? 'día' : 'días'}`
            : '🔥 Sin racha aún'}
        </Text>
        <Text style={styles.week}>Semana: {progress.this_week}</Text>
      </View>

      <Text style={styles.count}>
        Hoy <Text style={styles.countBig}>{progress.today}</Text>
        <Text style={styles.countGoal}>/{progress.goal}</Text> contactos
      </Text>

      <View style={styles.barBg}>
        <View
          style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: reached ? '#4ade80' : '#fff' }]}
        />
      </View>

      <Text style={styles.msg}>{message(progress)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streak: { color: '#fff', fontWeight: '700', fontSize: 14 },
  week: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  count: { color: '#fff', fontSize: 15, marginTop: 10 },
  countBig: { fontSize: 26, fontWeight: '800' },
  countGoal: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  barBg: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 6 },
  msg: { color: '#fff', fontSize: 13, marginTop: 8, fontWeight: '500' },
});
