// Friends screen: add by username, incoming/outgoing requests, and the
// accepted friends list. Every mutating action (add/accept/decline/remove)
// re-fetches so the lists update without a manual reload. A guest gets a lazy
// anonymous session on mount (R2) instead of a sign-in wall -- guests can add
// friends and view the social surface too, it all keys on userId.
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button, Card, Field, ScreenContainer } from '../components/ui';
import { CompactHeader } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import {
  acceptFriend,
  addFriendByUsername,
  addOutcomeMessage,
  declineFriend,
  fetchFriends,
  removeFriend,
  type FriendsData,
  type FriendUser,
} from '../lib/friends';
import { usernameErrorMessage, validateUsernameClient } from '../lib/profile';

export default function Friends() {
  const router = useRouter();
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
        <CompactHeader title="Friends" />
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

  return <FriendsContent />;
}

function FriendsContent() {
  const router = useRouter();
  const [data, setData] = useState<FriendsData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchFriends();
    setData(next);
    setLoadingData(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchFriends().then((next) => {
        if (!active) return;
        setData(next);
        setLoadingData(false);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Friends" />

      <AddFriendCard onAdded={refresh} />

      <Button
        title="Ranking"
        subtitle="See how you rank against friends"
        variant="secondary"
        align="left"
        onPress={() => router.push('/leaderboard')}
        style={styles.rankingBtn}
      />

      {loadingData ? (
        <ActivityIndicator size="large" color={colors.felt} style={styles.loader} />
      ) : (
        <>
          <RequestsSection
            title="Incoming requests"
            users={data?.incoming ?? []}
            emptyText="No incoming requests."
            renderActions={(user) => (
              <IncomingActions
                user={user}
                onDone={refresh}
              />
            )}
          />

          <RequestsSection
            title="Outgoing requests"
            users={data?.outgoing ?? []}
            emptyText="No pending requests."
            renderActions={(user) => (
              <OutgoingActions user={user} onDone={refresh} />
            )}
          />

          <RequestsSection
            title="Friends"
            users={data?.accepted ?? []}
            emptyText="No friends yet. Add someone by username above."
            renderActions={(user) => (
              <FriendActions user={user} onDone={refresh} />
            )}
          />
        </>
      )}
    </ScreenContainer>
  );
}

// --- Add by username --------------------------------------------------------

function AddFriendCard({ onAdded }: { onAdded: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function onChange(next: string) {
    setValue(next);
    setError(null);
  }

  async function onSubmit() {
    const valid = validateUsernameClient(value);
    if (!valid.ok) {
      setError(usernameErrorMessage(valid.reason));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const outcome = await addFriendByUsername(valid.username);
      const message = addOutcomeMessage(outcome);
      if (message) {
        setError(message);
      } else {
        setValue('');
        onAdded();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={styles.addCard}>
      <Text style={styles.sectionTitle}>Add a friend</Text>
      <Field
        label="Username"
        value={value}
        onChangeText={onChange}
        error={error ?? undefined}
        placeholder="username"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        title="Send request"
        loading={sending}
        disabled={value.trim().length === 0}
        onPress={() => void onSubmit()}
        style={styles.addBtn}
      />
    </Card>
  );
}

// --- Section shell -----------------------------------------------------------

function RequestsSection({
  title,
  users,
  emptyText,
  renderActions,
}: {
  title: string;
  users: FriendUser[];
  emptyText: string;
  renderActions: (user: FriendUser) => ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {users.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </Card>
      ) : (
        <Card style={styles.listCard}>
          {users.map((user, i) => (
            <View key={user.userId} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Avatar url={user.image} name={user.name ?? user.username ?? 'Player'} size={44} />
              <View style={styles.rowText}>
                {user.username ? <Text style={styles.username}>@{user.username}</Text> : null}
                <Text style={styles.name} numberOfLines={1}>
                  {user.name ?? 'Player'}
                </Text>
              </View>
              {renderActions(user)}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

// --- Row actions -------------------------------------------------------------

function IncomingActions({ user, onDone }: { user: FriendUser; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function run(action: (userId: string) => Promise<boolean>) {
    setBusy(true);
    try {
      await action(user.userId);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.actions}>
      <Button
        title="Accept"
        variant="primary"
        disabled={busy}
        onPress={() => void run(acceptFriend)}
        style={styles.actionBtn}
      />
      <Button
        title="Decline"
        variant="ghost"
        disabled={busy}
        onPress={() => void run(declineFriend)}
        style={styles.actionBtn}
      />
    </View>
  );
}

function OutgoingActions({ user, onDone }: { user: FriendUser; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await removeFriend(user.userId);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.actions}>
      <Text style={styles.pendingLabel}>Pending</Text>
      <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => void cancel()} style={styles.actionBtn} />
    </View>
  );
}

// Remove a friend needs a confirm step: the first tap swaps the label to
// "Confirm remove"; a second tap on that same button actually removes them.
function FriendActions({ user, onDone }: { user: FriendUser; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onPress() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await removeFriend(user.userId);
      onDone();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <View style={styles.actions}>
      <Button
        title={confirming ? 'Confirm remove' : 'Remove'}
        variant={confirming ? 'primary' : 'ghost'}
        disabled={busy}
        onPress={() => void onPress()}
        style={styles.actionBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  signInCard: { alignItems: 'center', marginTop: spacing.lg },
  signInText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  signInBtn: { alignSelf: 'stretch' },
  loader: { marginTop: spacing.xl },
  addCard: { marginBottom: spacing.md },
  addBtn: { marginTop: spacing.md },
  rankingBtn: { marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.label,
    color: colors.felt,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  emptyCard: { padding: spacing.md },
  emptyText: { ...typography.caption, color: colors.textMuted },
  listCard: { paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.overlay,
  },
  rowText: { flex: 1, minWidth: 0 },
  username: { ...typography.bodyBold, color: colors.textPrimary },
  name: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 44 is the floor for a tap target; the previous 40 undercut it.
  actionBtn: { minHeight: 44, paddingVertical: spacing.xs },
  pendingLabel: { ...typography.caption, color: colors.textFaint, marginRight: spacing.xs },
});
