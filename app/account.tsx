// Full profile / account screen (registered as `account`, reached via /account).
// Shows signed-in user or guest mode: identity, the username-claim flow, stats,
// and sign-in/out actions. Renamed off /profile (was app/profile.tsx) so it no
// longer collided with the Profile TAB (app/(tabs)/profile.tsx), which owns the
// /profile route; the tab pushes here as /account.
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { BigStat, Button, Card, Field, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { emptyStats, loadStats, LEVEL_ORDER, LEVEL_TITLE, type BotStats } from '../lib/stats';
import { usernameErrorMessage, validateUsernameClient } from '../lib/profile';
import {
  checkUsernameAvailable,
  claimUsername,
  fetchProfileMeta,
  renameUsername,
  setAvatarPref as saveAvatarPref,
  type AvatarPref,
  type ProfileMeta,
} from '../lib/profileClient';

const PLACE_LABEL = ['1st', '2nd', '3rd', '4th'];

export default function Profile() {
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();
  const [stats, setStats] = useState<BotStats>(emptyStats());
  // Profile meta (username, rename allowance, avatar preference) lives here so
  // both the identity Avatar preview and the child sections stay in sync when
  // any of them changes it.
  const [meta, setMeta] = useState<ProfileMeta | null>(null);

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

  // Load profile meta on focus (signed-in only; a guest read just returns nulls).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (session) {
        void fetchProfileMeta().then((m) => {
          if (active) setMeta(m);
        });
      }
      return () => {
        active = false;
      };
    }, [session]),
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
            avatarPref={meta?.avatarPref}
            name={profile.displayName}
            size={72}
          />
          <Text style={styles.displayName}>{profile.displayName}</Text>
          <Text style={styles.linkedLabel}>Linked account</Text>
        </Card>

        <UsernameSection meta={meta} onChange={setMeta} />

        <AvatarPrefSection
          meta={meta}
          hasPhoto={Boolean(profile.avatarUrl)}
          onChange={setMeta}
        />

        {/* Stats row */}
        <Text style={styles.statsTitle}>Your stats vs bots</Text>
        {renderStatsCards(stats)}

        <Button
          title="Friends"
          subtitle="Add friends and see the ranking"
          variant="secondary"
          style={styles.button}
          onPress={() => router.push('/friends')}
        />

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

// Username: shown on Profile for signed-in users. Three states off the loaded
// meta: no username yet -> a claim field; a username with the one free change
// left -> the handle plus a "Change username" affordance that opens the same
// field wired to /rename; a username with the change spent -> the handle plus a
// "no changes left" note. The claim/rename field shares inline validation, live
// availability, and the server's moderation message (shown inline).
type ClaimStatus = 'idle' | 'checking' | 'available' | 'taken' | 'blocked';

interface UsernameSectionProps {
  meta: ProfileMeta | null;
  onChange: (meta: ProfileMeta) => void;
}

function UsernameSection({ meta, onChange }: UsernameSectionProps) {
  // 'editing' opens the field for a rename; claim (no username) always shows it.
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus>('idle');
  const [busy, setBusy] = useState(false);
  // Ignore stale availability responses when the user keeps typing.
  const checkSeq = useRef(0);

  if (!meta) return null;

  const isRename = Boolean(meta.username);

  function reset() {
    setValue('');
    setError(null);
    setStatus('idle');
    setEditing(false);
  }

  function onFieldChange(next: string) {
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
      if (res.status === 'available') setStatus('available');
      else if (res.status === 'taken') {
        setStatus('taken');
        setError('That username is taken.');
      } else if (res.status === 'invalid') {
        // Server-side reason (e.g. moderation), shown with its own copy.
        setStatus('blocked');
        setError(res.message ?? 'That username is not allowed.');
      } else setStatus('idle');
    });
  }

  async function onSubmit() {
    const valid = validateUsernameClient(value);
    if (!valid.ok) {
      setError(usernameErrorMessage(valid.reason));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isRename) {
        const res = await renameUsername(valid.username);
        if (res.ok) {
          onChange({ ...meta!, username: res.username, canRename: false });
          reset();
        } else {
          setError(res.message ?? 'Could not change that username.');
        }
      } else {
        const res = await claimUsername(valid.username);
        if (res.ok) {
          // A first claim does not spend the rename, so canRename stays true.
          onChange({ ...meta!, username: res.username, canRename: true });
          reset();
        } else {
          setError(res.message ?? 'Could not claim that username.');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // View mode: a claimed handle with the change affordance / note.
  if (meta.username && !editing) {
    return (
      <Card style={styles.usernameCard}>
        <Text style={styles.usernameLabel}>Username</Text>
        <Text style={styles.usernameValue}>@{meta.username}</Text>
        {meta.canRename ? (
          <>
            <Text style={styles.usernameHint}>1 free change remaining.</Text>
            <Button
              title="Change username"
              variant="secondary"
              style={styles.button}
              onPress={() => setEditing(true)}
            />
          </>
        ) : (
          <Text style={styles.usernameHint}>No username changes left.</Text>
        )}
      </Card>
    );
  }

  const helper =
    status === 'available' ? 'Available' : status === 'checking' ? 'Checking...' : null;

  return (
    <Card style={styles.usernameCard}>
      <Text style={styles.usernameLabel}>{isRename ? 'Change your username' : 'Claim your username'}</Text>
      <Text style={styles.usernameHint}>
        {isRename
          ? 'You get one free change. Lowercase letters, numbers, and underscores.'
          : 'A unique handle friends use to add you. Lowercase letters, numbers, and underscores.'}
      </Text>
      <Field
        value={value}
        onChangeText={onFieldChange}
        error={error ?? undefined}
        placeholder="username"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {helper ? <Text style={styles.usernameAvailable}>{helper}</Text> : null}
      <Button
        title={isRename ? 'Save new username' : 'Claim username'}
        style={styles.button}
        loading={busy}
        disabled={status !== 'available'}
        onPress={() => void onSubmit()}
      />
      {isRename ? (
        <Button title="Cancel" variant="ghost" style={styles.button} onPress={reset} />
      ) : null}
    </Card>
  );
}

// Avatar source preference: a two-option segmented control. "Photo" is enabled
// only when the linked account actually has a picture; "Letter" forces the
// initial disc. Saving updates the preference server-side and the shared meta,
// so the identity Avatar preview flips immediately. The preset picker is a
// disabled "coming soon" affordance (art deferred).
interface AvatarPrefSectionProps {
  meta: ProfileMeta | null;
  hasPhoto: boolean;
  onChange: (meta: ProfileMeta) => void;
}

function AvatarPrefSection({ meta, hasPhoto, onChange }: AvatarPrefSectionProps) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!meta) return null;

  // The effective selection: an explicit 'letter', else 'photo' when a picture
  // exists (the default precedence), else 'letter'.
  const selected: 'photo' | 'letter' = meta.avatarPref === 'letter' ? 'letter' : hasPhoto ? 'photo' : 'letter';

  async function choose(next: 'photo' | 'letter') {
    if (saving) return;
    const pref: AvatarPref = next === 'photo' ? 'social' : 'letter';
    setSaving(true);
    setNote(null);
    // Optimistic: flip the preview, then persist.
    onChange({ ...meta!, avatarPref: pref });
    const okSaved = await saveAvatarPref(pref);
    setSaving(false);
    if (!okSaved) {
      onChange({ ...meta!, avatarPref: meta!.avatarPref });
      setNote('Claim a username first to save this.');
    }
  }

  return (
    <Card style={styles.usernameCard}>
      <Text style={styles.usernameLabel}>Avatar</Text>
      <Text style={styles.usernameHint}>Choose what shows on your seat.</Text>
      <View style={styles.segment}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selected === 'photo', disabled: !hasPhoto }}
          disabled={!hasPhoto || saving}
          onPress={() => void choose('photo')}
          style={[
            styles.segmentItem,
            selected === 'photo' && styles.segmentItemActive,
            !hasPhoto && styles.segmentItemDisabled,
          ]}
        >
          <Text style={[styles.segmentText, selected === 'photo' && styles.segmentTextActive]}>Photo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selected === 'letter' }}
          disabled={saving}
          onPress={() => void choose('letter')}
          style={[styles.segmentItem, selected === 'letter' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, selected === 'letter' && styles.segmentTextActive]}>Letter</Text>
        </Pressable>
      </View>
      {!hasPhoto ? (
        <Text style={styles.usernameHint}>Sign in with Google or Facebook to use a photo.</Text>
      ) : null}
      <View style={[styles.segmentItem, styles.presetSoon]}>
        <Text style={styles.presetSoonText}>Preset avatars (coming soon)</Text>
      </View>
      {note ? <Text style={styles.usernameAvailable}>{note}</Text> : null}
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
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.felt,
    borderColor: colors.felt,
  },
  segmentItemDisabled: {
    opacity: 0.4,
  },
  segmentText: { ...typography.label, color: colors.textPrimary, fontWeight: '700' },
  segmentTextActive: { color: colors.textOnFelt },
  presetSoon: {
    flex: 0,
    marginTop: spacing.sm,
    opacity: 0.5,
  },
  presetSoonText: { ...typography.caption, color: colors.textMuted },
});
