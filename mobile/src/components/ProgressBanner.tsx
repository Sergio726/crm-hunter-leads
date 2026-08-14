import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { MyProgress } from '../lib/types';
import { useTheme } from '../theme/ThemeProvider';
import { mono, type ThemeColors } from '../ui';

function message(p: MyProgress): string {
  const remaining = p.goal - p.today;
  if (p.today >= p.goal) return '¡Meta del día cumplida! Seguí sumando.';
  if (p.today === 0) return '¡Arrancá el día! Cada contacto suma.';
  if (remaining <= 2) return `¡Casi! Te faltan ${remaining} para la meta.`;
  return `Vas bien, te faltan ${remaining} para la meta de hoy.`;
}

/**
 * Banner de progreso diario.
 *
 * Superficie de marca: fondo ink en ambos temas, con el verde reservado a lo
 * que es progreso real (la barra y la cifra del día). Antes el banner entero
 * era del color primario con la barra en blanco — con el verde eléctrico eso
 * quedaba ilegible y contradecía la regla "señal antes que ruido".
 */
export default function ProgressBanner({ progress }: { progress: MyProgress | null }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  if (!progress) return null;
  const pct = Math.max(0, Math.min(1, progress.goal > 0 ? progress.today / progress.goal : 0));
  const reached = progress.today >= progress.goal;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.streak}>
          {progress.streak > 0
            ? `/ RACHA · ${progress.streak} ${progress.streak === 1 ? 'DÍA' : 'DÍAS'}`
            : '/ SIN RACHA AÚN'}
        </Text>
        <Text style={styles.week}>SEMANA · {progress.this_week}</Text>
      </View>

      <Text style={styles.count}>
        Hoy <Text style={styles.countBig}>{progress.today}</Text>
        <Text style={styles.countGoal}>/{progress.goal}</Text> contactos
      </Text>

      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
      </View>

      <Text style={[styles.msg, reached && styles.msgDone]}>{message(progress)}</Text>
    </View>
  );
}

// El banner es superficie de marca: usa ink y mint fijos, no los del tema,
// para verse igual en claro y oscuro.
const INK = '#070908';
const MINT = '#02ffc4';
const PAPER = '#f4f7f5';

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: 14,
      padding: 16,
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 4,
      backgroundColor: INK,
      borderWidth: 1,
      borderColor: 'rgba(2,255,196,0.20)',
    },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    streak: { fontFamily: mono, color: MINT, fontWeight: '700', fontSize: 11, letterSpacing: 1.1 },
    week: { fontFamily: mono, color: 'rgba(244,247,245,0.6)', fontSize: 11, letterSpacing: 1.1, fontWeight: '700' },
    count: { color: 'rgba(244,247,245,0.8)', fontSize: 15, marginTop: 12 },
    countBig: { fontFamily: mono, fontSize: 26, fontWeight: '800', color: MINT },
    countGoal: { fontFamily: mono, fontSize: 18, fontWeight: '700', color: 'rgba(244,247,245,0.5)' },
    barBg: {
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(2,255,196,0.15)',
      marginTop: 10,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 4, backgroundColor: MINT },
    msg: { color: 'rgba(244,247,245,0.7)', fontSize: 13, marginTop: 10, fontWeight: '500' },
    msgDone: { color: MINT },
  });
