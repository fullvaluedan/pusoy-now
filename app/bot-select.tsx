// The two-step bot-difficulty screen is gone from the flow (Round 9 U2):
// Home's PLAY button now handles first-time difficulty picking inline and
// starts the game instantly on every later tap (see app/(tabs)/index.tsx).
// This route stays registered as a redirect to Home so any external link,
// bookmark, or deep link that still points at /bot-select keeps working.
import { Redirect } from 'expo-router';

export default function BotSelect() {
  return <Redirect href="/" />;
}
