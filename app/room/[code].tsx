// One room, both as a lobby (seat list + invite link + host start) and as the
// live table once play begins, and finally the finish-order screen. Backed by
// the server-authoritative WebSocket (lib/onlineGame.useOnlineRoom) -- this
// screen only ever renders the room's redacted view; it never has another
// seat's cards. headerShown:false in app/_layout.tsx (see there) because this
// becomes a felt-less but still full table once play starts, so the header
// here is drawn in-line instead of the native Stack header.
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Header, ScreenContainer } from '../../components/ui';
import { OpponentCardStack, PlayingCard } from '../../components/PlayingCard';
import { canPlay, detectCombo } from '../../lib/pusoy/combo';
import { colors, radii, spacing, typography, withAlpha } from '../../lib/theme';
import { useOnlineRoom, type OnlineRoomView } from '../../lib/onlineGame';
import type { Card as CardT, PlayedCombo } from '../../lib/pusoy/types';

// Web falls back to this app's own /join/[code] route on its own origin;
// native falls back to the pusoynow:// deep link. Both are overridden by the
// server-provided `link`/`deepLink` route params when play-online passed them
// through (see app/play-online.tsx).
function deriveJoinLink(code: string): string {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? `${window.location.origin}/join/${code}` : `/join/${code}`;
  }
  return `pusoynow://join/${code}`;
}

function playerLabel(view: OnlineRoomView, seat: number): string {
  const p = view.players.find((pl) => pl.seat === seat);
  if (!p) return `Seat ${seat + 1}`;
  if (p.username) return p.username;
  return p.kind === 'bot' ? `Bot ${seat + 1}` : 'Player';
}

export default function RoomScreen() {
  const params = useLocalSearchParams<{ code: string; link?: string; deepLink?: string }>();
  const code = params.code ?? '';
  const router = useRouter();
  const { view, status, error, playCards, pass, start, clearError } = useOnlineRoom(code || null);

  const [selected, setSelected] = useState<CardT[]>([]);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const humanSeat = view?.yourSeat ?? null;
  // Better-auth's profile does not expose a raw userId here, so "host" is
  // read off the room shape itself: the first seat is always the creator (see
  // server/src/roomLogic.ts joinRoom, which assigns seats in join order and
  // the DO seats the creator first).
  const isHost = humanSeat === 0;
  const isMyTurn =
    view?.phase === 'playing' &&
    view.handState != null &&
    humanSeat != null &&
    view.handState.currentPlayerIndex === humanSeat;

  // Turn countdown: only ticks while it is your turn, cleared on unmount / turn
  // change so it never runs in the background.
  useEffect(() => {
    if (!isMyTurn || !view?.turnDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isMyTurn, view?.turnDeadline]);

  // Selection resets once the turn moves on -- either your play landed, or the
  // turn passed to someone else while you were deciding.
  useEffect(() => {
    setSelected([]);
  }, [view?.handState?.currentPlayerIndex]);

  const seconds =
    isMyTurn && view?.turnDeadline ? Math.max(0, Math.ceil((view.turnDeadline - now) / 1000)) : null;

  const lead = view?.handState?.leadCombo ?? null;
  const selCombo = selected.length ? detectCombo(selected) : null;
  const selLegal = !!selCombo && canPlay(selCombo, lead);

  function toggleCard(c: CardT) {
    setSelected((sel) => (sel.find((s) => s.id === c.id) ? sel.filter((s) => s.id !== c.id) : [...sel, c]));
  }

  function onPlay() {
    if (!selCombo) return;
    playCards({ ...selCombo, cards: selected } as PlayedCombo);
    setSelected([]);
  }

  const joinLink = params.link ?? (Platform.OS === 'web' ? deriveJoinLink(code) : params.deepLink ?? deriveJoinLink(code));

  async function onShare() {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(joinLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard permission denied; nothing more to do
      }
    } else {
      try {
        await Share.share({ message: joinLink });
      } catch {
        // user dismissed the share sheet
      }
    }
  }

  if (!view) {
    return (
      <ScreenContainer>
        <Header title={code ? `Room ${code}` : 'Room'} onBack={() => router.replace('/')} />
        <ActivityIndicator size="large" color={colors.felt} style={styles.loader} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={view.phase !== 'playing'}>
      <Header title={`Room ${view.code}`} onBack={() => router.replace('/')} />

      {status === 'reconnecting' ? (
        <View style={styles.reconnectBanner}>
          <Text style={styles.reconnectText}>Reconnecting...</Text>
        </View>
      ) : null}

      {error ? (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>{error} (tap to dismiss)</Text>
        </Pressable>
      ) : null}

      {view.phase === 'lobby' ? (
        <LobbySection
          view={view}
          joinLink={joinLink}
          isHost={isHost}
          copied={copied}
          onStart={start}
          onShare={() => void onShare()}
        />
      ) : null}

      {view.phase === 'playing' ? (
        <LiveTable
          view={view}
          humanSeat={humanSeat}
          selected={selected}
          onToggle={toggleCard}
          onPlay={onPlay}
          onPass={pass}
          selLegal={selLegal}
          seconds={seconds}
          isMyTurn={isMyTurn}
        />
      ) : null}

      {view.phase === 'finished' ? (
        <FinishedSection view={view} onHome={() => router.replace('/')} />
      ) : null}
    </ScreenContainer>
  );
}

// --- Lobby -------------------------------------------------------------------

function LobbySection({
  view,
  joinLink,
  isHost,
  copied,
  onStart,
  onShare,
}: {
  view: OnlineRoomView;
  joinLink: string;
  isHost: boolean;
  copied: boolean;
  onStart: () => void;
  onShare: () => void;
}) {
  const emptySeats = Math.max(0, view.seats - view.players.length);

  return (
    <>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Players</Text>
        {view.players.map((p) => (
          <View key={p.seat} style={styles.playerRow}>
            <Text style={styles.playerName} numberOfLines={1}>
              {p.username ?? 'Player'}
            </Text>
            <Text style={styles.playerStatus}>{p.connected ? 'Connected' : 'Waiting'}</Text>
          </View>
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.playerRow}>
            <Text style={styles.playerNameEmpty}>Open seat</Text>
            <Text style={styles.playerStatusEmpty}>Bot if unfilled</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Invite</Text>
        <Text style={styles.roomCode}>{view.code}</Text>
        <Text style={styles.roomLink} numberOfLines={1}>
          {joinLink}
        </Text>
        <Button title={copied ? 'Copied' : 'Share link'} variant="secondary" onPress={onShare} style={styles.shareBtn} />
      </Card>

      {isHost ? (
        <Button title="Start game" onPress={onStart} />
      ) : (
        <Text style={styles.waitingHost}>Waiting for the host to start.</Text>
      )}
    </>
  );
}

// --- Live table ---------------------------------------------------------------

function LiveTable({
  view,
  humanSeat,
  selected,
  onToggle,
  onPlay,
  onPass,
  selLegal,
  seconds,
  isMyTurn,
}: {
  view: OnlineRoomView;
  humanSeat: number | null;
  selected: CardT[];
  onToggle: (c: CardT) => void;
  onPlay: () => void;
  onPass: () => void;
  selLegal: boolean;
  seconds: number | null;
  isMyTurn: boolean;
}) {
  const opponents = view.players.filter((p) => p.seat !== humanSeat).sort((a, b) => a.seat - b.seat);
  const lastPlay = view.trickHistory[0];
  const currentSeat = view.handState?.currentPlayerIndex ?? null;
  const canPass = isMyTurn && !!view.handState?.leadCombo;

  return (
    <View style={styles.tableWrap}>
      <View style={styles.oppRow}>
        {opponents.map((p) => (
          <View
            key={p.seat}
            style={[
              styles.oppBox,
              currentSeat === p.seat && styles.oppBoxActive,
              p.kind === 'human' && !p.connected && styles.oppBoxLeft,
            ]}
          >
            <Text style={styles.oppName} numberOfLines={1}>
              {p.username ?? (p.kind === 'bot' ? `Bot ${p.seat + 1}` : 'Player')}
            </Text>
            <OpponentCardStack count={p.handCount} small />
            {p.kind === 'human' && !p.connected ? (
              <Text style={styles.oppLeft}>LEFT TABLE</Text>
            ) : (
              <Text style={styles.oppCount}>{p.handCount} cards</Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.center}>
        <Text style={styles.turnLabel}>
          {isMyTurn ? 'Your turn' : currentSeat != null ? `${playerLabel(view, currentSeat)} to play` : ''}
        </Text>
        {isMyTurn && seconds !== null ? <Text style={styles.timer}>{seconds}s</Text> : null}
        {lastPlay ? (
          <View style={styles.trickCards}>
            {lastPlay.combo.cards.map((c, i) => (
              <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -22 }}>
                <PlayingCard card={c} />
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.trickEmpty}>No plays yet</Text>
        )}
      </View>

      <View style={styles.handRow}>
        {(view.yourHand ?? []).map((c) => (
          <Pressable key={c.id} onPress={() => onToggle(c)} style={styles.handCard}>
            <PlayingCard card={c} selected={!!selected.find((s) => s.id === c.id)} />
          </Pressable>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <Button title="Pass" variant="secondary" disabled={!canPass} onPress={onPass} style={styles.actionBtn} />
        <Button title="Play" disabled={!isMyTurn || !selLegal} onPress={onPlay} style={styles.actionBtn} />
      </View>
    </View>
  );
}

// --- Finished ------------------------------------------------------------------

function FinishedSection({ view, onHome }: { view: OnlineRoomView; onHome: () => void }) {
  return (
    <>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Finish order</Text>
        {view.finishOrder.map((seat, i) => (
          <View key={seat} style={styles.playerRow}>
            <Text style={styles.finishPlace}>{i + 1}.</Text>
            <Text style={styles.playerName} numberOfLines={1}>
              {playerLabel(view, seat)}
            </Text>
          </View>
        ))}
      </Card>
      <Button title="Back to home" onPress={onHome} />
    </>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xl },
  reconnectBanner: {
    backgroundColor: withAlpha(colors.gold, 0.18),
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  reconnectText: { color: colors.felt, fontWeight: '700', fontSize: typography.caption.fontSize, textAlign: 'center' },
  errorBanner: {
    backgroundColor: colors.dangerSoftBg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.dangerSoftBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: { color: colors.dangerSoftText, fontSize: typography.caption.fontSize, textAlign: 'center' },

  section: { marginBottom: spacing.md },
  sectionTitle: { ...typography.label, color: colors.felt, fontWeight: '700', marginBottom: spacing.sm },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  playerName: { ...typography.bodyBold, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  playerStatus: { ...typography.caption, color: colors.textMuted },
  playerNameEmpty: { ...typography.body, color: colors.textFaint, flex: 1, marginRight: spacing.sm },
  playerStatusEmpty: { ...typography.caption, color: colors.textFaint },
  roomCode: { fontSize: 28, fontWeight: '800', color: colors.felt, letterSpacing: 4, marginBottom: spacing.xs },
  roomLink: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  shareBtn: { alignSelf: 'stretch' },
  waitingHost: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },

  finishPlace: { ...typography.subheading, color: colors.felt, width: 32 },

  // Live table
  tableWrap: { flex: 1, width: '100%' },
  oppRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm },
  oppBox: {
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radii.md,
    minWidth: 90,
  },
  oppBoxActive: { backgroundColor: withAlpha(colors.gold, 0.12), borderWidth: 1, borderColor: colors.gold },
  // A seat whose human walked away: dimmed, with a red LEFT TABLE tag in place
  // of the card count. They keep auto-passing until they reconnect.
  oppBoxLeft: { opacity: 0.55 },
  oppName: { ...typography.caption, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs, maxWidth: 100 },
  oppCount: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.xs },
  oppLeft: {
    ...typography.tiny,
    color: colors.dangerSoftText,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  turnLabel: { ...typography.subheading, color: colors.felt, marginBottom: spacing.xs },
  timer: { ...typography.heading, fontSize: 22, color: colors.dangerSoftText, marginBottom: spacing.sm },
  trickCards: { flexDirection: 'row', justifyContent: 'center' },
  trickEmpty: { ...typography.body, color: colors.textFaint },

  handRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  handCard: { marginBottom: spacing.xs },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionBtn: { minWidth: 120 },
});
