import { router } from 'expo-router';
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
import { requestPasswordReset, setNewPassword, verifyPasswordResetCode } from '@/hooks/use-auth';
import { useThemeColor } from '@/hooks/use-theme-color';

const S = { one: 4, two: 8, three: 16, four: 24 };

/**
 * Password reset via emailed OTP code (Expo Go-friendly — no deep link needed).
 * Step 'request': enter email -> Supabase emails a recovery code.
 * Step 'reset':  enter the code + a new password -> verify code, then update password.
 */
export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const cardColor = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({ light: '#D14343', dark: '#FF6B6B' }, 'text');

  async function sendCode() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setBusy(true);
    const { error: err } = await requestPasswordReset(email);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setInfo('If that email has an account, we sent a reset code. Enter it below.');
    setStep('reset');
  }

  async function applyReset() {
    setError(null);
    setInfo(null);
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    if (password.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const verify = await verifyPasswordResetCode(email, code);
    if (verify.error) {
      setBusy(false);
      setError(verify.error);
      return;
    }
    const update = await setNewPassword(password);
    setBusy(false);
    if (update.error) {
      setError(update.error);
      return;
    }
    // verifyOtp established a recovery session; the auth gate will now route into the app.
    setInfo('Password updated. Signing you in…');
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ThemedText type="title" style={styles.heading}>
          Reset password
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: muted }]}>
          {step === 'request'
            ? "Enter your email and we'll send a reset code."
            : 'Enter the code we emailed you and choose a new password.'}
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          editable={step === 'request'}
          placeholder="Email"
          placeholderTextColor={muted}
          autoCapitalize="none"
          keyboardType="email-address"
          inputMode="email"
          style={[
            styles.input,
            { backgroundColor: cardColor, color: text, opacity: step === 'request' ? 1 : 0.6 },
          ]}
        />

        {step === 'reset' && (
          <>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Reset code"
              placeholderTextColor={muted}
              autoCapitalize="none"
              keyboardType="number-pad"
              style={[styles.input, { backgroundColor: cardColor, color: text }]}
            />
            <View style={[styles.passwordRow, { backgroundColor: cardColor }]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                placeholderTextColor={muted}
                autoCapitalize="none"
                secureTextEntry={!showPassword}
                style={[styles.passwordInput, { color: text }]}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={S.two}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={styles.eyeButton}>
                <IconSymbol name={showPassword ? 'eye.slash' : 'eye'} size={20} color={muted} />
              </Pressable>
            </View>
          </>
        )}

        {error ? <ThemedText style={[styles.msg, { color: danger }]}>{error}</ThemedText> : null}
        {info ? <ThemedText style={[styles.msg, { color: muted }]}>{info}</ThemedText> : null}

        <Pressable
          onPress={step === 'request' ? sendCode : applyReset}
          disabled={busy}
          style={[styles.button, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText type="defaultSemiBold" style={styles.buttonLabel}>
              {step === 'request' ? 'Send reset code' : 'Update password'}
            </ThemedText>
          )}
        </Pressable>

        {step === 'reset' && (
          <Pressable onPress={sendCode} disabled={busy} style={styles.switch}>
            <ThemedText style={[styles.switchLabel, { color: tint }]}>Resend code</ThemedText>
          </Pressable>
        )}

        <Pressable onPress={() => router.back()} style={styles.switch}>
          <ThemedText style={[styles.switchLabel, { color: tint }]}>Back to sign in</ThemedText>
        </Pressable>
      </KeyboardAvoidingView>
    </ThemedView>
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
  passwordInput: { flex: 1, paddingHorizontal: S.three, paddingVertical: S.three, fontSize: 16 },
  eyeButton: { padding: S.one },
  msg: { marginBottom: S.three },
  button: { borderRadius: S.two, paddingVertical: S.three, alignItems: 'center', marginTop: S.one },
  buttonLabel: { color: '#fff' },
  switch: { marginTop: S.three, alignItems: 'center' },
  switchLabel: { fontSize: 14 },
});
