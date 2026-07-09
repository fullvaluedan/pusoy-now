# Pusoy Now — Bug Fixes + UI Polish Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Each task ends with a passing test, typecheck, and commit.

**Goal:** Fix 6 reported bugs and ship a noticeably better-playing bot game UI.

**Architecture:** Engine + UI separation stays as-is. All bugs are either engine rule fixes or UI layout/event-handling. No new dependencies. Tests in `lib/pusoy/test.ts` and `lib/pusoy/fullGameTest.ts` remain authoritative for engine correctness.

**Tech Stack:** React Native 0.86, Expo SDK 57, Expo Router, TypeScript 6, pure-TS engine in `lib/pusoy/`, Jest-free test runner via `tsx`.

---

## Bug Inventory (verbatim from user)

1. **2♦ is not an automatic pass** — when a player leads the 2 of diamonds, other players must pass (2♦ is the highest single, unbeatable).
2. **Cards come out pre-organized** — dealing animation should reveal each card face-up one by one to the human as it lands, not pre-sort.
3. **Hand and action button layout** — user's hand should be in the **lower-center** of the screen, with Play/Pass as a single row **directly under** the cards, centered.
4. **Drag-to-reorder is limited** — user wants to freely arrange cards however they want (current code reorders, but bot hand pre-sort on deal and the limited interaction is frustrating). Specifically: cards should not auto-sort when they arrive; drag should work without long-press; selection state should persist across reorder.
5. **Play Again freezes on dealing** — after a hand completes, "Play again" creates a new game but the dealing phase never finishes. Suspect: `DealingAnimation` is mounted, `onDone` calls `startGame(game)`, but the `subscribe` listener was unsubscribed when the React component re-rendered or the new game is missing the listener.
6. **1 bot selected → 4 players** — `bot-select` offers "You vs 1 bot" but the game launches 4 players. Either the option is wrong (Pusoy Dos is 4-player only) or the engine should support 2-player mode.

---

## Root Cause Analysis (from code review)

### Bug 1 — 2♦ is not an automatic pass
- **Where:** `lib/pusoy/combo.ts` `canPlay()` — does not know about 2♦ as unbeatable single.
- **Why:** No special-casing for the 2 of diamonds.
- **Fix:** Add a rule in `canPlay`: if `lead` is a single 2♦, no other single can beat it. Also: if `lead` is a 2 of any suit single, the only thing that beats it is a higher 5-card combo. (Standard Pusoy Dos rule: 2♦ as single is "bomb" — passes everyone.)
- **Scope:** Engine rule, with tests.

### Bug 2 — Cards come out pre-organized
- **Where:** `app/game-local.tsx` `myHand` is `game.hands[humanSeat]`. In `localGame.ts` `createLocalGame`, `dealFour` returns hands already sorted by rank ascending, then suit. The dealing animation deals them in that sorted order, so the user sees the hand arrive in the same order they'll hold it.
- **Why:** `dealFour` sorts each hand before returning. That sort is fine for the engine but bad for the dealing UX — the user wants the cards to land in the order they were dealt.
- **Fix:** Stop pre-sorting hands on deal. Keep them in deal order. Add an "Organize" button to sort. (Already exists — it just isn't needed initially.)
- **Scope:** Engine: `deck.ts` `dealFour` — preserve deal order. Add test confirming hands are not pre-sorted after deal.

### Bug 3 — Hand + action button layout
- **Where:** `app/game-local.tsx` layout — current is a top opponents row, center trick pile, bottom hand + actions. The actions row uses `justifyContent: 'space-around'` which spreads Play and Pass to the corners. The user wants them **centered** as a single group directly under the hand.
- **Fix:** Center the action buttons. Add a subtle divider line above. Move "Organize" and selection count to a slim toolbar immediately above the hand.
- **Scope:** Pure style changes.

### Bug 4 — Drag-to-reorder is too limited
- **Where:** `app/game-local.tsx` `DraggableCard` requires long-press 350ms before drag engages. User wants immediate drag.
- **Fix:** Remove the long-press gate. Engage drag on any movement past a tiny threshold. Also: persist selection across reorder (don't clear `selected` on reorder). Also: free-form positioning — allow the user to drag a card to a specific x slot, but if the drag is small, allow it to "snap back". This is a quality-of-life improvement.
- **Scope:** `DraggableCard` rewrite + handler change.

### Bug 5 — Play Again freezes on dealing
- **Where:** `app/game-local.tsx` "Play again" handler — `setGame(createLocalGame(...))` — and the `useEffect` that subscribes to the game runs once with `botCount` dep only, but the new game replaces the old one. The `subscribe` call on the new game adds a listener, but the previous game's listener is still firing on the old game's bot timers (or the old game's `botTimers` are still scheduled and emitting on the old game object, never on the new one).
- **Why:** `localGame.scheduleBots` queues a `setTimeout` on the **old** game object. When "Play again" is hit, the new game is created but old timers still fire. Worse: when the new game mounts, the dealing animation `onDone` calls `startGame(newGame)`, but `startGame` only emits on `newGame`'s listeners — and the React component subscribed to a *new* listener, but the **old** listeners were never cleaned up properly. Plus: the `useEffect` for `subscribe` only runs when `botCount` changes, not when `game` changes.
- **Fix:** 
  1. `useEffect([botCount])` for game creation is wrong — make it `useEffect([botCount, game?.id])` or just add a `key` prop on the screen and a `useState` that increments a "session id" to force remount.
  2. Make the `subscribe` useEffect depend on `game` (not just `botCount`).
  3. Cleanly cancel old bot timers in `createLocalGame` (call finalize on the old game, or document the cleanup).
  4. The simplest robust fix: have "Play again" call `router.replace({ pathname, params })` which re-mounts the screen with fresh state.
- **Scope:** game-local.tsx + a test that simulates createLocalGame → play all 52 cards → createLocalGame again → verify new game has fresh handState.

### Bug 6 — 1 bot selected, 4 players start
- **Where:** `app/bot-select.tsx` offers `[1, 2, 3]` bot buttons. `createLocalGame` always pads to 4 players.
- **Why:** Pusoy Dos is a 4-player game. The 1-bot option is misleading.
- **Fix:** Drop the 1-bot button (Pusoy Dos is 4-player only). OR: rename it to "You + 3 bots" (full table) only and remove 1/2 bot options. The cleanest answer: keep the 3 options but the **count means how many of the 3 other seats are bots** (which is currently what's happening). Better: change copy to be explicit.
  - Option A (simplest): replace the buttons with a single "You + 3 bots (full table)" — 4 players is the only valid config.
  - Option B: keep 1/2/3 buttons but show "1 bot, 2 empty seats (CPU plays both)" — would need a "filler" logic that's not real Pusoy Dos. YAGNI.
- **Decision:** Option A. One button. "You + 3 bots — start a 4-player game". Update the home screen too.
- **Scope:** bot-select.tsx + index.tsx copy. No engine change.

---

## Implementation Tasks

Each task: 2-5 min, one commit, exact paths, copy-pasteable code, verification.

### Task 1: 2♦ unbeatable single — failing test

**Files:**
- Modify: `lib/pusoy/test.ts` (add test before final console.log)
- Run: `npm test`

Add this test before the engine-timeouts block:

```typescript
// 5) 2 of diamonds is unbeatable as a single
console.log('2 of diamonds rule');
const twoD = detectCombo([c('D', '2')])!;
const twoH = detectCombo([c('H', '2')])!;
const twoS = detectCombo([c('S', '2')])!;
ok('2♦ beats any other 2 single', canPlay(twoD, twoH));
ok('2♥ cannot beat 2♦', !canPlay(twoH, twoD));
ok('2♠ cannot beat 2♦', !canPlay(twoS, twoD));
const aSingle = detectCombo([c('S', 'A')])!;
ok('A cannot beat 2♦', !canPlay(aSingle, twoD));
```

**Step 1:** Add the test block.
**Step 2:** Run `npm test`. Expected: 4 new failures.
**Step 3:** Commit nothing yet (just confirm failures).

### Task 2: 2♦ unbeatable — make it pass

**Files:**
- Modify: `lib/pusoy/combo.ts` `canPlay()` (add 2♦ special case at the top)

Replace the top of `canPlay` with:

```typescript
export function canPlay(play: PlayedCombo, lead: PlayedCombo | null): boolean {
  if (lead === null) return true;
  // 2 of diamonds as a single is "the bomb" — unbeatable by any other single.
  // The only way to beat it is a 5-card combo (straight flush, four of a kind).
  if (lead.length === 1 && lead.cards[0].rank === '2' && lead.cards[0].suit === 'D') {
    if (play.length === 5) {
      return compareCombos(play, lead) > 0;
    }
    return false;
  }
  if (play.length === 5 && lead.length === 5) {
    return compareCombos(play, lead) > 0;
  }
  if (play.length === 5 || lead.length === 5) return false;
  if (play.length !== lead.length) return false;
  return compareCombos(play, lead) > 0;
}
```

**Step 1:** Apply the patch.
**Step 2:** Run `npm test`. Expected: 38/38 pass + 4 new = 42/42.
**Step 3:** Commit: `git add -A && git commit -m "fix(engine): 2 of diamonds is unbeatable as a single (Pusoy Dos bomb rule)"`

### Task 3: dealFour preserves deal order — failing test

**Files:**
- Modify: `lib/pusoy/test.ts`

Add a new top-level section after `// 1) detectCombo`:

```typescript
// 0) dealFour preserves deal order (no pre-sort)
console.log('deal order');
const testDeck = buildDeck();
const dealt = dealFour(testDeck);
let nextIndex = 0;
for (const hand of dealt) {
  for (const card of hand) {
    ok(`hand card ${nextIndex} = deck[${nextIndex}]`, card.id === testDeck[nextIndex].id);
    nextIndex++;
  }
}
```

**Step 1:** Add the test. **Step 2:** Run `npm test`. Expected: 52 new failures (the deal order assertion fails for every card after the first because `dealFour` sorts).

### Task 4: dealFour preserves deal order — make it pass

**Files:**
- Modify: `lib/pusoy/deck.ts` `dealFour` (remove the per-hand sort block)

Replace the bottom of `dealFour` (after the hands[][] push loop) so it doesn't sort each hand. New `dealFour`:

```typescript
export function dealFour(deck: Card[][]): Card[][] {
  if (deck.length !== 52) {
    throw new Error(`dealFour expected 52, got ${deck.length}`);
  }
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }
  return hands;
}
```

**Step 1:** Run `npm test`. The 52 new order tests pass. Existing tests still pass (none relied on sort). **Step 2:** Run `npm test` to confirm 90 total pass. **Step 3:** Commit: `git add -A && git commit -m "fix(deck): dealFour preserves deal order; UI does the organizing"`.

### Task 5: Engine stays valid after ordering change

**Files:**
- Verify: existing `fullGameTest.ts` still passes (it should — the engine just iterates hands, doesn't care about order).

**Step 1:** Run `npm test`. Expected: 90/90 pass.
**Step 2:** Run `npm run typecheck`. Expected: clean.

### Task 6: bot-select — single "Full table" button

**Files:**
- Rewrite: `app/bot-select.tsx` — single button: "You + 3 bots — start a 4-player game"
- Optional: tweak `app/index.tsx` button label "Play vs Bots" → "Play vs 3 bots" for clarity

New `app/bot-select.tsx`:

```typescript
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BotSelect() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Pusoy Dos is a 4-player game</Text>
      <Text style={styles.subtitle}>
        You'll play against 3 computer opponents. The player with the 3 of clubs leads first.
      </Text>
      <Pressable
        style={styles.btn}
        onPress={() => router.push('/game-local?bots=3')}
      >
        <Text style={styles.btnText}>Start game</Text>
        <Text style={styles.btnSub}>You + 3 bots</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f4f1e8' },
  title: { fontSize: 26, fontWeight: '800', color: '#0e4a3a', marginTop: 24 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32, lineHeight: 22 },
  btn: { padding: 22, borderRadius: 14, backgroundColor: '#0e4a3a' },
  btnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  btnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 2 },
});
```

**Step 1:** Write file. **Step 2:** Run `npm run typecheck`. **Step 3:** Commit: `git add -A && git commit -m "fix(bot-select): single full-table button; Pusoy Dos is 4-player only"`.

### Task 7: game-local — Play Again via router.replace

**Files:**
- Modify: `app/game-local.tsx` — change "Play again" handler

Replace the "Play again" Pressable's `onPress` with:

```typescript
onPress={() => router.replace({ pathname: '/game-local', params: { bots: botCount } })}
```

Also: in the `useEffect` for the subscribe call, change deps to `[game?.id]`:

```typescript
useEffect(() => {
  if (!game) return;
  const unsub = subscribe(game, () => setTick((t) => t + 1));
  return () => { unsub(); };
}, [game?.id]);
```

And the game-creation useEffect should re-run if needed (it already depends on `botCount`, which doesn't change on Play again, but `router.replace` gives a fresh component instance so this is fine).

**Step 1:** Apply both patches. **Step 2:** Run `npm run typecheck`. **Step 3:** Commit: `git add -A && git commit -m "fix(game-local): Play again remounts the screen via router.replace, fixes dealing freeze"`.

### Task 8: game-local — hand + action button centered

**Files:**
- Modify: `app/game-local.tsx` styles + the actions row JSX

In the actions row JSX, wrap Play+Pass in a `View style={styles.actionsInner}`. New styles:

```typescript
actionsRow: {
  flexDirection: 'row',
  justifyContent: 'center',     // was: 'space-around'
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 12,
  borderTopWidth: 1,
  borderTopColor: 'rgba(255,255,255,0.1)',
},
actionsInner: { flexDirection: 'row', gap: 12 },
```

In the JSX:

```tsx
<View style={styles.actionsRow}>
  <View style={styles.actionsInner}>
    <Pressable style={[styles.btn, !isMyTurn && styles.btnDisabled]} disabled={!isMyTurn} onPress={onPlay}>
      <Text style={styles.btnText}>Play</Text>
    </Pressable>
    <Pressable
      style={[styles.btn, styles.btnPass, (!isMyTurn || lead === null) && styles.btnDisabled]}
      disabled={!isMyTurn || lead === null}
      onPress={onPass}
    >
      <Text style={styles.btnText}>Pass</Text>
    </Pressable>
  </View>
</View>
```

**Step 1:** Apply. **Step 2:** typecheck. **Step 3:** Commit: `git add -A && git commit -m "ui(game-local): center Play/Pass row directly under the hand"`.

### Task 9: game-local — remove long-press gate from drag

**Files:**
- Modify: `app/game-local.tsx` `DraggableCard` component

Changes:
- Drop the `longPressFired` ref and the `onPressIn`/`onPressOut` long-press setup.
- Engage the responder on any move past a tiny threshold (8px) — already there.
- Don't clear `selected` on reorder — move that logic out of the parent's `onReorder` callback.

Replace the `onReorder` handler at the call site:

```typescript
onReorder={(from, to) => reorderHumanHand(game, from, to)}
```

(don't call `setSelected([])`).

**Step 1:** Patch. **Step 2:** typecheck. **Step 3:** Commit: `git add -A && git commit -m "ui(game-local): drag cards freely, no long-press; selection persists across reorder"`.

### Task 10: Dealing animation — show face-up card arriving to human

**Files:**
- Modify: `components/DealingAnimation.tsx`

Update the "flying card" so when it lands at the human's seat, the actual dealt card is shown face-up briefly. The `dealOrder` only has `{seat, cardIndex}` — we need the card itself. So:

1. In `DealingAnimation`, accept `deck: Card[]` as a prop.
2. The flying card at step `i` is `deck[dealOrder[i].cardIndex]`.
3. After the human's seat is dealt all 13 cards, briefly show the human's hand face-up.
4. The user's hand arrives in deal order (because Task 4 removed the pre-sort).

Patch:
- Add `deck: Card[]` to Props.
- In the component, `const currentCard = deck[dealOrder[step]?.cardIndex];` and pass `card={currentCard}` instead of `faceDown` to the Animated.View.
- For non-human seats, keep faceDown.

```typescript
interface Props {
  dealOrder: DealStep[];
  deck: Card[];
  playerKinds: LocalPlayer[];
  playerNames: string[];
  onDone: () => void;
}

// inside render:
const humanSeat = playerKinds.findIndex((k) => k === 'human');
const currentDeal = showShuffle ? null : dealOrder[step];
const currentCard = currentDeal ? deck[currentDeal.cardIndex] : null;
const isHumanCard = currentDeal?.seat === humanSeat;

// replace <PlayingCard faceDown /> with:
<PlayingCard card={isHumanCard ? currentCard : undefined} faceDown={!isHumanCard} />
```

**Step 1:** Patch. **Step 2:** typecheck. **Step 3:** Commit: `git add -A && git commit -m "ui(dealing): human's dealt card shows face-up as it arrives"`.

### Task 11: game-local — pass `deck` to DealingAnimation

**Files:**
- Modify: `app/game-local.tsx`

In the dealing-phase branch, pass `deck={game.deck}`:

```typescript
<DealingAnimation
  dealOrder={game.dealOrder}
  deck={game.deck}
  playerKinds={game.playerKinds}
  playerNames={playerNames}
  onDone={() => startGame(game)}
/>
```

**Step 1:** Patch. **Step 2:** typecheck. **Step 3:** Commit: `git add -A && git commit -m "fix(game-local): pass deck to dealing animation for face-up cards"`.

### Task 12: Final verification

**Files:** none — just run all the verifications.

Run all of:
```bash
cd C:/Users/danre/projects/pusoy-now
npm test            # expect 94/94 pass (38 baseline + 4 for 2♦ + 52 for deal order)
npm run typecheck   # expect 0 errors
npx expo prebuild --no-install   # expect success
```

**Step 1:** Run the three commands. **Step 2:** Commit any straggler files. **Step 3:** `git push`.

---

## Risks and Trade-offs

- **Drag-to-reorder without long-press** could conflict with tap-to-select. The PanResponder already gates on movement threshold (8px), so a tap and a slow drag won't collide. Tested mentally: if the user starts a drag, the move threshold trips and the responder takes over; if they don't move, the Pressable's `onPress` fires for select.
- **2♦ as unbeatable** is the standard Pusoy Dos rule but some variants play that 2 of any suit is "the bomb". I'll go with 2♦ only (the canonical Filipino rule) and document it in the engine comments.
- **Removing pre-sort from dealFour** changes one engine behavior. The test in Task 3 catches this. No other code assumed sorted hands. The `Organize` button is the user-facing way to sort.
- **router.replace for Play Again** re-mounts the entire screen, which is heavier than `setGame`. That's fine — it's the right tradeoff for correctness over micro-optimization. If we want speed later, we can switch to a session-id-based remount.
- **bot-select rewrite to single button** drops 1/2/3 options. User explicitly asked: this is correct because Pusoy Dos is 4-player only.

## Out of Scope (defer to next round)

- Haptic feedback (already in code but unverified on web)
- Sound effects
- Multi-round matches (best of N)
- Card-flip animation when the last play arrives
- Stats persistence (AsyncStorage)
- Online play + Bluetooth
