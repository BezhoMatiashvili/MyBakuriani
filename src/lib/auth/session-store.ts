"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Listener = (user: User | null) => void;

// One getSession() + one onAuthStateChange() for every subscriber, instead of
// one of each per listing card: GoTrue serializes both through a Web Lock and
// re-reads the auth cookie for each, so a page of cards queued dozens of them.
const listeners = new Set<Listener>();
let started = false;
let known = false;
let current: User | null = null;

function publish(user: User | null) {
  known = true;
  current = user;
  for (const listener of listeners) listener(user);
}

function start() {
  if (started) return;
  started = true;
  const supabase = createClient();
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => publish(session?.user ?? null))
    .catch(() => {});
  supabase.auth.onAuthStateChange((_event, session) =>
    publish(session?.user ?? null),
  );
}

/**
 * Subscribes to the signed-in user. Like useAuth(), the answer always arrives
 * asynchronously, after the subscriber's first render: a late subscriber gets
 * the last known user replayed on a microtask, never during subscribe().
 */
export function subscribeAuthUser(listener: Listener): () => void {
  listeners.add(listener);
  start();
  if (known) {
    queueMicrotask(() => {
      if (listeners.has(listener)) listener(current);
    });
  }
  return () => {
    listeners.delete(listener);
  };
}
