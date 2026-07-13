// Local, server-side username moderation: no external API. A username is run
// through a normalizer that undoes the usual evasions (leetspeak digits, repeat
// padding, separators) and then checked, as a substring, against a blocklist of
// slurs and profanity. Kept as a pure function so it is fully unit-testable
// (see usernameBlocklist.test.ts) and reused by validateUsername.
//
// The list below is a REPRESENTATIVE starter set, not an exhaustive one. It is
// meant to be expanded over time: add a base word (lowercase, plain letters)
// and the normalizer handles its leetspeak/padded variants automatically. Keep
// entries specific enough that they do not fire inside innocent handles - short
// generic fragments (e.g. a bare three-letter root) cause false positives on
// clean words, so prefer whole, unambiguous terms.

// Leetspeak / symbol substitutions, applied before the alpha-only strip. A '1'
// is mapped to 'i' (the more common evasion); the rarer 1->l case is an
// accepted miss for a starter set. Extend this map as new evasions show up.
const SUBSTITUTIONS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '+': 't',
};

// Fold a raw handle to a comparison form:
//   1. lowercase
//   2. apply the leetspeak/symbol substitutions
//   3. drop everything that is not a-z (spaces, underscores, digits, punctuation)
//   4. collapse runs of 3+ identical letters to one, defeating padding like
//      "fuuuuck" while preserving legitimate double letters (so a base word such
//      as "asshole" still matches and "class" is not shredded into a short root)
export function normalizeForModeration(raw: string): string {
  const lowered = raw.toLowerCase();
  let out = '';
  for (const ch of lowered) out += SUBSTITUTIONS[ch] ?? ch;
  out = out.replace(/[^a-z]/g, '');
  out = out.replace(/([a-z])\1{2,}/g, '$1');
  return out;
}

// Base words are curated as plain lowercase. They are normalized with the SAME
// function at load time so the substring comparison is apples-to-apples (e.g. a
// base with a double letter collapses identically to a padded attacker input).
const BASE_WORDS = [
  // profanity
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'piss',
  'slut', 'whore', 'douchebag', 'jackass', 'dickhead', 'motherfucker',
  'bollocks', 'wanker', 'twat', 'prick',
  // slurs (representative; expand as needed)
  'nigger', 'nigga', 'faggot', 'retard', 'spic', 'chink', 'kike',
  'tranny', 'wetback', 'gook', 'dyke', 'paki',
];

const BLOCKLIST: string[] = BASE_WORDS.map(normalizeForModeration).filter((w) => w.length > 0);

// True when the normalized handle contains any blocked base word as a substring.
// Substring (not whole-word) because usernames have no spaces, so evasions pack
// the slur between other characters (e.g. "xxfuckxx").
export function containsBlockedWord(raw: string): boolean {
  const norm = normalizeForModeration(raw);
  if (!norm) return false;
  return BLOCKLIST.some((word) => norm.includes(word));
}

// Exposed for tests / tooling that want to introspect the loaded list.
export const blocklistSize = BLOCKLIST.length;
