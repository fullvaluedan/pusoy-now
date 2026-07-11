// Pure request-outcome mapping for the friends client, split out from
// lib/friends.ts (which imports authClient / react-native) so it stays unit-
// testable in node.

// The stable outcome the add-by-username field renders as inline feedback.
export type AddOutcome = 'sent' | 'not-found' | 'self' | 'unauthorized' | 'error';

// Map the $fetch error HTTP status to an outcome. No error (undefined status)
// means a 2xx: the request was sent.
export function mapAddStatus(status: number | undefined): AddOutcome {
  switch (status) {
    case undefined:
      return 'sent';
    case 404:
      return 'not-found';
    case 400:
      return 'self';
    case 401:
      return 'unauthorized';
    default:
      return 'error';
  }
}

// Human copy for each add outcome, so the field and any toast read the same.
export function addOutcomeMessage(outcome: AddOutcome): string | null {
  switch (outcome) {
    case 'sent':
      return null; // success: no error banner
    case 'not-found':
      return 'No player with that username.';
    case 'self':
      return 'You cannot add yourself.';
    case 'unauthorized':
      return 'Sign in to add friends.';
    case 'error':
      return 'Something went wrong. Try again.';
  }
}
