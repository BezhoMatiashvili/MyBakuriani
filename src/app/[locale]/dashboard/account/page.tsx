"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, Phone, Plus, Unlink } from "lucide-react";
import type { Provider, UserIdentity } from "@supabase/supabase-js";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import {
  NotificationPreferences,
  type NotificationPreferenceValues,
} from "@/components/consent/NotificationPreferences";

const OAUTH_PROVIDERS: Provider[] = ["google"];

const PROVIDER_ICON: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
};

function providerLabelKey(provider: string) {
  return ["phone", "email", "google", "facebook"].includes(provider)
    ? provider
    : null;
}

export default function LinkedAccountsPage() {
  const t = useTranslations("DashboardAccount");
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    linkIdentity,
    unlinkIdentity,
    getUserIdentities,
  } = useAuth();

  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkingProvider, setLinkingProvider] = useState<Provider | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferenceValues | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    getUserIdentities()
      .then(setIdentities)
      .catch(() => setError(t("errors.loadFailed")))
      .finally(() => setLoading(false));

    // Notification preferences live on the same account screen. A failure here
    // must not block the identity list, so it degrades to hiding the section.
    createClient()
      .from("profiles")
      .select("marketing_sms_consent, marketing_email_consent, push_consent")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs(data);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  function authErrorMessage(err: unknown) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("manual linking")) {
      return t("errors.manualLinkingDisabled");
    }
    if (message.includes("already linked") || message.includes("in use")) {
      return t("errors.alreadyLinked");
    }
    return t("errors.generic");
  }

  async function handleLink(provider: Provider) {
    setError(null);
    setLinkingProvider(provider);
    try {
      await linkIdentity(provider);
      // Successful call redirects the browser to the provider; nothing else
      // to do here. Only a thrown error keeps us on this page.
    } catch (err) {
      setError(authErrorMessage(err));
      setLinkingProvider(null);
    }
  }

  async function handleUnlink(identity: UserIdentity) {
    setError(null);
    setUnlinkingId(identity.identity_id);
    try {
      await unlinkIdentity(identity);
      setIdentities((prev) =>
        (prev ?? []).filter((i) => i.identity_id !== identity.identity_id),
      );
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setUnlinkingId(null);
    }
  }

  const linkedProviders = new Set((identities ?? []).map((i) => i.provider));
  const linkableProviders = OAUTH_PROVIDERS.filter(
    (p) => !linkedProviders.has(p),
  );

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[36px] text-[#0F172A] sm:text-[36px] sm:leading-[44px]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
      </motion.div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-[24px] border bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:p-8"
      >
        <h2 className="text-sm font-bold text-[#0F172A]">{t("linkedTitle")}</h2>
        <div className="mt-4 space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </>
          ) : (
            (identities ?? []).map((identity) => {
              const labelKey = providerLabelKey(identity.provider);
              const Icon = PROVIDER_ICON[identity.provider] ?? Mail;
              const canUnlink = (identities?.length ?? 0) > 1;
              return (
                <div
                  key={identity.identity_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#F8FAFC]">
                      <Icon className="size-4 text-[#64748B]" />
                    </span>
                    <span className="text-sm font-bold text-[#0F172A]">
                      {labelKey
                        ? t(`providers.${labelKey}`)
                        : identity.provider}
                    </span>
                  </div>
                  {canUnlink ? (
                    <button
                      type="button"
                      onClick={() => handleUnlink(identity)}
                      disabled={unlinkingId === identity.identity_id}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#EF4444] hover:underline disabled:opacity-50"
                    >
                      {unlinkingId === identity.identity_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Unlink className="size-3.5" />
                      )}
                      {t("unlink")}
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-[#94A3B8]">
                      {t("cannotUnlinkLast")}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>

      {!loading && linkableProviders.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[24px] border bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:p-8"
        >
          <h2 className="text-sm font-bold text-[#0F172A]">{t("addTitle")}</h2>
          <p className="mt-1 text-[13px] font-medium text-[#64748B]">
            {t("addHint")}
          </p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            {linkableProviders.map((provider) => (
              <Button
                key={provider}
                type="button"
                variant="outline"
                onClick={() => handleLink(provider)}
                disabled={linkingProvider === provider}
                className="flex-1"
              >
                {linkingProvider === provider ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                {t(`linkButton.${provider}`)}
              </Button>
            ))}
          </div>
        </motion.div>
      )}

      {prefs ? <NotificationPreferences initial={prefs} /> : null}
    </div>
  );
}
