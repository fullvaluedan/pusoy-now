// Bottom tab bar (U3, +U4 Friends): Home / Leaderboard / Friends / Profile. This is the only place
// in the app with a persistent bottom bar -- every other screen (game
// table, matchmaking, sign-in, how-to-play, legal, room/[code]...) is a root
// Stack sibling that pushes full-screen over this group automatically, no
// per-screen config needed (expo-router strips route groups from the URL
// and treats non-group siblings as covering the tabs).
//
// No icon library: @expo/vector-icons is not bundled in SDK 57 and is
// deprecation-flagged, so tabBarIcon just renders an emoji Text sized to
// read as an icon, dimmed via opacity when its tab isn't focused (the
// tabBarActiveTintColor/tabBarInactiveTintColor pair only colors the label).
//
// headerShown is off here (and again at the root Stack level in
// app/_layout.tsx) so the only header anywhere is the in-screen
// CompactHeader -- see R6 in docs/plans/2026-07-11-006-*.
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../lib/theme';

const TAB_ICON: Record<string, string> = {
  index: '\u{1F3E0}', // house
  leaderboard: '\u{1F3C6}', // trophy
  friends: '\u{1F465}', // busts in silhouette (group)
  profile: '\u{1F464}', // bust silhouette
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.felt,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.cream,
          borderTopWidth: 2,
          borderTopColor: colors.creamEdge,
          height: 60,
        },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{TAB_ICON[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
