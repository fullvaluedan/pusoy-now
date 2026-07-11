// Pusoy Dos core types. Pure data — no RN or supabase imports here.

export type Suit = 'C' | 'D' | 'H' | 'S'; // clubs, diamonds, hearts, spades
export type Rank =
  | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

export interface Card {
  id: string;        // stable id, e.g. "H-A"
  suit: Suit;
  rank: Rank;
}

export type ComboType =
  | 'single'
  | 'pair'
  | 'threeOfAKind'
  | 'fiveCard' // for five-card hands below
  ;

export type FiveCardType =
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush';

export interface PlayedCombo {
  type: ComboType;
  fiveType?: FiveCardType;
  cards: Card[];      // in combination order
  length: number;     // 1, 2, 3, or 5
  rankValue: number;  // primary compare value
  suitValue?: number; // tiebreaker
}

// Player actions during a round
export type RoundAction =
  | { kind: 'play'; combo: PlayedCombo }
  | { kind: 'pass' };

// Player lifecycle inside a hand
export type PlayerStatus = 'playing' | 'passed' | 'finished';

// State of a single hand
export interface HandState {
  handId: string;
  roundNumber: number;            // 1..N within a game
  playerCount: number;            // seats in play, 2-4 (leftover cards dead)
  currentPlayerIndex: number;     // whose turn
  leadPlayerIndex: number;        // who led the current trick
  leadCombo: PlayedCombo | null;  // null = opening play
  lastPlay: { playerIndex: number; combo: PlayedCombo } | null;
  passed: number[];               // indexes that passed this trick
  finishedOrder: number[];        // indexes in the order they emptied
  turnDeadline: number | null;    // epoch ms
  turnStartedAt: number | null;
}

// Top-level game state
export interface GameState {
  gameId: string;
  playerIds: string[];            // user ids, 4 players
  hands: Card[][];                // per-player hands (private to each client)
  handState: HandState;
  startedAt: number;
  finishedAt: number | null;
  // The 'winners' array is filled in once all hands played. Position 0 is the
  // overall winner of the game (emptied first); remaining players ranked by
  // who emptied next. Last position is the "loser" who still holds cards.
  finishOrder: number[];          // 4 indexes in order of emptying
}

export interface PublicGameView {
  gameId: string;
  playerIds: string[];
  handState: HandState;
  // Counts only, never the actual cards in other players' hands.
  handSizes: number[];
  finishOrder: number[];
  finishedAt: number | null;
  startedAt: number;
}

// --- Bots ---------------------------------------------------------------

export type BotLevel = 'easy' | 'normal' | 'expert';

// Uniform in [0, 1). Injected so every bot decision is reproducible.
export type Rng = () => number;

// What the bot is allowed to know beyond its own hand. Everything here is
// public information a human player at the table could also track.
export interface BotContext {
  // Every card played face-up so far this hand, by anyone.
  playedCards?: Card[];
  // Cards remaining in each seat's hand, indexed by seat.
  handSizes?: number[];
  // The seat the bot is sitting in, so it can ignore itself in `handSizes`.
  seat?: number;
}

export interface BotOptions {
  level?: BotLevel;
  rng?: Rng;
  context?: BotContext;
}

export interface PlayerPublicStats {
  userId: string;
  wins: number;
  losses: number;
  // keyed by opponent userId
  vs: Record<string, { wins: number; losses: number }>;
}
