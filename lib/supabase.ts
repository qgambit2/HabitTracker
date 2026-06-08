import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

// Config comes from .env.local (gitignored). EXPO_PUBLIC_* vars are inlined by Expo
// at build time. The anon/publishable key is safe to ship — RLS enforces per-user
// access at the database (see supabase/schema.sql).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Copy .env.example to .env.local and set ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Metro.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in AsyncStorage on native; on web the SDK uses its own
    // storage, so we only override off-web (matches the Supabase Expo guide).
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native (that's a web-OAuth concern).
    detectSessionInUrl: false,
  },
});

// Auto-refresh only makes sense while the app is in the foreground. Start/stop the
// refresh timer with app state so we don't burn refreshes in the background. Native
// only — AppState 'active'/'background' isn't meaningful on web.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
