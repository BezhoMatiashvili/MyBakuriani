"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/forms/PhoneInput";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

const SERVICE_CATEGORIES = [
  { value: "cleaning", label: "დალაგება" },
  { value: "handyman", label: "ხელოსანი" },
];

export default function CreateServicePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("cleaning");
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
      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: category as "cleaning" | "handyman",
        title: title.trim(),
        description: description.trim() || null,
        price: price ? Number(price) : null,
        price_unit: priceUnit || null,
        schedule: schedule.trim() || null,
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
      <h1 className="mb-8 text-center text-2xl font-bold">
        სერვისის განცხადება
      </h1>

      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">კატეგორია</label>
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_CATEGORIES.map((sc) => (
              <button
                key={sc.value}
                type="button"
                onClick={() => setCategory(sc.value)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  category === sc.value
                    ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                    : "border-input hover:border-muted-foreground/40"
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            სათაური <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="მაგ: პროფესიონალური დალაგება"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">აღწერა</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="სერვისის დეტალური აღწერა..."
            rows={4}
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">ფასი (₾)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ერთეული</label>
            <select
              value={priceUnit}
              onChange={(e) => setPriceUnit(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="საათი">საათი</option>
              <option value="დღე">დღე</option>
              <option value="პროექტი">პროექტი</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">განრიგი</label>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ყოველდღე, 09:00-18:00"
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
