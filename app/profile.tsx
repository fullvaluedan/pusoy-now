// Profile screen: shows signed-in user or guest mode. Displays stats and sign-in/out actions.
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography, withAlpha } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { emptyStats, loadStats, LEVEL_ORDER, LEVEL_TITLE, type BotStats } from '../lib/stats';

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

export default function Profile() {
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();
  const [stats, setStats] = useState<BotStats>(emptyStats());

  // Reload stats every time the screen comes into focus
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

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator size="large" color={colors.felt} />
      </ScreenContainer>
    );
  }

  if (session && profile) {
    // Signed in
    return (
      <ScreenContainer scroll>
        <View style={styles.avatarContainer}>
          <Avatar
            url={profile.avatarUrl ?? undefined}
            name={profile.displayName}
            size={72}
          />
        </View>

        <Text style={styles.displayName}>{profile.displayName}</Text>
        <Text style={styles.linkedLabel}>Linked account</Text>

        {/* Stats row */}
        <Text style={styles.statsTitle}>Your stats vs bots</Text>
        {renderStatsCards(stats)}

        <Button
          title="Sign out"
          variant="secondary"
          style={styles.button}
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />

        <Button
          title="Back"
          variant="ghost"
          style={styles.button}
          onPress={() => router.back()}
        />
      </ScreenContainer>
    );
  }

  // Guest mode
  return (
    <ScreenContainer scroll>
      <View style={styles.avatarContainer}>
        <Avatar name="Guest" size={72} />
      </View>

      <Text style={styles.displayName}>Guest</Text>
      <Text style={styles.guestExplain}>Your stats are saved locally on this device.</Text>

      {/* Stats row */}
      <Text style={styles.statsTitle}>Your stats vs bots</Text>
      {renderStatsCards(stats)}

      <Button
        title="Sign in to save to account"
        variant="primary"
        style={styles.button}
        onPress={() => router.push('/sign-in')}
      />

      <Button
        title="Back"
        variant="ghost"
        style={styles.button}
        onPress={() => router.back()}
      />
    </ScreenContainer>
  );
}

function renderStatsCards(stats: BotStats) {
  const totalGames = LEVEL_ORDER.reduce((n, lvl) => n + stats[lvl].games, 0);

  if (totalGames === 0) {
    return <Text style={styles.noStats}>Play a game against the bots to start tracking stats.</Text>;
  }

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  displayName: {
    ...typography.subheading,
    color: colors.felt,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  linkedLabel: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  guestExplain: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  statsTitle: {
    ...typography.label,
    color: colors.felt,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  noStats: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
  },
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
  button: { marginTop: spacing.md },
});
