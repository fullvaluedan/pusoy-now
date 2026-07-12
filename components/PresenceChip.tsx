// Small "N online" chip: a green dot + the live players-online count. Hidden
// entirely while count is null (no beat has landed yet), so it never flashes
// a "0 online" on cold start. Exported standalone (rather than inlined in
// app/index.tsx) so the U6 home redesign can re-place it without rebuilding
// it.
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../lib/theme';

export function PresenceChip({ count }: { count: number | null }) {
  if (count == null) return null;

  return (
    <View style={styles.chip}>
      <View style={styles.dot} />
      <Text style={styles.text}>{count} online</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  text: {
    fontSize: typography.caption.fontSize,
    color: colors.textMuted,
    fontWeight: typography.bodyBold.fontWeight,
  },
});
