// Profile tab (U3): identity + navigation hub. This is the tab-bar landing
// screen -- it is intentionally lightweight, not the full profile UI (that
// lives at app/account.tsx, pushed from here as /account, and keeps the
// username-claim flow etc. working unchanged). The full screen was renamed off
// /profile so it no longer collides with this tab's own /profile route.
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
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { avatarRingStyles, Button, CompactHeader, FeltHero, IconTile, ListRow, ScreenContainer } from '../../components/ui';
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
  const heroName = signedIn ? profile?.displayName ?? 'Player' : guestName ?? 'Guest';
  const subtitle = signedIn
    ? 'Progress saved to your account'
    : 'Guest account - progress saved on this device';

  return (
    <ScreenContainer scroll>
      <CompactHeader title="Profile" back={false} />

      <FeltHero style={styles.hero}>
        {signedIn ? (
          <Pressable
            onPress={() => router.push('/account')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open full profile"
            style={styles.heroTap}
          >
            <HeroIdentity name={heroName} subtitle={subtitle} url={profile?.avatarUrl} />
          </Pressable>
        ) : (
          <View style={styles.heroTap}>
            <HeroIdentity name={heroName} subtitle={subtitle} url={null} />
            <Button
              title="Sign in to keep your progress"
              variant="primary"
              color={colors.gold}
              onPress={() => router.push('/sign-in')}
              style={styles.heroCta}
            />
          </View>
        )}
      </FeltHero>

      <View style={styles.menuSection}>
        <ListRow
          label="Scoreboard"
          leading={<IconTile emoji="📊" tint={colors.gold} />}
          chevron
          onPress={() => router.push('/stats')}
        />
        <ListRow
          label="Settings"
          leading={<IconTile emoji="⚙️" tint={colors.textMuted} />}
          chevron
          onPress={() => router.push('/settings')}
        />
        <ListRow
          label="How to play"
          leading={<IconTile emoji="📖" tint={colors.skyBlue} />}
          chevron
          onPress={() => router.push('/how-to-play')}
        />
      </View>
    </ScreenContainer>
  );
}

// The identity block inside the felt hero: a gold-ringed avatar, the display
// name in white heading type, and a muted-white subtitle line.
function HeroIdentity({ name, subtitle, url }: { name: string; subtitle: string; url?: string | null }) {
  return (
    <View style={styles.heroIdentity}>
      <View style={avatarRingStyles.gold}>
        <Avatar name={name} url={url} size={72} />
      </View>
      <View style={styles.heroTextGroup}>
        <Text style={styles.heroName} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>
        <Text style={styles.heroSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: spacing.lg, padding: spacing.lg },
  heroTap: { gap: spacing.md },
  heroIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroTextGroup: { flex: 1, minWidth: 0 },
  heroName: { ...typography.heading, color: colors.textOnFelt },
  heroSubtitle: { ...typography.caption, color: colors.textOnFeltMuted, marginTop: 2 },
  heroCta: { width: '100%' },
  menuSection: { marginTop: spacing.sm },
});
