// Client wrappers for the room HTTP endpoints on the auth Worker (create /
// info). The live WebSocket play is in lib/onlineGame.ts. Session rides along
// via authClient.$fetch.

import { authClient } from './authClient';

export type OnlineBotLevel = 'easy' | 'normal' | 'expert';

export interface CreatedRoom {
  code: string;
  link: string; // public web URL (Pages origin) to share
  deepLink: string; // app deep link
}

// Create a room (2-4 seats) with a bot difficulty for unfilled seats. The
// caller becomes the host.
export async function createRoom(seats: number, botLevel: OnlineBotLevel): Promise<CreatedRoom | null> {
  const { data, error } = await authClient.$fetch<CreatedRoom>('/api/rooms', {
    method: 'POST',
    body: { seats, botLevel },
  });
  if (error || !data) return null;
  return data;
}

export interface RoomInfo {
  code: string;
  seats: number;
  phase: 'lobby' | 'playing' | 'finished';
  hostUserId: string;
  players: { seat: number; username: string | null; kind: 'human' | 'bot'; connected: boolean }[];
}

// Lobby info for a room, or 'not-found' if the code does not resolve.
export async function fetchRoomInfo(code: string): Promise<RoomInfo | 'not-found' | null> {
  const { data, error } = await authClient.$fetch<RoomInfo>(`/api/rooms/${code}`);
  if (error) {
    const status = (error as { status?: number }).status;
    return status === 404 ? 'not-found' : null;
  }
  return data ?? null;
}
