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
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import MediaUploader, {
  type MediaValue,
} from "@/components/forms/MediaUploader";
import DateTimeField from "@/components/shared/DateTimeField";
import NumberField from "@/components/shared/NumberField";
import {
  BANNER_KINDS,
  BANNER_TONE_STYLES,
  BANNER_TONES,
  type BannerKind,
  type BannerTone,
  type LandingBanner,
} from "@/lib/banners";

type FormState = {
  id: string | null;
  kind: BannerKind;
  title: string;
  body: string;
  cta_label: string;
  cta_href: string;
  image_url: string;
  video_url: string;
  video_poster_url: string;
  tone: BannerTone;
  active: boolean;
  start_at: string;
  end_at: string;
  sort_order: number;
};

const EMPTY_FORM: FormState = {
  id: null,
  kind: "info",
  title: "",
  body: "",
  cta_label: "",
  cta_href: "",
  image_url: "",
  video_url: "",
  video_poster_url: "",
  tone: "orange",
  active: true,
  start_at: "",
  end_at: "",
  sort_order: 0,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AdminBannersPage() {
  const t = useTranslations("AdminBanners");
  const tShared = useTranslations("AdminShared");
  const tDash = useTranslations("DashboardShared");
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState<LandingBanner[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/banners", { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? tShared("loadFailed"));
      setBanners([]);
    } else {
      setBanners(payload.banners as LandingBanner[]);
    }
    setLoading(false);
  }, [tShared]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const map: Record<BannerKind, LandingBanner[]> = {
      info: [],
      promo: [],
      sticky_news: [],
    };
    for (const b of banners) map[b.kind].push(b);
    return map;
  }, [banners]);

  function openCreate(kind: BannerKind) {
    setForm({
      ...EMPTY_FORM,
      kind,
      tone: kind === "promo" ? "amber" : "orange",
    });
    setError("");
    setOpen(true);
  }

  function openEdit(b: LandingBanner) {
    setForm({
      id: b.id,
      kind: b.kind,
      title: b.title,
      body: b.body ?? "",
      cta_label: b.cta_label ?? "",
      cta_href: b.cta_href ?? "",
      image_url: b.image_url ?? "",
      video_url: b.video_url ?? "",
      video_poster_url: b.video_poster_url ?? "",
      tone: b.tone,
      active: b.active,
      start_at: toLocalInput(b.start_at),
      end_at: toLocalInput(b.end_at),
      sort_order: b.sort_order,
    });
    setError("");
    setOpen(true);
  }

  const mediaValue: MediaValue = form.video_url
    ? { url: form.video_url, type: "video" }
    : form.image_url
      ? { url: form.image_url, type: "image" }
      : null;

  function handleMediaChange(v: MediaValue) {
    if (!v) {
      setForm((p) => ({
        ...p,
        image_url: "",
        video_url: "",
        video_poster_url: "",
      }));
      return;
    }
    if (v.type === "video") {
      setForm((p) => ({ ...p, video_url: v.url, image_url: "" }));
    } else {
      setForm((p) => ({
        ...p,
        image_url: v.url,
        video_url: "",
        video_poster_url: "",
      }));
    }
  }

  function handlePosterChange(url: string | null) {
    setForm((p) => ({ ...p, video_poster_url: url ?? "" }));
  }

  function close() {
    setOpen(false);
    setError("");
  }

  function onField(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value, type } = e.target;
    const next =
      type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : type === "number"
          ? Number(value)
          : value;
    setForm((p) => ({ ...p, [name]: next }));
  }

  function stop(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(t("titleRequired"));
      return;
    }
    if (form.cta_label.trim() && !form.cta_href.trim()) {
      setError(t("ctaUrlRequired"));
      return;
    }
    if (
      form.start_at &&
      form.end_at &&
      new Date(form.end_at) < new Date(form.start_at)
    ) {
      setError(t("endBeforeStart"));
      return;
    }

    setSubmitting(true);
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      body: form.body.trim() || null,
      cta_label: form.cta_label.trim() || null,
      cta_href: form.cta_href.trim() || null,
      image_url: form.image_url.trim() || null,
      video_url: form.video_url.trim() || null,
      video_poster_url: form.video_poster_url.trim() || null,
      tone: form.tone,
      active: form.active,
      start_at: fromLocalInput(form.start_at),
      end_at: fromLocalInput(form.end_at),
      sort_order: form.sort_order,
    };

    try {
      const res = await fetch(
        form.id ? `/api/admin/banners/${form.id}` : "/api/admin/banners",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "timeout") throw new Error(t("saveTimeout"));
        throw new Error(data.error ?? tShared("saveFailed"));
      }
      toast.success(form.id ? t("updated") : t("created"));
      setOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(b: LandingBanner) {
    const res = await fetch(`/api/admin/banners/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !b.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? tShared("changeFailed"));
      return;
    }
    toast.success(b.active ? t("disabled") : t("enabled"));
    await load();
  }

  async function remove(b: LandingBanner) {
    if (!confirm(t("deleteConfirm", { title: b.title }))) return;
    const res = await fetch(`/api/admin/banners/${b.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? tShared("deleteFailed"));
      return;
    }
    toast.success(t("deleted"));
    await load();
  }

  return (
    <div className="relative h-full w-full overflow-x-auto">
      <div className="flex min-h-full flex-col gap-6 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-6 pb-2">
          <div className="space-y-2">
            <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
              {t("title")}
            </h1>
            <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[160px] w-full rounded-3xl" />
            ))}
          </div>
        ) : (
          BANNER_KINDS.map((kind) => (
            <section key={kind} className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[20px] font-black leading-7 text-[#1E293B]">
                    {t(`kinds.${kind}`)}
                  </h2>
                  <p className="text-[12px] font-medium leading-[18px] text-[#94A3B8]">
                    {t(`kindDescriptions.${kind}`)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCreate(kind)}
                  className="inline-flex h-[44px] min-h-[44px] items-center gap-2 rounded-xl bg-[#0F172A] px-4 text-[13px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)]"
                >
                  <Plus className="h-[13px] w-[13px]" strokeWidth={2.8} />
                  {t("add")}
                </button>
              </div>

              {grouped[kind].length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white py-10 text-center text-sm font-medium text-[#94A3B8]">
                  {t("empty")}
                </div>
              ) : (
                <div className="space-y-3">
                  {grouped[kind].map((b) => (
                    <BannerRow
                      key={b.id}
                      banner={b}
                      onEdit={() => openEdit(b)}
                      onToggle={() => toggleActive(b)}
                      onDelete={() => remove(b)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 p-4 backdrop-blur-[2px] sm:p-6"
          onClick={close}
          role="presentation"
        >
          <div
            className="max-h-[calc(100vh-2rem)] w-full max-w-[640px] overflow-y-auto rounded-[32px] bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] sm:p-10"
            onClick={stop}
          >
            <div className="flex items-start justify-between gap-4 pb-6">
              <div className="space-y-1">
                <h2 className="text-2xl font-black leading-7 tracking-[-0.6px] text-[#1E293B]">
                  {form.id ? t("editTitle") : t("newTitle")}
                </h2>
                <p className="text-xs font-medium leading-[18px] text-[#64748B]">
                  {t(`kinds.${form.kind}`)}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-10 min-h-[44px] w-10 items-center justify-center rounded-full border border-[#F1F5F9] bg-[#F8FAFC] text-[#64748B]"
                aria-label={tShared("close")}
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <form className="space-y-5" onSubmit={submit}>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={t("type")}>
                  <select
                    name="kind"
                    value={form.kind}
                    onChange={onField}
                    className={selectCls}
                  >
                    {BANNER_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`kinds.${k}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("color")}>
                  <select
                    name="tone"
                    value={form.tone}
                    onChange={onField}
                    className={selectCls}
                  >
                    {BANNER_TONES.map((tone) => (
                      <option key={tone} value={tone}>
                        {t(`tones.${tone}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label={t("bannerTitle")}>
                <input
                  name="title"
                  value={form.title}
                  onChange={onField}
                  className={inputCls}
                  placeholder={t("titlePlaceholder")}
                />
              </Field>

              <Field label={t("bodyOptional")}>
                <textarea
                  name="body"
                  value={form.body}
                  onChange={onField}
                  rows={3}
                  className={`${inputCls} h-auto min-h-[80px] resize-none py-3`}
                  placeholder={t("bodyPlaceholder")}
                />
              </Field>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={t("ctaText")}>
                  <input
                    name="cta_label"
                    value={form.cta_label}
                    onChange={onField}
                    className={inputCls}
                    placeholder={t("ctaTextPlaceholder")}
                  />
                </Field>
                <Field label={t("ctaUrl")}>
                  <input
                    name="cta_href"
                    value={form.cta_href}
                    onChange={onField}
                    className={inputCls}
                    placeholder={t("ctaUrlPlaceholder")}
                  />
                </Field>
              </div>

              <MediaUploader
                value={mediaValue}
                onChange={handleMediaChange}
                kind="banner"
                poster={form.video_poster_url || null}
                onPosterChange={handlePosterChange}
              />

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={t("startOptional")}>
                  <DateTimeField
                    value={form.start_at}
                    onChange={(v) => setForm((p) => ({ ...p, start_at: v }))}
                    clearable
                    className="h-[55px] rounded-2xl"
                  />
                </Field>
                <Field label={t("endOptional")}>
                  <DateTimeField
                    value={form.end_at}
                    onChange={(v) => setForm((p) => ({ ...p, end_at: v }))}
                    clearable
                    className="h-[55px] rounded-2xl"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={t("sortOrder")}>
                  <NumberField
                    value={String(form.sort_order)}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, sort_order: Number(v) }))
                    }
                    integer
                    min={0}
                    max={10000}
                  />
                </Field>
                <label className="flex h-[55px] cursor-pointer items-center gap-3 self-end rounded-2xl border border-[#E2E8F0] bg-white px-4">
                  <input
                    type="checkbox"
                    name="active"
                    checked={form.active}
                    onChange={onField}
                    className="h-4 w-4 accent-[#2563EB]"
                  />
                  <span className="text-sm font-bold text-[#1E293B]">
                    {t("enabledLabel")}
                  </span>
                </label>
              </div>

              {error && (
                <p className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#B91C1C]">
                  {error}
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
                {form.id ? tDash("save") : t("create")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-[55px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none";
const selectCls =
  "h-[55px] w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium leading-[21px] text-[#1E293B] focus:border-[#2563EB] focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]">
        {label}
      </label>
      {children}
    </div>
  );
}

function BannerRow({
  banner,
  onEdit,
  onToggle,
  onDelete,
}: {
  banner: LandingBanner;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("AdminBanners");
  const tDash = useTranslations("DashboardShared");
  const tCreate = useTranslations("CreateShared");
  const tone = BANNER_TONE_STYLES[banner.tone];
  return (
    <article
      className="overflow-hidden rounded-2xl border bg-white shadow-[0px_2px_8px_-2px_rgba(0,0,0,0.04)]"
      style={{ borderColor: tone.border }}
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
        style={{ backgroundColor: tone.bg }}
      >
        <div className="flex items-start gap-3">
          {banner.video_url ? (
            <video
              src={banner.video_url}
              poster={banner.video_poster_url ?? banner.image_url ?? undefined}
              muted
              loop
              autoPlay
              playsInline
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : banner.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.image_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
              style={{ backgroundColor: tone.iconBg, color: tone.iconText }}
            >
              i
            </span>
          )}
          <div className="min-w-0">
            <p
              className="text-sm font-black leading-tight"
              style={{ color: tone.title }}
            >
              {banner.title}
            </p>
            {banner.body && (
              <p
                className="mt-1 text-xs font-medium leading-[18px]"
                style={{ color: tone.text }}
              >
                {banner.body}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
              <span className="rounded bg-white/70 px-2 py-1">
                {t(`kinds.${banner.kind}`)}
              </span>
              <span className="rounded bg-white/70 px-2 py-1">
                {t(`tones.${banner.tone}`)}
              </span>
              {!banner.active && (
                <span className="rounded bg-[#EF4444] px-2 py-1 text-white">
                  {t("disabledBadge")}
                </span>
              )}
              {banner.cta_label && banner.cta_href && (
                <span className="max-w-full break-words rounded bg-white/70 px-2 py-1 normal-case tracking-normal">
                  {banner.cta_label} → {banner.cta_href}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-11 min-h-[44px] lg:h-9 lg:min-h-[36px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-bold text-[#475569]"
          >
            {banner.active ? (
              <>
                <EyeOff className="h-3.5 w-3.5" /> {t("disable")}
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" /> {t("enable")}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-11 min-h-[44px] lg:h-9 lg:min-h-[36px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-bold text-[#475569]"
          >
            <Pencil className="h-3.5 w-3.5" /> {tDash("edit")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-11 min-h-[44px] lg:h-9 lg:min-h-[36px] items-center gap-1.5 rounded-lg border border-[#FECACA] bg-white px-3 text-[11px] font-bold text-[#B91C1C]"
          >
            <Trash2 className="h-3.5 w-3.5" /> {tCreate("delete")}
          </button>
        </div>
      </div>
    </article>
  );
}
