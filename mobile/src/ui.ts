import { StyleSheet } from 'react-native';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryText: string;
  bg: string;
  card: string;
  surface2: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  orange: string;
  danger: string;
  whatsapp: string;
  accent: string;
  accentSoft: string;
}

export const lightColors: ThemeColors = {
  primary: '#087c63',
  primaryDark: '#065e4c',
  primaryText: '#f4f7f5',
  bg: '#f4f7f5',
  card: '#ffffff',
  surface2: '#e6ede9',
  text: '#070908',
  textMuted: '#60736a',
  border: '#d8e1dd',
  success: '#15803d',
  warning: '#b45309',
  orange: '#c2410c',
  danger: '#b91c1c',
  whatsapp: '#16a34a',
  accent: '#087c63',
  accentSoft: '#d9fff3',
};

export const darkColors: ThemeColors = {
  primary: '#02ffc4',
  primaryDark: '#b8ffef',
  primaryText: '#00130d',
  bg: '#070908',
  card: '#0d1411',
  surface2: '#14221d',
  text: '#f2fff9',
  textMuted: '#91a59d',
  border: 'rgba(184,255,239,0.18)',
  success: '#22c55e',
  warning: '#f59e0b',
  orange: '#fb923c',
  danger: '#ef4444',
  whatsapp: '#22c55e',
  accent: '#b8ffef',
  accentSoft: 'rgba(2,255,196,0.12)',
};

export function makeShared(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      marginHorizontal: 12,
      marginVertical: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: { fontSize: 16, fontWeight: '600', color: colors.text },
    muted: { fontSize: 13, color: colors.textMuted },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    buttonText: { color: colors.primaryText, fontWeight: '800', fontSize: 15 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
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
