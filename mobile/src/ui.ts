import { Platform, StyleSheet } from 'react-native';

/**
 * Identidad ST Labs · Hunter Leads · Turbo — manual v0.1
 * Manual y assets: https://github.com/Sergio726/crm-hunter-leads-brand
 * Guía de consulta: docs/IDENTIDAD-VISUAL.md
 *
 * El verde eléctrico (#02FFC4) es SEÑAL: acción, foco y progreso. No se usa
 * como relleno ni para estados de cliente — el semáforo tiene su propia gama.
 */

/**
 * Voz técnica de la marca. El manual pide Consolas, que no existe en móvil:
 * el equivalente de sistema es Menlo en iOS y monospace en Android. Se usa en
 * títulos de sección, métricas y rótulos; nunca en párrafos.
 */
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  /** Texto/iconos sobre `primary`. Con el mint es ink oscuro, nunca blanco. */
  onPrimary: string;
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
  /** Scrim de modales y bottom sheets. */
  overlay: string;
}

export const lightColors: ThemeColors = {
  primary: '#02ffc4',
  // Verde profundo para texto e iconos sobre fondo claro: el mint puro
  // no alcanza contraste sobre papel (#08785F sale del manual).
  primaryDark: '#08785f',
  onPrimary: '#00130d',
  bg: '#f4f7f5',
  card: '#ffffff',
  surface2: '#eaf0ed',
  text: '#070908',
  textMuted: '#5e7067',
  border: '#dce7e1',
  // 'won' se corre a un verde hierba para no confundirse con el mint (SEM-1).
  success: '#2f7d52',
  warning: '#b45309',
  orange: '#c2410c',
  danger: '#b91c1c',
  whatsapp: '#16a34a',
  accent: '#08785f',
  accentSoft: '#d9fff3',
  overlay: 'rgba(0,0,0,0.6)',
};

export const darkColors: ThemeColors = {
  primary: '#02ffc4',
  primaryDark: '#b8ffef',
  onPrimary: '#00130d',
  bg: '#070908',
  card: '#0d1411',
  surface2: '#14221d',
  text: '#f4f7f5',
  textMuted: '#91a59d',
  // Trazo neutro: el mint al 18% teñía cada divisor (BRAND-3).
  border: 'rgba(255,255,255,0.10)',
  success: '#3fbf7f',
  warning: '#f59e0b',
  orange: '#fb923c',
  danger: '#ef4444',
  whatsapp: '#22c55e',
  accent: '#b8ffef',
  accentSoft: 'rgba(2,255,196,0.10)',
  overlay: 'rgba(0,0,0,0.72)',
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
    /** Rótulo técnico de marca: secciones, estados y cifras. */
    eyebrow: {
      fontFamily: mono,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    /** Cifras y datos duros. */
    metric: { fontFamily: mono, fontWeight: '700', color: colors.text },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    // Sobre el verde eléctrico el texto va en ink, nunca en blanco.
    buttonText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
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
