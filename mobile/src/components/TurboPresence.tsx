import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

export type TurboState = 'idle' | 'talking' | 'thinking' | 'ready';

type Props = {
  state?: TurboState;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  style?: ViewStyle;
};

const COPY: Record<TurboState, string> = {
  idle: 'Turbo está cerca.',
  talking: 'Turbo tiene una señal para vos.',
  thinking: 'Turbo está preparando tu espacio.',
  ready: 'Turbo está listo.',
};

/**
 * Presencia visual de Turbo hecha con componentes nativos: no depende de un
 * archivo de marca externo y puede comunicar sus estados en toda la app.
 */
export default function TurboPresence({ state = 'idle', size = 'md', label, style }: Props) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.92)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const voice = useRef(new Animated.Value(0.35)).current;
  const dimensions = size === 'lg' ? 132 : size === 'md' ? 70 : 40;
  const styles = useMemo(() => makeStyles(colors, dimensions), [colors, dimensions]);

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: state === 'thinking' ? 850 : 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.92, duration: state === 'thinking' ? 850 : 1400, useNativeDriver: true }),
      ]),
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [pulse, state]);

  useEffect(() => {
    if (state !== 'thinking') {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const spinAnimation = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1250, easing: Easing.linear, useNativeDriver: true }),
    );
    spinAnimation.start();
    return () => spinAnimation.stop();
  }, [spin, state]);

  useEffect(() => {
    if (state !== 'talking') {
      voice.stopAnimation();
      voice.setValue(0.35);
      return;
    }
    const voiceAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(voice, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(voice, { toValue: 0.38, duration: 300, useNativeDriver: true }),
      ]),
    );
    voiceAnimation.start();
    return () => voiceAnimation.stop();
  }, [state, voice]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const icon = state === 'ready' ? 'checkmark' : 'flash';

  return (
    <View style={[styles.wrap, style]} accessibilityLabel={label ?? COPY[state]}>
      <View style={styles.orbArea}>
        <Animated.View style={[styles.pulse, { transform: [{ scale: pulse }] }]} />
        <Animated.View style={[styles.orbit, state === 'thinking' && { transform: [{ rotate: rotation }] }]} />
        <View style={styles.core}>
          <Ionicons name={icon} size={dimensions * 0.38} color={colors.onPrimary} />
        </View>
        {state === 'talking' && (
          <View style={styles.voiceBars}>
            {[0.7, 1, 0.55].map((base, index) => (
              <Animated.View
                key={index}
                style={[styles.voiceBar, { opacity: voice, transform: [{ scaleY: voice.interpolate({ inputRange: [0, 1], outputRange: [base, 1.55 - base / 2] }) }] }]}
              />
            ))}
          </View>
        )}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors'], size: number) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center' },
    orbArea: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    pulse: {
      position: 'absolute', width: size * 0.92, height: size * 0.92, borderRadius: size,
      backgroundColor: colors.primary, opacity: 0.12,
    },
    orbit: {
      position: 'absolute', width: size * 0.82, height: size * 0.82, borderRadius: size,
      borderWidth: 1, borderColor: colors.primary, borderTopColor: 'transparent', opacity: 0.72,
    },
    core: {
      width: size * 0.52, height: size * 0.52, borderRadius: size,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.primary, shadowOpacity: 0.42, shadowRadius: 13, shadowOffset: { width: 0, height: 0 }, elevation: 5,
    },
    voiceBars: { position: 'absolute', bottom: -size * 0.025, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    voiceBar: { width: Math.max(2, size * 0.045), height: size * 0.13, borderRadius: 4, backgroundColor: colors.primary },
    label: { marginTop: 10, color: colors.textMuted, fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.2, textAlign: 'center' },
  });
