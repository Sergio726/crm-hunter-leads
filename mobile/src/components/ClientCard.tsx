import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import type { Client } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
// nota: el origen se muestra como pill "GHL" cuando aplica
import { colors, shared } from '../ui';

const STATUS_COLORS: Record<Client['status'], string> = {
  pending: colors.warning,
  contacted: colors.primary,
  won: colors.success,
  lost: colors.danger,
};

export default function ClientCard({
  client,
  onPress,
}: {
  client: Client;
  onPress: () => void;
}) {
  const followUpDue =
    client.next_follow_up && client.next_follow_up <= new Date().toISOString().slice(0, 10);

  return (
    <TouchableOpacity style={shared.card} onPress={onPress}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={shared.title}>{client.full_name}</Text>
          {client.company ? <Text style={shared.muted}>{client.company}</Text> : null}
          {client.phone ? <Text style={shared.muted}>{client.phone}</Text> : null}
          {client.origin === 'ghl' || (client.tags?.length ?? 0) > 0 ? (
            <View style={styles.chipsRow}>
              {client.origin === 'ghl' ? <Text style={styles.originChip}>GHL</Text> : null}
              {(client.tags ?? []).slice(0, 3).map((t) => (
                <Text key={t} style={styles.tagChip}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.badge, { color: STATUS_COLORS[client.status] }]}>
            {STATUS_LABELS[client.status]}
          </Text>
          {followUpDue ? <Text style={styles.due}>Seguimiento vencido</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { fontSize: 12, fontWeight: '700' },
  due: { fontSize: 11, color: colors.danger, marginTop: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  originChip: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6d28d9',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tagChip: {
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
