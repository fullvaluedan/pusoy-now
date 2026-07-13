// Local, server-side username moderation: no external API. A username is run
// through a normalizer that undoes the usual evasions (leetspeak digits, repeat
// padding, separators) and then checked against a two-tier blocklist of slurs
// and profanity. Kept as pure functions so it is fully unit-testable (see
// usernameBlocklist.test.ts) and reused by validateUsername.
//
// Two tiers, because a naive substring match on short roots wrecks clean names
// (the Scunthorpe problem: "scunthorpe" contains "cunt", "pakistani" contains
// "paki", "analysis" contains "anal", "class"/"grass"/"assassin" contain "ass",
// "suspicious" contains "spic"):
//
//   LONG_UNAMBIGUOUS - long slurs/profanity that effectively never appear inside
//     a clean handle. Matched as a SUBSTRING, on both the lightly-normalized form
//     and a fully-deduped form (every run of a letter folded to one), so padded
//     evasions like "fuuck", "shiit", "niigga" are caught.
//
//   SHORT_AMBIGUOUS - short roots that DO collide with clean words. Matched only
//     when the whole handle IS that word (modulo leetspeak/padding) OR the word
//     appears in the RAW handle bounded on BOTH sides by a non-letter (start,
//     end, digit, underscore, punctuation). So "paki123" and "xX_paki" block,
//     but "pakistani" and "scunthorpe" pass.
//
// Both lists are REPRESENTATIVE starter sets, expandable over time. Add a base
// word (lowercase, plain letters) to the tier that fits its collision risk.

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
//   4. collapse runs of 3+ identical letters to one, defeating heavy padding like
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

// Fold EVERY run of the same letter to a single one. Applied on top of the
// normalized form to catch two-letter padding the 3+ collapse leaves alone
// ("fuuck" -> "fuck", "niigga" -> "niga", "cuunt" -> "cunt"). Base words are
// deduped the same way so the comparison is apples-to-apples.
function dedupeLetters(s: string): string {
  return s.replace(/([a-z])\1+/g, '$1');
}

// --- Tier 1: long, unambiguous terms (substring match) ---------------------
// These do not occur inside clean handles, so a substring hit is safe. Matched
// on the normalized form AND its deduped form.
const LONG_UNAMBIGUOUS_BASE = [
  // profanity
  'fuck', 'shit', 'bitch', 'whore', 'slut', 'asshole', 'bastard',
  'douchebag', 'jackass', 'dickhead', 'motherfucker', 'bollocks', 'wanker',
  // slurs (representative; expand as needed)
  'nigger', 'nigga', 'faggot', 'retard', 'chink', 'tranny', 'wetback',
];

// --- Tier 2: short, ambiguous roots (whole-handle or delimited only) --------
// Each of these is a substring of at least one innocent word, so we never do a
// bare substring match. Blocked only when the handle IS the word or the word is
// delimited by non-letters in the raw input.
const SHORT_AMBIGUOUS_BASE = [
  'spic', 'cunt', 'paki', 'anal', 'ass', 'gook', 'kike', 'dyke', 'twat',
  'prick', 'piss',
];

interface Tier {
  norm: string;
  deduped: string;
  // Padded-repeat matcher: each letter of the base may repeat (l -> l+), so
  // doubled-letter padding ("niigger") still matches WITHOUT collapsing the
  // base into a shorter string that over-matches clean words. Using a
  // dedupe-then-substring match instead would shrink "nigger" to "niger",
  // which is a substring of the country "nigeria"/"niger" -- a false positive.
  // The padded regex keeps every distinct letter, so "nigger" matches
  // "niigger" but not "nigeria" (after "nige" it requires another "g").
  padded: RegExp;
}

function escapeChar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build /l+e+t+e+r+/ from "letter": each char may repeat one or more times.
function paddedPattern(word: string): string {
  return word.split('').map((ch) => `${escapeChar(ch)}+`).join('');
}

function toTier(base: string): Tier {
  const norm = normalizeForModeration(base);
  return { norm, deduped: dedupeLetters(norm), padded: new RegExp(paddedPattern(norm)) };
}

const LONG_UNAMBIGUOUS: Tier[] = LONG_UNAMBIGUOUS_BASE.map(toTier).filter((t) => t.norm.length > 0);
const SHORT_AMBIGUOUS: Tier[] = SHORT_AMBIGUOUS_BASE.map(toTier).filter((t) => t.norm.length > 0);

// Escape a base word for use inside a RegExp (the words are plain letters today,
// but keep this defensive so the list stays safe to extend).
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Does `word` appear in the raw (lowercased) handle bounded on BOTH sides by a
// non-letter or a string edge? Boundaries are tested on the raw input so that
// underscores and digits (valid username chars) count as delimiters:
// "paki123" and "xX_paki" match, "pakistani" does not.
function delimitedInRaw(rawLower: string, word: string): boolean {
  return new RegExp(`(^|[^a-z])${escapeRegExp(word)}([^a-z]|$)`).test(rawLower);
}

// True when the normalized handle contains any blocked base word (long tier), or
// the handle is/contains-as-a-delimited-token any short ambiguous root.
export function containsBlockedWord(raw: string): boolean {
  const rawLower = raw.toLowerCase();
  const norm = normalizeForModeration(raw);
  if (!norm) return false;
  const deduped = dedupeLetters(norm);

  // Tier 1: the base word appears (padding-tolerant) as a substring of norm.
  // The padded regex catches doubled-letter evasions ("niigger") without the
  // dedupe-substring over-match that flags clean words like "nigeria".
  for (const t of LONG_UNAMBIGUOUS) {
    if (t.padded.test(norm)) return true;
  }

  // Tier 2: whole-handle equality (modulo leetspeak/padding) or a delimited
  // occurrence in the raw handle. Never a bare substring.
  for (const t of SHORT_AMBIGUOUS) {
    if (norm === t.norm || deduped === t.deduped) return true;
    if (delimitedInRaw(rawLower, t.norm)) return true;
  }

  return false;
}

// Exposed for tests / tooling that want to introspect the loaded lists.
export const blocklistSize = LONG_UNAMBIGUOUS.length + SHORT_AMBIGUOUS.length;
