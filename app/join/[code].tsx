// Join-link landing page. A shared room link (web or the pusoynow://join deep
// link) lands here first. Signed-out visitors are asked to sign in (so they
// come back with a session); once signed in the actual join happens over the
// room WebSocket, so this just hands off to the room screen.
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Button, Card, ScreenContainer } from '../../components/ui';
import { colors, spacing, typography } from '../../lib/theme';
import { useAuth } from '../../lib/auth';

export default function JoinScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = params.code ?? '';
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session && code) {
      router.replace({ pathname: '/room/[code]', params: { code } });
    }
  }, [loading, session, code, router]);

  if (loading || session) {
    return (
      <ScreenContainer>
        <ActivityIndicator size="large" color={colors.felt} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Card style={styles.card}>
        <Text style={styles.title}>You're invited to a game</Text>
        <Text style={styles.body}>
          Sign in to join room {code || 'this room'}. You'll come right back here once you're signed in.
        </Text>
        <Button title="Sign in to join" onPress={() => router.push('/sign-in')} style={styles.btn} />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', marginTop: spacing.xl },
  title: { ...typography.heading, fontSize: 22, color: colors.felt, textAlign: 'center', marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  btn: { alignSelf: 'stretch' },
});
