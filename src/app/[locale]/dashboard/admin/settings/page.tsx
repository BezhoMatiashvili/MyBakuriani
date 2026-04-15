"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Crown,
  Loader2,
  Megaphone,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface PricingPackage {
  id: string;
  category: string;
  code: string;
  name: string;
  label: string | null;
  amount_gel: number;
  is_enabled: boolean;
  sort_order: number;
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Rocket; accent: string }
> = {
  sms: { label: "SMS პაკეტები", icon: Rocket, accent: "text-[#2563EB]" },
  ad: { label: "რეკლამის სლოტები", icon: Megaphone, accent: "text-[#0F172A]" },
  vip: { label: "VIP ამოწევა", icon: Crown, accent: "text-[#F97316]" },
  verification: {
    label: "ვერიფიკაციის პაკეტები",
    icon: ShieldCheck,
    accent: "text-[#059669]",
  },
  subscription: {
    label: "საწევრო / Subscription",
    icon: BadgeCheck,
    accent: "text-[#8B5CF6]",
  },
};

const CATEGORY_ORDER = ["sms", "ad", "vip", "verification", "subscription"];

async function readJsonSafely(
  res: Response,
): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getPayloadError(
  payload: Record<string, unknown> | null,
  fallback: string,
): string {
  return typeof payload?.error === "string" ? payload.error : fallback;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pricing-packages", {
        cache: "no-store",
      });
      const payload = await readJsonSafely(res);
      if (!res.ok) {
        toast.error(getPayloadError(payload, "ჩატვირთვა ვერ მოხერხდა"));
        setPackages([]);
        return;
      }
      if (!Array.isArray(payload?.packages)) {
        toast.error("სერვერის პასუხი არასწორია");
        setPackages([]);
        return;
      }
      setPackages(payload.packages as PricingPackage[]);
    } catch {
      toast.error("ჩატვირთვა ვერ მოხერხდა");
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, PricingPackage[]>();
    for (const pkg of packages) {
      const list = map.get(pkg.category) ?? [];
      list.push(pkg);
      map.set(pkg.category, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [packages]);

  async function updatePackage(
    id: string,
    patch: { amount_gel?: number; is_enabled?: boolean },
  ) {
    setSaving(id);
    try {
      const res = await fetch("/api/admin/pricing-packages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJsonSafely(res);
      if (!res.ok) throw new Error(getPayloadError(payload, "შეცდომა"));
      setPackages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
      toast.success("შენახულია");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setSaving(null);
    }
  }

  const stats = [
    { label: "SMS პაკეტები", value: grouped.get("sms")?.length ?? 0 },
    { label: "VIP ტარიფები", value: grouped.get("vip")?.length ?? 0 },
    { label: "რეკლამის სლოტები", value: grouped.get("ad")?.length ?? 0 },
    {
      label: "SUBSCRIPTION",
      value: grouped.get("subscription")?.length ?? 0,
    },
    {
      label: "სულ პროდუქტები",
      value: packages.length,
      highlighted: true,
    },
  ];

  return (
    <div className="w-full space-y-6 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          ტარიფები და პაკეტები
        </h1>
        <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
          მართეთ პლატფორმის მონეტიზაციის წესები და ფასიანი პროდუქტები.
        </p>
      </div>

      <div className="rounded-xl border border-[#FEF08A] bg-[#ECFDF5] px-4 py-4 text-[#B45309] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <p className="flex items-center gap-3 text-[13px] font-bold leading-5">
          <AlertTriangle className="h-5 w-5 text-[#F97316]" />
          ფასების ცვლილება ძალაში შევა მყისიერად და იმოქმედებს მხოლოდ ახალ
          ტრანზაქციებზე.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-[24px] border px-5 py-4 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] ${
              stat.highlighted
                ? "border-[#2563EB] bg-[#2563EB] text-white"
                : "border-[#E2E8F0] bg-white text-[#0F172A]"
            }`}
          >
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.5px] ${
                stat.highlighted ? "text-[#BFDBFE]" : "text-[#94A3B8]"
              }`}
            >
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-black leading-8">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          if (!meta) return null;
          const items = grouped.get(category) ?? [];
          const Icon = meta.icon;
          return (
            <section
              key={category}
              className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center justify-between bg-[#F8FAFC] px-5 py-5">
                <h2 className="flex items-center gap-2 text-[15px] font-black leading-[22px] text-[#1E293B]">
                  <Icon className={`h-[15px] w-[15px] ${meta.accent}`} />
                  {meta.label}
                </h2>
              </div>
              <div className="space-y-4 p-6">
                {loading ? (
                  Array.from({ length: 2 }).map((_, idx) => (
                    <Skeleton
                      key={idx}
                      className="h-[76px] w-full rounded-2xl"
                    />
                  ))
                ) : items.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[#94A3B8]">
                    პაკეტი ჯერ არ არის შექმნილი
                  </p>
                ) : (
                  items.map((pkg) => {
                    const draft = drafts[pkg.id] ?? pkg.amount_gel;
                    const isSaving = saving === pkg.id;
                    return (
                      <div
                        key={pkg.id}
                        className="flex min-h-[76px] items-center justify-between rounded-2xl border border-[#F1F5F9] bg-[#F8FAFC] px-4"
                      >
                        <div className="pr-4">
                          <p className="text-sm font-bold leading-[21px] text-[#1E293B]">
                            {pkg.name}
                          </p>
                          {pkg.label ? (
                            <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#64748B]">
                              {pkg.label}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              value={draft}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [pkg.id]: Number(e.target.value),
                                }))
                              }
                              onBlur={() => {
                                if (draft !== pkg.amount_gel) {
                                  updatePackage(pkg.id, { amount_gel: draft });
                                }
                              }}
                              className="h-[42px] w-24 rounded-lg border border-[#E2E8F0] bg-white px-3 pr-8 text-center text-base font-black leading-6 text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#94A3B8]">
                              ₾
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updatePackage(pkg.id, {
                                is_enabled: !pkg.is_enabled,
                              })
                            }
                            disabled={isSaving}
                            className={`relative h-5 w-10 rounded-full transition-colors ${
                              pkg.is_enabled ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                            } disabled:opacity-50`}
                            aria-label="ჩართვა/გამორთვა"
                          >
                            <span
                              className={`absolute top-0 h-5 w-5 rounded-full border-4 transition-all ${
                                pkg.is_enabled
                                  ? "left-5 border-[#10B981] bg-white"
                                  : "left-0 border-[#CBD5E1] bg-white"
                              }`}
                            />
                          </button>
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#94A3B8]" />
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
