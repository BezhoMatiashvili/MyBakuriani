"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Provider,
  User,
  Session,
  UserIdentity,
} from "@supabase/supabase-js";
import { withRetry, isRetryableAuthError } from "@/lib/with-timeout";
import { clearSupportChat } from "@/lib/support/storage";

export function useAuth() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    // .finally guarantees loading clears even if getSession rejects — otherwise
    // auth-gated UI would spin forever.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Only change `user` identity when the signed-in user actually changes.
      // onAuthStateChange also fires on every TOKEN_REFRESHED with a fresh user
      // object of the SAME id; bumping `user` there needlessly re-ran every
      // `[user]`-dependent effect across the app (profile/balance refetches,
      // realtime re-subscribes), multiplying load on each token refresh.
      const nextUser = session?.user ?? null;
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser));
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signUp(email: string, password: string) {
    const { data, error } = await withRetry(
      () => supabase.auth.signUp({ email, password }),
      isRetryableAuthError,
    );
    if (error) throw error;
    return data;
  }

  async function signInWithPassword(email: string, password: string) {
    const { data, error } = await withRetry(
      () => supabase.auth.signInWithPassword({ email, password }),
      isRetryableAuthError,
    );
    if (error) throw error;
    return data;
  }

  // Not retried (C51): when a slow answer is lost after GoTrue sent the email,
  // a retry either lands in the 60 s resend window (a 429 shown as an error)
  // or sends a second email whose new token kills the first link.
  async function resetPasswordForEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });
    if (error) throw error;
  }

  // Not retried (C51): when the change commits and the answer is lost, the
  // retry gets 422 same_password, an error for a password that did change.
  async function updatePassword(password: string) {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  // The settings card's change (C51). updateUser takes a new password without
  // any proof, so the current one is checked first by signing in with it: a
  // failed sign-in leaves the session as it was, a successful one gives a
  // fresh session (so the hosted 24 h re-authentication rule cannot fire).
  async function changePassword(
    email: string,
    currentPassword: string,
    newPassword: string,
  ) {
    await signInWithPassword(email, currentPassword);
    return updatePassword(newPassword);
  }

  // Phone sign-in (C48). One call covers sign-up and sign-in: Supabase creates
  // the account for a new number. `data` lands in user_metadata only on
  // sign-up (the C41 signup-link hand-off). The code goes out through the
  // auth-send-sms hook. Not retried: a retry would send a second SMS.
  async function signInWithPhone(phone: string, data?: Record<string, string>) {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: data ? { data } : undefined,
    });
    if (error) throw error;
  }

  async function verifyPhoneOtp(phone: string, token: string) {
    const { data, error } = await withRetry(
      () => supabase.auth.verifyOtp({ phone, token, type: "sms" }),
      isRetryableAuthError,
    );
    if (error) throw error;
    return data;
  }

  // Attaches (or replaces) the signed-in user's phone: the code goes to the
  // NEW number, and the number becomes a sign-in method once verified.
  async function startPhoneChange(phone: string) {
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) throw error;
  }

  async function verifyPhoneChange(phone: string, token: string) {
    const { data, error } = await withRetry(
      () => supabase.auth.verifyOtp({ phone, token, type: "phone_change" }),
      isRetryableAuthError,
    );
    if (error) throw error;
    return data;
  }

  async function signOut() {
    clearSupportChat();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  // Attaches an OAuth identity to the CURRENTLY signed-in user (not a new
  // sign-in) — full-page redirect through the provider, back through
  // /auth/callback. Supabase's `linkIdentity` only supports OAuth/OIDC
  // providers; phone/email use a separate `updateUser()` mechanism.
  async function linkIdentity(provider: Provider) {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/account`,
      },
    });
    if (error) throw error;
  }

  async function unlinkIdentity(identity: UserIdentity) {
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) throw error;
  }

  async function getUserIdentities() {
    const { data, error } = await withRetry(
      () => supabase.auth.getUserIdentities(),
      isRetryableAuthError,
    );
    if (error) throw error;
    return data.identities;
  }

  return {
    user,
    session,
    loading,
    signUp,
    signInWithPassword,
    resetPasswordForEmail,
    updatePassword,
    changePassword,
    signInWithPhone,
    verifyPhoneOtp,
    startPhoneChange,
    verifyPhoneChange,
    signOut,
    linkIdentity,
    unlinkIdentity,
    getUserIdentities,
  };
}
