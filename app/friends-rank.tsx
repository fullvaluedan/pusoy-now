// Friends ranking: you plus your accepted friends, ranked by first-place
// finishes (win-rate tiebreak), sorted server-side. Your own row is
// highlighted so it is easy to find in a longer list.
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { BigStat, Button, Card, Header, ScreenContainer } from '../components/ui';
import { colors, spacing, typography, withAlpha } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { fetchRanking, type RankRow } from '../lib/friends';

export default function FriendsRank() {
  const router = useRouter();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator size="large" color={colors.felt} />
      </ScreenContainer>
    );
  }

  if (!session) {
    return (
      <ScreenContainer>
        <Header title="Ranking" onBack={() => router.back()} />
        <Card style={styles.signInCard}>
          <Text style={styles.signInText}>Sign in to see how you rank against friends.</Text>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} style={styles.signInBtn} />
        </Card>
      </ScreenContainer>
    );
  }

  return <RankingContent />;
}

function RankingContent() {
  const router = useRouter();
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
      <Header title="Ranking" onBack={() => router.back()} />

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
