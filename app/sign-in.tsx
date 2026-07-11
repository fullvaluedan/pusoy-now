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
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, ScreenContainer } from '../components/ui';
import { colors, providerBrand, radii, spacing, typography } from '../lib/theme';
import { useAuth, type SocialProvider } from '../lib/auth';
import { validateResetEmail, validateSignIn, validateSignUp } from '../lib/authForms';

// Flip to true once the TikTok bridge is ported to the auth Worker.
const TIKTOK_ENABLED = false;

interface ProviderEntry {
  id: SocialProvider | 'tiktok';
  name: string;
  color: string;
}

const PROVIDERS: ProviderEntry[] = [
  { id: 'google', name: 'Google', color: providerBrand.google },
  { id: 'facebook', name: 'Facebook', color: providerBrand.facebook },
  { id: 'tiktok', name: 'TikTok', color: providerBrand.tiktok },
];

type Mode = 'sign-in' | 'sign-up' | 'reset';

export default function SignIn() {
  const router = useRouter();
  const { session, profile, loading, phase, pendingEmail, signIn, signUpEmail, signInEmail, resetPassword, clearPending, signOut } =
    useAuth();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function resetFeedback() {
    setError(null);
    setNotice(null);
  }

  async function onSocial(entry: ProviderEntry) {
    if (entry.id === 'tiktok') return;
    resetFeedback();
    setBusy(entry.id);
    try {
      const result = await signIn(entry.id);
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
      if (invalid) return setError(invalid);
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
      if (invalid) return setError(invalid);
      setBusy('email');
      try {
        const res = await signUpEmail({ name, email, password });
        if (res.status === 'error') setError(res.message);
        else if (res.status === 'signed-in') router.replace('/');
        // 'verification-pending' flips the whole screen to the pending view.
      } finally {
        setBusy(null);
      }
      return;
    }

    // sign-in
    const invalid = validateSignIn({ email, password });
    if (invalid) return setError(invalid);
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
  const submitLabel =
    busy === 'email' ? 'Please wait...' : mode === 'sign-up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in';

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        {mode === 'reset'
          ? 'Enter your email and we will send a reset link.'
          : 'Use an email and password, or continue with a social account. We only use it for your name, picture, and stats.'}
      </Text>

      {mode === 'sign-up' ? (
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor={colors.textFaint}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
      />

      {mode !== 'reset' ? (
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textFaint}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
      ) : null}

      {mode === 'sign-up' ? (
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.textFaint}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
        />
      ) : null}

      <Button title={submitLabel} onPress={() => void onSubmitEmail()} disabled={busy !== null} />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
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

      {/* Social providers only on the sign-in/up forms, not the reset form. */}
      {mode !== 'reset' ? (
        <View style={styles.providers}>
          <Text style={styles.orLabel}>or continue with</Text>
          {PROVIDERS.map((p) => {
            const disabled = p.id === 'tiktok' ? !TIKTOK_ENABLED : busy !== null;
            return (
              <Button
                key={p.id}
                title={busy === p.id ? 'Opening browser...' : `Continue with ${p.name}`}
                subtitle={p.id === 'tiktok' ? 'Coming soon' : ''}
                color={p.color}
                disabled={disabled}
                onPress={() => void onSocial(p)}
              />
            );
          })}
        </View>
      ) : null}

      <Button title="Back" variant="ghost" onPress={() => router.replace('/')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.felt, marginTop: spacing.sm },
  subtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.overlay,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
    minHeight: 52,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  providers: { marginTop: spacing.md, gap: spacing.sm + 4 },
  orLabel: { ...typography.caption, color: colors.textFaint, textAlign: 'center' },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: 10,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 13 },
  noticeBox: {
    backgroundColor: colors.overlay,
    borderRadius: 10,
    padding: spacing.md,
  },
  noticeText: { color: colors.textBody, fontSize: 13 },
});
