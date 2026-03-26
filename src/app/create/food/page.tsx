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
      <h1 className="mb-8 text-center text-2xl font-bold">კვების განცხადება</h1>

      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            დასახელება <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="მაგ: რესტორანი ბაკურიანი"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">აღწერა</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="რესტორნის აღწერა..."
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">სამზარეულოს ტიპი</label>
          <input
            type="text"
            value={cuisineType}
            onChange={(e) => setCuisineType(e.target.value)}
            placeholder="მაგ: ქართული, ევროპული"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        {/* Menu editor */}
        <div className="space-y-3">
          <label className="text-sm font-medium">მენიუ</label>
          {menuItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateMenuItem(index, "name", e.target.value)}
                placeholder="კერძის სახელი"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
              <input
                type="number"
                value={item.price}
                onChange={(e) => updateMenuItem(index, "price", e.target.value)}
                placeholder="₾"
                min="0"
                className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
              {menuItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMenuItem(index)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
          <label className="text-sm font-medium">სამუშაო საათები</label>
          <input
            type="text"
            value={operatingHours}
            onChange={(e) => setOperatingHours(e.target.value)}
            placeholder="მაგ: 10:00-23:00"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">ფოტოები</label>
          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={5}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">საკონტაქტო ტელეფონი</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={loading || !title.trim()}
          className="w-full"
          size="lg"
        >
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          განცხადების გამოქვეყნება
        </Button>
      </div>
    </div>
  );
}
