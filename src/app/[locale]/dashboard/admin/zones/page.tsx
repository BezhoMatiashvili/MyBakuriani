"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  MapPin,
  Mountain,
  Pencil,
  Plus,
  Save,
  Trash2,
  TreePine,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type ZoneIconValue = "mountain" | "tree" | "pin";

interface Zone {
  id: string;
  slug: string;
  name_ka: string;
  description_ka: string;
  lat: number;
  lng: number;
  icon: ZoneIconValue;
  sort_order: number;
  is_active: boolean;
}

interface ZoneDraft {
  slug: string;
  name_ka: string;
  description_ka: string;
  lat: string;
  lng: string;
  icon: ZoneIconValue;
}

const EMPTY_DRAFT: ZoneDraft = {
  slug: "",
  name_ka: "",
  description_ka: "",
  lat: "",
  lng: "",
  icon: "mountain",
};

const ICON_OPTIONS: { value: ZoneIconValue; label: string }[] = [
  { value: "mountain", label: "მთა" },
  { value: "tree", label: "ხე" },
  { value: "pin", label: "ნიშანი" },
];

function IconGlyph({
  icon,
  className,
}: {
  icon: ZoneIconValue;
  className?: string;
}) {
  if (icon === "tree") return <TreePine className={className} />;
  if (icon === "pin") return <MapPin className={className} />;
  return <Mountain className={className} />;
}

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

export default function AdminZonesPage() {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<Zone[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, ZoneDraft>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState<ZoneDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/zones", { cache: "no-store" });
      const payload = await readJsonSafely(res);
      if (!res.ok) {
        toast.error(getPayloadError(payload, "ჩატვირთვა ვერ მოხერხდა"));
        setZones([]);
        return;
      }
      if (!Array.isArray(payload?.zones)) {
        toast.error("სერვერის პასუხი არასწორია");
        setZones([]);
        return;
      }
      setZones(payload.zones as Zone[]);
    } catch {
      toast.error("ჩატვირთვა ვერ მოხერხდა");
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(
    () => zones.filter((z) => z.is_active).length,
    [zones],
  );

  async function patchZone(id: string, patch: Partial<Zone>) {
    setSavingId(id);
    try {
      const res = await fetch("/api/admin/zones", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJsonSafely(res);
      if (!res.ok) throw new Error(getPayloadError(payload, "შეცდომა"));
      setZones((prev) =>
        prev.map((z) => (z.id === id ? { ...z, ...patch } : z)),
      );
      toast.success("შენახულია");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(zone: Zone) {
    await patchZone(zone.id, { is_active: !zone.is_active });
  }

  async function softDelete(zone: Zone) {
    const confirmed = window.confirm(
      `დაამოვდე ზონა "${zone.name_ka}"? ის გაითიშება ყველგან, მაგრამ ძველი მონაცემები შენარჩუნდება.`,
    );
    if (!confirmed) return;
    setSavingId(zone.id);
    try {
      const res = await fetch(
        `/api/admin/zones?id=${encodeURIComponent(zone.id)}`,
        { method: "DELETE" },
      );
      const payload = await readJsonSafely(res);
      if (!res.ok) throw new Error(getPayloadError(payload, "შეცდომა"));
      setZones((prev) =>
        prev.map((z) => (z.id === zone.id ? { ...z, is_active: false } : z)),
      );
      toast.success("ზონა გათიშულია");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setSavingId(null);
    }
  }

  async function move(zone: Zone, direction: -1 | 1) {
    const ordered = [...zones].sort((a, b) => a.sort_order - b.sort_order);
    const idx = ordered.findIndex((z) => z.id === zone.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swapIdx];
    // Optimistic swap
    setZones((prev) =>
      prev.map((z) => {
        if (z.id === a.id) return { ...z, sort_order: b.sort_order };
        if (z.id === b.id) return { ...z, sort_order: a.sort_order };
        return z;
      }),
    );
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/zones", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: a.id, sort_order: b.sort_order }),
        }),
        fetch("/api/admin/zones", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: b.id, sort_order: a.sort_order }),
        }),
      ]);
      if (!r1.ok || !r2.ok) throw new Error("ვერ მოხერხდა გადატანა");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
      load();
    }
  }

  function startEditing(zone: Zone) {
    setEditing((prev) => ({
      ...prev,
      [zone.id]: {
        slug: zone.slug,
        name_ka: zone.name_ka,
        description_ka: zone.description_ka,
        lat: String(zone.lat),
        lng: String(zone.lng),
        icon: zone.icon,
      },
    }));
  }

  function cancelEditing(zoneId: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[zoneId];
      return next;
    });
  }

  async function saveEdit(zone: Zone) {
    const draft = editing[zone.id];
    if (!draft) return;
    const name = draft.name_ka.trim();
    if (!name) {
      toast.error("სახელი აუცილებელია");
      return;
    }
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("lat/lng არასწორია");
      return;
    }
    await patchZone(zone.id, {
      name_ka: name,
      description_ka: draft.description_ka.trim(),
      lat,
      lng,
      icon: draft.icon,
    });
    cancelEditing(zone.id);
  }

  async function createZone() {
    const slug = createDraft.slug.trim();
    const name = createDraft.name_ka.trim();
    const lat = Number(createDraft.lat);
    const lng = Number(createDraft.lng);
    if (!slug) {
      toast.error("slug აუცილებელია");
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
      toast.error("slug-ში მხოლოდ a-z, 0-9, '-' '_' შეიძლება");
      return;
    }
    if (!name) {
      toast.error("სახელი აუცილებელია");
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("lat/lng არასწორია");
      return;
    }
    const maxOrder = zones.reduce((m, z) => Math.max(m, z.sort_order), 0);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/zones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          name_ka: name,
          description_ka: createDraft.description_ka.trim(),
          lat,
          lng,
          icon: createDraft.icon,
          sort_order: maxOrder + 1,
        }),
      });
      const payload = await readJsonSafely(res);
      if (!res.ok) throw new Error(getPayloadError(payload, "შეცდომა"));
      toast.success("ზონა დამატებულია");
      setShowCreate(false);
      setCreateDraft(EMPTY_DRAFT);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setCreating(false);
    }
  }

  const ordered = useMemo(
    () => [...zones].sort((a, b) => a.sort_order - b.sort_order),
    [zones],
  );

  return (
    <div className="w-full space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
            ლოკაციის ზონები
          </h1>
          <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
            მართეთ ბაკურიანის ზონები — ისინი გამოჩნდება ძიების, რუკის, შექმნის
            ფორმებსა და ფასების სტატისტიკაში.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setCreateDraft(EMPTY_DRAFT);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2563EB] px-5 text-sm font-bold text-white shadow-[0px_4px_12px_rgba(37,99,235,0.25)] transition hover:bg-[#1D4ED8]"
        >
          <Plus className="h-4 w-4" />
          ახალი ზონა
        </button>
      </div>

      <div className="rounded-xl border border-[#FEF08A] bg-[#FFFBEB] px-4 py-4 text-[#B45309] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <p className="flex items-center gap-3 text-[13px] font-bold leading-5">
          <AlertTriangle className="h-5 w-5 text-[#F97316]" />
          ცვლილებები მყისიერად აისახება ვებსაიტზე. ზონის გათიშვა მისი
          მონაცემების წაშლის ნაცვლად რეკომენდებულია.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="აქტიური ზონები" value={activeCount} highlight />
        <StatCard label="სულ ზონები" value={zones.length} />
        <StatCard label="გათიშული" value={zones.length - activeCount} />
      </div>

      {showCreate ? (
        <section className="rounded-3xl border border-[#2563EB]/30 bg-[#EFF6FF] p-6 shadow-[0px_4px_20px_-2px_rgba(37,99,235,0.10)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-black text-[#1E293B]">
              ახალი ზონის დამატება
            </h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-full p-1 text-[#64748B] hover:bg-white"
              aria-label="დახურვა"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ZoneFormFields
            draft={createDraft}
            onChange={setCreateDraft}
            slugEditable
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="h-10 rounded-full border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              გაუქმება
            </button>
            <button
              type="button"
              onClick={createZone}
              disabled={creating}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#2563EB] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              დამატება
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="bg-[#F8FAFC] px-5 py-5">
          <h2 className="text-[15px] font-black leading-[22px] text-[#1E293B]">
            ზონების სია
          </h2>
        </div>
        <div className="space-y-3 p-6">
          {loading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-[88px] w-full rounded-2xl" />
            ))
          ) : ordered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">
              ჯერ ზონები არ არის
            </p>
          ) : (
            ordered.map((zone, idx) => {
              const isEditing = !!editing[zone.id];
              const isSaving = savingId === zone.id;
              return (
                <div
                  key={zone.id}
                  className={`rounded-2xl border px-4 py-4 transition ${
                    zone.is_active
                      ? "border-[#F1F5F9] bg-[#F8FAFC]"
                      : "border-dashed border-[#E2E8F0] bg-[#FAFAFA] opacity-70"
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <ZoneFormFields
                        draft={editing[zone.id]}
                        onChange={(next) =>
                          setEditing((prev) => ({ ...prev, [zone.id]: next }))
                        }
                        slugEditable={false}
                        slug={zone.slug}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => cancelEditing(zone.id)}
                          className="h-9 rounded-full border border-[#E2E8F0] bg-white px-3 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                        >
                          გაუქმება
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(zone)}
                          disabled={isSaving}
                          className="inline-flex h-9 items-center gap-2 rounded-full bg-[#10B981] px-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          შენახვა
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2563EB] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
                          <IconGlyph icon={zone.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#1E293B]">
                            {zone.name_ka}
                            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                              {zone.slug}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-[#64748B]">
                            {zone.description_ka || "—"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#94A3B8]">
                            {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)} · სორტი{" "}
                            {zone.sort_order}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => move(zone, -1)}
                          disabled={idx === 0 || isSaving}
                          className="rounded-full p-3 lg:p-2 text-[#64748B] hover:bg-white disabled:opacity-30"
                          aria-label="ზემოთ"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(zone, 1)}
                          disabled={idx === ordered.length - 1 || isSaving}
                          className="rounded-full p-3 lg:p-2 text-[#64748B] hover:bg-white disabled:opacity-30"
                          aria-label="ქვემოთ"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(zone)}
                          disabled={isSaving}
                          className={`relative h-5 w-10 rounded-full transition-colors before:absolute before:-inset-x-0.5 before:-inset-y-3 before:content-[''] ${
                            zone.is_active ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                          } disabled:opacity-50`}
                          aria-label={zone.is_active ? "გათიშვა" : "ჩართვა"}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                              zone.is_active
                                ? "translate-x-5"
                                : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(zone)}
                          className="rounded-full p-3 lg:p-2 text-[#2563EB] hover:bg-white"
                          aria-label="რედაქტირება"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => softDelete(zone)}
                          disabled={isSaving || !zone.is_active}
                          className="rounded-full p-3 lg:p-2 text-[#DC2626] hover:bg-white disabled:opacity-30"
                          aria-label="გათიშვა"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border px-5 py-4 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] ${
        highlight
          ? "border-[#2563EB] bg-[#2563EB] text-white"
          : "border-[#E2E8F0] bg-white text-[#0F172A]"
      }`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-[0.5px] ${
          highlight ? "text-[#BFDBFE]" : "text-[#94A3B8]"
        }`}
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-black leading-8">{value}</p>
    </div>
  );
}

function ZoneFormFields({
  draft,
  onChange,
  slugEditable,
  slug,
}: {
  draft: ZoneDraft;
  onChange: (next: ZoneDraft) => void;
  slugEditable: boolean;
  slug?: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Slug">
        {slugEditable ? (
          <input
            value={draft.slug}
            onChange={(e) => onChange({ ...draft, slug: e.target.value })}
            placeholder="didveli"
            className="zone-input"
          />
        ) : (
          <p className="flex h-11 items-center rounded-lg border border-dashed border-[#E2E8F0] bg-white px-3 text-sm font-bold text-[#64748B]">
            {slug}
          </p>
        )}
      </Field>
      <Field label="ხატულა">
        <div className="relative">
          <select
            value={draft.icon}
            onChange={(e) =>
              onChange({ ...draft, icon: e.target.value as ZoneIconValue })
            }
            className="zone-input appearance-none pr-9"
          >
            {ICON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        </div>
      </Field>
      <Field label="სახელი (ქართულად)">
        <input
          value={draft.name_ka}
          onChange={(e) => onChange({ ...draft, name_ka: e.target.value })}
          placeholder="დიდველი / კრისტალი"
          className="zone-input"
        />
      </Field>
      <Field label="აღწერა">
        <input
          value={draft.description_ka}
          onChange={(e) =>
            onChange({ ...draft, description_ka: e.target.value })
          }
          placeholder="ტრასასთან ახლოს..."
          className="zone-input"
        />
      </Field>
      <Field label="Latitude">
        <input
          value={draft.lat}
          onChange={(e) => onChange({ ...draft, lat: e.target.value })}
          placeholder="41.7385"
          inputMode="decimal"
          className="zone-input"
        />
      </Field>
      <Field label="Longitude">
        <input
          value={draft.lng}
          onChange={(e) => onChange({ ...draft, lng: e.target.value })}
          placeholder="43.5175"
          inputMode="decimal"
          className="zone-input"
        />
      </Field>
      <style jsx>{`
        :global(.zone-input) {
          height: 44px;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 0 0.75rem;
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        :global(.zone-input:focus) {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
      `}</style>
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
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
        {label}
      </span>
      {children}
    </label>
  );
}
