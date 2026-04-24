"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhoneInput from "@/components/forms/PhoneInput";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { useAuth } from "@/lib/hooks/useAuth";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";
import { createClient } from "@/lib/supabase/client";

const RESTAURANT_TYPES = [
  { value: "restaurant", label: "რესტორანი" },
  { value: "cafe", label: "კაფე / საკონდიტრო" },
  { value: "bar", label: "ბარი / პაბი" },
  { value: "fast_food", label: "სწრაფი კვება" },
  { value: "other", label: "სხვა" },
];

const CUISINE_TYPES = [
  { value: "georgian", label: "ქართული" },
  { value: "european", label: "ევროპული" },
  { value: "asian", label: "აზიური" },
  { value: "mixed", label: "შერეული" },
];

interface MenuItem {
  name: string;
  price: string;
}

export default function CreateFoodPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [restaurantType, setRestaurantType] = useState("restaurant");
  const [cuisineType, setCuisineType] = useState("");
  const [zone, setZone] = useState("");
  const [exactLocation, setExactLocation] = useState("");
  const [description, setDescription] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [hasDelivery, setHasDelivery] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([
    { name: "", price: "" },
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [phone, setPhone] = useState("");

  function addMenuItem() {
    setMenuItems([...menuItems, { name: "", price: "" }]);
  }

  function removeMenuItem(index: number) {
    setMenuItems(menuItems.filter((_, i) => i !== index));
  }

  function updateMenuItem(index: number, field: keyof MenuItem, value: string) {
    const updated = [...menuItems];
    updated[index][field] = value;
    setMenuItems(updated);
  }

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const menu = menuItems
        .filter((item) => item.name.trim())
        .map((item) => ({
          name: item.name.trim(),
          price: item.price ? Number(item.price) : null,
        }));

      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "food",
        title: title.trim(),
        description: description.trim() || null,
        cuisine_type: cuisineType || null,
        menu: menu.length > 0 ? menu : null,
        has_delivery: hasDelivery,
        operating_hours: operatingHours.trim() || null,
        location: zone || exactLocation.trim() || null,
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
      title="კვება და რესტორნები"
      accent="orange"
      footer={
        <WizardFooter
          accent="orange"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={!title.trim()}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="orange">
        <Field label="ობიექტის დასახელება" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="მაგ: რესტორანი პანორამა"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="რესტორნის ტიპი" required>
            <select
              value={restaurantType}
              onChange={(e) => setRestaurantType(e.target.value)}
              className={inputClass}
            >
              {RESTAURANT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="სამზარეულოს ტიპი">
            <select
              value={cuisineType}
              onChange={(e) => setCuisineType(e.target.value)}
              className={inputClass}
            >
              <option value="">აირჩიე ტიპი</option>
              {CUISINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ლოკაცია (ZONE)" required>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                აირჩიე ზონა
              </option>
              {SEARCH_LOCATION_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ზუსტი ლოკაცია">
            <input
              type="text"
              value={exactLocation}
              onChange={(e) => setExactLocation(e.target.value)}
              placeholder="მაგ: ცენტრალური პარკის შესასვლელთან"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="სამუშაო საათები">
          <input
            type="text"
            value={operatingHours}
            onChange={(e) => setOperatingHours(e.target.value)}
            placeholder="მაგ: 10:00-23:00"
            className={inputClass}
          />
        </Field>

        <Field label="აღწერა">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ობიექტის აღწერა..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#F97316] focus:ring-2 focus:ring-[#FFEDD5]"
          />
        </Field>

        <div className="space-y-3">
          <label className="text-[13px] font-bold text-[#334155]">მენიუ</label>
          {menuItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateMenuItem(index, "name", e.target.value)}
                placeholder="კერძის სახელი"
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                value={item.price}
                onChange={(e) => updateMenuItem(index, "price", e.target.value)}
                placeholder="₾"
                min="0"
                className={`${inputClass} w-24`}
              />
              {menuItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMenuItem(index)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addMenuItem}
            className="flex items-center gap-1 text-sm font-semibold text-[#F97316] hover:underline"
          >
            <Plus className="size-4" />
            კერძის დამატება
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-[#334155]">
          <input
            type="checkbox"
            checked={hasDelivery}
            onChange={(e) => setHasDelivery(e.target.checked)}
            className="size-4 rounded accent-[#F97316]"
          />
          მიტანის სერვისი
        </label>

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
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#F97316] focus:ring-2 focus:ring-[#FFEDD5]";

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-bold text-[#334155]">
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
      {helper && (
        <p className="text-right text-xs font-medium text-[#94A3B8]">
          {helper}
        </p>
      )}
    </div>
  );
}
