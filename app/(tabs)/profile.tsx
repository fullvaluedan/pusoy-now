// Profile tab (U3): identity + navigation hub. This is the tab-bar landing
// screen -- it is intentionally lightweight, not the full profile UI (that
// stays at app/profile.tsx, pushed from here, and keeps the username-claim
// flow etc. working unchanged).
//
// Signed-in real accounts get an avatar + display-name card that pushes into
// the existing app/profile.tsx screen. A guest sees their local device name
// plus a chunky "sign in to save your progress" nudge (guest wiring copied
// from the Home tab's IdentityLine pattern: getLocalGuestName + useAuth's
// isAnonymous, since a guest here means "no session" OR "anonymous
// session").
//
// Below identity: a ghost-button list to the other hub screens that used to
// live directly on Home (Scoreboard, Settings, How to play) -- Home sheds
// these in U4, this tab is where they land instead. Friends got its own
// bottom tab in U4 (app/(tabs)/friends.tsx), so the row here was removed
// rather than pointed at it.
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Button, CompactHeader, ListRow, ScreenContainer } from '../../components/ui';
import { colors, spacing, typography } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { getLocalGuestName } from '../../lib/guest';

export default function ProfileTab() {
  const router = useRouter();
  const { session, profile, isAnonymous } = useAuth();

  const [guestName, setGuestName] = useState<string | null>(null);
  useEffect(() => {
    void getLocalGuestName().then(setGuestName);
  }, []);

  const signedIn = Boolean(session) && !isAnonymous;

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Profile" back={false} />

      {signedIn ? (
        <ListRow
          leading={<Avatar name={profile?.displayName ?? 'Player'} url={profile?.avatarUrl} size={44} />}
          chevron
          onPress={() => router.push('/profile')}
          style={styles.identityRow}
        >
          <View style={styles.identityTextGroup}>
            <Text style={styles.identityTitle}>Signed in</Text>
            <Text style={styles.identitySubtitle} numberOfLines={1} ellipsizeMode="tail">
              {profile?.displayName}
            </Text>
          </View>
        </ListRow>
      ) : (
        <View style={styles.guestWrap}>
          {guestName ? <Text style={styles.guestLine} numberOfLines={1} ellipsizeMode="tail">Playing as {guestName}</Text> : null}
          <Button
            title="Sign in to save your progress"
            variant="primary"
            onPress={() => router.push('/sign-in')}
          />
        </View>
      )}

      <View style={styles.menuSection}>
        <ListRow
          label="Scoreboard"
          leading={<Text style={styles.rowEmoji}>📊</Text>}
          chevron
          onPress={() => router.push('/stats')}
        />
        <ListRow
          label="Settings"
          leading={<Text style={styles.rowEmoji}>⚙️</Text>}
          chevron
          onPress={() => router.push('/settings')}
        />
        <ListRow
          label="How to play"
          leading={<Text style={styles.rowEmoji}>📖</Text>}
          chevron
          onPress={() => router.push('/how-to-play')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  identityRow: { marginBottom: spacing.lg },
  identityTextGroup: { flex: 1, minWidth: 0 },
  identityTitle: { ...typography.bodyBold, color: colors.textPrimary },
  identitySubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2, flex: 1, minWidth: 0 },
  guestWrap: { marginBottom: spacing.lg, gap: spacing.sm },
  guestLine: { ...typography.caption, color: colors.textMuted, flex: 1, minWidth: 0 },
  menuSection: { marginTop: spacing.sm },
  rowEmoji: { fontSize: 22 },
});
