"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface Promocode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  uses_count: number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export default function PromoCodesPage() {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<Promocode[]>([]);
  const [form, setForm] = useState({
    code: "NEWYEAR2026",
    discount_value: 20,
    discount_type: "percent" as "percent" | "fixed",
    expires_at: "",
    max_uses: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/promocodes", { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "ჩატვირთვა ვერ მოხერხდა");
      setCodes([]);
    } else {
      setCodes(payload.codes as Promocode[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!form.code.trim()) {
      toast.error("კოდი სავალდებულოა");
      return;
    }
    if (!(form.discount_value > 0)) {
      toast.error("ფასდაკლების მნიშვნელობა დადებითი უნდა იყოს");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/promocodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          expires_at: form.expires_at || undefined,
          max_uses: form.max_uses ? Number(form.max_uses) : undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "შექმნა ვერ მოხერხდა");
      toast.success("კოდი შეიქმნა");
      setForm({
        code: "",
        discount_value: 20,
        discount_type: "percent",
        expires_at: "",
        max_uses: "",
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/admin/promocodes?id=${id}`, {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "გაუქმება ვერ მოხერხდა");
      toast.success("კოდი გაუქმდა");
      setCodes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: false } : c)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setCancellingId(null);
    }
  }

  const activeCodes = codes.filter((c) => c.is_active);

  return (
    <div className="mx-auto flex w-full max-w-[918px] flex-col gap-8 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          პრომო კოდების გენერატორი
        </h1>
        <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
          შექმენით ფასდაკლების კოდები ლოიალური მომხმარებლებისთვის.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-6">
            <div className="space-y-2">
              <label className="block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                პრომო კოდი (მაგ: NEWYEAR2026)
              </label>
              <input
                id="promocode-code"
                type="text"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
                className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                  ფასდაკლება
                </label>
                <input
                  type="number"
                  value={form.discount_value}
                  min={1}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount_value: Number(e.target.value),
                    }))
                  }
                  className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                />
              </div>
              <div className="space-y-2">
                <label className="block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                  ტიპი
                </label>
                <select
                  value={form.discount_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount_type: e.target.value as "percent" | "fixed",
                    }))
                  }
                  className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                >
                  <option value="percent">პროცენტი (%)</option>
                  <option value="fixed">ფიქსირებული (₾)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                  გამოყენების ლიმიტი (სურვილისამებრ)
                </label>
                <input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_uses: e.target.value }))
                  }
                  className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                />
              </div>
              <div className="space-y-2">
                <label className="block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                  ვადის ამოწურვა (სურვილისამებრ)
                </label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expires_at: e.target.value }))
                  }
                  className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex h-[53px] min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-[14px] font-bold leading-[21px] text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)] disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              კოდის გენერაცია
            </button>
          </div>
        </section>

        <section className="min-h-[329px] rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <h2 className="pb-6 text-[14px] font-bold leading-[21px] text-[#1E293B]">
            აქტიური კოდები ({activeCodes.length})
          </h2>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <Skeleton key={idx} className="h-[68px] w-full rounded-xl" />
              ))
            ) : activeCodes.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                აქტიური კოდი ჯერ არ არის
              </p>
            ) : (
              activeCodes.map((code) => {
                const isCancelling = cancellingId === code.id;
                const discountLabel =
                  code.discount_type === "percent"
                    ? `-${code.discount_value}%`
                    : `-${code.discount_value}₾`;
                const expiry = code.expires_at
                  ? new Date(code.expires_at).toLocaleDateString("ka-GE")
                  : "უვადოდ";
                return (
                  <div
                    key={code.id}
                    className="flex items-center justify-between rounded-xl border border-[#ECFDF5] bg-[#F8FAFC] px-5 py-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-bold leading-6 tracking-[0.4px] text-[#2563EB]">
                        {code.code}
                      </p>
                      <p className="mt-1 truncate text-[11px] font-medium leading-4 text-[#64748B]">
                        {discountLabel} • გამოყ.: {code.uses_count}
                        {code.max_uses ? `/${code.max_uses}` : ""} • {expiry}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancel(code.id)}
                      disabled={isCancelling}
                      className="ml-4 shrink-0 text-[12px] font-bold leading-[18px] text-[#EF4444] disabled:opacity-50"
                    >
                      {isCancelling ? "..." : "გაუქმება"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
