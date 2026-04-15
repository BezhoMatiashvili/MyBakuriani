"use client";

import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Flame, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type Ad = {
  id: string;
  title: string;
  position: string;
  url: string;
  banner_url: string | null;
  start_at: string;
  end_at: string;
  status: string;
  views_count: number;
  clicks_count: number;
};

const POSITION_OPTIONS = [
  { value: "slot-a", label: "სლოტი A (Hero)" },
  { value: "slot-b", label: "სლოტი B (Between cards)" },
  { value: "slot-c", label: "სლოტი C (Sidebar)" },
];

const INITIAL_FORM_STATE = {
  title: "",
  position: "slot-a",
  url: "",
  startDate: "",
  endDate: "",
  bannerUrl: "",
};

export default function ModerationPage() {
  const [loading, setLoading] = useState(true);
  const [ads, setAds] = useState<Ad[]>([]);
  const [isAddAdModalOpen, setIsAddAdModalOpen] = useState(false);
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/ads", { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "ჩატვირთვა ვერ მოხერხდა");
      setAds([]);
    } else {
      setAds(payload.ads as Ad[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isAddAdModalOpen) return;
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAddAdModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscClose);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscClose);
    };
  }, [isAddAdModalOpen]);

  const closeModal = () => {
    setIsAddAdModalOpen(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !formState.title.trim() ||
      !formState.position ||
      !formState.url.trim() ||
      !formState.startDate ||
      !formState.endDate
    ) {
      setFormError("გთხოვთ შეავსოთ ყველა სავალდებულო ველი.");
      return;
    }
    try {
      new URL(formState.url);
    } catch {
      setFormError("გთხოვთ მიუთითოთ სწორი URL მისამართი.");
      return;
    }
    if (new Date(formState.endDate) < new Date(formState.startDate)) {
      setFormError("დასასრული თარიღი ვერ იქნება დაწყების თარიღზე ადრე.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: formState.title,
          position: formState.position,
          url: formState.url,
          banner_url: formState.bannerUrl || undefined,
          start_at: new Date(formState.startDate).toISOString(),
          end_at: new Date(formState.endDate).toISOString(),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "შექმნა ვერ მოხერხდა");
      toast.success("რეკლამა შეიქმნა");
      setFormState(INITIAL_FORM_STATE);
      setFormError("");
      setIsAddAdModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "შეცდომა");
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
              B2B რეკლამები
            </h1>
            <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
              რესტორნების, ტრანსპორტისა და ინვენტარის ბანერების მართვა.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddAdModalOpen(true)}
            className="inline-flex h-[53px] min-h-[44px] items-center gap-2 rounded-xl bg-[#0F172A] px-6 text-[14px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)]"
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={2.8} />
            რეკლამის დამატება
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton key={idx} className="h-[200px] w-full rounded-3xl" />
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#E2E8F0] bg-white py-20 text-center">
            <p className="text-sm font-medium text-[#94A3B8]">
              ჯერ არ არის კამპანია. დააწკაპუნეთ &laquo;რეკლამის დამატება&raquo;.
            </p>
          </div>
        ) : (
          ads.map((ad) => {
            const ctr =
              ad.views_count > 0
                ? ((ad.clicks_count / ad.views_count) * 100).toFixed(1)
                : "0.0";
            return (
              <article
                key={ad.id}
                className="overflow-hidden rounded-3xl border border-[#10B981] border-t-[6px] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center justify-between bg-[#ECFDF5] px-6 py-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-[#059669]" />
                    <span className="text-[11px] font-black uppercase tracking-[1.1px] text-[#047857]">
                      {ad.title}
                    </span>
                  </div>
                  <span className="inline-flex items-center rounded bg-[#10B981] px-[10px] py-1 text-[10px] font-black uppercase tracking-[0.5px] text-white">
                    {ad.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-6 px-6 py-6">
                  <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E2E8F0] bg-white">
                    {ad.banner_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ad.banner_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[30px]">📣</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[18px] font-black leading-[27px] text-[#1E293B]">
                      {ad.title}
                    </h3>
                    <p className="text-[13px] font-bold leading-5 text-[#F97316]">
                      პოზიცია: {ad.position}
                    </p>
                    <a
                      href={ad.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#64748B] underline"
                    >
                      {ad.url}
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-4">
                  {[
                    {
                      label: "ნახვები",
                      value: ad.views_count.toLocaleString(),
                    },
                    { label: "კლიკი", value: ad.clicks_count.toLocaleString() },
                    { label: "კლიკების %", value: `${ctr}%` },
                    {
                      label: "დარჩენილია",
                      value: `${Math.max(
                        0,
                        Math.ceil(
                          (new Date(ad.end_at).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24),
                        ),
                      )} დღე`,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="flex h-[86px] flex-col items-center justify-center border-l border-[#E2E8F0] px-3 first:border-l-0 bg-white"
                    >
                      <span className="text-[10px] font-bold uppercase leading-[15px] tracking-[0.5px] text-[#94A3B8]">
                        {metric.label}
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

      {isAddAdModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 p-4 backdrop-blur-[2px] sm:p-6"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="max-h-[calc(100vh-2rem)] w-full max-w-[600px] overflow-y-auto rounded-[32px] bg-white p-6 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] sm:p-10"
            onClick={handleModalContainerClick}
          >
            <div className="flex items-start justify-between gap-4 pb-8">
              <div className="space-y-1">
                <h2 className="text-2xl font-black leading-6 tracking-[-0.6px] text-[#1E293B]">
                  რეკლამის დამატება
                </h2>
                <p className="text-xs font-medium leading-[18px] text-[#64748B]">
                  B2B კამპანიის კონფიგურაცია
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 min-h-[44px] w-10 items-center justify-center rounded-full border border-[#F1F5F9] bg-[#F8FAFC] text-[#64748B]"
                aria-label="დახურვა"
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
                  რეკლამის სათაური
                </label>
                <input
                  id="ad-title"
                  name="title"
                  value={formState.title}
                  onChange={handleInputChange}
                  placeholder="მაგ: თხილამურები დიდველზე"
                  className="h-[55px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="ad-position"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    პოზიცია
                  </label>
                  <select
                    id="ad-position"
                    name="position"
                    value={formState.position}
                    onChange={handleInputChange}
                    className="h-[55px] w-full rounded-2xl border border-[#E2E8F0] bg-white px-4 text-sm font-medium leading-[21px] text-[#1E293B] focus:border-[#2563EB] focus:outline-none"
                  >
                    {POSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="ad-url"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    გადამისამართება (URL)
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
                    დაწყება
                  </label>
                  <input
                    id="start-date"
                    name="startDate"
                    type="date"
                    value={formState.startDate}
                    onChange={handleInputChange}
                    className="h-[57px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="end-date"
                    className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                  >
                    დასრულება
                  </label>
                  <input
                    id="end-date"
                    name="endDate"
                    type="date"
                    value={formState.endDate}
                    onChange={handleInputChange}
                    className="h-[57px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="banner-url"
                  className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]"
                >
                  ბანერის URL (სურვილისამებრ)
                </label>
                <input
                  id="banner-url"
                  name="bannerUrl"
                  value={formState.bannerUrl}
                  onChange={handleInputChange}
                  placeholder="https://.../banner.png"
                  className="h-[55px] w-full rounded-2xl border border-[#E2E8F0] px-4 text-sm font-medium leading-[21px] text-[#1E293B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

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
                კამპანიის გაშვება
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
