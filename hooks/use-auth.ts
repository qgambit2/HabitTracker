import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { resetLocalState, setSyncListener } from '@/hooks/use-habits';
import { supabase } from '@/lib/supabase';
import { pullOnLogin, schedulePush, setSyncUser } from '@/lib/sync';

/**
 * Shared auth store, exposed across screens via useSyncExternalStore (same pattern as
 * use-habits.ts) so every screen sees one session with no provider. The session is the
 * source of truth for "who is logged in"; supabase persists/refreshes it (see
 * lib/supabase.ts), and we mirror its changes into this store via onAuthStateChange.
 */

type AuthState = {
  session: Session | null;
  // true until the initial getSession() resolves — lets the gate show a splash
  // instead of flashing the login screen for an already-logged-in user.
  loading: boolean;
};

let state: AuthState = { session: null, loading: true };
const listeners = new Set<() => void>();

function emit() {
  // Fresh object reference so useSyncExternalStore sees a change.
  state = { ...state };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

// Connect or disconnect cloud sync as the signed-in user changes. Tracks the last
// user id so we only pull once per login (onAuthStateChange can fire repeatedly, e.g.
// on TOKEN_REFRESHED, and we don't want to re-pull/overwrite local on every refresh).
//
// `undefined` means "we haven't attached to any user yet this app run" — distinct from
// `null` ("explicitly signed out"). This lets the very first attach preserve local state
// (so pre-auth habits seed into a fresh account), while any *switch* between users wipes
// local first so a new user never inherits the previous user's habits.
let lastSyncedUserId: string | null | undefined = undefined;

function reconcileSync(session: Session | null) {
  const userId = session?.user?.id ?? null;
  if (userId === lastSyncedUserId) return;

  const isFirstAttach = lastSyncedUserId === undefined;
  const switchingUsers = !isFirstAttach && lastSyncedUserId !== userId;
  lastSyncedUserId = userId;

  if (userId) {
    // Clear the previous user's data before loading this one (unless this is the first
    // attach, where local may hold pre-auth habits we want to seed into the account).
    if (switchingUsers) resetLocalState();
    setSyncUser(userId);
    setSyncListener(schedulePush);
    void pullOnLogin(userId);
  } else {
    // Signed out: stop syncing and wipe local so the next user starts clean.
    setSyncListener(null);
    setSyncUser(null);
    resetLocalState();
  }
}

// Hydrate the current session once at module load, then keep it in sync.
supabase.auth.getSession().then(({ data }) => {
  state = { session: data.session, loading: false };
  reconcileSync(data.session);
  emit();
});

supabase.auth.onAuthStateChange((_event, session) => {
  state = { session, loading: false };
  reconcileSync(session);
  emit();
});

export function useAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type AuthResult = { error: string | null };

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}
