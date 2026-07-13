// Client wrappers for the friends, ranking, and username endpoints on the auth
// Worker. Every call goes through authClient.$fetch so the session rides along:
// browser cookies on web, the SecureStore cookie-jar on native. The UI (U5)
// consumes these; the pure request-outcome mapping is exported for testing.

import { apiUrl, authClient } from './authClient';
import { mapAddStatus, type AddOutcome } from './friendsMap';

export { addOutcomeMessage, formatH2h, mapAddStatus, type AddOutcome } from './friendsMap';

// A friend or request row: the other player's id plus their display fields.
export interface FriendUser {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
  // The player's avatar-source preference, so a 'letter' choice is honored in
  // friend lists instead of always showing their social photo. May be absent.
  avatarPref?: string | null;
}

// The caller's head-to-head record vs one friend, from shared finished
// online games (a win = the caller placed ahead of the friend).
export interface H2H {
  wins: number;
  losses: number;
}

// Accepted rows additionally carry the head-to-head record vs the caller
// (server/src/index.ts's GET /api/friends, U3) -- always present, {0,0}
// when there are no shared finished games.
export interface AcceptedFriend extends FriendUser {
  h2h: H2H;
}

export interface FriendsData {
  accepted: AcceptedFriend[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
}

export interface RankRow {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
  avatarPref?: string | null;
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
