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
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ScreenContainer } from '../components/ui';
import { colors, spacing, typography } from '../lib/theme';
import { apiUrl, authClient } from '../lib/authClient';

const HERO_IMG = require('../assets/art/paywall-hero.png');
const BADGE_IMG = require('../assets/art/premium-badge.png');

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
        apiUrl('/api/stripe/checkout'),
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
      <Image
        source={HERO_IMG}
        style={styles.hero}
        resizeMode="contain"
        accessibilityLabel="Premium paywall hero"
      />

      <View style={styles.priceGroup}>
        <Image
          source={BADGE_IMG}
          style={styles.badge}
          resizeMode="contain"
          accessibilityLabel="Premium badge"
        />
        <Text style={styles.title}>Remove ads</Text>
        <Text style={styles.price}>$9.99 a year, no ads</Text>
      </View>

      <Card style={styles.card}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefitRow}>
            <Text style={styles.benefitDot}>•</Text>
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
  hero: { width: '100%', maxWidth: 320, height: 240, alignSelf: 'center', marginBottom: spacing.lg },
  priceGroup: { alignItems: 'center', marginBottom: spacing.lg },
  badge: { width: 80, height: 32, marginBottom: spacing.sm },
  title: { ...typography.heading, color: colors.felt },
  price: { ...typography.subheading, color: colors.textPrimary, marginTop: spacing.xs },
  card: { marginBottom: spacing.lg, gap: spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center' },
  benefitDot: { color: colors.felt, fontSize: 16, marginRight: spacing.sm },
  benefitText: { ...typography.body, color: colors.textPrimary },
  errorBox: { backgroundColor: colors.dangerLight, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: 13 },
  notNow: { marginTop: spacing.md },
});
