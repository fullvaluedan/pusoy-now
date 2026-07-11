// Client wrappers for the friends, ranking, and username endpoints on the auth
// Worker. Every call goes through authClient.$fetch so the session rides along:
// browser cookies on web, the SecureStore cookie-jar on native. The UI (U5)
// consumes these; the pure request-outcome mapping is exported for testing.

import { apiUrl, authClient } from './authClient';
import { mapAddStatus, type AddOutcome } from './friendsMap';

export { addOutcomeMessage, mapAddStatus, type AddOutcome } from './friendsMap';

// A friend or request row: the other player's id plus their display fields.
export interface FriendUser {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

export interface FriendsData {
  accepted: FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
}

export interface RankRow {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
  firsts: number;
  games: number;
  winRate: number;
  isSelf: boolean;
}

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

export async function fetchFriends(): Promise<FriendsData | null> {
  const { data, error } = await authClient.$fetch<FriendsData>(apiUrl('/api/friends'));
  if (error || !data) return null;
  return data;
}

// Send a request by username. Returns a stable outcome the add-field renders as
// inline feedback ("No player with that username", etc.).
export async function addFriendByUsername(username: string): Promise<AddOutcome> {
  const { error } = await authClient.$fetch(apiUrl('/api/friends/request'), {
    method: 'POST',
    body: { username },
  });
  return mapAddStatus(error ? statusOf(error) : undefined);
}

async function friendAction(path: string, userId: string): Promise<boolean> {
  const { error } = await authClient.$fetch(apiUrl(path), { method: 'POST', body: { userId } });
  return !error;
}

export const acceptFriend = (userId: string) => friendAction('/api/friends/accept', userId);
export const declineFriend = (userId: string) => friendAction('/api/friends/decline', userId);
export const removeFriend = (userId: string) => friendAction('/api/friends/remove', userId);

export async function fetchRanking(): Promise<RankRow[] | null> {
  const { data, error } = await authClient.$fetch<{ ranking: RankRow[] }>(apiUrl('/api/friends/ranking'));
  if (error || !data) return null;
  return data.ranking;
}
