"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/forms/PhoneInput";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

export default function CreateTransportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [driverName, setDriverName] = useState("");
  const [route, setRoute] = useState("");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("მგზავრი");
  const [schedule, setSchedule] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "transport",
        title: title.trim(),
        description: description.trim() || null,
        driver_name: driverName.trim() || null,
        route: route.trim() || null,
        vehicle_capacity: vehicleCapacity ? Number(vehicleCapacity) : null,
        price: price ? Number(price) : null,
        price_unit: priceUnit || null,
        schedule: schedule.trim() || null,
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
        ტრანსპორტის განცხადება
      </h1>

      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            სათაური <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="მაგ: ტრანსფერი თბილისი-ბაკურიანი"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">აღწერა</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="სერვისის აღწერა..."
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">მძღოლის სახელი</label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="სახელი გვარი"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ავტომობილის ტევადობა</label>
            <input
              type="number"
              value={vehicleCapacity}
              onChange={(e) => setVehicleCapacity(e.target.value)}
              placeholder="მაგ: 4"
              min="1"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">მარშრუტი</label>
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="მაგ: თბილისი → ბაკურიანი"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
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
              <option value="მგზავრი">მგზავრი</option>
              <option value="მანქანა">მანქანა</option>
              <option value="მარშრუტი">მარშრუტი</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">განრიგი</label>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ყოველდღე, 08:00-20:00"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
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
