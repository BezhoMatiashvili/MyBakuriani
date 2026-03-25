"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { User, Users, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";

const ROLES: { value: Enums<"user_role">; label: string; icon: string }[] = [
  { value: "guest", label: "სტუმარი", icon: "🏠" },
  { value: "renter", label: "გამქირავებელი", icon: "🔑" },
  { value: "seller", label: "გამყიდველი", icon: "💰" },
  { value: "cleaner", label: "დამლაგებელი", icon: "🧹" },
  { value: "food", label: "კვება", icon: "🍽️" },
  { value: "entertainment", label: "გართობა", icon: "🎿" },
  { value: "transport", label: "ტრანსპორტი", icon: "🚗" },
  { value: "employment", label: "დასაქმება", icon: "💼" },
  { value: "handyman", label: "ხელოსანი", icon: "🔧" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [selectedRole, setSelectedRole] = useState<Enums<"user_role"> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [authLoading, user, router]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProfileSubmit() {
    if (!displayName.trim()) {
      setError("გთხოვთ შეიყვანოთ სახელი");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleRoleSubmit() {
    if (!selectedRole || !user) return;
    setLoading(true);
    setError(null);

    try {
      let uploadedAvatarUrl: string | null = null;

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const path = `avatars/${user.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("property-photos")
          .upload(path, avatarFile, { upsert: true });
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-photos").getPublicUrl(path);
        uploadedAvatarUrl = publicUrl;
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        phone: user.phone || "",
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: uploadedAvatarUrl,
        role: selectedRole,
      });

      if (profileError) throw profileError;

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-accent/10">
            {step === 1 ? (
              <User className="size-8 text-brand-accent" />
            ) : (
              <Users className="size-8 text-brand-accent" />
            )}
          </div>
          <h1 className="text-2xl font-bold">
            {step === 1 ? "პროფილის შექმნა" : "აირჩიეთ როლი"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === 1
              ? "შეავსეთ თქვენი პროფილის ინფორმაცია"
              : "რა როლით გსურთ პლატფორმის გამოყენება?"}
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Avatar */}
                <div className="flex justify-center">
                  <label className="group relative cursor-pointer">
                    <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/25 bg-muted transition-colors group-hover:border-brand-accent/50">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="ავატარი"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Camera className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <span className="mt-1 block text-center text-xs text-muted-foreground">
                      ფოტოს ატვირთვა
                    </span>
                  </label>
                </div>

                {/* Display name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    სახელი <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="თქვენი სახელი"
                    className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/50"
                  />
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">ბიო</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="მოკლე აღწერა..."
                    rows={3}
                    className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/50"
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  onClick={handleProfileSubmit}
                  disabled={!displayName.trim()}
                  className="w-full"
                  size="lg"
                >
                  შემდეგი
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="role"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {ROLES.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setSelectedRole(role.value)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        selectedRole === role.value
                          ? "border-brand-accent bg-brand-accent/5 shadow-sm"
                          : "border-transparent bg-muted/50 hover:border-muted-foreground/20"
                      }`}
                    >
                      <span className="text-2xl">{role.icon}</span>
                      <span className="text-sm font-medium">{role.label}</span>
                    </button>
                  ))}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1"
                    size="lg"
                  >
                    უკან
                  </Button>
                  <Button
                    onClick={handleRoleSubmit}
                    disabled={loading || !selectedRole}
                    className="flex-1"
                    size="lg"
                  >
                    {loading ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    დასრულება
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
