"use client";

import { useState } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";

export default function SettingsPage() {
  const [smsPackages, setSmsPackages] = useState([
    {
      id: "starter",
      name: "Starter SMS",
      amount: 10,
      label: "50 SMS",
      enabled: true,
    },
    {
      id: "standard",
      name: "Standard SMS",
      amount: 18,
      label: "100 SMS",
      enabled: true,
    },
    { id: "pro", name: "Pro SMS", amount: 40, label: "250 SMS", enabled: true },
  ]);
  const [vipPackages, setVipPackages] = useState([
    { id: "vip24", name: "VIP 24 საათი", amount: 5, enabled: true },
  ]);
  const [verificationPackages, setVerificationPackages] = useState([
    { id: "fb", name: "FB პაკეტი", amount: 30, enabled: true },
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[56px] font-black leading-[1.05] tracking-[-1px] text-[#0F172A]">
          ტარიფები და პაკეტები
        </h1>
        <p className="mt-2 text-[30px] leading-tight text-[#64748B]">
          მართეთ პლატფორმის მონეტიზაციის წესები და ფასიანი პროდუქტები.
        </p>
      </div>

      <div className="rounded-2xl border border-[#FDE68A] bg-[#F0FDF4] px-5 py-4 text-[#B45309]">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5 text-[#F97316]" />
          ფასების ცვლილება ძალაში შევა მყისიერად და იმოქმედებს მომდევნო ახალ
          ტრანზაქციებზე.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "SMS პაკეტები", value: smsPackages.length },
          { label: "VIP ტარიფები", value: vipPackages.length },
          { label: "რეკლამის სლოტები", value: 3 },
          { label: "SUBSCRIPTION", value: 4 },
          { label: "სულ პროდუქტები", value: 19, highlighted: true },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`rounded-3xl border p-5 ${
              stat.highlighted
                ? "border-[#2563EB] bg-[#2563EB] text-white"
                : "border-[#E2E8F0] bg-white text-[#0F172A]"
            }`}
          >
            <p className="text-sm font-bold uppercase tracking-[1.2px] opacity-70">
              {stat.label}
            </p>
            <p className="mt-1 text-5xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4">
            <h2 className="text-[34px] font-black text-[#0F172A]">
              SMS პაკეტები
            </h2>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A]">
              <Plus className="h-4 w-4" />
              ახალი
            </button>
          </div>
          <div className="space-y-4 p-5">
            {smsPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex items-center justify-between rounded-2xl border border-[#EEF2F7] bg-[#F8FAFC] px-4 py-4"
              >
                <div>
                  <p className="text-[30px] font-black leading-tight text-[#0F172A]">
                    {pkg.name}
                  </p>
                  <p className="text-sm text-[#64748B]">{pkg.label}</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={pkg.amount}
                    onChange={(e) =>
                      setSmsPackages((prev) =>
                        prev.map((item) =>
                          item.id === pkg.id
                            ? { ...item, amount: Number(e.target.value) }
                            : item,
                        ),
                      )
                    }
                    className="h-11 w-28 rounded-xl border border-[#E2E8F0] bg-white px-3 text-center text-[30px] font-black text-[#0F172A]"
                  />
                  <span className="text-sm font-semibold text-[#94A3B8]">
                    ₾
                  </span>
                  <button
                    onClick={() =>
                      setSmsPackages((prev) =>
                        prev.map((item) =>
                          item.id === pkg.id
                            ? { ...item, enabled: !item.enabled }
                            : item,
                        ),
                      )
                    }
                    className={`relative h-8 w-14 rounded-full transition-colors ${
                      pkg.enabled ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
                        pkg.enabled ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                  <button className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#94A3B8]">
                    <Check className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4">
              <h2 className="text-[34px] font-black text-[#0F172A]">
                VIP ამოწევა
              </h2>
              <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A]">
                <Plus className="h-4 w-4" />
                ახალი
              </button>
            </div>
            <div className="space-y-4 p-5">
              {vipPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between rounded-2xl border border-[#EEF2F7] bg-[#F8FAFC] px-4 py-4"
                >
                  <p className="text-[30px] font-black text-[#0F172A]">
                    {pkg.name}
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={pkg.amount}
                      onChange={(e) =>
                        setVipPackages((prev) =>
                          prev.map((item) =>
                            item.id === pkg.id
                              ? { ...item, amount: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                      className="h-11 w-24 rounded-xl border border-[#E2E8F0] bg-white px-3 text-center text-[30px] font-black text-[#0F172A]"
                    />
                    <button
                      onClick={() =>
                        setVipPackages((prev) =>
                          prev.map((item) =>
                            item.id === pkg.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                      className={`relative h-8 w-14 rounded-full transition-colors ${
                        pkg.enabled ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
                          pkg.enabled ? "left-7" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-6 py-4">
              <h2 className="text-[34px] font-black text-[#0F172A]">
                ვერიფიკაციის პაკეტები
              </h2>
              <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A]">
                <Plus className="h-4 w-4" />
                ახალი
              </button>
            </div>
            <div className="space-y-4 p-5">
              {verificationPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between rounded-2xl border border-[#EEF2F7] bg-[#F8FAFC] px-4 py-4"
                >
                  <p className="text-[30px] font-black text-[#0F172A]">
                    {pkg.name}
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={pkg.amount}
                      onChange={(e) =>
                        setVerificationPackages((prev) =>
                          prev.map((item) =>
                            item.id === pkg.id
                              ? { ...item, amount: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                      className="h-11 w-24 rounded-xl border border-[#E2E8F0] bg-white px-3 text-center text-[30px] font-black text-[#0F172A]"
                    />
                    <button
                      onClick={() =>
                        setVerificationPackages((prev) =>
                          prev.map((item) =>
                            item.id === pkg.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                      className={`relative h-8 w-14 rounded-full transition-colors ${
                        pkg.enabled ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
                          pkg.enabled ? "left-7" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
