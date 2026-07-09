// Local (bot) game screen. Reads ?bots=N from the URL, creates a LocalGame,
// and renders the table. No Supabase, no realtime — pure client state.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { detectCombo, canPlay } from '../lib/pusoy/combo';
import {
  checkTimeout,
  createLocalGame,
  findHumanSeat,
  humanAct,
  publicView,
  subscribe,
  TURN_DURATION_MS,
  type LocalGame,
} from '../lib/pusoy/localGame';
import type { Card, PlayedCombo } from '../lib/pusoy/types';

const RANK_DISPLAY: Record<Card['rank'], string> = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', J: 'J', Q: 'Q', K: 'K', A: 'A', '2': '2',
};
const SUIT_GLYPH: Record<Card['suit'], string> = {
  C: '♣', D: '♦', H: '♥', S: '♠',
};
const SUIT_COLOR: Record<Card['suit'], string> = {
  C: '#222', D: '#c0392b', H: '#c0392b', S: '#222',
};

function cardLabel(c: Card): string {
  return `${RANK_DISPLAY[c.rank]}${SUIT_GLYPH[c.suit]}`;
}

function comboLabel(combo: PlayedCombo): string {
  const cards = combo.cards.map(cardLabel).join(' ');
  if (combo.fiveType) {
    const pretty =
      combo.fiveType === 'fourOfAKind'
        ? 'Four of a kind'
        : combo.fiveType === 'fullHouse'
        ? 'Full house'
        : combo.fiveType === 'flush'
        ? 'Flush'
        : combo.fiveType === 'straightFlush'
        ? 'Straight flush'
        : 'Straight';
    return `${pretty}: ${cards}`;
  }
  if (combo.type === 'single') return `Single: ${cards}`;
  if (combo.type === 'pair') return `Pair: ${cards}`;
  return `Three of a kind: ${cards}`;
}

// Card visual. A rounded rectangle with the rank + suit glyph.
function CardView({ card, small = false, faceDown = false }: { card?: Card; small?: boolean; faceDown?: boolean }) {
  const w = small ? 36 : 56;
  const h = small ? 52 : 80;
  if (faceDown || !card) {
    return (
      <View
        style={[
          styles.card,
          { width: w, height: h, backgroundColor: '#0e4a3a', borderColor: '#0e4a3a' },
        ]}
      >
        <Text style={{ color: '#fff', fontSize: small ? 14 : 22, fontWeight: '700' }}>?</Text>
      </View>
    );
  }
  return (
    <View style={[styles.card, { width: w, height: h }]}>
      <Text
        style={{
          color: SUIT_COLOR[card.suit],
          fontSize: small ? 14 : 22,
          fontWeight: '700',
        }}
      >
        {RANK_DISPLAY[card.rank]}
        {SUIT_GLYPH[card.suit]}
      </Text>
    </View>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function LocalGameScreen() {
  const params = useLocalSearchParams<{ bots: string }>();
  const router = useRouter();
  const botCount = Math.max(1, Math.min(3, Number(params.bots) || 1));

  const [game, setGame] = useState<LocalGame | null>(null);
  // Incrementing tick state to force re-render on bot moves.
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const g = createLocalGame(botCount, 'You');
    setGame(g);
    const unsub = subscribe(g, () => setTick((t) => t + 1));
    return () => {
      unsub();
    };
  }, [botCount]);

  // Timer re-render
  const now = useNow(200);

  // Timeout checker
  useEffect(() => {
    if (!game) return;
    const t = setInterval(() => {
      checkTimeout(game);
      setTick((x) => x + 1);
    }, 500);
    return () => clearInterval(t);
  }, [game]);

  const humanSeat = useMemo(() => (game ? findHumanSeat(game) : 0), [game]);
  const view = useMemo(() => (game ? publicView(game, humanSeat) : null), [game, humanSeat, tick]);
  const myHand = game?.hands[humanSeat] ?? [];

  if (!game || !view) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Loading…</Text>
      </SafeAreaView>
    );
  }

  const currentSeat = view.handState.currentPlayerIndex;
  const isMyTurn = currentSeat === humanSeat;
  const turnLeftMs = view.handState.turnDeadline
    ? Math.max(0, view.handState.turnDeadline - now)
    : 0;
  const turnLeftPct = Math.min(100, (turnLeftMs / TURN_DURATION_MS) * 100);

  const onPlay = () => {
    setError(null);
    if (selected.length === 0) {
      setError('Pick cards to play');
      return;
    }
    try {
      humanAct(game, { kind: 'play', combo: { ...detectCombo(selected), cards: selected } as PlayedCombo }, selected);
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onPass = () => {
    setError(null);
    try {
      humanAct(game, { kind: 'pass' });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onRestart = () => {
    router.replace({ pathname: '/game-local', params: { bots: botCount } });
  };

  const toggleCard = (c: Card) => {
    setSelected((sel) => {
      if (sel.find((s) => s.id === c.id)) {
        return sel.filter((s) => s.id !== c.id);
      }
      return [...sel, c];
    });
  };

  // The "current trick" pile: shows the lead combo at the center.
  const lead = view.handState.leadCombo;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top: opponents */}
      <View style={styles.opponentsRow}>
        {[1, 2, 3].map((offset) => {
          const seat = (humanSeat + offset) % 4;
          if (seat === humanSeat) return null;
          const isCurrent = currentSeat === seat && !view.finishedAt;
          const isBot = game.playerKinds[seat] === 'bot';
          const finished = view.handState.finishedOrder.includes(seat);
          return (
            <View
              key={seat}
              style={[
                styles.opponent,
                isCurrent && styles.opponentCurrent,
                finished && styles.opponentDone,
              ]}
            >
              <Text style={styles.oppLabel}>
                {isBot ? `Bot ${seat}` : `P${seat}`}
                {finished ? ' ✓' : ''}
              </Text>
              <View style={styles.oppHand}>
                {Array.from({ length: view.handSizes[seat] }).map((_, i) => (
                  <View key={i} style={{ marginLeft: i === 0 ? 0 : -18 }}>
                    <CardView faceDown small />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {/* Center: trick pile + status */}
      <View style={styles.center}>
        {view.finishedAt ? (
          <View style={styles.finishBox}>
            <Text style={styles.finishTitle}>Hand complete</Text>
            <Text style={styles.finishText}>
              {view.finishOrder
                .map((s, i) => `${i + 1}. ${s === humanSeat ? 'You' : game.playerKinds[s] === 'bot' ? `Bot ${s}` : `P${s}`}`)
                .join('\n')}
            </Text>
            <Pressable style={styles.btn} onPress={onRestart}>
              <Text style={styles.btnText}>Play again</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: '#666' }]}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.btnText}>Home</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.trickBox}>
              {lead ? (
                <>
                  <Text style={styles.trickLabel}>Last play</Text>
                  <Text style={styles.trickText}>{comboLabel(lead)}</Text>
                </>
              ) : (
                <Text style={styles.trickMuted}>
                  {isMyTurn ? 'Your turn — lead a play' : `${game.playerKinds[currentSeat] === 'bot' ? `Bot ${currentSeat}` : `P${currentSeat}`} to lead`}
                </Text>
              )}
            </View>
            {/* Turn timer bar */}
            <View style={styles.timerBarBg}>
              <View
                style={[styles.timerBarFg, { width: `${turnLeftPct}%` }]}
              />
            </View>
            <Text style={styles.timerText}>
              {Math.ceil(turnLeftMs / 1000)}s
              {isMyTurn ? ' — your turn' : ''}
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </View>

      {/* Bottom: human's hand */}
      <View style={styles.handArea}>
        <View style={styles.handRow}>
          {myHand.map((c) => {
            const isSelected = !!selected.find((s) => s.id === c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => isMyTurn && toggleCard(c)}
                style={{ marginLeft: 0 }}
              >
                <View
                  style={[
                    isSelected && styles.cardSelected,
                  ]}
                >
                  <CardView card={c} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.btn, !isMyTurn && styles.btnDisabled]}
            disabled={!isMyTurn}
            onPress={onPlay}
          >
            <Text style={styles.btnText}>Play</Text>
          </Pressable>
          <Pressable
            style={[
              styles.btn,
              styles.btnPass,
              (!isMyTurn || view.handState.leadCombo === null) && styles.btnDisabled,
            ]}
            disabled={!isMyTurn || view.handState.leadCombo === null}
            onPress={onPass}
          >
            <Text style={styles.btnText}>Pass</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e4a3a', padding: 12 },
  opponentsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    minHeight: 90,
  },
  opponent: {
    alignItems: 'center',
    padding: 4,
    borderRadius: 8,
  },
  opponentCurrent: { backgroundColor: 'rgba(255,255,255,0.15)' },
  opponentDone: { opacity: 0.5 },
  oppLabel: { color: '#fff', fontWeight: '600', fontSize: 12, marginBottom: 4 },
  oppHand: { flexDirection: 'row' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  trickBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    borderRadius: 12,
    minWidth: 240,
    alignItems: 'center',
  },
  trickLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 },
  trickText: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  trickMuted: { color: 'rgba(255,255,255,0.8)', fontSize: 16, textAlign: 'center' },
  finishBox: {
    backgroundColor: '#f4f1e8',
    padding: 22,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 240,
  },
  finishTitle: { fontSize: 22, fontWeight: '800', color: '#0e4a3a', marginBottom: 8 },
  finishText: { color: '#222', fontSize: 16, lineHeight: 24, marginBottom: 16 },
  timerBarBg: {
    width: '90%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginTop: 18,
    overflow: 'hidden',
  },
  timerBarFg: { height: '100%', backgroundColor: '#f1c40f' },
  timerText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 },
  handArea: { paddingTop: 12, paddingBottom: 8 },
  handRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#f4f1e8',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  cardSelected: {
    transform: [{ translateY: -12 }],
    shadowColor: '#f1c40f',
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around' },
  btn: {
    backgroundColor: '#1c7a5d',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  btnPass: { backgroundColor: '#7f8c8d' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#ff6b6b', marginTop: 8 },
});
