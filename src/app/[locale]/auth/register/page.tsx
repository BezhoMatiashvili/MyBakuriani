"use client";

import { useState, useEffect, useRef } from "react";
import { Link, useRouter } from "@/i18n/navigation";
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
  Building2,
  Search,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { withRetry } from "@/lib/with-timeout";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";
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

type SellerOrg = {
  id: string;
  brand_name: string;
  phone: string | null;
  logo_url: string | null;
};

export default function RegisterPage() {
  const t = useTranslations("AuthRegister");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  // Step 3 — seller sub-path (individual / register a company / link as agent)
  const [sellerKind, setSellerKind] = useState<
    "individual" | "agent" | "company" | null
  >(null);
  const [orgQuery, setOrgQuery] = useState("");
  const [orgResults, setOrgResults] = useState<SellerOrg[]>([]);
  const [orgSearching, setOrgSearching] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<{
    id: string;
    brand_name: string;
  } | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const orgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth/login");
      return;
    }

    // Check if user already has a profile — redirect to dashboard if so
    const sb = createClient();
    async function checkExistingProfile() {
      const { data: profile, error } = await withRetry(() =>
        sb.from("profiles").select("role").eq("id", user!.id).maybeSingle(),
      );

      if (error) {
        // Couldn't confirm whether a profile already exists, even after a
        // retry — don't fail open into the wizard: an existing user could
        // silently overwrite their profile (persistProfile()'s insert-conflict
        // path updates the row) or, worse, an admin re-picking a role here
        // would pass the profiles_lock_role trigger (it only checks the
        // caller's *current* role) and self-demote. Land somewhere safe.
        router.replace("/dashboard/guest");
        return;
      }
      if (profile) {
        const path = ROLE_DASHBOARD[profile.role] ?? "/dashboard/guest";
        router.replace(path);
      } else {
        setCheckingProfile(false);
      }
    }
    checkExistingProfile();
  }, [authLoading, user, router]);

  // Debounced company search for the "link as agent" seller sub-path.
  useEffect(() => {
    if (sellerKind !== "agent") return;

    const q = orgQuery.trim();
    if (orgDebounceRef.current) clearTimeout(orgDebounceRef.current);
    if (q.length < 2) {
      setOrgResults([]);
      setOrgSearching(false);
      return;
    }
    setOrgSearching(true);
    orgDebounceRef.current = setTimeout(async () => {
      const sb = createClient();
      const safeQ = sanitizeQuery(q);
      const { data } = await sb
        .from("organizations")
        .select("id, brand_name, phone, logo_url")
        .eq("status", "active")
        .or(`brand_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
        .limit(20);
      setOrgResults((data as SellerOrg[]) ?? []);
      setOrgSearching(false);
    }, 300);
    return () => {
      if (orgDebounceRef.current) clearTimeout(orgDebounceRef.current);
    };
  }, [orgQuery, sellerKind]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(t("errors.fileTooLarge"));
      e.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError(t("errors.invalidFormat"));
      e.target.value = "";
      return;
    }
    setError(null);
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

  // Avatar upload + profiles insert/update-on-conflict + verify. Shared by
  // every role's finish step (non-seller roles and all three seller
  // sub-paths). Throws on failure; callers own loading/error state.
  async function persistProfile() {
    if (!selectedRole || !user) return;

    let uploadedAvatarUrl: string | null = null;

    if (avatarFile) {
      // Avatars live in the dedicated `avatars` bucket (public, 2MB, jpeg/png
      // only — enforced both by handleAvatarChange and the bucket policy). Ext
      // is derived from the validated mime type, not the (untrusted) filename.
      const ext = avatarFile.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
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

      // The row already exists from an earlier attempt of this same wizard, so its
      // public fields already carry this payload. Re-apply only `role`: display_name,
      // phone, bio and avatar_url are review-gated
      // (prevent_unreviewed_public_content_update), and updating them from a browser
      // session raises 42501 — which would turn a benign retry into a hard
      // registration failure.
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ role: selectedRole })
        .eq("id", user.id);

      if (updateError) throw updateError;
    }

    const { data: savedProfile, error: verifyError } = await withRetry(() =>
      supabase.from("profiles").select("role").eq("id", user.id).single(),
    );

    if (verifyError) throw verifyError;
    if (savedProfile?.role !== selectedRole) {
      throw new Error(t("errors.roleUpdateFailed"));
    }
  }

  async function handleRoleSubmit() {
    if (!selectedRole || !user) return;

    // Sellers pick individual / company / agent on step 3 before the
    // profile is written — every other role keeps the original flow.
    if (selectedRole === "seller") {
      setError(null);
      setStep(3);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await persistProfile();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  function goBackToRoleStep() {
    setStep(2);
    setSellerKind(null);
    setSelectedOrg(null);
    setRequestSent(false);
    setOrgQuery("");
    setOrgResults([]);
    setError(null);
  }

  async function handleSellerConfirm() {
    if (!user || !sellerKind) return;
    if (sellerKind === "agent" && !selectedOrg) return;

    setLoading(true);
    setError(null);
    try {
      await persistProfile();

      if (sellerKind === "individual") {
        router.push("/");
      } else if (sellerKind === "company") {
        router.push("/dashboard/seller/organizations/new");
      } else if (sellerKind === "agent" && selectedOrg) {
        const { error: rpcError } = await supabase.rpc(
          "request_organization_membership",
          { p_org_id: selectedOrg.id },
        );
        if (rpcError) throw rpcError;
        setRequestSent(true);
      }
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
            ) : step === 2 ? (
              <Users className="size-8 text-brand-accent" />
            ) : (
              <Wallet className="size-8 text-brand-accent" />
            )}
          </div>
          <h1 className="text-2xl font-bold">
            {step === 1
              ? t("createProfile")
              : step === 2
                ? t("chooseRole")
                : t("seller.stepTitle")}
          </h1>
          <p className="mt-2 text-sm text-[#94A3B8]">
            {step === 1
              ? t("createProfileHint")
              : step === 2
                ? t("chooseRoleHint")
                : t("seller.stepHint")}
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
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleProfileSubmit();
                  }}
                  noValidate
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
                      className="min-h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-[#DBEAFE]/50 lg:min-h-0"
                    />
                  </div>

                  {/* Bio */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {t("bioLabel")}
                    </label>
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
                    type="submit"
                    disabled={!displayName.trim()}
                    className="min-h-11 w-full lg:min-h-0"
                    size="lg"
                  >
                    {t("next")}
                  </Button>
                </form>
              </motion.div>
            ) : step === 2 ? (
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
                    className="min-h-11 flex-1 lg:min-h-0"
                    size="lg"
                  >
                    {t("back")}
                  </Button>
                  <Button
                    onClick={handleRoleSubmit}
                    disabled={loading || !selectedRole}
                    className="min-h-11 flex-1 lg:min-h-0"
                    size="lg"
                  >
                    {loading ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    {selectedRole === "seller" ? t("next") : t("finish")}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="seller"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {requestSent ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-[#DCFCE7]">
                      <Check className="size-7 text-[#16A34A]" />
                    </span>
                    <h3 className="mt-4 text-[17px] font-bold text-[#0F172A]">
                      {t("seller.requestSentTitle")}
                    </h3>
                    <p className="mt-1.5 text-[14px] font-medium text-[#64748B]">
                      {t("seller.requestSentDesc")}
                    </p>
                    <Link
                      href="/dashboard/seller/organizations"
                      className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-brand-accent hover:underline lg:min-h-0"
                    >
                      {t("seller.requestSentLink")}
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => setSellerKind("individual")}
                        className={`flex flex-col items-center rounded-2xl border-2 p-4 text-center transition-all ${
                          sellerKind === "individual"
                            ? "border-brand-accent bg-brand-accent/5 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                            : "border-transparent bg-[#F8FAFC] hover:border-[#64748B]/20"
                        }`}
                      >
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-accent/10">
                          <User className="size-6 text-brand-accent" />
                        </span>
                        <h3 className="mt-3 text-[14px] font-bold text-[#0F172A]">
                          {t("seller.individualTitle")}
                        </h3>
                        <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#64748B]">
                          {t("seller.individualDesc")}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSellerKind("company")}
                        className={`flex flex-col items-center rounded-2xl border-2 p-4 text-center transition-all ${
                          sellerKind === "company"
                            ? "border-brand-accent bg-brand-accent/5 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                            : "border-transparent bg-[#F8FAFC] hover:border-[#64748B]/20"
                        }`}
                      >
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-[#EFF6FF]">
                          <Building2 className="size-6 text-[#2563EB]" />
                        </span>
                        <h3 className="mt-3 text-[14px] font-bold text-[#0F172A]">
                          {t("seller.companyTitle")}
                        </h3>
                        <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#64748B]">
                          {t("seller.companyDesc")}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSellerKind("agent")}
                        className={`flex flex-col items-center rounded-2xl border-2 p-4 text-center transition-all ${
                          sellerKind === "agent"
                            ? "border-brand-accent bg-brand-accent/5 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                            : "border-transparent bg-[#F8FAFC] hover:border-[#64748B]/20"
                        }`}
                      >
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-[#DCFCE7]">
                          <Users className="size-6 text-[#16A34A]" />
                        </span>
                        <h3 className="mt-3 text-[14px] font-bold text-[#0F172A]">
                          {t("seller.agentTitle")}
                        </h3>
                        <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#64748B]">
                          {t("seller.agentDesc")}
                        </p>
                      </button>
                    </div>

                    {sellerKind === "agent" && (
                      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
                        <label className="text-[13px] font-bold text-[#334155]">
                          {t("seller.searchLabel")}
                        </label>
                        <div className="relative mt-2">
                          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
                          <input
                            type="text"
                            value={orgQuery}
                            onChange={(e) => setOrgQuery(e.target.value)}
                            placeholder={t("seller.searchPlaceholder")}
                            className="h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 text-sm outline-none transition-colors focus:border-brand-accent focus:ring-2 focus:ring-[#DBEAFE]"
                          />
                        </div>

                        <div className="mt-3 space-y-2">
                          {orgSearching && (
                            <div className="flex items-center justify-center py-4 text-[#94A3B8]">
                              <Loader2 className="size-5 animate-spin" />
                            </div>
                          )}
                          {!orgSearching &&
                            orgQuery.trim().length >= 2 &&
                            orgResults.length === 0 && (
                              <p className="py-4 text-center text-sm font-medium text-[#94A3B8]">
                                {t("seller.noResults")}
                              </p>
                            )}
                          {!orgSearching && orgQuery.trim().length < 2 && (
                            <p className="py-4 text-center text-sm font-medium text-[#94A3B8]">
                              {t("seller.searchHint")}
                            </p>
                          )}
                          {orgResults.map((org) => {
                            const active = selectedOrg?.id === org.id;
                            return (
                              <button
                                key={org.id}
                                type="button"
                                onClick={() =>
                                  setSelectedOrg({
                                    id: org.id,
                                    brand_name: org.brand_name,
                                  })
                                }
                                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                                  active
                                    ? "border-brand-accent bg-brand-accent/5"
                                    : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]"
                                }`}
                              >
                                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EFF6FF]">
                                  {org.logo_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={org.logo_url}
                                      alt={org.brand_name}
                                      className="size-full object-cover"
                                    />
                                  ) : (
                                    <Building2 className="size-5 text-[#2563EB]" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#0F172A]">
                                  {org.brand_name}
                                </span>
                                {active && (
                                  <Check className="size-4 shrink-0 text-brand-accent" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {error && <p className="text-sm text-[#EF4444]">{error}</p>}

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={goBackToRoleStep}
                        className="min-h-11 flex-1 lg:min-h-0"
                        size="lg"
                      >
                        {t("back")}
                      </Button>
                      <Button
                        onClick={handleSellerConfirm}
                        disabled={
                          loading ||
                          !sellerKind ||
                          (sellerKind === "agent" && !selectedOrg)
                        }
                        className="min-h-11 flex-1 lg:min-h-0"
                        size="lg"
                      >
                        {loading ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : null}
                        {t("seller.confirm")}
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
