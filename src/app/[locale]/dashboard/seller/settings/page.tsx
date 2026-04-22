"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, MessageCircle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

type ProfileType = "ფიზიკური პირი" | "იურიდიული პირი";

interface NotifPrefs {
  newLead: boolean;
  addToFavorites: boolean;
  dailyReport: boolean;
}

export default function SellerSettingsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [profileType, setProfileType] = useState<ProfileType>("ფიზიკური პირი");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [personalId, setPersonalId] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);

  const [prefs, setPrefs] = useState<NotifPrefs>({
    newLead: true,
    addToFavorites: true,
    dailyReport: true,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setPhone(data.phone ?? "");
        }
        setLoading(false);
      });
  }, [user, supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        phone,
      })
      .eq("id", user.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  function Toggle({
    checked,
    onChange,
    color = "#2563EB",
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    color?: string;
  }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ backgroundColor: checked ? color : "#E2E8F0" }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
          style={{
            transform: checked ? "translateX(22px)" : "translateX(2px)",
          }}
        />
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end gap-3"
      >
        <SettingsIcon className="mb-1 h-6 w-6 text-[#64748B]" />
        <div>
          <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
            პარამეტრები
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            პროფილის დეტალები და ნოტიფიკაციების კონტროლი.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSave}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            პროფილის ტიპი და დეტალები
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                პროფილის ტიპი
              </label>
              <select
                value={profileType}
                onChange={(e) => setProfileType(e.target.value as ProfileType)}
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              >
                <option>ფიზიკური პირი</option>
                <option>იურიდიული პირი</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                სახელი / კომპანია
              </label>
              {loading ? (
                <Skeleton className="h-11 w-full rounded-xl" />
              ) : (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                საკონტაქტო ნომერი (საჯარო)
              </label>
              {loading ? (
                <Skeleton className="h-11 w-full rounded-xl" />
              ) : (
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+995 5XX XX XX XX"
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                პირადი ნომერი (არასავალდებულო)
              </label>
              <input
                type="text"
                value={personalId}
                onChange={(e) => setPersonalId(e.target.value)}
                placeholder="01008060403"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </div>

            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                whatsapp
                  ? "border-[#DCFCE7] bg-[#F0FDF4]"
                  : "border-[#E2E8F0] bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    whatsapp
                      ? "bg-[#DCFCE7] text-[#16A34A]"
                      : "bg-[#F1F5F9] text-[#94A3B8]"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" />
                </span>
                <span className="text-[12px] font-bold uppercase tracking-wide text-[#0F172A]">
                  WhatsApp ნომერი
                </span>
              </div>
              <Toggle
                checked={whatsapp}
                onChange={setWhatsapp}
                color="#16A34A"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B] disabled:opacity-60"
            >
              {saved && <Check className="h-4 w-4" />}
              {saving ? "შენახვა..." : saved ? "შენახულია" : "შენახვა"}
            </button>
          </div>
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            შეტყობინებების მართვა
          </h2>

          <div className="mt-5 space-y-3">
            {[
              {
                key: "newLead" as const,
                title: "ახალი მოთხოვნა",
                sub: "ვებ-შეტყობინება და SMS (კრედიტში)",
              },
              {
                key: "addToFavorites" as const,
                title: "რჩეულებში დამატება",
                sub: "მხოლოდ ვებ-შეტყობინება",
              },
              {
                key: "dailyReport" as const,
                title: "ყოველდღიური რეპორტი",
                sub: "მხოლოდ ელ-ფოსტა",
              },
            ].map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between rounded-xl border border-[#EEF1F4] bg-white px-4 py-3.5"
              >
                <div>
                  <p className="text-[13px] font-black text-[#0F172A]">
                    {row.title}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {row.sub}
                  </p>
                </div>
                <Toggle
                  checked={prefs[row.key]}
                  onChange={(v) => setPrefs((p) => ({ ...p, [row.key]: v }))}
                />
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
