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
import { createClient } from "@/lib/supabase/client";

const VEHICLE_MAKES = [
  "Toyota",
  "Mercedes-Benz",
  "Ford",
  "Mitsubishi",
  "Honda",
  "Volkswagen",
  "სხვა",
];

const TRANSPORT_TYPES = [
  { value: "minivan", label: "მინივენი" },
  { value: "sedan", label: "სედანი" },
  { value: "suv", label: "SUV" },
  { value: "bus", label: "ავტობუსი" },
  { value: "other", label: "სხვა" },
];

export default function CreateTransportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [driverName, setDriverName] = useState("");
  const [vehicleMake, setVehicleMake] = useState("Mercedes-Benz");
  const [transportType, setTransportType] = useState("minivan");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [route, setRoute] = useState("");
  const [description, setDescription] = useState("");
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
        title: driverName.trim() || "ტრანსფერი",
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
    <WizardShell
      title="ტრანსპორტი და ტრანსფერები"
      accent="blue"
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={!driverName.trim()}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="მძღოლის სახელი" required>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="გოგა მ."
              className={inputClass}
            />
          </Field>
          <Field label="მანქანის მარკა" required>
            <select
              value={vehicleMake}
              onChange={(e) => setVehicleMake(e.target.value)}
              className={inputClass}
            >
              {VEHICLE_MAKES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ტრანსპორტის ტიპი" required>
            <select
              value={transportType}
              onChange={(e) => setTransportType(e.target.value)}
              className={inputClass}
            >
              {TRANSPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="რამდენ ადგილიანია მანქანა" required>
            <input
              type="number"
              value={vehicleCapacity}
              onChange={(e) => setVehicleCapacity(e.target.value)}
              placeholder="8"
              min="1"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="მარშრუტი">
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="მაგ: თბილისი → ბაკურიანი"
            className={inputClass}
          />
        </Field>

        <Field label="აღწერა">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="სერვისის აღწერა..."
            rows={3}
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
              <option value="მგზავრი">მგზავრი</option>
              <option value="მანქანა">მანქანა</option>
              <option value="მარშრუტი">მარშრუტი</option>
            </select>
          </Field>
        </div>

        <Field label="განრიგი">
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ყოველდღე, 08:00-20:00"
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
