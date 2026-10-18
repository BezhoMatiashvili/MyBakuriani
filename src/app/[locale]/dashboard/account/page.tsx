"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Loader2, Mail, Phone, Plus, ShieldCheck, Unlink } from "lucide-react";
import type { Provider, UserIdentity } from "@supabase/supabase-js";
import { useAuth } from "@/lib/hooks/useAuth";
import { isPhoneAuthEnabled } from "@/lib/auth/phone";
import { formatPhone } from "@/lib/utils/format";
import PhoneOtpForm from "@/components/auth/PhoneOtpForm";
import ChangePasswordCard from "@/components/auth/ChangePasswordCard";
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
    startPhoneChange,
    verifyPhoneChange,
  } = useAuth();
  const phoneEnabled = isPhoneAuthEnabled();
  // The number this account signs in with by SMS code (C48), once verified.
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);

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
    setVerifiedPhone(user.phone && user.phone_confirmed_at ? user.phone : null);
    getUserIdentities()
      .then(setIdentities)
      .catch(() => setError(t("errors.loadFailed")))
      .finally(() => setLoading(false));

    // Notification preferences live on the same account screen. A failure here
    // must not block the identity list, so it degrades to hiding the section.
    createClient()
      .from("profiles")
      .select(
        "marketing_sms_consent, marketing_email_consent, marketing_whatsapp_consent, push_consent",
      )
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

  // The code goes to the new number; once verified the number is this
  // account's phone sign-in (a "Phone" identity), so signing in by SMS lands
  // here instead of creating a second, empty account.
  async function verifyNewPhone(phone: string, code: string) {
    const data = await verifyPhoneChange(phone, code);
    setVerifiedPhone(data.user?.phone || phone);
    setEditingPhone(false);
    setPhoneNotice(t("phone.saved"));
    getUserIdentities()
      .then(setIdentities)
      .catch(() => {});
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
                  className="flex flex-col items-start gap-1 rounded-xl border border-[#E2E8F0] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex shrink-0 items-center gap-3">
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
                      className="flex min-h-11 items-center gap-1.5 pl-12 text-xs font-bold text-[#EF4444] hover:underline disabled:opacity-50 sm:min-h-0 sm:pl-0"
                    >
                      {unlinkingId === identity.identity_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Unlink className="size-3.5" />
                      )}
                      {t("unlink")}
                    </button>
                  ) : (
                    <span className="pl-12 text-xs font-medium text-[#94A3B8] sm:pl-0 sm:text-right">
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
                className="min-h-11 flex-1 sm:min-h-0"
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

      {phoneEnabled && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-[24px] border bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:p-8"
        >
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC]">
                <Phone className="size-4 text-[#64748B]" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  {t("phone.title")}
                </h2>
                <p className="mt-1 text-[13px] font-medium text-[#64748B]">
                  {t("phone.hint")}
                </p>
                <p className="mt-2 text-sm font-bold text-[#0F172A]">
                  {verifiedPhone ? formatPhone(verifiedPhone) : t("phone.none")}
                </p>
                {phoneNotice && (
                  <p role="status" className="mt-1 text-xs text-green-700">
                    {phoneNotice}
                  </p>
                )}
              </div>
            </div>
            {!editingPhone && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingPhone(true);
                  setPhoneNotice(null);
                }}
                className="min-h-11 w-full shrink-0 sm:min-h-0 sm:w-auto"
              >
                {verifiedPhone ? t("phone.change") : t("phone.add")}
              </Button>
            )}
          </div>
          {editingPhone && (
            <div className="mt-5 max-w-[420px]">
              <PhoneOtpForm
                idPrefix="account"
                onSend={startPhoneChange}
                onVerify={verifyNewPhone}
                onCancel={() => setEditingPhone(false)}
              />
            </div>
          )}
        </motion.div>
      )}

      <ChangePasswordCard />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex flex-col items-start gap-4 rounded-[24px] border bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF]">
            <ShieldCheck className="size-4 text-[#1E3A8A]" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">
              {t("ownership.title")}
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#64748B]">
              {t("ownership.accountCardText")}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/account/ownership"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] sm:w-auto"
        >
          {t("ownership.accountCardCta")}
        </Link>
      </motion.div>

      {prefs ? <NotificationPreferences initial={prefs} /> : null}
    </div>
  );
}
