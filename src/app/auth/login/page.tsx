"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Phone, Shield, Loader2, Eye, EyeOff } from "lucide-react";
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
                className="space-y-6"
              >
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
                  კოდის გაგზავნა
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
          <a href="/terms" className="underline">
            მომსახურების პირობებს
          </a>{" "}
          და{" "}
          <a href="/terms#confidentiality" className="underline">
            კონფიდენციალურობის პოლიტიკას
          </a>
        </p>
      </motion.div>
    </div>
  );
}
