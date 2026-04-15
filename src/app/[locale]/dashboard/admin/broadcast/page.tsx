"use client";

import { useState } from "react";
import { Bell, Loader2, Mail, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

const AUDIENCE_OPTIONS = [
  { value: "all_verified_owners", label: "ყველა ვერიფიცირებული მესაკუთრე" },
  { value: "providers_only", label: "მხოლოდ მომწოდებლები" },
  { value: "employers_only", label: "მხოლოდ დამსაქმებლები" },
  { value: "guests_only", label: "მხოლოდ სტუმრები/მომხმარებლები" },
  { value: "hostels", label: "მხოლოდ ჰოსტელები" },
];

const CHANNELS: {
  id: "push" | "email";
  label: string;
  helper: string;
  icon: typeof Bell;
}[] = [
  {
    id: "push",
    label: "ვებ-შეტყობინება (უფასო)",
    helper: "სწრაფი და ჩართულობის მაღალი მაჩვენებელი",
    icon: Bell,
  },
  {
    id: "email",
    label: "ელ. ფოსტის დაგზავნა (უფასო)",
    helper: "გაფართოებული კონტენტი ბმულებით",
    icon: Mail,
  },
];

export default function AdminBroadcastPage() {
  const [audience, setAudience] = useState(AUDIENCE_OPTIONS[0].value);
  const [channel, setChannel] = useState<"push" | "email">("push");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(
    "გაუმარჯოს! ამ კვირაში VIP პაკეტზე მოქმედებს 20%-იანი ფასდაკლება. ისარგებლეთ დღესვე და გაზარდეთ თქვენი განცხადების ხილვადობა.",
  );
  const [tone, setTone] = useState("friendly-professional");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  async function aiDraft() {
    if (!message.trim()) {
      toast.error("დაწერეთ მოკლე მოთხოვნა AI-სთვის");
      return;
    }
    setDrafting(true);
    try {
      const res = await fetch("/api/admin/broadcasts/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audience, tone, prompt: message, channel }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "AI draft failed");
      if (payload.subject) setSubject(payload.subject);
      if (payload.body) setMessage(payload.body);
      toast.success("AI ვარიანტი მზადაა");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!message.trim()) {
      toast.error("ტექსტი სავალდებულოა");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audience,
          channel,
          subject: subject || undefined,
          message,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "დაგზავნა ვერ მოხერხდა");
      toast.success(
        `დაგზავნილია ${payload.broadcast?.recipient_count ?? 0} მომხმარებელზე`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-full w-full flex-1 flex-col pb-10">
      <div className="mx-auto w-full max-w-[1000px] space-y-8">
        <header className="space-y-2">
          <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A] lg:whitespace-nowrap">
            მასობრივი კომუნიკაცია
          </h1>
          <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
            მარკეტინგული კამპანიები და AI-ს დახმარებით გაფორმებული
            შეტყობინებები.
          </p>
        </header>

        <article className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] lg:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-[#2563EB]" />
              <h2 className="text-[18px] font-black leading-7 text-[#1E293B]">
                ერთჯერადი დაგზავნა
              </h2>
            </div>
            <button
              type="button"
              onClick={aiDraft}
              disabled={drafting}
              className="inline-flex h-[36px] min-h-[36px] items-center gap-1.5 rounded-lg border border-[#F3E8FF] bg-[#FAF5FF] px-3 text-[11px] font-bold text-[#8B5CF6] disabled:opacity-50"
            >
              {drafting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              AI დახმარება
            </button>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="recipient-category"
                className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]"
              >
                1. აუდიტორია
              </label>
              <select
                id="recipient-category"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="h-[51px] w-full rounded-xl border border-[#2563EB] bg-white px-4 text-[13px] font-bold text-[#1E293B] shadow-[0_0_0_4px_rgba(37,99,235,0.1)] outline-none"
              >
                {AUDIENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                2. საკომუნიკაციო არხი
              </p>
              <div className="space-y-3">
                {CHANNELS.map((option) => {
                  const Icon = option.icon;
                  const checked = channel === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex h-[60px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 transition ${
                        checked
                          ? "border-[#2563EB] bg-[#EFF6FF]"
                          : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="channel"
                        checked={checked}
                        onChange={() => setChannel(option.id)}
                        className="sr-only"
                      />
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[#CBD5E1] bg-white">
                        {checked ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                        ) : null}
                      </span>
                      <Icon
                        className={`h-4 w-4 ${
                          checked ? "text-[#EAB308]" : "text-[#94A3B8]"
                        }`}
                      />
                      <div className="flex flex-col">
                        <span
                          className={`text-[13px] leading-5 ${
                            checked
                              ? "font-bold text-[#2563EB]"
                              : "font-medium text-[#334155]"
                          }`}
                        >
                          {option.label}
                        </span>
                        <span className="text-[11px] font-medium text-[#64748B]">
                          {option.helper}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {channel === "email" ? (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                  Subject (email)
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="მაგ: ახალი წლის ფასდაკლება"
                  className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[13px] font-medium text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                3. ტონალობა (AI draft-ისთვის)
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="h-[44px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-medium text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB]"
              >
                <option value="friendly-professional">
                  მეგობრული-პროფესიონალური
                </option>
                <option value="urgent">სასწრაფო</option>
                <option value="promotional">ფასდაკლების</option>
                <option value="informational">ინფორმაციული</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="broadcast-message"
                className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]"
              >
                4. ტექსტი
              </label>
              <textarea
                id="broadcast-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[140px] w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[13px] font-medium leading-5 text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="inline-flex h-[53px] min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white shadow-[0px_8px_20px_rgba(37,99,235,0.25)] disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                დაგზავნის გაშვება
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
