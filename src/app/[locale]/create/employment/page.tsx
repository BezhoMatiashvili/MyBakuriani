"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhoneInput from "@/components/forms/PhoneInput";
import { useAuth } from "@/lib/hooks/useAuth";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";
import { createClient } from "@/lib/supabase/client";

export default function CreateEmploymentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("ცენტრი");
  const [position, setPosition] = useState("");
  const [description, setDescription] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [experience, setExperience] = useState("");
  const [schedule, setSchedule] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "employment",
        title: title.trim() || position.trim(),
        description: description.trim() || null,
        position: position.trim() || null,
        location: location || null,
        salary_range: salaryRange.trim() || null,
        experience_required: experience.trim() || null,
        employment_schedule: schedule.trim() || null,
        phone: phone ? `+995${phone}` : null,
        status: "pending",
      });

      if (insertError) throw insertError;
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <WizardShell
      title="დასაქმება ბაკურიანში"
      accent="blue"
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={!title.trim() && !position.trim()}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="დამსაქმებელი / ობიექტი" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="რესტორანი 'პანორამა'"
              className={inputClass}
            />
          </Field>
          <Field label="ლოკაცია" required>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            >
              <option value="ცენტრი">ცენტრი</option>
              {SEARCH_LOCATION_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="პოზიცია" required>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="მიმტანი / ბარმენი"
            className={inputClass}
          />
        </Field>

        <Field label="აღწერა">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="სამუშაოს დეტალური აღწერა..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ანაზღაურება">
            <input
              type="text"
              value={salaryRange}
              onChange={(e) => setSalaryRange(e.target.value)}
              placeholder="მაგ: 1000-1500 ₾"
              className={inputClass}
            />
          </Field>
          <Field label="გამოცდილება">
            <input
              type="text"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="მაგ: 1 წელი"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="განრიგი">
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ორშ-პარ, 09:00-18:00"
            className={inputClass}
          />
        </Field>

        <Field label="საკონტაქტო ტელეფონი">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
      </WizardInnerCard>
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-bold text-[#334155]">
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}
