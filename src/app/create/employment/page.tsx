"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/forms/PhoneInput";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

export default function CreateEmploymentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState("");
  const [description, setDescription] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [experience, setExperience] = useState("");
  const [schedule, setSchedule] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "employment",
        title: position.trim(),
        description: description.trim() || null,
        salary_range: salaryRange.trim() || null,
        experience_required: experience.trim() || null,
        employment_schedule: schedule.trim() || null,
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
        დასაქმების განცხადება
      </h1>

      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            პოზიცია <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="მაგ: მიმტანი, ადმინისტრატორი"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">აღწერა</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="სამუშაოს დეტალური აღწერა..."
            rows={4}
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">ანაზღაურება</label>
            <input
              type="text"
              value={salaryRange}
              onChange={(e) => setSalaryRange(e.target.value)}
              placeholder="მაგ: 1000-1500 ₾"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">გამოცდილება</label>
            <input
              type="text"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="მაგ: 1 წელი"
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">განრიგი</label>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="მაგ: ორშ-პარ, 09:00-18:00"
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
          disabled={loading || !position.trim()}
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
