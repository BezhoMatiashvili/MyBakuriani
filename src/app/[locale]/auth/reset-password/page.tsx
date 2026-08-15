"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withRetry } from "@/lib/with-timeout";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/dashboard/admin",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/entertainment",
  transport: "/dashboard/transport",
  employment: "/dashboard/employment",
  handyman: "/dashboard/services",
};

export default function ResetPasswordPage() {
  const t = useTranslations("AuthResetPassword");
  const router = useRouter();
  const { session, loading: authLoading, updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError(t("errors.fillAllFields"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("errors.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("errors.passwordsMismatch"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile, error: profErr } = await withRetry(() =>
          supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle(),
        );
        const target =
          !profErr && profile
            ? (ROLE_DASHBOARD[profile.role] ?? "/dashboard/guest")
            : "/dashboard/guest";
        router.refresh();
        router.push(target);
      }
    } catch {
      setError(t("errors.generic"));
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
        </div>

        <div className="rounded-[24px] border bg-white p-10 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)]">
          {authLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-6 animate-spin text-[#94A3B8]" />
            </div>
          ) : !session ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-[#94A3B8]">{t("noSession")}</p>
              <Link
                href="/auth/forgot-password"
                className="block text-center text-sm font-medium text-brand-accent hover:underline"
              >
                {t("requestNewLink")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="reset-password" className="text-sm font-medium">
                  {t("passwordLabel")}
                </label>
                <div className="relative">
                  <input
                    id="reset-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="reset-confirm-password"
                  className="text-sm font-medium"
                >
                  {t("confirmPasswordLabel")}
                </label>
                <input
                  id="reset-confirm-password"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
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
                {t("submit")}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
