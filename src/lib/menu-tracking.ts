export function trackMenuOpen(serviceId?: string | null): void {
  if (!serviceId) return;
  if (typeof window === "undefined") return;

  try {
    void fetch("/api/menu/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ service_id: serviceId }),
    }).catch(() => {
      // Fire-and-forget — never block menu navigation.
    });
  } catch {
    // ignore
  }
}
