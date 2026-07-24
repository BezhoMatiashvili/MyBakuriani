"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Crown,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import Modal from "@/components/shared/Modal";
import NumberField from "@/components/shared/NumberField";
import CreatePackageModal, {
  type EditPackage,
  type PackageCategory,
} from "@/components/admin/CreatePackageModal";

interface PricingPackage {
  id: string;
  category: string;
  code: string;
  name: string;
  label: string | null;
  description: string | null;
  amount_gel: number;
  is_enabled: boolean;
  sort_order: number;
  meta: Record<string, unknown> | null;
  active_subscribers?: number;
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Rocket; accent: string; tint: string }
> = {
  sms: {
    label: "SMS პაკეტები",
    icon: Rocket,
    accent: "text-[#2563EB]",
    tint: "bg-[#DBEAFE] text-[#2563EB] hover:bg-[#BFDBFE]",
  },
  ad: {
    label: "რეკლამის სლოტები",
    icon: Megaphone,
    accent: "text-[#0F172A]",
    tint: "bg-[#E2E8F0] text-[#0F172A] hover:bg-[#CBD5E1]",
  },
  vip: {
    label: "VIP ამოწევა",
    icon: Crown,
    accent: "text-[#F97316]",
    tint: "bg-[#FFEDD5] text-[#F97316] hover:bg-[#FED7AA]",
  },
  verification: {
    label: "ვერიფიკაციის პაკეტები",
    icon: ShieldCheck,
    accent: "text-[#059669]",
    tint: "bg-[#DCFCE7] text-[#059669] hover:bg-[#BBF7D0]",
  },
  subscription: {
    label: "საწევრო / Subscription",
    icon: BadgeCheck,
    accent: "text-[#8B5CF6]",
    tint: "bg-[#EDE9FE] text-[#8B5CF6] hover:bg-[#DDD6FE]",
  },
};

const CATEGORY_ORDER: PackageCategory[] = [
  "sms",
  "ad",
  "vip",
  "verification",
  "subscription",
];

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
  const [createModal, setCreateModal] = useState<{
    open: boolean;
    category: PackageCategory;
  }>({ open: false, category: "sms" });
  const [editModal, setEditModal] = useState<{
    open: boolean;
    pkg: PricingPackage | null;
  }>({ open: false, pkg: null });
  const [confirmDisable, setConfirmDisable] = useState<PricingPackage | null>(
    null,
  );

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

  // Active packages, grouped by category. Disabled ones live in the Archive.
  const grouped = useMemo(() => {
    const map = new Map<string, PricingPackage[]>();
    for (const pkg of packages) {
      if (!pkg.is_enabled) continue;
      const list = map.get(pkg.category) ?? [];
      list.push(pkg);
      map.set(pkg.category, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [packages]);

  // Turned-off packages, stored together in the Archive section.
  const archived = useMemo(
    () =>
      packages
        .filter((p) => !p.is_enabled)
        .sort((a, b) =>
          a.category === b.category
            ? a.sort_order - b.sort_order
            : a.category.localeCompare(b.category),
        ),
    [packages],
  );

  const countByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of packages) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
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

  function openEdit(pkg: PricingPackage) {
    setEditModal({ open: true, pkg });
  }

  const stats = [
    { label: "SMS პაკეტები", value: countByCategory.sms ?? 0 },
    { label: "VIP ტარიფები", value: countByCategory.vip ?? 0 },
    { label: "რეკლამის სლოტები", value: countByCategory.ad ?? 0 },
    {
      label: "SUBSCRIPTION",
      value: countByCategory.subscription ?? 0,
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
          ფასების ცვლილება ძალაში შევა მყისიერად. პაკეტის გამორთვა აჩერებს ახალ
          შესყიდვებს — ვინც უკვე შეიძინა, შეუნარჩუნდება ვადის ბოლომდე.
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
                <button
                  type="button"
                  onClick={() => setCreateModal({ open: true, category })}
                  className={`inline-flex h-8 min-h-11 items-center gap-1 rounded-lg px-3 text-[12px] font-bold transition-colors lg:min-h-0 ${meta.tint}`}
                  aria-label={`დაამატე ახალი ${meta.label}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  დამატება
                </button>
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
                    აქტიური პაკეტი არ არის
                  </p>
                ) : (
                  items.map((pkg) => {
                    const draft = drafts[pkg.id] ?? pkg.amount_gel;
                    const isSaving = saving === pkg.id;
                    return (
                      <div
                        key={pkg.id}
                        className="flex min-h-[76px] flex-wrap items-center justify-between gap-y-2 rounded-2xl border border-[#F1F5F9] bg-[#F8FAFC] px-4 py-3 sm:py-0"
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
                          <div
                            className="w-32"
                            onBlur={() => {
                              if (draft !== pkg.amount_gel) {
                                updatePackage(pkg.id, { amount_gel: draft });
                              }
                            }}
                          >
                            <NumberField
                              value={String(draft)}
                              onChange={(v) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [pkg.id]: Number(v),
                                }))
                              }
                              min={0}
                              max={100000}
                              decimals={2}
                              suffix="₾"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => openEdit(pkg)}
                            title="რედაქტირება (ფასი, ხანგრძლივობა)"
                            aria-label="რედაქტირება"
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F1F5F9] lg:h-8 lg:w-8"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDisable(pkg)}
                            disabled={isSaving}
                            title="გამორთვით პაკეტი იმალება მომხმარებლებისგან"
                            className="relative h-5 w-10 rounded-full bg-[#10B981] transition-colors before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] disabled:opacity-50"
                            aria-label="ჩართვა/გამორთვა"
                          >
                            <span className="absolute left-5 top-0 h-5 w-5 rounded-full border-4 border-[#10B981] bg-white transition-all" />
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

      {/* Archive: turned-off packages, kept for reference and re-activation. */}
      <section className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 bg-[#F8FAFC] px-5 py-5">
          <Archive className="h-[15px] w-[15px] text-[#64748B]" />
          <h2 className="text-[15px] font-black leading-[22px] text-[#1E293B]">
            არქივი
          </h2>
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E2E8F0] px-1.5 text-[11px] font-bold text-[#475569]">
            {archived.length}
          </span>
        </div>
        <div className="space-y-3 p-6">
          {loading ? (
            <Skeleton className="h-[64px] w-full rounded-2xl" />
          ) : archived.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#94A3B8]">
              არქივი ცარიელია
            </p>
          ) : (
            archived.map((pkg) => {
              const cmeta = CATEGORY_META[pkg.category];
              const CIcon = cmeta?.icon ?? Archive;
              const isSaving = saving === pkg.id;
              return (
                <div
                  key={pkg.id}
                  className="flex flex-wrap items-center justify-between gap-y-3 rounded-2xl border border-[#F1F5F9] bg-[#F8FAFC] px-4 py-3"
                >
                  <div className="flex items-center gap-3 pr-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[10px] font-bold ${cmeta?.accent ?? "text-[#64748B]"}`}
                    >
                      <CIcon className="h-3 w-3" />
                      {cmeta?.label ?? pkg.category}
                    </span>
                    <div>
                      <p className="text-sm font-bold leading-[21px] text-[#1E293B]">
                        {pkg.name}
                      </p>
                      {pkg.label ? (
                        <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#64748B]">
                          {pkg.label}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mr-1 text-sm font-bold text-[#1E293B]">
                      {pkg.amount_gel} ₾
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(pkg)}
                      title="რედაქტირება"
                      className="inline-flex h-8 min-h-11 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F1F5F9] lg:min-h-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      რედაქტირება
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePackage(pkg.id, { is_enabled: true })
                      }
                      disabled={isSaving}
                      title="ჩართეთ რომ მომხმარებლებმა დაინახონ"
                      className="inline-flex h-8 min-h-11 items-center gap-1 rounded-lg bg-[#DCFCE7] px-3 text-[12px] font-bold text-[#059669] transition-colors hover:bg-[#BBF7D0] disabled:opacity-50 lg:min-h-0"
                    >
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      ჩართვა
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <CreatePackageModal
        isOpen={createModal.open}
        onClose={() => setCreateModal((p) => ({ ...p, open: false }))}
        category={createModal.category}
        categoryLabel={
          CATEGORY_META[createModal.category]?.label ?? createModal.category
        }
        onCreated={load}
      />

      <CreatePackageModal
        isOpen={editModal.open}
        onClose={() => setEditModal((p) => ({ ...p, open: false }))}
        category={(editModal.pkg?.category as PackageCategory) ?? "sms"}
        categoryLabel={
          editModal.pkg
            ? (CATEGORY_META[editModal.pkg.category]?.label ??
              editModal.pkg.category)
            : ""
        }
        editPackage={
          editModal.pkg
            ? ({
                id: editModal.pkg.id,
                category: editModal.pkg.category as PackageCategory,
                name: editModal.pkg.name,
                label: editModal.pkg.label,
                description: editModal.pkg.description,
                amount_gel: editModal.pkg.amount_gel,
                meta: editModal.pkg.meta,
              } satisfies EditPackage)
            : null
        }
        onCreated={load}
      />

      <Modal
        isOpen={Boolean(confirmDisable)}
        onClose={() => setConfirmDisable(null)}
        title="პაკეტის გამორთვა"
        size="sm"
      >
        {confirmDisable ? (
          <div className="space-y-4">
            <p className="text-sm font-bold text-[#0F172A]">
              „{confirmDisable.name}&quot; გადავა არქივში.
            </p>
            <p className="text-sm font-medium leading-5 text-[#475569]">
              ახალი შესყიდვები შეჩერდება და პაკეტი დაიმალება მომხმარებლებისგან.
              ვინც უკვე შეიძინა — შეუნარჩუნდება ვადის ბოლომდე (არაფერი უქმდება).
            </p>
            {confirmDisable.category === "subscription" &&
            (confirmDisable.active_subscribers ?? 0) > 0 ? (
              <p className="rounded-xl bg-[#FEF3C7] px-3 py-2.5 text-[13px] font-bold text-[#B45309]">
                {confirmDisable.active_subscribers} აქტიური წევრი შეინარჩუნებს
                წვდომას ვადის ბოლომდე და მიიღებს შეტყობინებას.
              </p>
            ) : null}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDisable(null)}
                className="flex-1 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
              >
                გაუქმება
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = confirmDisable.id;
                  setConfirmDisable(null);
                  updatePackage(id, { is_enabled: false });
                }}
                className="flex-1 rounded-xl bg-[#DC2626] px-4 py-3 text-sm font-bold text-white hover:bg-[#B91C1C]"
              >
                გამორთვა
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
