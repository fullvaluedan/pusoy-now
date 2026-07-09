# Pusoy Now

A 4-player Pusoy Dos card game for iOS and Android. Built with React Native + Expo.

## What's in this vertical slice

- **Full Pusoy Dos game engine** — singles, pairs, three-of-a-kind, and all five 5-card combos (straight, flush, full house, four of a kind, straight flush). 4-player rotation, 15s turn timer, pass mechanic, hand end detection. Pure TypeScript, no React Native imports in the engine so it's testable in Node.
- **Bot mode** — 1 human vs 1, 2, or 3 bot players. Bots use a legal-play picker that prefers discarding weak cards first. 38 unit + integration tests passing.
- **Online + social login scaffolding** — Supabase client, SQL schema, RLS policies, head-to-head stats trigger. All four social logins (Apple, Google, Facebook, X, TikTok) are wired as buttons but need provider keys to actually authenticate.
- **Lobby + leaderboard + stats screens** — UI shell ready, real data hooks into Supabase (not implemented in this slice).
- **Bluetooth stub** — `/bluetooth-info` explains what's needed (dev client + react-native-nearby-connection). Not implemented in this slice.

## Run

```bash
npm install
npm start                # opens Expo dev server
npm run android          # native Android
npm run ios              # native iOS (macOS only, or use Expo Go)
npm test                 # runs the engine + game tests (38/38)
npm run typecheck        # tsc --noEmit
```

## Project layout

```
app/                     Expo Router screens (file-based routing)
  _layout.tsx            root navigator
  index.tsx              home — mode picker
  bot-select.tsx         pick 1, 2, or 3 bots
  game-local.tsx         full game UI (drives lib/pusoy/localGame.ts)
  sign-in.tsx            social login (stub — needs Supabase config)
  lobby.tsx              online lobby (stub)
  leaderboard.tsx        global wins/losses
  stats.tsx              your stats + head-to-head records
  bluetooth-info.tsx     BT plan
  settings.tsx
lib/pusoy/               the game (no UI deps)
  types.ts               Card, GameState, HandState, etc.
  deck.ts                52-card deck, dealFour
  combo.ts               detectCombo, compareCombos, canPlay
  engine.ts              applyAction, newHand, isHandOver, TURN_MS=15_000
  bot.ts                 botChoose: legal-play picker
  localGame.ts           in-memory game container used by game-local.tsx
  supabase.ts            (see lib/supabase/client.ts for the client)
  test.ts                engine unit tests
  fullGameTest.ts        end-to-end: 4 bots play a real hand
lib/supabase/
  client.ts              Supabase client + SecureStore auth storage
supabase/
  schema.sql             full schema, RLS, h2h trigger
```

## Rules

Pusoy Dos (Filipino "13 cards"). 4 players, 13 cards each. Play to the right of the lead; singles, pairs, or three-of-a-kind must be beaten by the same length and a higher rank. 5-card hands (straight, flush, full house, four of a kind, straight flush) follow their own class hierarchy. First player to empty their hand wins the hand; the order others empty ranks them.

15-second turn timer. Passes are only allowed after the opening play. If everyone passes, the last player to play leads the next trick.

## To enable online play

1. Create a Supabase project (free tier is fine).
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Run `supabase/schema.sql` in the Supabase SQL editor.
4. Enable the auth providers you want in Authentication > Providers.
5. For each provider, register an OAuth app on their developer portal (Apple, Google, Facebook, X, TikTok) and copy the client IDs/secrets into Supabase.
6. Wire `supabase.auth.signInWithOAuth({ provider: 'google' })` (and the others) into `app/sign-in.tsx`.
7. Implement the online lobby in `app/lobby.tsx` — subscribe to the `games` table, show waiting games, allow creating and joining.

## To enable Bluetooth

1. Run `npx expo prebuild` to generate the native android/ and ios/ folders.
2. Install `react-native-nearby-connection` (or `expo-bluetooth-p2p` if it exists in your SDK).
3. Add iOS Info.plist NSBluetoothPeripheralUsageDescription and Android ACCESS_FINE_LOCATION + BLUETOOTH permissions.
4. Reuse `lib/pusoy/localGame.ts` as the in-game state — replace the bot timer with a peer-message handler.
5. Build a discovery + host/join flow in `app/bluetooth-info.tsx`.

## License

MIT
