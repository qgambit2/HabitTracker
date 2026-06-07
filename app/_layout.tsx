import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import 'react-native-reanimated';

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
