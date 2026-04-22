"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

interface NotifPrefs {
  newOrder: boolean;
  newReview: boolean;
  dailyReport: boolean;
}

export default function FoodParametersPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [prefs, setPrefs] = useState<NotifPrefs>({
    newOrder: true,
    newReview: true,
    dailyReport: true,
  });

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const { data } = await supabase
        .from("services")
        .select("*")
        .eq("owner_id", user!.id)
        .eq("category", "food")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setService(data);
        setName(data.title ?? "");
        setCuisine(data.cuisine_type ?? "");
        setPhone(data.phone ?? "");
      }
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(`mb-whatsapp-${user!.id}`)
          : null;
      if (saved) setWhatsapp(saved);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!service) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("services")
      .update({
        title: name,
        cuisine_type: cuisine,
        phone,
      })
      .eq("id", service.id);
    if (!error && user && typeof window !== "undefined") {
      window.localStorage.setItem(`mb-whatsapp-${user.id}`, whatsapp);
    }
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
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          პარამეტრები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          პროფილის დეტალები და ნოტიფიკაციების კონტროლი.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSave}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            პროფილის დეტალები
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                რესტორნის სახელი
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                კერძი (სპეციალიზაცია)
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <input
                  type="text"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  placeholder="მაგ: პიცა, ქართული სამზარეულო"
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                ტელეფონის ნომერი
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+995 5XX XX XX XX"
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                WhatsApp-ის ნომერი
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <div className="relative">
                  <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#16A34A]" />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="+995 5XX XX XX XX"
                    className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/10"
                  />
                </div>
              )}
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
                key: "newOrder" as const,
                title: "ახალი შეკვეთა",
                sub: "ვებ-შეტყობინება და SMS",
              },
              {
                key: "newReview" as const,
                title: "ახალი შეფასება",
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
