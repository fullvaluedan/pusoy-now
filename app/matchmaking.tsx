// Quick match waiting room (U4). Connects to the Matchmaker DO's queue on
// mount (after ensureSession -- a guest needs *some* session to be seen by
// the queue, same reasoning as play-online.tsx's room-creation path), shows a
// live countdown driven by the server's deadline (never a local 30s timer,
// per the plan), and auto-navigates into the matched room. Cancelling just
// closes the socket -- the server's webSocketClose handler drops the queue
// entry, no explicit "leave" message needed.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CompactHeader, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { authClient, AUTH_BASE_URL } from '../lib/authClient';
import { MatchmakingConnection, matchmakingWsUrl, type MatchmakingState, type SocketLike } from '../lib/matchmakingClient';

// Real socket for the matchmaking queue, matching lib/onlineGame.ts's
// realSocketFactory for rooms: on native the session cookie lives in the
// SecureStore cookie-jar and must be injected as a header on the upgrade; on
// web the browser attaches it automatically.
function realMatchmakingSocket(): SocketLike {
  const url = matchmakingWsUrl(AUTH_BASE_URL);
  if (Platform.OS === 'web') {
    return new WebSocket(url) as unknown as SocketLike;
  }
  const getCookie = (authClient as { getCookie?: () => string }).getCookie;
  const cookie = typeof getCookie === 'function' ? getCookie() : '';
  const options = cookie ? { headers: { Cookie: cookie } } : undefined;
  const RnWebSocket = WebSocket as unknown as new (
    url: string,
    protocols?: string[],
    options?: unknown,
  ) => SocketLike;
  return new RnWebSocket(url, undefined, options);
}

// Brief pause on a match so "Match found!" is readable before the room
// screen takes over.
const MATCH_FOUND_PAUSE_MS = 900;

export default function Matchmaking() {
  const router = useRouter();
  const { ensureSession } = useAuth();
  const [state, setState] = useState<MatchmakingState>({ status: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const connRef = useRef<MatchmakingConnection | null>(null);

  function startQueueing() {
    const conn = new MatchmakingConnection(realMatchmakingSocket, { onState: setState });
    connRef.current = conn;
    conn.connect();
  }

  // Connect on mount (and on a manual retry, see onRetry). Cleans up the
  // socket on unmount so navigating away never leaves an orphaned connection.
  useEffect(() => {
    let cancelled = false;
    void ensureSession().then((result) => {
      if (cancelled) return;
      if (result === 'failed') {
        setState({ status: 'error', retryable: true });
        return;
      }
      startQueueing();
    });
    return () => {
      cancelled = true;
      connRef.current?.cancel();
      connRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick every 250ms against Date.now() while a deadline is live, matching
  // the room screen's own-turn countdown (app/room/[code].tsx). The countdown
  // itself always reads the last server-sent deadline, never a local timer.
  const deadline = state.status === 'queued' ? state.deadline : null;
  useEffect(() => {
    if (deadline == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  // On match: pause briefly on "Match found!", then replace into the room.
  useEffect(() => {
    if (state.status !== 'matched') return;
    const code = state.code;
    const id = setTimeout(() => {
      router.replace({ pathname: '/room/[code]', params: { code } });
    }, MATCH_FOUND_PAUSE_MS);
    return () => clearTimeout(id);
  }, [state, router]);

  function onCancel() {
    connRef.current?.cancel();
    connRef.current = null;
    router.back();
  }

  function onRetry() {
    setState({ status: 'connecting' });
    startQueueing();
  }

  const seconds = deadline != null ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const count = state.status === 'queued' ? state.count : null;

  return (
    <ScreenContainer>
      <CompactHeader title="Quick match" onBack={onCancel} />

      <Card style={styles.card}>
        {state.status === 'error' ? (
          <>
            <Text style={styles.statusText}>Lost the connection to the queue.</Text>
            <Button title="Try again" variant="primary" onPress={onRetry} style={styles.retryBtn} />
          </>
        ) : state.status === 'matched' ? (
          <>
            <Text style={styles.matchedText}>Match found!</Text>
            <Text style={styles.subtleCopy}>Taking you to the table...</Text>
          </>
        ) : (
          <>
            <Text style={styles.countdown}>{seconds != null ? `${seconds}s` : '...'}</Text>
            <Text style={styles.countLine}>{count != null ? `${count} of 4 players` : 'Connecting...'}</Text>
            <Text style={styles.subtleCopy}>Empty seats are filled with expert bots</Text>
          </>
        )}
      </Card>

      {state.status !== 'matched' ? (
        <Button title="Cancel" variant="danger" onPress={onCancel} style={styles.cancelBtn} />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.xxl },
  countdown: { fontSize: 64, fontWeight: '800', color: colors.felt },
  countLine: { ...typography.bodyBold, color: colors.textPrimary, marginTop: spacing.sm },
  subtleCopy: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  matchedText: { ...typography.heading, color: colors.felt },
  statusText: { ...typography.body, color: colors.textPrimary, textAlign: 'center' },
  retryBtn: { marginTop: spacing.lg, alignSelf: 'stretch' },
  cancelBtn: { marginTop: spacing.xl },
});
