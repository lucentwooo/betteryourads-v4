'use client';

// Browser auth: Supabase client init, approval gate, and authed fetch.
// Ported from auth.js. The DOM overlay screens (sign-in / sign-up / pending /
// recovery markup) now live in the React client (AppRoot); this module is the
// DOM-free auth core plus the sign-in/up/magic-link/recovery actions the React
// screens call. Surface mirrors the old window.Auth.
import {
  createClient,
  type SupabaseClient,
  // `Session` is exported directly by the root package; `AuthChangeEvent` isn't
  // re-exported, so the onAuthStateChange callback param types are derived from
  // the client below instead of imported.
  type Session,
} from '@supabase/supabase-js';

// Param types of the auth-state-change callback, taken from the client itself
// (avoids importing AuthChangeEvent, which the root package doesn't re-export).
type AuthStateChangeCallback = Parameters<SupabaseClient['auth']['onAuthStateChange']>[0];
type AuthChangeEvent = Parameters<AuthStateChangeCallback>[0];

type Profile = { approved: boolean; email: string | null; is_admin: boolean };
type GuardResult = { session: Session; profile: Profile; userId: string };

let client: SupabaseClient | null = null;
let cachedToken: string | null = null;

async function init(): Promise<SupabaseClient> {
  if (client) return client;
  const cfg = await fetch('/api/config').then((r) => r.json());
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error('Supabase is not configured on the server (.env).');
  }
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  return client;
}

function getClient(): SupabaseClient | null {
  return client;
}

function requireClient(): SupabaseClient {
  if (!client) throw new Error('Auth is not initialized. Call Auth.init() first.');
  return client;
}

async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireClient()
    .from('profiles').select('approved,email,is_admin').eq('id', userId).single();
  if (error) return null;
  return data as Profile;
}

// Resolves with { session, profile, userId } only for an approved user.
// `onState` receives every non-approved state so the React layer can render the
// matching gate (no session -> sign in; signed-in-but-unapproved -> pending;
// PASSWORD_RECOVERY -> recovery), mirroring the old overlay branches.
type GuardState =
  | { kind: 'signin' }
  | { kind: 'pending'; email: string | null }
  | { kind: 'recovery' };

function guard(onState: (state: GuardState) => void): Promise<GuardResult> {
  return new Promise<GuardResult>((resolve) => {
    void (async () => {
      await init();
      const c = requireClient();
      let resolved = false;
      async function evaluate(session: Session | null) {
        cachedToken = session ? session.access_token : null;
        if (!session) { onState({ kind: 'signin' }); return; }
        const profile = await getProfile(session.user.id);
        if (profile && profile.approved) {
          if (!resolved) {
            resolved = true;
            resolve({ session, profile, userId: session.user.id });
          }
        } else {
          onState({ kind: 'pending', email: session.user.email ?? null });
        }
      }

      c.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        if (event === 'PASSWORD_RECOVERY') { onState({ kind: 'recovery' }); return; }
        void evaluate(session);
      });
      // A password-reset link lands here with type=recovery in the URL hash.
      if (window.location.hash && window.location.hash.indexOf('type=recovery') !== -1) {
        onState({ kind: 'recovery' });
        return;
      }
      const { data } = await c.auth.getSession();
      await evaluate(data.session);
    })();
  });
}

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const { data } = await requireClient().auth.getSession();
  cachedToken = data.session ? data.session.access_token : null;
  return cachedToken;
}

async function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = Object.assign({}, opts.headers, token ? { Authorization: 'Bearer ' + token } : {});
  return fetch(url, Object.assign({}, opts, { headers }));
}

async function signOut(): Promise<void> {
  if (client) await client.auth.signOut();
  cachedToken = null;
  // Reload so the React client re-renders its sign-in screen. (Avoids
  // hard-redirecting to "/", which is the public marketing landing page.)
  window.location.reload();
}

// ── Auth actions (called by the React sign-in / sign-up / recovery screens) ──
// Each returns Supabase's { error } shape so the UI renders the message.
function redirectTo(): string {
  return window.location.origin + window.location.pathname;
}

function signInWithPassword(email: string, password: string) {
  return requireClient().auth.signInWithPassword({ email, password });
}

function signUp(email: string, password: string) {
  return requireClient().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
}

function resetPasswordForEmail(email: string) {
  return requireClient().auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
}

function signInWithOtp(email: string) {
  return requireClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
}

function updatePassword(password: string) {
  return requireClient().auth.updateUser({ password });
}

// After a recovery password update: strip the recovery token from the URL.
function clearRecoveryHash(): void {
  history.replaceState(null, '', window.location.origin + window.location.pathname);
}

function getSession() {
  return requireClient().auth.getSession();
}

export type { GuardResult, GuardState, Profile };

export const Auth = {
  init,
  guard,
  getToken,
  authedFetch,
  signOut,
  getProfile,
  getSession,
  // auth actions
  signInWithPassword,
  signUp,
  resetPasswordForEmail,
  signInWithOtp,
  updatePassword,
  clearRecoveryHash,
  // client accessor (parity with old Auth.client)
  get client(): SupabaseClient | null { return getClient(); },
};
