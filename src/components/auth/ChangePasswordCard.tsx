"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { KeyRound, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  MIN_PASSWORD_LENGTH,
  passwordChangeErrorKey,
} from "@/lib/auth/password";

const INPUT =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]/50";

const LINK_BUTTON =
  "inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] sm:min-h-9 sm:w-auto";

// C51: password change for a signed-in user, mounted bare on every cabinet's
// settings page. A session alone never sets a password: an account with one
// proves the current password (useAuth().changePassword), and an account
// without one (Google-only) sets it through the emailed reset link, which
// proves the address.
export default function ChangePasswordCard() {
  const t = useTranslations("DashboardAccount");
  const { user, loading, changePassword } = useAuth();
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Password sign-in is by email: a phone-only account has nothing to change.
  if (loading || !user?.email) return null;
  const email = user.email;
  const hasPassword = (user.identities ?? []).some(
    (identity) => identity.provider === "email",
  );

  function close() {
    setEditing(false);
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!currentPassword || !password || !confirmPassword) {
      setError(t("password.errors.fillAllFields"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("password.errors.tooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("password.errors.mismatch"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePassword(email, currentPassword, password);
      close();
      setNotice(t("password.saved"));
    } catch (err) {
      setError(t(`password.errors.${passwordChangeErrorKey(err)}`));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.13 }}
      className="rounded-[24px] border bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:p-8"
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F8FAFC]">
            <KeyRound className="size-4 text-[#64748B]" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">
              {t("password.title")}
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#64748B]">
              {hasPassword ? t("password.hint") : t("password.noPasswordHint")}
            </p>
            {notice && (
              <p role="status" className="mt-1 text-xs text-green-700">
                {notice}
              </p>
            )}
          </div>
        </div>
        {!hasPassword ? (
          <Link href="/auth/forgot-password" className={LINK_BUTTON}>
            {t("password.setViaEmail")}
          </Link>
        ) : (
          !editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(true);
                setNotice(null);
              }}
              className="min-h-11 w-full shrink-0 sm:min-h-0 sm:w-auto"
            >
              {t("password.change")}
            </Button>
          )
        )}
      </div>
      {hasPassword && editing && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-5 max-w-[420px] space-y-4"
        >
          {/* Lets a password manager store the new password for this account. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <div className="space-y-2">
            <label
              htmlFor="account-current-password"
              className="text-sm font-medium"
            >
              {t("password.currentLabel")}
            </label>
            <input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={INPUT}
            />
            <Link
              href="/auth/forgot-password"
              className="inline-block text-xs font-medium text-brand-accent hover:underline"
            >
              {t("password.forgotCurrent")}
            </Link>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="account-new-password"
              className="text-sm font-medium"
            >
              {t("password.newLabel")}
            </label>
            <input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="account-confirm-password"
              className="text-sm font-medium"
            >
              {t("password.confirmLabel")}
            </label>
            <input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={INPUT}
            />
          </div>
          {error && <p className="text-xs text-[#EF4444]">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              disabled={saving}
              className="min-h-11 w-full sm:min-h-0 sm:w-auto"
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("password.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={saving}
              className="min-h-11 w-full sm:min-h-0 sm:w-auto"
            >
              {t("password.cancel")}
            </Button>
          </div>
        </form>
      )}
    </motion.div>
  );
}
