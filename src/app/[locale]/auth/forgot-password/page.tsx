"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { isAuthApiError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";

export default function ForgotPasswordPage() {
  const t = useTranslations("AuthForgotPassword");
  const searchParams = useSearchParams();
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "invalid_link") {
      setError(t("errors.linkExpired"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      setError(t("errors.fillAllFields"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPasswordForEmail(email);
      setSent(true);
    } catch (err) {
      if (isAuthApiError(err) && err.status === 429) {
        setError(t("errors.tooManyRequests"));
      } else {
        // Avoid leaking whether the email exists in the system — show the
        // same neutral success state for any error other than a 429.
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
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
          {sent ? (
            <div className="space-y-5">
              <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
                {t("linkSent")}
              </div>
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
