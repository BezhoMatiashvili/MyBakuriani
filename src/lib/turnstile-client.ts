"use client";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      execute: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

let loader: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile_unavailable"));
    document.head.appendChild(script);
  });
  return loader;
}

/** Obtains a one-time invisible Turnstile token immediately before a reveal. */
export async function getTurnstileToken(): Promise<string | null> {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!sitekey) return null;
  try {
    await loadTurnstile();
    if (!window.turnstile) return null;
    return await new Promise<string | null>((resolve) => {
      const host = document.createElement("div");
      host.style.display = "none";
      document.body.appendChild(host);
      let widgetId = "";
      const cleanup = () => {
        if (widgetId) window.turnstile?.remove(widgetId);
        host.remove();
      };
      const timer = window.setTimeout(() => {
        cleanup();
        resolve(null);
      }, 8_000);
      const turnstile = window.turnstile;
      if (!turnstile) {
        cleanup();
        resolve(null);
        return;
      }
      widgetId = turnstile.render(host, {
        sitekey,
        size: "invisible",
        callback: (token: string) => {
          window.clearTimeout(timer);
          cleanup();
          resolve(token);
        },
        "error-callback": () => {
          window.clearTimeout(timer);
          cleanup();
          resolve(null);
        },
        "expired-callback": () => {
          window.clearTimeout(timer);
          cleanup();
          resolve(null);
        },
      });
      turnstile.execute(widgetId);
    });
  } catch {
    return null;
  }
}
