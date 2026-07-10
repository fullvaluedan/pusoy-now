// Difficulty selector. Pusoy Dos is 4-player only (human + 3 bots).
// Player picks a difficulty level which sets bot strategy.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, ScreenContainer } from '../components/ui';
import { colors, radii, spacing, typography, withAlpha } from '../lib/theme';
import type { BotLevel } from '../lib/pusoy/types';

interface DifficultyOption {
  level: BotLevel;
  label: string;
  description: string;
}

const OPTIONS: DifficultyOption[] = [
  { level: 'easy', label: 'Easy', description: 'Makes careless plays and misses easy wins' },
  { level: 'normal', label: 'Normal', description: 'Solid fundamentals with the occasional slip' },
  { level: 'expert', label: 'Expert', description: 'Tracks every card played and plays to win' },
];

export default function BotSelect() {
  const router = useRouter();
  const [level, setLevel] = useState<BotLevel>('normal');

  return (
    <ScreenContainer>
      <Text style={styles.title}>Pusoy Dos is a 4-player game</Text>
      <Text style={styles.subtitle}>
        You'll play against 3 computer opponents. The player with the 3 of clubs leads first.
      </Text>

      <Text style={styles.difficultyLabel}>Choose difficulty</Text>
      <View style={styles.difficultyGroup}>
        {OPTIONS.map((option) => (
          <DifficultyCard
            key={option.level}
            option={option}
            isSelected={level === option.level}
            onPress={() => setLevel(option.level)}
          />
        ))}
      </View>

      <Button
        title="Start game"
        subtitle="You + 3 bots"
        align="left"
        onPress={() => router.push(`/game-local?bots=3&level=${level}`)}
      />
    </ScreenContainer>
  );
}

interface DifficultyCardProps {
  option: DifficultyOption;
  isSelected: boolean;
  onPress: () => void;
}

function DifficultyCard({ option, isSelected, onPress }: DifficultyCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      style={[styles.card, isSelected ? styles.cardSelected : styles.cardUnselected]}
    >
      <View style={styles.cardTextGroup}>
        <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>{option.label}</Text>
        <Text style={[styles.cardDescription, isSelected && styles.cardDescriptionSelected]}>
          {option.description}
        </Text>
      </View>
      <View style={[styles.radio, isSelected && styles.radioSelected]}>
        {isSelected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 26, color: colors.felt, marginTop: spacing.xl },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xxl, lineHeight: 22 },
  difficultyLabel: { ...typography.label, color: colors.felt, fontWeight: '600', marginBottom: spacing.md },
  difficultyGroup: { gap: spacing.md, marginBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md + 4,
    borderRadius: radii.lg,
    borderWidth: 2,
  },
  cardUnselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  cardSelected: {
    backgroundColor: colors.felt,
    borderColor: colors.gold,
  },
  cardTextGroup: { flex: 1, marginRight: spacing.md },
  cardLabel: { ...typography.subheading, color: colors.felt },
  cardLabelSelected: { color: colors.textOnFelt },
  cardDescription: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  cardDescriptionSelected: { color: colors.textOnFeltMuted },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: withAlpha(colors.felt, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.gold },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gold,
  },
});
