"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import { useAuth } from "@/lib/hooks/useAuth";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";
import { createClient } from "@/lib/supabase/client";

const ACTIVITY_TYPES = [
  { value: "extreme", label: "ექსტრემალური" },
  { value: "sport", label: "სპორტული" },
  { value: "family", label: "ოჯახისთვის" },
  { value: "kids", label: "ბავშვებისთვის" },
  { value: "other", label: "სხვა" },
];

const ACTIVITY_CATEGORIES = [
  { value: "inventory_rent", label: "ინვენტარი" },
  { value: "horses", label: "ცხენები" },
  { value: "buggies", label: "ბურანები" },
  { value: "quad_bikes", label: "კვადროციკლები" },
  { value: "other", label: "სხვა" },
];

export default function CreateEntertainmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState("extreme");
  const [category, setCategory] = useState("buggies");
  const [zone, setZone] = useState("დიდველი");
  const [exactLocation, setExactLocation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("ადამიანი");
  const [schedule, setSchedule] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [phone, setPhone] = useState("");

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "entertainment",
        title: title.trim(),
        description: description.trim() || null,
        price: price ? Number(price) : null,
        price_unit: priceUnit || null,
        schedule: schedule.trim() || null,
        location: [zone, exactLocation.trim()].filter(Boolean).join(" • "),
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
      title="გართობა და აქტივობები"
      subtitle="ტურიზმი, ტურები და ინვენტარის გაქირავება"
      accent="blue"
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={!title.trim()}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="blue">
        <Field label="სათაური" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ექსტრემალური ტური თოვლის ბურანით"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="გართობის ტიპი" required>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className={inputClass}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="კატეგორია" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              {ACTIVITY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ზონა / ტრასა" required>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className={inputClass}
            >
              <option value="დიდველი">დიდველი</option>
              {SEARCH_LOCATION_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ზუსტი ლოკაცია">
            <div className="flex gap-2">
              <input
                type="text"
                value={exactLocation}
                onChange={(e) => setExactLocation(e.target.value)}
                placeholder="მაგ: ცენტრალური პარკის შესასვლელთან"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                className="flex size-[48px] shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                aria-label="რუკაზე არჩევა"
              >
                <MapPin className="size-5" />
              </button>
            </div>
          </Field>
        </div>

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
              <option value="ადამიანი">ადამიანი</option>
              <option value="ჯგუფი">ჯგუფი</option>
              <option value="საათი">საათი</option>
              <option value="დღე">დღე</option>
            </select>
          </Field>
        </div>

        <Field label="აღწერა">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="აქტივობის აღწერა..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>

        <Field label="განრიგი">
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ყოველდღე, 10:00-17:00"
            className={inputClass}
          />
        </Field>

        <Field label="ფოტოები">
          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={10}
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
