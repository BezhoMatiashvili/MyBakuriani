"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

type ProfileType = "personal" | "company";

export default function RenterSettingsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileType, setProfileType] = useState<ProfileType>("personal");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("+995 599 00 00 00");
  const [personalId, setPersonalId] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);

  const [notifNewRequest, setNotifNewRequest] = useState(true);
  const [notifAddFavorite, setNotifAddFavorite] = useState(true);
  const [notifMonthlyReport, setNotifMonthlyReport] = useState(true);

  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!user) return;

    async function fetchProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name);
        if (data.phone) setPhone(data.phone);
      }
      setLoading(false);
    }

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    const normalizedPhone = phone.replace(/\s+/g, "");
    if (!normalizedPhone || !/^\+9955\d{8}$/.test(normalizedPhone)) {
      setErrorMsg("გთხოვთ მიუთითოთ სწორი ნომერი (+995 5XX XX XX XX)");
      return;
    }

    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        phone: normalizedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (!error) {
      setProfile((prev) => (prev ? { ...prev, phone: normalizedPhone } : prev));
      setSuccessMsg("პროფილი წარმატებით განახლდა");
      setTimeout(() => setSuccessMsg(""), 3000);
    } else {
      setErrorMsg("პროფილის განახლება ვერ მოხერხდა. სცადეთ თავიდან.");
    }
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, displayName, phone]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[500px] rounded-[20px]" />
          <Skeleton className="h-[340px] rounded-[20px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="flex items-center gap-3 text-[36px] font-black leading-[44px] text-[#0F172A]">
          <SettingsIcon className="h-8 w-8 text-[#94A3B8]" />
          პარამეტრები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          პროფილის დეტალები და ნოტიფიკაციების კონტროლი.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: profile details */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
        >
          <h2 className="text-[16px] font-black text-[#0F172A]">
            პროფილის ტიპი და დეტალები
          </h2>

          <div className="mt-5 space-y-4">
            <Field label="პროფილის ტიპი">
              <div className="relative">
                <select
                  value={profileType}
                  onChange={(e) =>
                    setProfileType(e.target.value as ProfileType)
                  }
                  className="w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                >
                  <option value="personal">ფიზიკური პირი</option>
                  <option value="company">იურიდიული პირი</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              </div>
            </Field>

            <Field label="სახელი / კომპანია">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                placeholder="გიორგი მახარაძე"
              />
            </Field>

            <Field label="საკონტაქტო ნომერი (საჯარო)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                placeholder="+995 599 00 00 00"
              />
            </Field>

            <Field label="პირადი ნომერი">
              <input
                type="text"
                value={personalId}
                onChange={(e) => setPersonalId(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                placeholder="01008060403"
              />
            </Field>

            {/* WhatsApp pill toggle */}
            <button
              type="button"
              onClick={() => setWhatsapp((v) => !v)}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                whatsapp
                  ? "bg-[#DCFCE7] text-[#16A34A]"
                  : "bg-[#F1F5F9] text-[#94A3B8]"
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide">
                <WhatsAppIcon
                  className={whatsapp ? "text-[#16A34A]" : "text-[#94A3B8]"}
                />
                WHATSAPP ნომერი
              </span>
              <Toggle on={whatsapp} tone="success" />
            </button>

            {successMsg && (
              <p className="text-[13px] font-semibold text-[#16A34A]">
                {successMsg}
              </p>
            )}
            {errorMsg && (
              <p className="text-[13px] font-semibold text-[#DC2626]">
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-2 w-full rounded-xl bg-[#0F172A] py-3.5 text-[14px] font-black text-white transition-colors hover:bg-[#1E293B] disabled:opacity-60"
            >
              {saving ? "ინახება..." : "შენახვა"}
            </button>
          </div>
        </motion.section>

        {/* Right: notifications */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
        >
          <h2 className="text-[16px] font-black text-[#0F172A]">
            შეტყობინებების მართვა
          </h2>

          <div className="mt-5 space-y-3">
            <NotifRow
              title="ახალი მოთხოვნა"
              sub="ვებ-შეტყობინება და SMS (პრემიუმი)"
              on={notifNewRequest}
              onToggle={() => setNotifNewRequest((v) => !v)}
            />
            <NotifRow
              title="რჩეულებში დამატება"
              sub="მხოლოდ ვებ-შეტყობინება"
              on={notifAddFavorite}
              onToggle={() => setNotifAddFavorite((v) => !v)}
            />
            <NotifRow
              title="ყოველთვიური რეპორტი"
              sub="მხოლოდ ელ-ფოსტა"
              on={notifMonthlyReport}
              onToggle={() => setNotifMonthlyReport((v) => !v)}
            />
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </label>
      {children}
    </div>
  );
}

function NotifRow({
  title,
  sub,
  on,
  onToggle,
}: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#EEF1F4] bg-white px-4 py-3.5">
      <div>
        <p className="text-[13px] font-extrabold text-[#0F172A]">{title}</p>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-[#94A3B8]">
          {sub}
        </p>
      </div>
      <Toggle on={on} onToggle={onToggle} tone="primary" />
    </div>
  );
}

function Toggle({
  on,
  onToggle,
  tone,
}: {
  on: boolean;
  onToggle?: () => void;
  tone: "primary" | "success";
}) {
  const onColor = tone === "primary" ? "bg-[#2563EB]" : "bg-[#22C55E]";
  const trackClass = `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
    on ? onColor : "bg-[#CBD5E1]"
  }`;
  const knob = (
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
        on ? "translate-x-[22px]" : "translate-x-0.5"
      }`}
    />
  );

  if (!onToggle) {
    return (
      <span aria-hidden="true" className={trackClass}>
        {knob}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={trackClass}
    >
      {knob}
    </button>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
