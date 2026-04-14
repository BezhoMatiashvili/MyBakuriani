"use client";

import { PencilLine, RotateCw } from "lucide-react";

export default function SeoPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[56px] font-black leading-[1.05] tracking-[-1px] text-[#0F172A]">
          სიახლეები &amp; ბლოგი
        </h1>
        <p className="mt-2 text-[30px] leading-tight text-[#64748B]">
          SEO სტატიების წერა და ავტომატური RSS სინქრონიზაცია.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-4 inline-flex items-center gap-2 text-[34px] font-black text-[#0F172A]">
            <PencilLine className="h-7 w-7 text-[#2563EB]" />
            სტატიის დაწერა
          </h2>
          <div className="space-y-4">
            <input
              placeholder="სტატიის სათაური..."
              className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4"
            />
            <textarea
              placeholder="სტატიის სრული ტექსტი..."
              rows={6}
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
            />
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
              <p className="mb-3 text-sm font-semibold text-[#334155]">
                აირჩიეთ გამოქვეყნების ტიპი:
              </p>
              <div className="flex gap-8">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                  <input type="radio" defaultChecked />
                  სტატიური ობიექტი
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[#64748B]">
                  <input type="radio" />
                  მედიაადა მორგავი
                </label>
              </div>
            </div>
            <button className="h-12 w-full rounded-xl bg-[#2563EB] text-sm font-extrabold text-white">
              გამოქვეყნება
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[34px] font-black leading-tight text-[#0F172A]">
              RSS ავტო-
              <br />
              სინქრონიზაცია
            </h2>
            <span className="rounded-lg bg-[#D1FAE5] px-3 py-1 text-xs font-extrabold uppercase tracking-[1px] text-[#059669]">
              აქტიური
            </span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#334155]">
                წყაროს (FEED) ლინკი
              </label>
              <input
                defaultValue="https://www.ambebi.ge/rss"
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#334155]">
                საკვანძო სიტყვები (KEYWORDS)
              </label>
              <textarea
                rows={3}
                defaultValue="ბაკურიანი, დიდველი, აჭარა, ბათუმი, თბილისი"
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
              />
            </div>
            <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F1F5F9] text-sm font-bold text-[#334155]">
              <RotateCw className="h-4 w-4" />
              ახლა სინქრონიზაცია
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
