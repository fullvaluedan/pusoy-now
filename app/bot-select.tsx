// Difficulty selector. Pusoy Dos is 4-player only (human + 3 bots).
// Player picks a difficulty level which sets bot strategy.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import type { BotLevel } from '../lib/pusoy/types';

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
        <DifficultyButton
          label="Easy"
          description="Plays suboptimal hands"
          isSelected={level === 'easy'}
          onPress={() => setLevel('easy')}
        />
        <DifficultyButton
          label="Normal"
          description="Balanced play, occasional mistakes"
          isSelected={level === 'normal'}
          onPress={() => setLevel('normal')}
        />
        <DifficultyButton
          label="Expert"
          description="Counts cards, plays strategically"
          isSelected={level === 'expert'}
          onPress={() => setLevel('expert')}
        />
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

interface DifficultyButtonProps {
  label: string;
  description: string;
  isSelected: boolean;
  onPress: () => void;
}

function DifficultyButton({ label, description, isSelected, onPress }: DifficultyButtonProps) {
  return (
    <Button
      title={label}
      subtitle={description}
      align="left"
      variant={isSelected ? 'primary' : 'ghost'}
      onPress={onPress}
      style={styles.diffButton}
    />
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 26, color: colors.felt, marginTop: spacing.xl },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xxl, lineHeight: 22 },
  difficultyLabel: { ...typography.label, color: colors.felt, fontWeight: '600', marginBottom: spacing.md },
  difficultyGroup: { gap: spacing.md, marginBottom: spacing.xxl },
  diffButton: { marginBottom: 0 },
});
