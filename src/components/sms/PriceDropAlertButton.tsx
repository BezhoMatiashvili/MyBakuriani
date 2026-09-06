"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/hooks/useAuth";

export function PriceDropAlertButton({ propertyId }: { propertyId: string }) {
  const t = useTranslations("PriceDropSms.public");
  const router = useRouter();
  const { user, loading } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void fetch(`/api/listings/property/${propertyId}/price-drop-alert`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { subscribed?: boolean } | null) =>
        setSubscribed(payload?.subscribed === true),
      );
  }, [propertyId, user]);

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
