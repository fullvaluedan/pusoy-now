// Sign-in screen: email accounts (create / sign in / reset) plus social
// providers.
//
// Email/password runs against the Cloudflare auth Worker (better-auth). New
// accounts must verify by email before they can sign in, so sign-up and an
// unverified sign-in both land on a "check your email" state rather than a
// session. Google and Facebook use better-auth social sign-in; TikTok stays
// behind a coming-soon flag until its Worker bridge is ported.
//
// Signing in is only ever about a display name, a picture, and holding an
// account. Guests keep full access to bot games, so nothing here is a gate.
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Checkbox, Field, ScreenContainer } from '../components/ui';
import { colors, providerBrand, radii, spacing, typography } from '../lib/theme';
import { useAuth, type SocialProvider } from '../lib/auth';
import { validateResetEmail, validateSignIn, validateSignUp } from '../lib/authForms';
import { authClient } from '../lib/authClient';

// Flip to true once the TikTok bridge is ported to the auth Worker.
const TIKTOK_ENABLED = false;

// Display metadata for each social provider the client knows how to render. A
// button only appears when the server reports the provider as configured (via
// GET /api/providers), so brand + label live here, availability comes from the
// Worker's feature detection.
const PROVIDER_META: Record<SocialProvider, { name: string; color: string }> = {
  google: { name: 'Google', color: providerBrand.google },
  facebook: { name: 'Facebook', color: providerBrand.facebook },
  apple: { name: 'Apple', color: providerBrand.apple },
};

// Order the buttons appear in when configured.
const PROVIDER_ORDER: SocialProvider[] = ['apple', 'google', 'facebook'];

// Offline/dev fallback if GET /api/providers can't be reached: assume the
// pre-Apple pair so the screen is never empty. Apple is intentionally absent
// here -- it must be confirmed configured before its button shows.
const STATIC_FALLBACK: SocialProvider[] = ['google', 'facebook'];

// Apple's button is iOS-native or web-redirect only; guideline 4.8 is
// Apple-only so it must never render on Android even if the server lists it.
function providerVisibleHere(id: SocialProvider): boolean {
  if (id === 'apple') return Platform.OS === 'ios' || Platform.OS === 'web';
  return true;
}

type Mode = 'sign-in' | 'sign-up' | 'reset';

// Which Field a validateSignIn/validateSignUp/validateResetEmail message
// belongs to, so it renders inline under the right input instead of only as
// a form-level banner. authForms.ts returns a single message for the first
// problem found; this just routes that message by the field it names. Order
// matters: check 'match' (password mismatch) before the generic 'password'
// check, since that message also contains the word "Password".
interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

function fieldErrorsFor(message: string): FieldErrors {
  if (message.includes('name')) return { name: message };
  if (message.includes('email')) return { email: message };
  if (message.includes('match')) return { confirm: message };
  if (message.includes('assword')) return { password: message };
  return {};
}

export default function SignIn() {
  const router = useRouter();
  const { session, profile, loading, phase, pendingEmail, signIn, signUpEmail, signInEmail, resetPassword, clearPending, signOut } =
    useAuth();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Which social providers the Worker has secrets for. Fetched once from the
  // public GET /api/providers (no auth needed); falls back to the static pair
  // if the request fails (offline dev), so the buttons are never empty.
  const [configured, setConfigured] = useState<SocialProvider[]>(STATIC_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = (await authClient.$fetch('/api/providers')) as
          | { data?: { providers?: string[] }; providers?: string[] }
          | undefined;
        const ids = res?.data?.providers ?? res?.providers;
        if (!cancelled && Array.isArray(ids)) {
          setConfigured(ids.filter((id): id is SocialProvider => id in PROVIDER_META));
        }
      } catch {
        // Keep the static fallback already in state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Configured, visible-on-this-platform, in display order.
  const socialProviders = PROVIDER_ORDER.filter((id) => configured.includes(id) && providerVisibleHere(id));

  function resetFeedback() {
    setError(null);
    setNotice(null);
    setFieldErrors({});
  }

  async function onSocial(id: SocialProvider) {
    resetFeedback();
    setBusy(id);
    try {
      const result = await signIn(id);
      if (result.status === 'signed-in') router.replace('/');
      // 'cancelled' and 'redirecting' say nothing: the player closed the
      // browser, or the web page is navigating away.
      if (result.status === 'error') setError(result.message);
    } finally {
      setBusy(null);
    }
  }

  async function onSubmitEmail() {
    resetFeedback();

    if (mode === 'reset') {
      const invalid = validateResetEmail(email);
      if (invalid) return setFieldErrors(fieldErrorsFor(invalid));
      setBusy('email');
      try {
        const res = await resetPassword(email);
        if (res.status === 'error') setError(res.message);
        else setNotice('If that email has an account, a reset link is on its way.');
      } finally {
        setBusy(null);
      }
      return;
    }

    if (mode === 'sign-up') {
      const invalid = validateSignUp({ name, email, password, confirm });
      if (invalid) return setFieldErrors(fieldErrorsFor(invalid));
      setBusy('email');
      try {
        const res = await signUpEmail({ name, email, password });
        if (res.status === 'error') {
          setError(res.message);
        } else {
          if (res.status === 'signed-in') router.replace('/');
          // 'verification-pending' flips the whole screen to the pending view.
          // Fire-and-forget consent capture: this 401s silently if there is no
          // session yet (verification still pending) - the post-sign-in prompt
          // on home is the safety net for that case, so signup never blocks on
          // this call either way.
          void authClient.$fetch('/api/consent', {
            method: 'POST',
            body: { optIn: marketingConsent, source: 'signup' },
          });
        }
      } finally {
        setBusy(null);
      }
      return;
    }

    // sign-in
    const invalid = validateSignIn({ email, password });
    if (invalid) return setFieldErrors(fieldErrorsFor(invalid));
    setBusy('email');
    try {
      const res = await signInEmail({ email, password });
      if (res.status === 'error') setError(res.message);
      else if (res.status === 'signed-in') router.replace('/');
      // 'verification-pending' flips to the pending view.
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.felt} />
      </ScreenContainer>
    );
  }

  // Signed in ---------------------------------------------------------------
  if (session) {
    return (
      <ScreenContainer scroll>
        <Text style={styles.title}>Signed in</Text>
        <Text style={styles.subtitle}>
          You are signed in as {profile?.displayName ?? 'Player'}. Your name and picture show at your seat.
        </Text>
        <Button
          title="Sign out"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
        <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />
      </ScreenContainer>
    );
  }

  // Awaiting email verification --------------------------------------------
  if (phase === 'pending-verification') {
    return (
      <ScreenContainer scroll>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to {pendingEmail ?? 'your email'}. Open it to finish, then come back and sign in.
        </Text>
        <Button
          title="Back to sign in"
          onPress={() => {
            clearPending();
            setMode('sign-in');
            setPassword('');
            resetFeedback();
          }}
        />
        <Button title="Keep playing as guest" variant="ghost" onPress={() => router.replace('/')} />
      </ScreenContainer>
    );
  }

  // Forms -------------------------------------------------------------------
  const title = mode === 'sign-up' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in';
  const submitLabel = mode === 'sign-up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in';

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        {mode === 'reset'
          ? 'Enter your email and we will send a reset link.'
          : 'Use an email and password, or continue with a social account. We only use it for your name, picture, and stats.'}
      </Text>

      {mode === 'sign-up' ? (
        <Field label="Name" value={name} onChangeText={setName} error={fieldErrors.name} autoCapitalize="words" />
      ) : null}

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
      />

      {mode !== 'reset' ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          autoCapitalize="none"
        />
      ) : null}

      {mode === 'sign-up' ? (
        <Field
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          error={fieldErrors.confirm}
          secureTextEntry
          autoCapitalize="none"
        />
      ) : null}

      {mode === 'sign-up' ? (
        <Text style={styles.guestNotice}>
          Playing as a guest? Your stats come with you when you create an account.
        </Text>
      ) : null}

      {mode === 'sign-up' ? (
        <Checkbox
          checked={marketingConsent}
          onToggle={setMarketingConsent}
          label="Email me game updates and events. Unsubscribe anytime."
          style={styles.consentCheckbox}
        />
      ) : null}

      <Button title={submitLabel} onPress={() => void onSubmitEmail()} loading={busy === 'email'} disabled={busy !== null && busy !== 'email'} />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {/* Mode switches */}
      {mode === 'sign-in' ? (
        <View style={styles.switchRow}>
          <Button
            title="Create an account"
            variant="ghost"
            onPress={() => {
              setMode('sign-up');
              resetFeedback();
            }}
          />
          <Button
            title="Forgot password?"
            variant="ghost"
            onPress={() => {
              setMode('reset');
              resetFeedback();
            }}
          />
        </View>
      ) : (
        <Button
          title="Back to sign in"
          variant="ghost"
          onPress={() => {
            setMode('sign-in');
            resetFeedback();
          }}
        />
      )}

      {/* Social providers only on the sign-in/up forms, not the reset form.
          Buttons come from GET /api/providers (feature-detected server-side),
          filtered to what can render on this platform. TikTok stays a static
          coming-soon affordance until its Worker bridge is ported. */}
      {mode !== 'reset' ? (
        <View style={styles.providers}>
          <Text style={styles.orLabel}>or continue with</Text>
          {socialProviders.map((id) => {
            const meta = PROVIDER_META[id];
            return (
              <Button
                key={id}
                title={`Continue with ${meta.name}`}
                color={meta.color}
                disabled={busy !== null && busy !== id}
                loading={busy === id}
                onPress={() => void onSocial(id)}
              />
            );
          })}
          <Button
            title="Continue with TikTok"
            subtitle="Coming soon"
            color={providerBrand.tiktok}
            disabled={!TIKTOK_ENABLED}
            onPress={() => {}}
          />
        </View>
      ) : null}

      <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt, marginTop: spacing.sm },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.md },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  guestNotice: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xs },
  consentCheckbox: { marginTop: spacing.xs, marginBottom: spacing.xs },
  providers: { marginTop: spacing.md, gap: spacing.sm + 4 },
  orLabel: { ...typography.caption, color: colors.textFaint, textAlign: 'center' },
  // Form-level (server) errors: same soft-red validation look as Field's
  // inline banner, since these are not tied to one specific input.
  errorBanner: {
    backgroundColor: colors.dangerSoftBg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.dangerSoftBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorBannerText: { color: colors.dangerSoftText, fontSize: typography.caption.fontSize },
  noticeBox: {
    backgroundColor: colors.overlay,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noticeText: { color: colors.textBody, fontSize: typography.caption.fontSize },
});
