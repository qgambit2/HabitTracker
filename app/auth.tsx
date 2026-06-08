import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { signIn, signUp } from '@/hooks/use-auth';
import { useThemeColor } from '@/hooks/use-theme-color';

const S = { one: 4, two: 8, three: 16, four: 24 };

/**
 * Sign-in / sign-up screen. The session gate in app/_layout.tsx routes here whenever
 * there is no logged-in user; on success, onAuthStateChange flips the gate and the
 * tabs appear. Email/password only for now (works in Expo Go SDK 54).
 *
 * Sign up adds confirm-email + confirm-password fields with match validation; sign in
 * stays email + password. Every password field has an eye toggle to reveal its text.
 */
export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({ light: '#D14343', dark: '#FF6B6B' }, 'text');

  const isSignup = mode === 'signup';

  function resetMessages() {
    setError(null);
    setInfo(null);
  }

  async function submit() {
    resetMessages();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (isSignup) {
      if (trimmedEmail !== confirmEmail.trim()) {
        setError('Emails do not match.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setBusy(true);
    const action = isSignup ? signUp : signIn;
    const { error: err } = await action(trimmedEmail, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (isSignup) {
      // If email confirmation is on, there is no session yet — tell the user to check
      // their inbox. If it is off, onAuthStateChange will route them in automatically.
      setInfo('Account created. If asked, confirm via the link we emailed you, then sign in.');
      switchMode('signin');
    }
  }

  function switchMode(next: 'signin' | 'signup') {
    setMode(next);
    resetMessages();
    setConfirmEmail('');
    setConfirmPassword('');
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ThemedText type="title" style={styles.heading}>
          {isSignup ? 'Create your account' : 'Welcome back 👋'}
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: muted }]}>
          {isSignup
            ? 'Sign up to keep your habits and streaks backed up.'
            : 'Sign in to sync your habits across devices.'}
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          style={[styles.input, { backgroundColor: card, color: text }]}
        />

        {isSignup ? (
          <TextInput
            value={confirmEmail}
            onChangeText={setConfirmEmail}
            placeholder="Confirm email"
            placeholderTextColor={muted}
            autoCapitalize="none"
            keyboardType="email-address"
            inputMode="email"
            style={[styles.input, { backgroundColor: card, color: text }]}
          />
        ) : null}

        <PasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          cardColor={card}
          textColor={text}
          mutedColor={muted}
        />

        {isSignup ? (
          <PasswordField
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            cardColor={card}
            textColor={text}
            mutedColor={muted}
          />
        ) : null}

        {error ? <ThemedText style={[styles.msg, { color: danger }]}>{error}</ThemedText> : null}
        {info ? <ThemedText style={[styles.msg, { color: muted }]}>{info}</ThemedText> : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
              {isSignup ? 'Sign up' : 'Sign in'}
            </ThemedText>
          )}
        </Pressable>

        <Pressable onPress={() => switchMode(isSignup ? 'signin' : 'signup')} style={styles.switch}>
          <ThemedText style={[styles.switchLabel, { color: tint }]}>
            {isSignup
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </ThemedText>
        </Pressable>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** A password input with a trailing eye toggle to reveal/hide the text. */
function PasswordField({
  value,
  onChangeText,
  placeholder,
  cardColor,
  textColor,
  mutedColor,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  cardColor: string;
  textColor: string;
  mutedColor: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.passwordRow, { backgroundColor: cardColor }]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        autoCapitalize="none"
        secureTextEntry={!visible}
        style={[styles.passwordInput, { color: textColor }]}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={S.two}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        style={styles.eyeButton}>
        <IconSymbol name={visible ? 'eye.slash' : 'eye'} size={20} color={mutedColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: S.four, justifyContent: 'center' },
  flex: { flex: 0 },
  heading: { marginBottom: S.two },
  subtitle: { marginBottom: S.four, lineHeight: 20 },
  input: {
    borderRadius: S.two,
    paddingHorizontal: S.three,
    paddingVertical: S.three,
    marginBottom: S.three,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: S.two,
    marginBottom: S.three,
    paddingRight: S.three,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: S.three,
    paddingVertical: S.three,
    fontSize: 16,
  },
  eyeButton: { padding: S.one },
  msg: { marginBottom: S.three },
  button: {
    borderRadius: S.two,
    paddingVertical: S.three,
    alignItems: 'center',
    marginTop: S.one,
  },
  buttonLabel: { color: '#fff' },
  switch: { marginTop: S.four, alignItems: 'center' },
  switchLabel: { fontSize: 14 },
});
