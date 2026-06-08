import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import 'react-native-reanimated';

import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { registerNotificationHandler } from '@/hooks/use-notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Mix the reward chime with other audio and let it play in silent mode.
// Native only — on web the reward uses Web Audio and this can fail before the
// document is ready.
if (Platform.OS !== 'web') {
  setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: true }).catch(() => {});
}
registerNotificationHandler();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();

  // While the initial session resolves, show a splash and don't mount the
  // navigator yet — this avoids flashing the login screen for an already
  // signed-in user.
  if (loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
        <StatusBar style="auto" />
      </ThemeProvider>
    );
  }

  // Declarative route guarding (Stack.Protected). Expo Router redirects to the
  // first allowed screen when the guard fails — no imperative router.replace in
  // an effect, which is what throws "navigate before mounting the Root Layout".
  const isSignedIn = !!session;
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Celebration' }} />
          <Stack.Screen name="onboarding" options={{ presentation: 'modal', title: 'Welcome' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
