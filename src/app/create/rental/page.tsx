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

const AMENITIES = [
  { key: "wifi", label: "Wi-Fi" },
  { key: "parking", label: "პარკინგი" },
  { key: "ski_storage", label: "სათხილამურო საცავი" },
  { key: "fireplace", label: "ბუხარი" },
  { key: "balcony", label: "აივანი" },
  { key: "pool", label: "აუზი" },
  { key: "spa", label: "სპა" },
  { key: "restaurant", label: "რესტორანი" },
];

const STEPS = ["ძირითადი ინფო", "ფოტოები და კეთილმოწყობა", "ფასი და წესები"];

export default function CreateRentalPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basic info
  const [propertyType, setPropertyType] =
    useState<Enums<"property_type">>("apartment");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [cadastralCode, setCadastralCode] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [capacity, setCapacity] = useState("");

  // Step 2: Photos & amenities
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [smoking, setSmoking] = useState(false);
  const [pets, setPets] = useState(false);
  const [checkIn, setCheckIn] = useState("14:00");
  const [checkOut, setCheckOut] = useState("12:00");

  // Step 3: Pricing
  const [pricePerNight, setPricePerNight] = useState("");
  const [minBookingDays, setMinBookingDays] = useState("1");
  const [discountPercent, setDiscountPercent] = useState("");

  function toggleAmenity(key: string) {
    setSelectedAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );
  }

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
        capacity: capacity ? Number(capacity) : null,
        photos,
        amenities: selectedAmenities,
        house_rules: { smoking, pets, check_in: checkIn, check_out: checkOut },
        price_per_night: Number(pricePerNight),
        min_booking_days: Number(minBookingDays) || 1,
        discount_percent: discountPercent ? Number(discountPercent) : 0,
        status: "pending" as Enums<"listing_status">,
        is_for_sale: false,
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
        ქირაობის განცხადება
      </h1>

      <ListingForm steps={STEPS} currentStep={step} onStepChange={setStep}>
        {step === 0 && (
          <div className="space-y-5">
            {/* Property type */}
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

            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                სათაური <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="მაგ: თანამედროვე ბინა ბაკურიანის ცენტრში"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            {/* Description */}
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

            {/* Location */}
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

            {/* Cadastral code */}
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

            {/* Numeric fields */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              <div className="space-y-2">
                <label className="text-sm font-medium">ტევადობა</label>
                <input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="0"
                  min="1"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            {/* Photos */}
            <div className="space-y-2">
              <label className="text-sm font-medium">ფოტოები</label>
              <PhotoUploader
                photos={photos}
                onPhotosChange={setPhotos}
                maxPhotos={10}
              />
            </div>

            {/* Amenities */}
            <div className="space-y-2">
              <label className="text-sm font-medium">კეთილმოწყობა</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {AMENITIES.map((am) => (
                  <button
                    key={am.key}
                    type="button"
                    onClick={() => toggleAmenity(am.key)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selectedAmenities.includes(am.key)
                        ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                        : "border-input hover:border-muted-foreground/40"
                    }`}
                  >
                    {am.label}
                  </button>
                ))}
              </div>
            </div>

            {/* House rules */}
            <div className="space-y-3">
              <label className="text-sm font-medium">სახლის წესები</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={smoking}
                    onChange={(e) => setSmoking(e.target.checked)}
                    className="rounded"
                  />
                  მოწევა ნებადართულია
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pets}
                    onChange={(e) => setPets(e.target.checked)}
                    className="rounded"
                  />
                  შინაური ცხოველები
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    შესვლა
                  </label>
                  <input
                    type="time"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    გასვლა
                  </label>
                  <input
                    type="time"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* Price */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                ფასი ღამეში (₾) <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                value={pricePerNight}
                onChange={(e) => setPricePerNight(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            {/* Min booking */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                მინიმუმ ჯავშნის დღეები
              </label>
              <input
                type="number"
                value={minBookingDays}
                onChange={(e) => setMinBookingDays(e.target.value)}
                placeholder="1"
                min="1"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            {/* Discount */}
            <div className="space-y-2">
              <label className="text-sm font-medium">ფასდაკლება (%)</label>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="0"
                min="0"
                max="100"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            {/* Preview */}
            {title && pricePerNight && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  გადახედვა
                </h3>
                <div className="space-y-1">
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">
                    {location || "ბაკურიანი"}
                  </p>
                  <p className="text-lg font-bold text-brand-accent">
                    {pricePerNight} ₾{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      / ღამე
                    </span>
                  </p>
                  {discountPercent && Number(discountPercent) > 0 && (
                    <p className="text-sm text-emerald-600">
                      -{discountPercent}% ფასდაკლება
                    </p>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={loading || !title || !pricePerNight || !location}
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
