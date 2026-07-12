// Redirect stub (U3): the ranking screen moved to app/(tabs)/leaderboard.tsx
// as part of the bottom tab bar. This file stays so any old
// router.push('/friends-rank') call or bookmarked/deep link still lands
// somewhere real instead of 404ing.
import { Redirect } from 'expo-router';

export default function FriendsRankRedirect() {
  return <Redirect href="/leaderboard" />;
}
