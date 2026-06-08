import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
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

/**
 * Redirects between the auth screen and the app based on session state. While the
 * initial session is loading we render nothing routable yet (a splash), so the login
 * screen never flashes for an already-signed-in user.
 */
function useAuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onAuthScreen = segments[0] === 'auth';
    if (!session && !onAuthScreen) {
      router.replace('/auth');
    } else if (session && onAuthScreen) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  return loading;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const loading = useAuthGate();

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Celebration' }} />
        <Stack.Screen
          name="onboarding"
          options={{ presentation: 'modal', title: 'Welcome' }}
        />
        <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
