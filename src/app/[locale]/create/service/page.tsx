"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhoneInput from "@/components/forms/PhoneInput";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

const SERVICE_SPHERES = [
  { value: "cleaning", label: "დასუფთავება / დამლაგებელი" },
  { value: "plumbing", label: "სანტექნიკა / გათბობის ქვები" },
  { value: "electrical", label: "ელექტრობა" },
  { value: "locksmith", label: "საკეტები" },
  { value: "appliance_repair", label: "ტექნიკის შეკეთება" },
  { value: "handyman", label: "ხელოსანი" },
  { value: "other", label: "სხვა" },
];

export default function CreateServicePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [sphere, setSphere] = useState("cleaning");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("საათი");
  const [schedule, setSchedule] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [phone, setPhone] = useState("");

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const categoryValue: "cleaning" | "handyman" =
        sphere === "cleaning" ? "cleaning" : "handyman";

      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: categoryValue,
        title: name.trim(),
        description: description.trim() || null,
        price: price ? Number(price) : null,
        price_unit: priceUnit || null,
        schedule: schedule.trim() || null,
        experience_required: experienceYears ? `${experienceYears} წელი` : null,
        photos,
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
      title="სერვისები და ხელოსნები"
      accent="blue"
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={!name.trim()}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard number={1} title="სფერო და პროფილი" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="სახელი / კომპანია" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ნინო"
              className={inputClass}
            />
          </Field>
          <Field label="გამოცდილება" required>
            <input
              type="text"
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              placeholder="8 წელი"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="მომსახურების სფერო" required>
          <select
            value={sphere}
            onChange={(e) => setSphere(e.target.value)}
            className={inputClass}
          >
            {SERVICE_SPHERES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="აღწერა">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="სერვისის დეტალური აღწერა..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ფასი (₾)">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
              className={inputClass}
            />
          </Field>
          <Field label="ერთეული">
            <select
              value={priceUnit}
              onChange={(e) => setPriceUnit(e.target.value)}
              className={inputClass}
            >
              <option value="საათი">საათი</option>
              <option value="დღე">დღე</option>
              <option value="პროექტი">პროექტი</option>
            </select>
          </Field>
        </div>

        <Field label="განრიგი">
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ყოველდღე, 09:00-18:00"
            className={inputClass}
          />
        </Field>

        <Field label="ფოტოები">
          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={5}
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
