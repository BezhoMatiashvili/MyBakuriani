"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ListingForm from "@/components/forms/ListingForm";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";

const PROPERTY_TYPES: { value: Enums<"property_type">; label: string }[] = [
  { value: "apartment", label: "ბინა" },
  { value: "cottage", label: "კოტეჯი" },
  { value: "hotel", label: "სასტუმრო" },
  { value: "studio", label: "სტუდიო" },
  { value: "villa", label: "ვილა" },
];

const CONSTRUCTION_STATUSES = [
  { value: "completed", label: "დასრულებული" },
  { value: "under_construction", label: "მშენებარე" },
  { value: "planned", label: "დაგეგმილი" },
];

const STEPS = ["ძირითადი ინფო", "ფოტოები", "ფასი და დეტალები"];

export default function CreateSalePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [propertyType, setPropertyType] =
    useState<Enums<"property_type">>("apartment");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [cadastralCode, setCadastralCode] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");

  // Step 2
  const [photos, setPhotos] = useState<string[]>([]);

  // Step 3
  const [salePrice, setSalePrice] = useState("");
  const [roiPercent, setRoiPercent] = useState("");
  const [constructionStatus, setConstructionStatus] = useState("completed");
  const [developer, setDeveloper] = useState("");

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("properties").insert({
        owner_id: user.id,
        type: propertyType,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim(),
        cadastral_code: cadastralCode.trim() || null,
        area_sqm: areaSqm ? Number(areaSqm) : null,
        rooms: rooms ? Number(rooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        photos,
        sale_price: Number(salePrice),
        roi_percent: roiPercent ? Number(roiPercent) : null,
        construction_status: constructionStatus,
        developer: developer.trim() || null,
        status: "pending" as Enums<"listing_status">,
        is_for_sale: true,
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
        გაყიდვის განცხადება
      </h1>

      <ListingForm steps={STEPS} currentStep={step} onStepChange={setStep}>
        {step === 0 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">ქონების ტიპი</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {PROPERTY_TYPES.map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => setPropertyType(pt.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      propertyType === pt.value
                        ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                        : "border-input hover:border-muted-foreground/40"
                    }`}
                  >
                    {pt.label}
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
                placeholder="მაგ: ახალაშენებული ბინა ბაკურიანში"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">აღწერა</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="დეტალური აღწერა..."
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                მდებარეობა <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="მაგ: ბაკურიანი, დიდველის მიმართულება"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">საკადასტრო კოდი</label>
              <input
                type="text"
                value={cadastralCode}
                onChange={(e) => setCadastralCode(e.target.value)}
                placeholder="XX.XX.XX.XXX.XXX"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">ფართი (მ²)</label>
                <input
                  type="number"
                  value={areaSqm}
                  onChange={(e) => setAreaSqm(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ოთახები</label>
                <input
                  type="number"
                  value={rooms}
                  onChange={(e) => setRooms(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">სააბაზანო</label>
                <input
                  type="number"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label className="text-sm font-medium">ფოტოები</label>
            <PhotoUploader
              photos={photos}
              onPhotosChange={setPhotos}
              maxPhotos={10}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                გასაყიდი ფასი (₾) <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">ROI (%)</label>
              <input
                type="number"
                value={roiPercent}
                onChange={(e) => setRoiPercent(e.target.value)}
                placeholder="მაგ: 12"
                min="0"
                max="100"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">მშენებლობის სტატუსი</label>
              <div className="grid grid-cols-3 gap-2">
                {CONSTRUCTION_STATUSES.map((cs) => (
                  <button
                    key={cs.value}
                    type="button"
                    onClick={() => setConstructionStatus(cs.value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      constructionStatus === cs.value
                        ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                        : "border-input hover:border-muted-foreground/40"
                    }`}
                  >
                    {cs.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">დეველოპერი</label>
              <input
                type="text"
                value={developer}
                onChange={(e) => setDeveloper(e.target.value)}
                placeholder="კომპანიის სახელი"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={loading || !title || !salePrice || !location}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              განცხადების გამოქვეყნება
            </Button>
          </div>
        )}
      </ListingForm>
    </div>
  );
}
