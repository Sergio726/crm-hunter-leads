import { StyleSheet } from 'react-native';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  bg: string;
  card: string;
  surface2: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  whatsapp: string;
  accent: string;
  accentSoft: string;
}

export const lightColors: ThemeColors = {
  primary: '#1d4ed8',
  primaryDark: '#1e40af',
  bg: '#f4f5f7',
  card: '#ffffff',
  surface2: '#eef1f5',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  whatsapp: '#16a34a',
  accent: '#7c3aed',
  accentSoft: '#ede9fe',
};

export const darkColors: ThemeColors = {
  primary: '#3b82f6',
  primaryDark: '#60a5fa',
  bg: '#0a0f1c',
  card: '#131b2c',
  surface2: '#1b2436',
  text: '#e8edf5',
  textMuted: '#93a1b5',
  border: '#273143',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  whatsapp: '#22c55e',
  accent: '#a78bfa',
  accentSoft: 'rgba(167,139,250,0.16)',
};

export function makeShared(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginHorizontal: 12,
      marginVertical: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: { fontSize: 16, fontWeight: '600', color: colors.text },
    muted: { fontSize: 13, color: colors.textMuted },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.text,
    },
    label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: 12 },
    emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 48, fontSize: 15 },
  });
}

// Compatibilidad hacia atrás (tema claro por defecto).
// Para soportar modo oscuro usá `useTheme()` (src/theme).
export const colors = lightColors;
export const shared = makeShared(lightColors);
