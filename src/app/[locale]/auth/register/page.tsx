"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Users,
  Loader2,
  Camera,
  Home,
  Key,
  Wallet,
  SprayCan,
  UtensilsCrossed,
  MountainSnow,
  Car,
  Briefcase,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";
import { SkierLoader } from "@/components/shared/SkierLoader";

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

const ROLES: { value: Enums<"user_role">; icon: LucideIcon }[] = [
  { value: "guest", icon: Home },
  { value: "renter", icon: Key },
  { value: "seller", icon: Wallet },
  { value: "cleaner", icon: SprayCan },
  { value: "food", icon: UtensilsCrossed },
  { value: "entertainment", icon: MountainSnow },
  { value: "transport", icon: Car },
  { value: "employment", icon: Briefcase },
  { value: "handyman", icon: Wrench },
];

export default function RegisterPage() {
  const t = useTranslations("AuthRegister");
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

  const [checkingProfile, setCheckingProfile] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth/login");
      return;
    }

    // Check if user already has a profile — redirect to dashboard if so
    const sb = createClient();
    async function checkExistingProfile() {
      const { data: profile } = await sb
        .from("profiles")
        .select("role")
        .eq("id", user!.id)
        .single();

      if (profile) {
        const path = ROLE_DASHBOARD[profile.role] ?? "/dashboard/guest";
        router.replace(path);
      } else {
        setCheckingProfile(false);
      }
    }
    checkExistingProfile();
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
      setError(t("errors.enterName"));
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
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("property-photos")
          .upload(path, avatarFile, {
            upsert: true,
            contentType: avatarFile.type,
          });
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-photos").getPublicUrl(path);
        uploadedAvatarUrl = publicUrl;
      }

      const profilePayload = {
        id: user.id,
        phone: user.phone?.trim() ? user.phone.trim() : null,
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: uploadedAvatarUrl,
        role: selectedRole,
      };

      // Prefer explicit insert/update over upsert to avoid RLS merge edge-cases.
      const { error: insertError } = await supabase
        .from("profiles")
        .insert(profilePayload);

      if (insertError) {
        const isConflict = insertError.code === "23505";
        if (!isConflict) throw insertError;

        const { error: updateError } = await supabase
          .from("profiles")
          .update(profilePayload)
          .eq("id", user.id);

        if (updateError) throw updateError;
      }

      const { data: savedProfile, error: verifyError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (verifyError) throw verifyError;
      if (savedProfile?.role !== selectedRole) {
        throw new Error(t("errors.roleUpdateFailed"));
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || checkingProfile) {
    return <SkierLoader />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-160px)] items-center justify-center px-4 py-12">
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
            {step === 1 ? t("createProfile") : t("chooseRole")}
          </h1>
          <p className="mt-2 text-sm text-[#94A3B8]">
            {step === 1 ? t("createProfileHint") : t("chooseRoleHint")}
          </p>
        </div>

        {/* Form */}
        <div className="rounded-[24px] border bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.08)] sm:p-10">
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
                    <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[#64748B]/25 bg-[#F8FAFC] transition-colors group-hover:border-brand-accent/50">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt={t("avatarAlt")}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Camera className="size-8 text-[#94A3B8]" />
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <span className="mt-1 block text-center text-xs text-[#94A3B8]">
                      {t("uploadPhoto")}
                    </span>
                  </label>
                </div>

                {/* Display name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("nameLabel")} <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("namePlaceholder")}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-[#DBEAFE]/50"
                  />
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("bioLabel")}</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t("bioPlaceholder")}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-[#DBEAFE]/50"
                  />
                </div>

                {error && <p className="text-sm text-[#EF4444]">{error}</p>}

                <Button
                  onClick={handleProfileSubmit}
                  disabled={!displayName.trim()}
                  className="w-full"
                  size="lg"
                >
                  {t("next")}
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
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all sm:p-4 ${
                        selectedRole === role.value
                          ? "border-brand-accent bg-brand-accent/5 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                          : "border-transparent bg-[#F8FAFC] hover:border-[#64748B]/20"
                      }`}
                    >
                      <role.icon className="size-6 text-brand-accent" />
                      <span className="break-words text-[13px] font-medium sm:text-sm">
                        {t(`roles.${role.value}`)}
                      </span>
                    </button>
                  ))}
                </div>

                {error && <p className="text-sm text-[#EF4444]">{error}</p>}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1"
                    size="lg"
                  >
                    {t("back")}
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
                    {t("finish")}
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
