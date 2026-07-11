// Join-link landing page. A shared room link (web or the prends://join deep
// link) lands here first. A signed-out visitor gets a lazy anonymous session
// (R2) instead of a sign-in wall, then proceeds straight to the room -- the
// actual join happens over the room WebSocket, so this just hands off once a
// session (any session) exists.
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Button, Card, ScreenContainer } from '../../components/ui';
import { colors, spacing, typography } from '../../lib/theme';
import { useAuth } from '../../lib/auth';

export default function JoinScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = params.code ?? '';
  const router = useRouter();
  const { session, loading, ensureSession } = useAuth();
  const [failed, setFailed] = useState(false);

  const tryEnsureSession = useCallback(async () => {
    setFailed(false);
    const result = await ensureSession();
    if (result === 'failed') setFailed(true);
  }, [ensureSession]);

  useEffect(() => {
    if (loading) return;
    if (session) {
      if (code) router.replace({ pathname: '/room/[code]', params: { code } });
      return;
    }
    void tryEnsureSession();
  }, [loading, session, code, router, tryEnsureSession]);

  if (failed) {
    return (
      <ScreenContainer>
        <Card style={styles.card}>
          <Text style={styles.title}>Could not join</Text>
          <Text style={styles.body}>
            We could not start a session to join room {code || 'this room'}. Check your connection and try again.
          </Text>
          <Button title="Try again" onPress={() => void tryEnsureSession()} style={styles.btn} />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ActivityIndicator size="large" color={colors.felt} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', marginTop: spacing.xl },
  title: { ...typography.heading, fontSize: 22, color: colors.felt, textAlign: 'center', marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  btn: { alignSelf: 'stretch' },
});
