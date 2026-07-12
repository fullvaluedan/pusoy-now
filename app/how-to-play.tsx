// How to Play: Pusoy Dos rules plus app-specific tips (Round 7 U6).
// Copy is checked against the engine's actual rules (lib/pusoy/deck.ts
// SUIT_VALUE, lib/pusoy/engine.ts newHand, lib/pusoy/combo.ts):
// suits rank club < spade < heart < diamond (standard Pusoy Dos).
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { CompactHeader, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';

export default function HowToPlay() {
  const router = useRouter();

  return (
    <ScreenContainer scroll>
      <CompactHeader title="How to play" />
      <Text style={styles.date}>Pusoy Dos rules and app tips</Text>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>🎯</Text>
          <Text style={styles.sectionTitle}>The goal</Text>
        </View>
        <Text style={styles.body}>
          Be first to empty your hand. Every card you hold at the end counts against you, so the fastest way to win is to keep playing your cards whenever you can.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>🃏</Text>
          <Text style={styles.sectionTitle}>Card ranking</Text>
        </View>
        <Text style={styles.body}>
          Ranks run low to high: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2. The 3 is the lowest card in the game and the 2 is the highest.
        </Text>
        <Text style={styles.body}>
          When two cards share a rank, suit breaks the tie. From lowest to highest: clubs, spades, hearts, diamonds. That makes the 2 of diamonds the single highest card in the deck.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>🥇</Text>
          <Text style={styles.sectionTitle}>Your first move</Text>
        </View>
        <Text style={styles.body}>
          Whoever is dealt the 3 of clubs leads the very first hand of the game, and must play a combo that includes it.
        </Text>
        <Text style={styles.body}>
          In a shorter game (fewer than 4 players) the 3 of clubs can end up in the dead pile instead of anyone's hand. When that happens, whoever holds the lowest card left in play opens instead.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>🖐️</Text>
          <Text style={styles.sectionTitle}>What you can play</Text>
        </View>
        <Text style={styles.bulletList}>- Single: one card.</Text>
        <Text style={styles.bulletList}>- Pair: two cards of the same rank.</Text>
        <Text style={styles.bulletList}>- Three of a kind: three cards of the same rank.</Text>
        <Text style={styles.bulletList}>- Five-card hand: straight, flush, full house, four of a kind, or straight flush.</Text>
        <Text style={styles.body}>
          A five-card hand beats a lower five-card hand in this order, low to high: straight, flush, full house, four of a kind, straight flush.
        </Text>
        <Text style={styles.body}>
          Whatever the lead player plays sets the size for that hand -- everyone after them must match it (single beats single, pair beats pair, and so on) with a higher combo of the same size.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>⏭️</Text>
          <Text style={styles.sectionTitle}>Passing</Text>
        </View>
        <Text style={styles.body}>
          If you can't beat the lead, or just don't want to, pass. Once everyone still in the hand has passed, the last player to actually play a combo leads fresh with any combo they like.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>🏆</Text>
          <Text style={styles.sectionTitle}>Winning</Text>
        </View>
        <Text style={styles.body}>
          The first player to play their last card wins the hand. Play keeps going among the rest of the table to settle 2nd and 3rd place.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEmoji}>💡</Text>
          <Text style={styles.sectionTitle}>App tips</Text>
        </View>
        <Text style={styles.bulletList}>- Tap cards to select them, then tap Play.</Text>
        <Text style={styles.bulletList}>- Drag a card up to the center to play it fast, no separate tap needed.</Text>
        <Text style={styles.bulletList}>- Sort cycles your hand between rank, suit, and hands order.</Text>
        <Text style={styles.bulletList}>- Online games give you 30 seconds per turn.</Text>
        <Text style={styles.bulletList}>- Empty seats in an online game get filled by expert bots.</Text>
      </Card>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    color: colors.felt,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionEmoji: { fontSize: 22 },
  // Bumped to subheading (20/800) so section headers read as bold Duolingo
  // titles, not a slightly-heavier body line.
  sectionTitle: {
    ...typography.subheading,
    color: colors.felt,
  },
  body: {
    ...typography.body,
    color: colors.textBody,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  bulletList: {
    ...typography.body,
    color: colors.textBody,
    lineHeight: 20,
    marginLeft: spacing.md,
    marginBottom: 2,
  },
  backBtn: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
});
