"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Eye, EyeOff } from "lucide-react";
import PhoneInput from "@/components/forms/PhoneInput";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/dashboard/admin",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/service",
  transport: "/dashboard/service",
  employment: "/dashboard/service",
  handyman: "/dashboard/service",
};

type AuthTab = "email" | "phone";
type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithOtp, verifyOtp, signUp, signInWithPassword } = useAuth();

  const [tab, setTab] = useState<AuthTab>("email");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fullPhone = `+995${phone}`;

  async function redirectAfterAuth(userId: string) {
    const supabase = createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    if (!profile) {
      router.push("/auth/register");
      return;
    }
    const next = searchParams.get("next");
    router.push(next || (ROLE_DASHBOARD[profile.role] ?? "/dashboard/guest"));
  }

  async function handleSendOtp() {
    if (phone.length !== 9) {
      setError("გთხოვთ შეიყვანოთ სწორი ტელეფონის ნომერი");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithOtp(fullPhone);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setError("გთხოვთ შეიყვანოთ 6-ციფრიანი კოდი");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await verifyOtp(fullPhone, otp);
      if (data?.user) await redirectAfterAuth(data.user.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "არასწორი კოდი. სცადეთ თავიდან.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin() {
    if (!email.trim() || !password) {
      setError("გთხოვთ შეავსოთ ყველა ველი");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await signInWithPassword(email.trim(), password);
      if (data?.user) await redirectAfterAuth(data.user.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "არასწორი ელ. ფოსტა ან პაროლი",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailRegister() {
    if (!email.trim() || !password) {
      setError("გთხოვთ შეავსოთ ყველა ველი");
      return;
    }
    if (password.length < 6) {
      setError("პაროლი მინიმუმ 6 სიმბოლო");
      return;
    }
    if (password !== confirmPassword) {
      setError("პაროლები არ ემთხვევა");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await signUp(email.trim(), password);
      if (data?.user && !data.user.identities?.length) {
        setError("ეს ელ. ფოსტა უკვე რეგისტრირებულია.");
        return;
      }
      if (data?.session && data.user) await redirectAfterAuth(data.user.id);
      else if (!data?.session)
        setSuccessMessage(
          "დადასტურების ბმული გამოგზავნილია თქვენს ელ. ფოსტაზე.",
        );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.includes("already registered")
          ? "ეს ელ. ფოსტა უკვე რეგისტრირებულია."
          : msg || "შეცდომა.",
      );
    } finally {
      setLoading(false);
    }
  }

  function switchTab(t: AuthTab) {
    setTab(t);
    setError(null);
    setSuccessMessage(null);
  }
  function switchMode(m: AuthMode) {
    setAuthMode(m);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12">
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
          <p className="mt-1 text-xs text-[#94A3B8]">პრემიუმ ეკოსისტემა</p>
          <div className="mx-auto mt-4 flex w-48 gap-1">
            <div className="h-[3px] flex-1 rounded-full bg-brand-accent" />
            <div className="h-[3px] flex-1 rounded-full bg-[#F8FAFC]" />
          </div>
          <h1 className="mt-6 text-xl font-black text-[#1E293B]">
            შესვლა / რეგისტრაცია
          </h1>
        </div>

        <div className="flex rounded-xl bg-[#F8FAFC] p-1">
          <button
            type="button"
            onClick={() => switchTab("email")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${tab === "email" ? "bg-white text-[#1E293B] shadow-[0px_1px_3px_rgba(0,0,0,0.05)]" : "text-[#94A3B8]"}`}
          >
            ელ. ფოსტა
          </button>
          <button
            type="button"
            onClick={() => switchTab("phone")}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${tab === "phone" ? "bg-white text-[#1E293B] shadow-[0px_1px_3px_rgba(0,0,0,0.05)]" : "text-[#94A3B8]"}`}
          >
            ტელეფონი
          </button>
        </div>

        <div className="rounded-[24px] border bg-white p-10 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)]">
          <AnimatePresence mode="wait">
            {tab === "email" ? (
              <motion.div
                key={`email-${authMode}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-5"
              >
                {successMessage ? (
                  <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
                    {successMessage}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">ელ. ფოსტა</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="example@mail.com"
                        className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">პაროლი</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
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
                    {authMode === "register" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          პაროლის დადასტურება
                        </label>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••"
                          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]/50"
                        />
                      </div>
                    )}
                    {error && <p className="text-xs text-[#EF4444]">{error}</p>}
                    <Button
                      onClick={
                        authMode === "login"
                          ? handleEmailLogin
                          : handleEmailRegister
                      }
                      disabled={loading || !email.trim() || !password}
                      className="w-full"
                      size="lg"
                    >
                      {loading && (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      )}
                      {authMode === "login" ? "შესვლა" : "რეგისტრაცია"}
                    </Button>
                    <button
                      type="button"
                      onClick={() =>
                        switchMode(authMode === "login" ? "register" : "login")
                      }
                      className="w-full text-center text-sm text-[#94A3B8]"
                    >
                      {authMode === "login"
                        ? "არ გაქვთ ანგარიში? რეგისტრაცია"
                        : "უკვე გაქვთ ანგარიში? შესვლა"}
                    </button>
                  </>
                )}
              </motion.div>
            ) : step === 1 ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback`,
                      },
                    });
                  }}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#4285F4"
                      d="M22.5 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.22-4.74 3.22-8.07z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.12A6.98 6.98 0 0 1 5.47 12c0-.74.13-1.46.37-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.48c1.61 0 3.06.55 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.41 9.14 5.48 12 5.48z"
                    />
                  </svg>
                  გაგრძელება Google-ით
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signInWithOAuth({
                      provider: "facebook",
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback`,
                      },
                    });
                  }}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#1877F2"
                      d="M24 12a12 12 0 1 0-13.88 11.85v-8.39H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.39A12 12 0 0 0 24 12z"
                    />
                  </svg>
                  გაგრძელება Facebook-ით
                </button>
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-[#E2E8F0]" />
                  <span className="mx-3 text-[11px] font-medium uppercase text-[#94A3B8]">
                    ან
                  </span>
                  <div className="flex-grow border-t border-[#E2E8F0]" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    ტელეფონის ნომერი
                  </label>
                  <PhoneInput value={phone} onChange={setPhone} error={error} />
                </div>
                <Button
                  onClick={handleSendOtp}
                  disabled={loading || phone.length < 9}
                  className="w-full"
                  size="lg"
                >
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  SMS კოდის მიღება
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">ერთჯერადი კოდი</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-[#DBEAFE]/50"
                  />
                  {error && <p className="text-xs text-[#EF4444]">{error}</p>}
                </div>
                <Button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length < 6}
                  className="w-full"
                  size="lg"
                >
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  დადასტურება
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setError(null);
                  }}
                  className="w-full text-center text-sm text-[#94A3B8]"
                >
                  ნომრის შეცვლა
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-[#94A3B8]">
          შესვლით თქვენ ეთანხმებით{" "}
          <Link href="/terms" className="underline">
            მომსახურების პირობებს
          </Link>{" "}
          და{" "}
          <Link href="/terms#confidentiality" className="underline">
            კონფიდენციალურობის პოლიტიკას
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
