// Friends tab (U4): the 4th bottom tab. Relocated + redesigned from the old
// pushed app/friends.tsx (now deleted -- a route group strips to the same
// `/friends` path as this tab, so keeping both was a route collision, not a
// redirect situation; see app/_layout.tsx and the grep sweep in this unit's
// plan section for the old-link fallout).
//
// Top-down: a primary ADD FRIEND button that expands into an inline
// username row (reuses the add-by-username validation/outcome pipeline from
// the old screen), a "your username" caption so people know what to share,
// requests (only rendered when non-empty), then the friends list with a
// head-to-head chip per row (U3's `h2h` field on accepted rows) and a
// two-tap remove. Guests get the same experience as accounts -- ensureSession
// lazily starts an anonymous session, exactly like Leaderboard.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Avatar } from '../../components/Avatar';
import { Button, Card, CompactHeader, Field, ListRow, ScreenContainer } from '../../components/ui';
import { colors, radii, spacing, typography, withAlpha } from '../../lib/theme';

const EMPTY_ART = require('../../assets/art/empty-state.png');
import { useAuth } from '../../lib/auth';
import { getLocalGuestName } from '../../lib/guest';
import { fetchMyUsername } from '../../lib/profileClient';
import { usernameErrorMessage, validateUsernameClient } from '../../lib/profile';
import {
  acceptFriend,
  addFriendByUsername,
  addOutcomeMessage,
  declineFriend,
  fetchFriends,
  formatH2h,
  removeFriend,
  type AcceptedFriend,
  type FriendsData,
  type FriendUser,
} from '../../lib/friends';

export default function FriendsTab() {
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
        <CompactHeader title="Friends" back={false} />
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

  const hasRequests = (data?.incoming.length ?? 0) > 0 || (data?.outgoing.length ?? 0) > 0;

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Friends" back={false} />

      <AddFriendSection onAdded={refresh} />

      {loadingData ? (
        <ActivityIndicator size="large" color={colors.felt} style={styles.loader} />
      ) : (
        <>
          {hasRequests ? (
            <View style={styles.requestsPanel}>
              <Text style={styles.requestsTitle}>Requests</Text>
              {(data?.incoming.length ?? 0) > 0
                ? data!.incoming.map((user) => (
                    <UserRow key={user.userId} user={user}>
                      <IncomingActions user={user} onDone={refresh} />
                    </UserRow>
                  ))
                : null}
              {(data?.outgoing.length ?? 0) > 0 ? (
                <View style={styles.outgoingWrap}>
                  {data!.outgoing.map((user) => (
                    <UserRow key={user.userId} user={user}>
                      <OutgoingActions user={user} onDone={refresh} />
                    </UserRow>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <FriendsList friends={data?.accepted ?? []} onChanged={refresh} />
        </>
      )}
    </ScreenContainer>
  );
}

// --- Add by username ---------------------------------------------------------

function AddFriendSection({ onAdded }: { onAdded: () => void }) {
  const { profile, isAnonymous } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [myHandle, setMyHandle] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchMyUsername().then((claimed) => {
        if (!active) return;
        if (claimed) {
          setMyHandle(claimed);
          return;
        }
        // No claimed username: fall back to the guest device name or the
        // session's display name, whichever this session actually has --
        // mirrors the guest identity shown on the Profile tab.
        if (isAnonymous || !profile) {
          void getLocalGuestName().then((name) => {
            if (active) setMyHandle(name);
          });
        } else {
          setMyHandle(profile.displayName);
        }
      });
      return () => {
        active = false;
      };
    }, [profile, isAnonymous]),
  );

  function onChange(next: string) {
    setValue(next);
    setError(null);
  }

  function close() {
    setOpen(false);
    setValue('');
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
        setOpen(false);
        onAdded();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.addSection}>
      {open ? (
        <Card style={styles.addCard}>
          <View style={styles.addRow}>
            <View style={styles.addField}>
              <Field
                value={value}
                onChangeText={onChange}
                error={error ?? undefined}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            <Button
              title="Add"
              loading={sending}
              disabled={value.trim().length === 0}
              onPress={() => void onSubmit()}
              style={styles.addSubmitBtn}
            />
            <Button title="✕" variant="ghost" onPress={close} style={styles.addCloseBtn} />
          </View>
        </Card>
      ) : (
        <Button title="Add friend" variant="primary" size="big" onPress={() => setOpen(true)} />
      )}
      {myHandle ? (
        <Text style={styles.handleCaption}>
          Your username: {myHandle}. Friends can add you with it.
        </Text>
      ) : null}
    </View>
  );
}

// --- Shared row shell ---------------------------------------------------------

function UserRow({ user, children }: { user: FriendUser; children: ReactNode }) {
  return (
    <ListRow
      leading={<Avatar url={user.image} avatarPref={user.avatarPref} name={user.name ?? user.username ?? 'Player'} size={44} />}
      trailing={children}
    >
      <View style={styles.rowText}>
        {user.username ? <Text style={styles.username}>@{user.username}</Text> : null}
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {user.name ?? 'Player'}
        </Text>
      </View>
    </ListRow>
  );
}

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

// --- Friends list --------------------------------------------------------------

function FriendsList({ friends, onChanged }: { friends: AcceptedFriend[]; onChanged: () => void }) {
  if (friends.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Friends</Text>
        <Card style={styles.emptyCard}>
          <Image source={EMPTY_ART} style={styles.emptyArt} resizeMode="contain" accessibilityLabel="No friends yet" />
          <Text style={styles.emptyText}>
            No friends yet. Add one by username, or play a Private game together -- joining a room makes you
            friends automatically.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Friends</Text>
      {friends.map((friend) => (
        <ListRow
          key={friend.userId}
          leading={<Avatar url={friend.image} avatarPref={friend.avatarPref} name={friend.name ?? friend.username ?? 'Player'} size={44} />}
          trailing={
            <View style={styles.friendTrailing}>
              <H2HChip h2h={friend.h2h} />
              <FriendActions user={friend} onDone={onChanged} />
            </View>
          }
        >
          <View style={styles.rowText}>
            {friend.username ? <Text style={styles.username}>@{friend.username}</Text> : null}
            <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {friend.name ?? 'Player'}
            </Text>
          </View>
        </ListRow>
      ))}
    </View>
  );
}

function H2HChip({ h2h }: { h2h: AcceptedFriend['h2h'] }) {
  // Color the pill by the record: green tint when you lead, red when behind,
  // neutral when even (or no shared games yet).
  const lead = h2h.wins > h2h.losses;
  const behind = h2h.wins < h2h.losses;
  const chipStyle = lead ? styles.h2hChipLead : behind ? styles.h2hChipBehind : styles.h2hChipNeutral;
  const textStyle = lead ? styles.h2hTextLead : behind ? styles.h2hTextBehind : styles.h2hTextNeutral;
  return (
    <View style={[styles.h2hChip, chipStyle]}>
      <Text style={[styles.h2hText, textStyle]}>{formatH2h(h2h)}</Text>
    </View>
  );
}

// Remove a friend needs a confirm step: the first tap swaps the label to
// "Sure?"; a second tap on that same button actually removes them.
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
    <Button
      title={confirming ? 'Sure?' : 'Remove'}
      variant={confirming ? 'danger' : 'ghost'}
      disabled={busy}
      onPress={() => void onPress()}
      style={styles.removeBtn}
    />
  );
}

const styles = StyleSheet.create({
  signInCard: { alignItems: 'center', marginTop: spacing.lg },
  signInText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  signInBtn: { alignSelf: 'stretch' },
  loader: { marginTop: spacing.xl },
  addSection: { marginBottom: spacing.lg },
  addCard: { padding: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  addField: { flex: 1 },
  addSubmitBtn: { minHeight: 44, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  addCloseBtn: { minHeight: 44, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  handleCaption: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.label,
    color: colors.felt,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  // Requests live in an inset sky-blue-tinted panel so pending asks read as a
  // distinct, attention-worthy zone rather than plain rows on cream.
  requestsPanel: {
    marginBottom: spacing.lg,
    backgroundColor: withAlpha(colors.skyBlue, 0.12),
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  requestsTitle: {
    ...typography.subheading,
    color: colors.felt,
    marginBottom: spacing.sm,
  },
  outgoingWrap: { marginTop: spacing.sm },
  emptyCard: { padding: spacing.md, alignItems: 'center' },
  emptyArt: { width: 96, height: 96, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  username: { ...typography.bodyBold, color: colors.textPrimary },
  name: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 44 is the floor for a tap target; the previous 40 undercut it.
  actionBtn: { minHeight: 44, paddingVertical: spacing.xs },
  pendingLabel: { ...typography.caption, color: colors.textFaint, marginRight: spacing.xs },
  // H2H chip stacked above the Remove button in the friend row's trailing
  // slot (was inline before ListRow; the row is narrower now that it is its
  // own bordered card, so stacking keeps long usernames from squeezing it).
  friendTrailing: { alignItems: 'flex-end', gap: spacing.xs },
  h2hChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  h2hChipLead: { backgroundColor: withAlpha(colors.successBright, 0.15) },
  h2hChipBehind: { backgroundColor: withAlpha(colors.dangerBright, 0.15) },
  h2hChipNeutral: { backgroundColor: colors.overlay },
  h2hText: { ...typography.tiny, fontWeight: '800' },
  h2hTextLead: { color: colors.successEdge },
  h2hTextBehind: { color: colors.dangerEdge },
  h2hTextNeutral: { color: colors.textFaint },
  removeBtn: { minHeight: 44, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
});
