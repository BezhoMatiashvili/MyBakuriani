"use client";

import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Flame,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import BannerLivePreview from "@/components/admin/BannerLivePreview";
import MediaUploader, {
  type MediaValue,
} from "@/components/forms/MediaUploader";
import DateField from "@/components/shared/DateField";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils/format";
import { adRowToCreative, looksLikeVideoUrl } from "@/lib/banner-creative";
import {
  BANNER_PLACEMENTS,
  type BannerPlacement,
  type BannerSurface,
} from "@/lib/banner-placements";

type Ad = {
  id: string;
  title: string;
  placement: string;
  position: string;
  url: string;
  banner_url: string | null;
  start_at: string;
  end_at: string;
  status: string;
  views_count: number;
  clicks_count: number;
};

const SURFACE_ORDER: BannerSurface[] = [
  "site",
  "home",
  "listing",
  "detail",
  "blog",
];

const INITIAL_FORM_STATE = {
  id: "",
  title: "",
  placement: "home_hero" as BannerPlacement,
  url: "",
  startDate: "",
  endDate: "",
  bannerUrl: "",
};

type FormState = typeof INITIAL_FORM_STATE;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function toDateInput(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** The `status` column is never updated by anything, so expiry is derived. */
function effectiveStatus(ad: Ad): "active" | "paused" | "expired" {
  if (ad.status === "paused") return "paused";
  if (new Date(ad.end_at).getTime() < Date.now()) return "expired";
  return "active";
}

function AdBannerThumb({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="text-[30px]">📣</span>;
  if (looksLikeVideoUrl(url)) {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

export default function ModerationPage() {
  const t = useTranslations("AdminModeration");
  const tShared = useTranslations("AdminShared");

  const placementLabel = useCallback(
    (id: string) =>
      BANNER_PLACEMENTS.some((p) => p.id === id)
        ? tShared(`placements.${id}`)
        : id,
    [tShared],
  );

  const groupedPlacements = useMemo(
    () =>
      SURFACE_ORDER.map((surface) => ({
        surface,
        label: tShared(`placementGroups.${surface}`),
        options: BANNER_PLACEMENTS.filter((p) => p.surface === surface),
      })).filter((g) => g.options.length > 0),
    [tShared],
  );

  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<Ad[]>([]);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isEditing = formState.id !== "";

  const filteredAds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ads;
    return ads.filter(
      (ad) =>
        ad.id.toLowerCase().includes(q) ||
        ad.title.toLowerCase().includes(q) ||
        ad.url.toLowerCase().includes(q) ||
        ad.placement.toLowerCase().includes(q) ||
        placementLabel(ad.placement).toLowerCase().includes(q),
    );
  }, [ads, search, placementLabel]);

  const bannerMedia: MediaValue = isHttpsUrl(formState.bannerUrl)
    ? {
        url: formState.bannerUrl,
        type: looksLikeVideoUrl(formState.bannerUrl) ? "video" : "image",
      }
    : null;

  // Built with the SAME adapter the public site uses, so the preview cannot
  // show something the renderer wouldn't.
  const previewCreative = useMemo(() => {
    if (!formState.title.trim() || !formState.bannerUrl) return null;
    return adRowToCreative({
      id: formState.id || "preview",
      title: formState.title,
      url: isHttpsUrl(formState.url) ? formState.url : "https://example.com",
      banner_url: formState.bannerUrl,
      placement: formState.placement,
    });
  }, [formState]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/ads", { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? tShared("loadFailed"));
      setAds([]);
    } else {
      setAds(payload.ads as Ad[]);
    }
    setLoading(false);
  }, [tShared]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscClose);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscClose);
    };
  }, [isModalOpen]);

  function openCreate() {
    setFormState(INITIAL_FORM_STATE);
    setFormError("");
    setIsModalOpen(true);
  }

  function openEdit(ad: Ad) {
    setFormState({
      id: ad.id,
      title: ad.title,
      placement: ad.placement as BannerPlacement,
      url: ad.url,
      startDate: toDateInput(ad.start_at),
      endDate: toDateInput(ad.end_at),
      bannerUrl: ad.banner_url ?? "",
    });
    setFormError("");
    setIsModalOpen(true);
  }

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError("");
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormState((previous) => ({ ...previous, [name]: value }));
  };

  const handleModalContainerClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  async function handleDelete(ad: Ad) {
    if (busyId) return;
    if (!confirm(t("deleteConfirm", { title: ad.title }))) return;
    setBusyId(ad.id);
    try {
      const res = await fetch(`/api/admin/ads/${ad.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? tShared("deleteFailed"));
      } else {
        toast.success(t("deleted"));
        await load();
      }
    } catch {
      toast.error(tShared("deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function togglePause(ad: Ad) {
    if (busyId) return;
    setBusyId(ad.id);
    const next = effectiveStatus(ad) === "paused" ? "active" : "paused";
    try {
      const res = await fetch(`/api/admin/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? tShared("error"));
      else {
        toast.success(t("updated"));
        await load();
      }
    } catch {
      toast.error(tShared("error"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !formState.title.trim() ||
      !formState.placement ||
      !formState.url.trim() ||
      !formState.startDate ||
      !formState.endDate
    ) {
      setFormError(t("fillRequired"));
      return;
    }
    // Matches the server, which requires HTTPS. The old check accepted http:
    // and any scheme, so admins hit an opaque 400 after submitting.
    if (!isHttpsUrl(formState.url.trim())) {
      setFormError(t("invalidUrl"));
      return;
    }
    if (!formState.bannerUrl) {
      setFormError(t("bannerRequired"));
      return;
    }
    if (new Date(formState.endDate) < new Date(formState.startDate)) {
      setFormError(t("endBeforeStart"));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: formState.title,
        placement: formState.placement,
        url: formState.url,
        banner_url: formState.bannerUrl,
        start_at: new Date(formState.startDate).toISOString(),
        end_at: new Date(formState.endDate).toISOString(),
      };
      const res = await fetch(
        isEditing ? `/api/admin/ads/${formState.id}` : "/api/admin/ads",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tShared("createFailed"));
      toast.success(isEditing ? t("updated") : t("adCreated"));
      setFormState(INITIAL_FORM_STATE);
      setFormError("");
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative h-full w-full overflow-x-auto">
      <div className="flex min-h-full flex-col gap-6 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-6 pb-4">
          <div className="space-y-2">
            <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
              {t("title")}
            </h1>
            <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-[53px] min-h-[44px] items-center gap-2 rounded-xl bg-[#0F172A] px-6 text-[14px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)]"
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={2.8} />
            {t("addAd")}
          </button>
        </div>

        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("searchPlaceholder")}
        />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton key={idx} className="h-[200px] w-full rounded-3xl" />
            ))}
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#E2E8F0] bg-white py-20 text-center">
            <p className="text-sm font-medium text-[#94A3B8]">
              {search.trim() ? t("searchEmpty") : t("empty")}
            </p>
          </div>
        ) : (
          filteredAds.map((ad) => {
            const status = effectiveStatus(ad);
            const live = status === "active";
            const ctr =
              ad.views_count > 0
                ? ((ad.clicks_count / ad.views_count) * 100).toFixed(1)
                : "0.0";
            const daysLeft = Math.max(
              0,
              Math.ceil(
                (new Date(ad.end_at).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
              ),
            );
            const metrics = [
              { key: "views", value: formatNumber(ad.views_count) },
              { key: "clicks", value: formatNumber(ad.clicks_count) },
              { key: "ctr", value: `${ctr}%` },
              { key: "daysLeft", value: t("daysUnit", { count: daysLeft }) },
            ] as const;
            const accent = live ? "#10B981" : "#94A3B8";
            const accentBg = live ? "#ECFDF5" : "#F8FAFC";

            return (
              <article
                key={ad.id}
                className="overflow-hidden rounded-3xl border border-t-[6px] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]"
                style={{ borderColor: accent }}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
                  style={{ backgroundColor: accentBg }}
                >
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4" style={{ color: accent }} />
                    <span
                      className="text-[11px] font-black uppercase tracking-[1.1px]"
                      style={{ color: live ? "#047857" : "#64748B" }}
                    >
                      {ad.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded px-[10px] py-1 text-[10px] font-black uppercase tracking-[0.5px] text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {status === "active"
                        ? t("statusActive")
                        : status === "paused"
                          ? t("statusPaused")
                          : t("statusExpired")}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(ad)}
                      disabled={busyId !== null}
                      aria-label={t("edit")}
                      title={t("edit")}
                      className="inline-flex h-11 min-h-[44px] w-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#EFF6FF] hover:text-[#2563EB] disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePause(ad)}
                      disabled={busyId !== null || status === "expired"}
                      aria-label={
                        status === "paused" ? t("resume") : t("pause")
                      }
                      title={status === "paused" ? t("resume") : t("pause")}
                      className="inline-flex h-11 min-h-[44px] w-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316] disabled:opacity-40"
                    >
                      {status === "paused" ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Pause className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(ad)}
                      disabled={busyId !== null}
                      aria-label={t("delete")}
                      title={t("delete")}
                      className="inline-flex h-11 min-h-[44px] w-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:opacity-50"
                    >
                      {busyId === ad.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 px-6 py-6">
                  <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E2E8F0] bg-white">
                    {ad.banner_url ? (
                      <AdBannerThumb url={ad.banner_url} />
                    ) : (
                      <span className="text-[30px]">📣</span>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-[18px] font-black leading-[27px] text-[#1E293B]">
                      {ad.title}
                    </h3>
                    <p className="text-[13px] font-bold leading-5 text-[#F97316]">
                      {placementLabel(ad.placement)}
                    </p>
                    <a
                      href={ad.url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-words text-xs text-[#64748B] underline"
                    >
                      {ad.url}
                    </a>
                  </div>
                </div>

                {!ad.banner_url || status === "expired" ? (
                  <p className="mx-6 mb-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[13px] font-semibold text-[#92400E]">
                    {!ad.banner_url ? t("needsImage") : t("expiredHint")}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 sm:grid-cols-4">
                  {metrics.map((metric) => (
                    <div
                      key={metric.key}
                      className="flex h-[86px] flex-col items-center justify-center border-[#E2E8F0] bg-white px-3 even:border-l [&:nth-child(n+3)]:border-t sm:border-l sm:first:border-l-0 sm:[&:nth-child(n+3)]:border-t-0"
                    >
                      <span className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-[#94A3B8]">
                        {t(metric.key)}
                      </span>
                      <span className="mt-1 font-black text-[#1E293B]">
                        {metric.value}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 p-4 backdrop-blur-[2px] sm:p-6"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="max-h-[90dvh] w-full max-w-[600px] overflow-y-auto rounded-[32px] bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] sm:p-10 lg:max-h-[calc(100vh-2rem)]"
            onClick={handleModalContainerClick}
          >
            <div className="flex items-start justify-between gap-4 pb-8">
              <div className="space-y-1">
                <h2 className="text-2xl font-black leading-6 tracking-[-0.6px] text-[#1E293B]">
                  {isEditing ? t("editTitle") : t("modalTitle")}
                </h2>
                <p className="text-xs font-medium leading-[18px] text-[#64748B]">
                  {t("modalSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 min-h-[44px] w-10 items-center justify-center rounded-full border border-[#F1F5F9] bg-[#F8FAFC] text-[#64748B]"
                aria-label={tShared("close")}
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  htmlFor="ad-title"
                  className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                >
                  {t("adTitle")}
                </label>
                <input
                  id="ad-title"
                  name="title"
                  value={formState.title}
                  onChange={handleInputChange}
                  placeholder={t("adTitlePlaceholder")}
                  className="h-[55px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="ad-placement"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    {tShared("placement")}
                  </label>
                  <select
                    id="ad-placement"
                    name="placement"
                    value={formState.placement}
                    onChange={handleInputChange}
                    className="h-[55px] w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium leading-[21px] text-[#1E293B] focus:border-[#2563EB] focus:outline-none"
                  >
                    {groupedPlacements.map((group) => (
                      <optgroup key={group.surface} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {tShared(`placements.${option.id}`)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="ad-url"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    {t("redirectUrl")}
                  </label>
                  <input
                    id="ad-url"
                    name="url"
                    value={formState.url}
                    onChange={handleInputChange}
                    placeholder="https://..."
                    className="h-[55px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="start-date"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    {t("startDate")}
                  </label>
                  <DateField
                    id="start-date"
                    value={formState.startDate}
                    onChange={(value) =>
                      setFormState((previous) => ({
                        ...previous,
                        startDate: value,
                      }))
                    }
                    className="h-[55px] rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="end-date"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    {t("endDate")}
                  </label>
                  <DateField
                    id="end-date"
                    value={formState.endDate}
                    onChange={(value) =>
                      setFormState((previous) => ({
                        ...previous,
                        endDate: value,
                      }))
                    }
                    min={formState.startDate || undefined}
                    className="h-[55px] rounded-2xl"
                  />
                </div>
              </div>

              {/*
                The uploader is the ONLY writer of banner_url. There used to be
                a free-text "banner URL" input bound to the same field, which is
                how three live ads ended up with a page URL where the image
                belongs (and therefore a broken thumbnail).
              */}
              <MediaUploader
                value={bannerMedia}
                onChange={(v) =>
                  setFormState((previous) => ({
                    ...previous,
                    bannerUrl: v?.url ?? "",
                  }))
                }
                kind="ads"
                label={t("bannerMedia")}
              />

              <BannerLivePreview
                placement={formState.placement}
                creative={previewCreative}
                emptyLabel={tShared("previewEmpty")}
                desktopLabel={tShared("previewDesktop")}
                mobileLabel={tShared("previewMobile")}
              />

              {formError && (
                <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#B91C1C]">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-[55px] min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-[#2563EB] text-[15px] font-bold leading-[22px] text-white shadow-[0px_8px_20px_rgba(37,99,235,0.25)] disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {isEditing ? t("save") : t("launch")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
