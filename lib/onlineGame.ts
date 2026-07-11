// React hook around the online room connection (lib/onlineConnection.ts). This
// module supplies the real WebSocket - injecting the native SecureStore cookie
// on the upgrade, since RN has no browser cookie store - and re-renders on
// view/status/error changes. The connection state machine itself is pure and
// tested separately.

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { PlayedCombo } from './pusoy/types';
import { authClient, AUTH_BASE_URL } from './authClient';
import {
  OnlineRoomConnection,
  roomWsUrl,
  type ConnStatus,
  type OnlineRoomView,
  type SocketLike,
} from './onlineConnection';

export type { ConnStatus, OnlinePlayerView, OnlineRoomView } from './onlineConnection';
export { roomWsUrl } from './onlineConnection';

// Create the real WebSocket for a room. On native the session cookie lives in
// the SecureStore cookie-jar (not a browser cookie store), so it is injected on
// the upgrade via a header; on web the browser attaches the SameSite=None
// cookie automatically.
function realSocketFactory(code: string): SocketLike {
  const url = roomWsUrl(AUTH_BASE_URL, code);
  if (Platform.OS === 'web') {
    return new WebSocket(url) as unknown as SocketLike;
  }
  const getCookie = (authClient as { getCookie?: () => string }).getCookie;
  const cookie = typeof getCookie === 'function' ? getCookie() : '';
  const options = cookie ? { headers: { Cookie: cookie } } : undefined;
  // RN's WebSocket accepts an options object with headers as the third arg; the
  // DOM WebSocket type does not, so construct through a cast.
  const RnWebSocket = WebSocket as unknown as new (
    url: string,
    protocols?: string[],
    options?: unknown,
  ) => SocketLike;
  return new RnWebSocket(url, undefined, options);
}

export interface UseOnlineRoom {
  view: OnlineRoomView | null;
  status: ConnStatus;
  error: string | null;
  playCards: (combo: PlayedCombo) => void;
  pass: () => void;
  start: () => void;
  clearError: () => void;
}

// Opens (and auto-reconnects) a connection to the room and exposes the latest
// redacted view, status, transient errors, and the action senders.
export function useOnlineRoom(code: string | null): UseOnlineRoom {
  const [view, setView] = useState<OnlineRoomView | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const connRef = useRef<OnlineRoomConnection | null>(null);

  useEffect(() => {
    if (!code) return;
    const conn = new OnlineRoomConnection(() => realSocketFactory(code), {
      onView: (v) => setView(v),
      onStatus: (s) => setStatus(s),
      onError: (m) => setError(m),
    });
    connRef.current = conn;
    conn.connect();
    return () => {
      conn.close();
      connRef.current = null;
    };
  }, [code]);

  return {
    view,
    status,
    error,
    playCards: (combo) => connRef.current?.playCards(combo),
    pass: () => connRef.current?.pass(),
    start: () => connRef.current?.start(),
    clearError: () => setError(null),
  };
}
