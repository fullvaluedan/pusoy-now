// Paywall sheet: the R6-R9 "remove ads" offer. Dark-launched -- nothing in the
// app gates play on this yet -- so this screen is reachable but not required;
// it exists so the checkout flow is exercised end to end before the ad SDK
// milestone lands.
//
// Web starts a Stripe Checkout session against the auth Worker and redirects
// to the returned URL. Native IAP is deferred: the CTA is disabled there with
// a pointer to buy on the website instead.
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { authClient } from '../lib/authClient';

const BENEFITS = ['No ads', 'Support development'];

export default function Paywall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCheckout() {
    setError(null);
    setBusy(true);
    try {
      const { data, error: fetchError } = await authClient.$fetch<{ url: string | null }>(
        '/api/stripe/checkout',
        { method: 'POST' },
      );
      if (fetchError) {
        setError(
          fetchError.status === 503
            ? 'Checkout is not available yet.'
            : 'Could not start checkout. Please try again.',
        );
        return;
      }
      if (data?.url && typeof window !== 'undefined') {
        window.location.href = data.url;
      } else {
        setError('Checkout is not available yet.');
      }
    } catch {
      setError('Could not start checkout. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Remove ads</Text>
      <Text style={styles.price}>$9.99 a year, no ads</Text>

      <Card style={styles.card}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefitRow}>
            <Text style={styles.benefitDot}>{'•'}</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </Card>

      {Platform.OS === 'web' ? (
        <Button
          title={busy ? 'Starting checkout...' : 'Subscribe for $9.99/year'}
          onPress={() => void onCheckout()}
          disabled={busy}
        />
      ) : (
        <Button title="Purchase on the website at pusoynow" onPress={() => {}} disabled />
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button title="Not now" variant="ghost" style={styles.notNow} onPress={() => router.back()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt, marginTop: spacing.sm },
  price: { ...typography.subheading, color: colors.textPrimary, marginBottom: spacing.md },
  card: { marginBottom: spacing.lg, gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center' },
  benefitDot: { color: colors.felt, fontSize: 16, marginRight: spacing.sm },
  benefitText: { ...typography.body, color: colors.textPrimary },
  errorBox: { backgroundColor: colors.dangerLight, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: 13 },
  notNow: { marginTop: spacing.md },
});
