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
import { BigStat, Button, Card, CompactHeader, ScreenContainer } from '../../components/ui';
import { colors, spacing, typography, withAlpha } from '../../lib/theme';
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
        rows.map((row, i) => <RankCard key={row.userId} row={row} position={i + 1} />)
      )}
    </ScreenContainer>
  );
}

function RankCard({ row, position }: { row: RankRow; position: number }) {
  const winRatePct = Math.round(row.winRate * 100);
  return (
    <Card style={[styles.rowCard, row.isSelf && styles.rowCardSelf]}>
      <View style={styles.rowMain}>
        <Text style={[styles.position, row.isSelf && styles.positionSelf]}>#{position}</Text>
        <Avatar url={row.image} name={row.name ?? row.username ?? 'Player'} size={44} />
        <View style={styles.rowText}>
          {row.username ? <Text style={styles.username}>@{row.username}</Text> : null}
          <Text style={styles.name} numberOfLines={1}>
            {row.name ?? 'Player'}
          </Text>
          <Text style={styles.supporting}>
            {row.games} game{row.games === 1 ? '' : 's'} played, {winRatePct}% win rate
          </Text>
        </View>
        <BigStat value={row.firsts} label="1st place" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  signInCard: { alignItems: 'center', marginTop: spacing.lg },
  signInText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  signInBtn: { alignSelf: 'stretch' },
  loader: { marginTop: spacing.xl },
  emptyCard: { padding: spacing.lg, marginTop: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  rowCard: { marginBottom: spacing.md },
  rowCardSelf: {
    backgroundColor: withAlpha(colors.felt, 0.08),
    borderWidth: 1,
    borderColor: colors.gold,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  position: {
    ...typography.subheading,
    color: colors.textMuted,
    width: 36,
  },
  positionSelf: { color: colors.felt },
  rowText: { flex: 1, minWidth: 0 },
  username: { ...typography.bodyBold, color: colors.textPrimary },
  name: { ...typography.caption, color: colors.textMuted },
  supporting: { ...typography.tiny, color: colors.textFaint, marginTop: 2 },
});
