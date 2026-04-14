"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/forms/PhoneInput";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

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
  const [description, setDescription] = useState("");
  const [cuisineType, setCuisineType] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([
    { name: "", price: "" },
  ]);
  const [hasDelivery, setHasDelivery] = useState(false);
  const [operatingHours, setOperatingHours] = useState("");
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
        cuisine_type: cuisineType.trim() || null,
        menu: menu.length > 0 ? menu : null,
        has_delivery: hasDelivery,
        operating_hours: operatingHours.trim() || null,
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
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-center text-[28px] font-black leading-8 tracking-[-0.7px] text-[#1E293B]">
        კვების განცხადება
      </h1>

      <div className="space-y-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#334155]">
            დასახელება <span className="text-[#EF4444]">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="მაგ: რესტორანი ბაკურიანი"
            className="h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#334155]">აღწერა</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="რესტორნის აღწერა..."
            rows={3}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#334155]">
            სამზარეულოს ტიპი
          </label>
          <input
            type="text"
            value={cuisineType}
            onChange={(e) => setCuisineType(e.target.value)}
            placeholder="მაგ: ქართული, ევროპული"
            className="h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>

        {/* Menu editor */}
        <div className="space-y-3">
          <label className="text-[13px] font-bold text-[#334155]">მენიუ</label>
          {menuItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateMenuItem(index, "name", e.target.value)}
                placeholder="კერძის სახელი"
                className="h-[48px] flex-1 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
              />
              <input
                type="number"
                value={item.price}
                onChange={(e) => updateMenuItem(index, "price", e.target.value)}
                placeholder="₾"
                min="0"
                className="h-[48px] w-24 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
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
            className="flex items-center gap-1 text-sm text-brand-accent hover:underline"
          >
            <Plus className="size-4" />
            კერძის დამატება
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasDelivery}
            onChange={(e) => setHasDelivery(e.target.checked)}
            className="rounded"
          />
          მიტანის სერვისი
        </label>

        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#334155]">
            სამუშაო საათები
          </label>
          <input
            type="text"
            value={operatingHours}
            onChange={(e) => setOperatingHours(e.target.value)}
            placeholder="მაგ: 10:00-23:00"
            className="h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#334155]">
            ფოტოები
          </label>
          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={5}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[13px] font-bold text-[#334155]">
            საკონტაქტო ტელეფონი
          </label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>

        {error && <p className="text-sm text-[#EF4444]">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={loading || !title.trim()}
          className="h-[48px] w-full rounded-xl bg-[#F97316] text-sm font-bold text-white shadow-[0px_8px_20px_rgba(249,115,22,0.25)] hover:bg-[#EA6C0E]"
          size="lg"
        >
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          განცხადების გამოქვეყნება
        </Button>
      </div>
    </div>
  );
}
