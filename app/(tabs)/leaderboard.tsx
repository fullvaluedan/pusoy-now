// Leaderboard tab (U3): the wired friends ranking experience, relocated from
// app/friends-rank.tsx into the bottom tab bar so there is exactly one
// leaderboard screen (Round 7 left a dual-screen ambiguity between this and
// the app/leaderboard.tsx stub -- that stub is now deleted and
// app/friends-rank.tsx redirects here for old links).
//
// You plus your accepted friends, ranked by first-place finishes (win-rate
// tiebreak), sorted server-side. Your own row is highlighted so it is easy
// to find in a longer list. Anonymous guests can view this too -- a lazy
// session is created on mount instead of a sign-in wall; they may appear on
// the ranking under their random name.
//
// It is a tab, not a pushed screen, so the header carries no back chevron
// (back={false}) -- there is nowhere to "back" to from a tab root.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Button, Card, CompactHeader, ListRow, ScreenContainer } from '../../components/ui';
import { colors, radii, spacing, typography, withAlpha } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchRanking, type RankRow } from '../../lib/friends';

export default function Leaderboard() {
  const { session, loading, ensureSession } = useAuth();
  const [failed, setFailed] = useState(false);

  const tryEnsureSession = useCallback(async () => {
    setFailed(false);
    const result = await ensureSession();
    if (result === 'failed') setFailed(true);
  }, [ensureSession]);

  useEffect(() => {
    if (!loading && !session) void tryEnsureSession();
  }, [loading, session, tryEnsureSession]);

  if (failed) {
    return (
      <ScreenContainer>
        <CompactHeader title="Leaderboard" back={false} />
        <Card style={styles.signInCard}>
          <Text style={styles.signInText}>Could not start a session. Check your connection and try again.</Text>
          <Button title="Try again" onPress={() => void tryEnsureSession()} style={styles.signInBtn} />
        </Card>
      </ScreenContainer>
    );
  }

  if (loading || !session) {
    return (
      <ScreenContainer>
        <ActivityIndicator size="large" color={colors.felt} />
      </ScreenContainer>
    );
  }

  return <RankingContent />;
}

function RankingContent() {
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchRanking().then((next) => {
        if (!active) return;
        setRows(next);
        setLoadingRows(false);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Leaderboard" back={false} />

      {loadingRows ? (
        <ActivityIndicator size="large" color={colors.felt} style={styles.loader} />
      ) : !rows || rows.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Add friends to see a ranking. It updates as everyone plays more games.
          </Text>
        </Card>
      ) : (
        <>
          <Podium rows={rows.slice(0, 3)} />
          {rows.slice(3).map((row, i) => (
            <RankRowItem key={row.userId} row={row} position={i + 4} />
          ))}
        </>
      )}
    </ScreenContainer>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

// Top-3 podium: 2nd on the left, 1st raised in the center with a larger
// gold-ringed avatar and a gold-tinted backdrop, 3rd on the right. Fewer than
// three entries render only the spots that exist (no empty placeholders): the
// row stays centered so one or two winners still read as a deliberate podium.
function Podium({ rows }: { rows: RankRow[] }) {
  const first = rows[0];
  const second = rows[1];
  const third = rows[2];
  return (
    <View style={styles.podium}>
      {second ? <PodiumSpot row={second} place={2} /> : null}
      {first ? <PodiumSpot row={first} place={1} /> : null}
      {third ? <PodiumSpot row={third} place={3} /> : null}
    </View>
  );
}

function PodiumSpot({ row, place }: { row: RankRow; place: 1 | 2 | 3 }) {
  const first = place === 1;
  const name = row.name ?? row.username ?? 'Player';
  return (
    <View
      style={[
        styles.podiumSpot,
        first ? styles.podiumFirst : styles.podiumSide,
        { backgroundColor: first ? withAlpha(colors.gold, 0.18) : colors.overlay },
        row.isSelf && styles.podiumSelf,
      ]}
    >
      <Text style={first ? styles.podiumMedalBig : styles.podiumMedal}>{MEDALS[place - 1]}</Text>
      <View style={first ? styles.goldRing : styles.plainRing}>
        <Avatar url={row.image} name={name} size={first ? 64 : 48} />
      </View>
      <Text style={styles.podiumName} numberOfLines={1} ellipsizeMode="tail">
        {name}
      </Text>
      <Text style={styles.podiumScore}>
        {row.firsts} <Text style={styles.podiumScoreUnit}>1st</Text>
      </Text>
    </View>
  );
}

function RankRowItem({ row, position }: { row: RankRow; position: number }) {
  const name = row.name ?? row.username ?? 'Player';
  return (
    <ListRow
      style={row.isSelf ? styles.rowSelf : undefined}
      leading={
        <View style={styles.leadingWrap}>
          <Text style={[styles.position, row.isSelf && styles.positionSelf]}>{position}</Text>
          <Avatar url={row.image} name={name} size={44} />
        </View>
      }
      trailing={
        <View style={styles.scoreTrailing}>
          <Text style={styles.scoreValue}>{row.firsts}</Text>
          <Text style={styles.scoreLabel}>1st place</Text>
        </View>
      }
    >
      <View style={styles.rowText}>
        {row.username ? <Text style={styles.username} ellipsizeMode="tail" numberOfLines={1}>@{row.username}</Text> : null}
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  signInCard: { alignItems: 'center', marginTop: spacing.lg },
  signInText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  signInBtn: { alignSelf: 'stretch' },
  loader: { marginTop: spacing.xl },
  emptyCard: { padding: spacing.lg, marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  rowSelf: {
    backgroundColor: withAlpha(colors.felt, 0.08),
    borderColor: colors.gold,
  },
  leadingWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  position: {
    ...typography.subheading,
    color: colors.textMuted,
    width: 30,
    textAlign: 'center',
  },
  positionSelf: { color: colors.felt },
  rowText: { flex: 1, minWidth: 0 },
  username: { ...typography.bodyBold, color: colors.textPrimary },
  name: { ...typography.caption, color: colors.textMuted },
  scoreTrailing: { alignItems: 'center', minWidth: 56 },
  scoreValue: { ...typography.bodyBold, color: colors.felt },
  scoreLabel: { ...typography.tiny, color: colors.textMuted, marginTop: 1 },

  // --- Podium (top 3) ---
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  podiumSpot: {
    flex: 1,
    maxWidth: 130,
    alignItems: 'center',
    borderRadius: radii.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  // The center (1st) spot sits flush to the top; the side spots are pushed
  // down so 1st reads as raised above them.
  podiumFirst: {},
  podiumSide: { marginTop: spacing.xxl + spacing.sm },
  podiumSelf: { borderWidth: 2, borderColor: colors.gold },
  podiumMedal: { fontSize: 22 },
  podiumMedalBig: { fontSize: 30 },
  goldRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: colors.gold,
  },
  plainRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: withAlpha(colors.felt, 0.15),
  },
  podiumName: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.textPrimary,
    maxWidth: '100%',
  },
  podiumScore: { ...typography.subheading, color: colors.felt },
  podiumScoreUnit: { ...typography.tiny, color: colors.textMuted, fontWeight: '700' },
});
