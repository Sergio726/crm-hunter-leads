import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#1d4ed8',
  primaryDark: '#1e40af',
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  whatsapp: '#16a34a',
};

export const shared = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
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
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4, marginTop: 12 },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 48, fontSize: 15 },
});
