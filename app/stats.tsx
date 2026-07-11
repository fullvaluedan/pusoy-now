// Bot scoreboard: games played and finish-place tallies per difficulty.
// Games ended with the manual "Skip to end" button are not counted.
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography, withAlpha } from '../lib/theme';
import { emptyStats, loadStats, LEVEL_ORDER, LEVEL_TITLE, type BotStats } from '../lib/stats';

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

export default function Stats() {
  const router = useRouter();
  const [stats, setStats] = useState<BotStats>(emptyStats);

  // Reload every time the screen comes into focus, so a game finished since the
  // last visit shows up.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadStats().then((s) => {
        if (active) setStats(s);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const totalGames = LEVEL_ORDER.reduce((n, lvl) => n + stats[lvl].games, 0);

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Scoreboard</Text>
      <Text style={styles.subtitle}>
        {totalGames === 0
          ? 'Play a game against the bots to start your record.'
          : `${totalGames} game${totalGames === 1 ? '' : 's'} played vs bots.`}
      </Text>

      {LEVEL_ORDER.map((lvl) => {
        const s = stats[lvl];
        return (
          <Card key={lvl} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.level}>{LEVEL_TITLE[lvl]}</Text>
              <Text style={styles.games}>{s.games} played</Text>
            </View>
            <View style={styles.placeRow}>
              {PLACE_LABEL.map((label, i) => (
                <View key={label} style={styles.place}>
                  <Text style={[styles.placeValue, i === 0 && styles.placeWin]}>{s.ranks[i]}</Text>
                  <Text style={styles.placeLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </Card>
        );
      })}

      <Button title="Back" variant="ghost" style={styles.btn} onPress={() => router.replace('/')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt },
  subtitle: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  level: { ...typography.subheading, color: colors.felt },
  games: { ...typography.label, color: colors.textMuted },
  placeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  place: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: 2,
    borderRadius: radii.sm,
    backgroundColor: withAlpha(colors.felt, 0.06),
  },
  placeValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  placeWin: { color: colors.felt },
  placeLabel: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  btn: { marginTop: spacing.md },
});
