"use client";

export default function PromoCodesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[56px] font-black leading-[1.05] tracking-[-1px] text-[#0F172A]">
          პრომო კოდების გენერატორი
        </h1>
        <p className="mt-2 text-[30px] leading-tight text-[#64748B]">
          შექმენით ფასდაკლების კოდები ლოიალური მომხმარებლებისთვის.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-6">
          <label className="mb-2 block text-sm font-semibold text-[#334155]">
            პრომო კოდი (მაგ: NEWYEAR2026)
          </label>
          <input
            defaultValue="NEWYEAR2026"
            className="mb-5 h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#334155]">
                ფასდაკლება (-20%)
              </label>
              <input
                defaultValue={20}
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#334155]">
                ტიპი
              </label>
              <select className="h-12 w-full rounded-xl border border-[#2563EB] bg-[#F8FAFC] px-4">
                <option>პროცენტი (%)</option>
                <option>ფიქსირებული (₾)</option>
              </select>
            </div>
          </div>

          <button className="mt-6 h-12 w-full rounded-xl bg-[#0B1736] text-sm font-extrabold text-white">
            კოდის გენერაცია
          </button>
        </section>

        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-4 text-[34px] font-black text-[#0F172A]">
            აქტიური კოდები
          </h2>
          <div className="rounded-2xl bg-[#F8FAFC] p-4">
            <div className="flex items-center justify-between">
              <p className="text-[36px] font-black text-[#2563EB]">
                NEWYEAR2026
              </p>
              <button className="text-sm font-bold text-[#DC2626]">
                გაუქმება
              </button>
            </div>
            <p className="mt-1 text-[22px] text-[#64748B]">
              -20% ფასდაკლება (გამოყენებულია: 14-ჯერ)
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
