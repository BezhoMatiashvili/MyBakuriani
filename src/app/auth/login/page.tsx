"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Shield, Loader2 } from "lucide-react";
import PhoneInput from "@/components/forms/PhoneInput";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { signInWithOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = `+995${phone}`;

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
      if (data?.user) {
        router.push("/auth/register");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "არასწორი კოდი. სცადეთ თავიდან.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-accent/10">
            {step === 1 ? (
              <Phone className="size-8 text-brand-accent" />
            ) : (
              <Shield className="size-8 text-brand-accent" />
            )}
          </div>
          <h1 className="text-2xl font-bold">
            {step === 1 ? "შესვლა" : "კოდის დადასტურება"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 1
              ? "შეიყვანეთ თქვენი ტელეფონის ნომერი"
              : `კოდი გაგზავნილია ${fullPhone}-ზე`}
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <AnimatePresence mode="wait">
            {step === 1 ? (
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
                  {loading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
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
                    className="w-full rounded-lg border border-input bg-background px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none transition-colors focus:ring-2 focus:ring-ring/50"
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>

                <Button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length < 6}
                  className="w-full"
                  size="lg"
                >
                  {loading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  დადასტურება
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setError(null);
                  }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  ნომრის შეცვლა
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Terms */}
        <p className="text-center text-xs text-muted-foreground">
          შესვლით თქვენ ეთანხმებით{" "}
          <a href="/terms" className="underline hover:text-foreground">
            მომსახურების პირობებს
          </a>{" "}
          და{" "}
          <a
            href="/terms#confidentiality"
            className="underline hover:text-foreground"
          >
            კონფიდენციალურობის პოლიტიკას
          </a>
        </p>
      </motion.div>
    </div>
  );
}
