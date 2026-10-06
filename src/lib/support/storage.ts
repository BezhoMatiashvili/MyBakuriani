// Where the support chat keeps its conversation between page changes (C43):
// sessionStorage of this tab only, never sent anywhere. Cleared on sign-out
// so the next person at a shared device does not see it; the saved owner
// and an idle timeout (SupportAssistant.tsx) cover the paths that skip that.

export const SUPPORT_STORAGE_KEY = "mb.jev.v2";

/** Forgets the support conversation of this tab (call on every sign-out). */
export function clearSupportChat(): void {
  try {
    window.sessionStorage.removeItem(SUPPORT_STORAGE_KEY);
    // The key before 2026-10-06 (no owner recorded).
    window.sessionStorage.removeItem("mb.jev.v1");
  } catch {
    // Storage unavailable: nothing was saved.
  }
}
