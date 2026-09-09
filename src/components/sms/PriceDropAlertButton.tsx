"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/hooks/useAuth";

// Mirrors SmsFeatureMode from @/lib/sms/feature-flags (a server-only module this
// client component must not import). "off" never reaches here — SaleDetailClient
// doesn't render the button at all in that mode.
type PriceAlertMode = "on" | "qa";

export function PriceDropAlertButton({
  propertyId,
  ownerId,
  mode = "on",
}: {
  propertyId: string;
  ownerId?: string | null;
  mode?: PriceAlertMode;
}) {
  const t = useTranslations("PriceDropSms.public");
  const router = useRouter();
  const { user, loading } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  // In "qa" mode only allow-listed users may see the button; that list is
  // server-only, so visibility waits on the GET eligibility probe (the API
  // route 404s feature_unavailable for everyone else). In "on" mode the
  // button shows immediately (matching the old SSR behavior, incl. anonymous).
  const [qaEligible, setQaEligible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void fetch(`/api/listings/property/${propertyId}/price-drop-alert`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { subscribed?: boolean } | null) => {
        if (payload) setQaEligible(true);
        setSubscribed(payload?.subscribed === true);
      });
  }, [propertyId, user]);

  // Owner never sees their own listing's alert button (was enforced server-side
  // pre-ISR; the API route still rejects self-subscription regardless).
  if (loading) return null;
  if (user && ownerId && user.id === ownerId) return null;
  if (mode === "qa" && !qaEligible) return null;

  const toggle = async () => {
    if (loading || busy) return;
    if (!user) {
      // Was a full document load to a hand-built, locale-prefixed login URL.
      // That was wrong twice over: localePrefix is "as-needed", so the default
      // locale's prefixed URL 307-redirects to the unprefixed one — a second
      // round trip on top of the reload. The locale-aware router from
      // @/i18n/navigation builds the correct URL and navigates client-side.
      const next = encodeURIComponent(window.location.pathname);
      router.push(`/auth/login?next=${next}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/listings/property/${propertyId}/price-drop-alert`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !subscribed }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        const key = payload?.error as string;
        throw new Error(
          key === "verified_phone_required"
            ? t("phoneRequired")
            : key === "marketing_opted_out"
              ? t("optedOut")
              : t("error"),
        );
      }
      setSubscribed(payload.subscribed === true);
      toast.success(payload.subscribed ? t("enabled") : t("disabled"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const Icon = subscribed ? BellRing : Bell;
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={subscribed}
      onClick={toggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${subscribed ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]" : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#93C5FD]"}`}
    >
      <Icon className="size-4" />
      {t(subscribed ? "active" : "action")}
    </button>
  );
}
