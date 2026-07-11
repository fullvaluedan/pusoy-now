// Profile screen: shows signed-in user or guest mode. Displays stats and sign-in/out actions.
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { BigStat, Button, Card, Field, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { emptyStats, loadStats, LEVEL_ORDER, LEVEL_TITLE, type BotStats } from '../lib/stats';
import { usernameErrorMessage, validateUsernameClient } from '../lib/profile';
import { checkUsernameAvailable, claimUsername, fetchMyUsername } from '../lib/profileClient';

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
        <Card style={styles.identityCard}>
          <Avatar
            url={profile.avatarUrl ?? undefined}
            name={profile.displayName}
            size={72}
          />
          <Text style={styles.displayName}>{profile.displayName}</Text>
          <Text style={styles.linkedLabel}>Linked account</Text>
        </Card>

        <UsernameSection />

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
      <Card style={styles.identityCard}>
        <Avatar name="Guest" size={72} />
        <Text style={styles.displayName}>Guest</Text>
        <Text style={styles.guestExplain}>Your stats are saved locally on this device.</Text>
      </Card>

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

// Username claim: shown on Profile for signed-in users. Once claimed it just
// displays the handle (rename is deferred); before that it is a claim field
// with inline validation and live availability, matching the v2 Field pattern.
type ClaimStatus = 'idle' | 'checking' | 'available' | 'taken';

function UsernameSection() {
  const [loaded, setLoaded] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus>('idle');
  const [claiming, setClaiming] = useState(false);
  // Ignore stale availability responses when the user keeps typing.
  const checkSeq = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchMyUsername().then((u) => {
        if (!active) return;
        setClaimed(u);
        setLoaded(true);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  function onChange(next: string) {
    setValue(next);
    setError(null);
    const valid = validateUsernameClient(next);
    if (!valid.ok) {
      setStatus('idle');
      // Show the rule only once the user has typed enough to be meaningful.
      if (next.length > 0) setError(usernameErrorMessage(valid.reason));
      return;
    }
    setStatus('checking');
    const seq = ++checkSeq.current;
    void checkUsernameAvailable(valid.username).then((res) => {
      if (seq !== checkSeq.current) return; // superseded by a newer keystroke
      if (res === 'available') setStatus('available');
      else if (res === 'taken') {
        setStatus('taken');
        setError('That username is taken.');
      } else setStatus('idle');
    });
  }

  async function onClaim() {
    const valid = validateUsernameClient(value);
    if (!valid.ok) {
      setError(usernameErrorMessage(valid.reason));
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const res = await claimUsername(valid.username);
      if (res.ok) {
        setClaimed(res.username);
      } else {
        setError(res.message ?? 'Could not claim that username.');
      }
    } finally {
      setClaiming(false);
    }
  }

  if (!loaded) return null;

  if (claimed) {
    return (
      <Card style={styles.usernameCard}>
        <Text style={styles.usernameLabel}>Username</Text>
        <Text style={styles.usernameValue}>@{claimed}</Text>
      </Card>
    );
  }

  const helper =
    status === 'available' ? 'Available' : status === 'checking' ? 'Checking...' : null;

  return (
    <Card style={styles.usernameCard}>
      <Text style={styles.usernameLabel}>Claim your username</Text>
      <Text style={styles.usernameHint}>
        A unique handle friends use to add you. Lowercase letters, numbers, and underscores.
      </Text>
      <Field
        value={value}
        onChangeText={onChange}
        error={error ?? undefined}
        placeholder="username"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {helper ? <Text style={styles.usernameAvailable}>{helper}</Text> : null}
      <Button
        title="Claim username"
        style={styles.button}
        loading={claiming}
        disabled={status !== 'available'}
        onPress={() => void onClaim()}
      />
    </Card>
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
                  <BigStat value={s.ranks[i]} label={label} />
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
  identityCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  displayName: {
    ...typography.subheading,
    color: colors.felt,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  linkedLabel: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
  },
  guestExplain: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
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
  place: { flex: 1 },
  button: { marginTop: spacing.md },
  usernameCard: { marginBottom: spacing.lg },
  usernameLabel: { ...typography.label, color: colors.felt, fontWeight: '700' },
  usernameValue: { ...typography.subheading, color: colors.textPrimary, marginTop: spacing.xs },
  usernameHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  usernameAvailable: { ...typography.caption, color: colors.feltLight, marginTop: spacing.xs },
});
