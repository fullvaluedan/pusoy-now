// Guest username generator (U1): Reddit-style "AdjectiveNoun-NNNN" names for
// anonymous sessions (e.g. "SwiftNarwhal-4821"). better-auth's anonymous plugin
// calls generateGuestName() via its `generateName` hook and writes the result
// into `user.name`, which the ranking query already reads through its LEFT JOIN
// fallback, so a guest appears on the leaderboard under this name with zero
// extra schema work.
//
// The rng is injectable so the shape and determinism are unit-testable without
// touching global Math.random. Words are family-friendly and deliberately kept
// clear of anything profanity-adjacent (no pairing produces a slur or an
// offensive phrase); both are Capitalized so the concatenation reads cleanly.

// ~40 upbeat, harmless adjectives.
export const ADJECTIVES: readonly string[] = [
  'Swift', 'Brave', 'Clever', 'Lucky', 'Mighty', 'Gentle', 'Jolly', 'Nimble',
  'Sunny', 'Cosmic', 'Golden', 'Silver', 'Crimson', 'Azure', 'Emerald', 'Amber',
  'Breezy', 'Frosty', 'Snappy', 'Zippy', 'Dizzy', 'Fuzzy', 'Merry', 'Perky',
  'Plucky', 'Quirky', 'Sleepy', 'Sparky', 'Spry', 'Wily', 'Witty', 'Zesty',
  'Bold', 'Calm', 'Dandy', 'Eager', 'Fancy', 'Grand', 'Happy', 'Keen',
];

// ~40 nouns: animals plus a few card-table words. Nothing that pairs into an
// offensive phrase with the adjectives above.
export const NOUNS: readonly string[] = [
  'Narwhal', 'Otter', 'Falcon', 'Panda', 'Tiger', 'Dolphin', 'Badger', 'Heron',
  'Lynx', 'Moose', 'Raven', 'Walrus', 'Wombat', 'Yak', 'Koala', 'Meerkat',
  'Penguin', 'Puffin', 'Quokka', 'Sparrow', 'Turtle', 'Beaver', 'Ferret', 'Gecko',
  'Hedgehog', 'Iguana', 'Jaguar', 'Kestrel', 'Mongoose', 'Newt', 'Ocelot', 'Pelican',
  'Ace', 'Joker', 'Dealer', 'Diamond', 'Spade', 'Heart', 'Club', 'Trump',
];

// Generate a guest username of the form "AdjectiveNoun-NNNN" where NNNN is a
// 4-digit number 1000-9999. `rng` returns a float in [0, 1) (default
// Math.random); injecting a seeded rng makes the output fully deterministic for
// tests. Retries until adjective + noun <= 14 chars (so full name <= 19 chars
// with -NNNN); number is always the last draw. Does not break determinism: the
// same seed always produces the same name because the rng stream is fixed.
export function generateGuestName(rng: () => number = Math.random): string {
  let adjective: string;
  let noun: string;
  // Retry until adjective + noun is within the length cap.
  do {
    adjective = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    noun = NOUNS[Math.floor(rng() * NOUNS.length)];
  } while (adjective.length + noun.length > 14);
  const number = 1000 + Math.floor(rng() * 9000);
  return `${adjective}${noun}-${number}`;
}
