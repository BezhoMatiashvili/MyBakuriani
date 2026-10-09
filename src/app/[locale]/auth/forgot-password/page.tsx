"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { resetRequestOutcome } from "@/lib/auth/password-reset";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/lib/site-contact";

export default function ForgotPasswordPage() {
  const t = useTranslations("AuthForgotPassword");
  const searchParams = useSearchParams();
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The address a link went to; the page then offers a resend instead of the
  // form. `resendAt` is a clock time, so the countdown stays right while the
  // phone is in the mail app and timers here are paused.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (searchParams.get("error") === "invalid_link") {
      setError(t("errors.linkExpired"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendAt) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [resendAt]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // C51: a request inside GoTrue's resend window means a link already went to
  // this address moments ago, so it lands on the sent state with a countdown;
  // only "nothing was sent" outcomes are errors, and each says what to do.
  async function requestLink(address: string) {
    setLoading(true);
    setError(null);
    let failure: unknown = null;
    try {
      await resetPasswordForEmail(address);
    } catch (err) {
      failure = err;
    }
    setLoading(false);
    const outcome = resetRequestOutcome(failure);
    if (outcome.kind === "sent") {
      const at = Date.now();
      setSentTo(address);
      setNow(at);
      setResendAt(at + outcome.resendIn * 1000);
    } else if (outcome.kind === "mailUnavailable") {
      setError(
        t("errors.mailUnavailable", {
          phone: CONTACT_PHONE_DISPLAY,
          email: CONTACT_EMAIL,
        }),
      );
    } else if (outcome.kind === "ipLimited") {
      setError(t("errors.tooManyRequests"));
    } else {
      setError(t("errors.network"));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("errors.fillAllFields"));
      return;
    }
    await requestLink(email.trim());
  }

  return (
    <div className="flex min-h-[calc(100dvh-160px)] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] space-y-8"
      >
        <div className="text-center">
          <h2 className="text-2xl font-black">
            <span className="text-[#1E293B]">My</span>
            <span className="text-brand-accent">Bakuriani</span>
          </h2>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-black text-[#1E293B]">{t("title")}</h1>
          <p className="mt-2 text-sm text-[#94A3B8]">{t("subtitle")}</p>
        </div>

        <div className="rounded-[24px] border bg-white p-10 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)]">
          {sentTo ? (
            <div className="space-y-5">
              <div
                role="status"
                className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700"
              >
                <p>{t("linkSent")}</p>
                <p className="mt-2 text-xs">{t("checkSpam")}</p>
              </div>
              {error && <p className="text-xs text-[#EF4444]">{error}</p>}
              <Button
                type="button"
                variant="outline"
                disabled={loading || resendIn > 0}
                onClick={() => void requestLink(sentTo)}
                className="min-h-11 w-full lg:min-h-0"
                size="lg"
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {resendIn > 0
                  ? t("resendIn", { seconds: resendIn })
                  : t("resend")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
                className="block min-h-11 w-full text-center text-sm font-medium text-[#64748B] hover:underline lg:min-h-0"
              >
                {t("otherEmail")}
              </button>
              <Link
                href="/auth/login"
                className="block text-center text-sm font-medium text-brand-accent hover:underline"
              >
                {t("backToLogin")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="forgot-email" className="text-sm font-medium">
                  {t("emailLabel")}
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]/50"
                />
              </div>
              {error && <p className="text-xs text-[#EF4444]">{error}</p>}
              <Button
                type="submit"
                disabled={loading}
                className="min-h-11 w-full lg:min-h-0"
                size="lg"
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t("sendLink")}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
