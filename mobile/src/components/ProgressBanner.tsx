import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { MyProgress } from '../lib/types';
import TurboPresence from './TurboPresence';
import { mono } from '../ui';

function message(p: MyProgress): string {
  const remaining = p.goal - p.today;
  if (p.today >= p.goal) return '🎉 ¡Meta del día cumplida! Seguí sumando.';
  if (p.today === 0) return '¡Arrancá el día! Cada contacto suma.';
  if (remaining <= 2) return `¡Casi! Te faltan ${remaining} para la meta.`;
  return `Vas bien, te faltan ${remaining} para la meta de hoy.`;
}

/**
 * Banner de progreso diario.
 *
 * Superficie de marca: fondo ink en los dos temas, con el mint reservado a lo
 * que es progreso real (la barra y la cifra del día).
 *
 * El fondo **no** sale del tema. Sobre la tarjeta clara el mint queda en
 * 1.30:1 —y contra el canal de la barra, en 1.06:1—, así que en modo claro la
 * barra de progreso desaparecía. Sobre ink el mismo mint mide 15.31:1. Es el
 * único lugar de la app donde el color se fija a mano, y es a propósito.
 */
export default function ProgressBanner({ progress }: { progress: MyProgress | null }) {
  if (!progress) return null;
  const pct = Math.max(0, Math.min(1, progress.goal > 0 ? progress.today / progress.goal : 0));
  const reached = progress.today >= progress.goal;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.signal}>
          <TurboPresence size="sm" state={reached ? 'ready' : 'talking'} sobre="ink" />
          <Text style={styles.streak}>
            {progress.streak > 0
              ? `Racha ${progress.streak} ${progress.streak === 1 ? 'día' : 'días'}`
              : 'Activá tu racha'}
          </Text>
        </View>
        <Text style={styles.week}>SEMANA / {progress.this_week}</Text>
      </View>

      <Text style={styles.count}>
        HOY / <Text style={styles.countBig}>{progress.today}</Text>
        <Text style={styles.countGoal}>/{progress.goal}</Text> contactos
      </Text>

      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
      </View>

      <Text style={[styles.msg, reached && styles.msgDone]}>{message(progress)}</Text>
    </View>
  );
}

// Colores fijos de marca: ver el comentario del componente.
const INK = '#070908';
const MINT = '#02ffc4';
const PAPER = '#f4f7f5';

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: INK,
    borderWidth: 1,
    borderColor: 'rgba(2,255,196,0.20)',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streak: { color: PAPER, fontWeight: '800', fontSize: 13, fontFamily: mono },
  week: { color: 'rgba(244,247,245,0.6)', fontSize: 10, fontWeight: '700', fontFamily: mono },
  count: { color: 'rgba(244,247,245,0.8)', fontSize: 11, fontFamily: mono, letterSpacing: 0.3, marginTop: 14 },
  countBig: { color: MINT, fontSize: 29, fontWeight: '900', letterSpacing: -1.4 },
  countGoal: { color: 'rgba(244,247,245,0.5)', fontSize: 18, fontWeight: '700' },
  barBg: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(2,255,196,0.15)',
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: MINT },
  msg: { color: 'rgba(244,247,245,0.7)', fontSize: 13, marginTop: 10, fontWeight: '600' },
  msgDone: { color: MINT },
});
