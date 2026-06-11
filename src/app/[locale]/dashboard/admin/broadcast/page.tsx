"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Info,
  Loader2,
  Mail,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";

type Severity = "info" | "warning" | "critical";
type Channel = "push" | "email";
type Role = Enums<"user_role">;

interface SeverityOption {
  id: Severity;
  label: string;
  helper: string;
  icon: typeof Bell;
  accent: string;
  bg: string;
  text: string;
}

const SEVERITY_OPTIONS: SeverityOption[] = [
  {
    id: "info",
    label: "ინფორმაცია",
    helper: "ჩვეულებრივი შეტყობინება — გამოჩნდება ჩამონათვალში",
    icon: Info,
    accent: "border-[#2563EB] bg-[#EFF6FF]",
    bg: "bg-[#2563EB]",
    text: "text-[#2563EB]",
  },
  {
    id: "warning",
    label: "გაფრთხილება",
    helper: "მნიშვნელოვანი — გამოყოფილია ჩამონათვალში",
    icon: Bell,
    accent: "border-[#F59E0B] bg-[#FFFBEB]",
    bg: "bg-[#F59E0B]",
    text: "text-[#B45309]",
  },
  {
    id: "critical",
    label: "კრიტიკული",
    helper:
      "გამოჩნდება მოდალური ფანჯრით შემდეგ შესვლისას — მომხმარებელმა უნდა დაადასტუროს",
    icon: AlertTriangle,
    accent: "border-[#DC2626] bg-[#FEF2F2]",
    bg: "bg-[#DC2626]",
    text: "text-[#DC2626]",
  },
];

const CHANNELS: {
  id: Channel;
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

const ROLES: { id: Role; label: string }[] = [
  { id: "guest", label: "სტუმარი" },
  { id: "renter", label: "დამქირავებელი" },
  { id: "seller", label: "გამყიდველი" },
  { id: "cleaner", label: "დამლაგებელი" },
  { id: "food", label: "კვება" },
  { id: "entertainment", label: "გართობა" },
  { id: "transport", label: "ტრანსპორტი" },
  { id: "employment", label: "დასაქმება" },
  { id: "handyman", label: "ხელოსანი" },
  { id: "admin", label: "ადმინი" },
];

const ROLE_PRESETS: { id: string; label: string; roles: Role[] }[] = [
  {
    id: "all_verified_owners",
    label: "მესაკუთრეები (renter + seller)",
    roles: ["renter", "seller"],
  },
  {
    id: "providers_only",
    label: "მომწოდებლები",
    roles: ["cleaner", "food", "entertainment", "transport", "handyman"],
  },
  {
    id: "employers_only",
    label: "დამსაქმებლები",
    roles: ["employment"],
  },
  {
    id: "guests_only",
    label: "მხოლოდ სტუმრები",
    roles: ["guest"],
  },
  {
    id: "all_non_admin",
    label: "ყველა (ადმინის გარდა)",
    roles: ROLES.filter((r) => r.id !== "admin").map((r) => r.id),
  },
];

interface UserOption {
  id: string;
  display_name: string;
  role: Role;
  phone: string | null;
}

export default function AdminBroadcastPage() {
  const supabase = useMemo(() => createClient(), []);

  const [severity, setSeverity] = useState<Severity>("info");
  const [channel, setChannel] = useState<Channel>("push");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(
    "გაუმარჯოს! ამ კვირაში VIP პაკეტზე მოქმედებს 20%-იანი ფასდაკლება. ისარგებლეთ დღესვე და გაზარდეთ თქვენი განცხადების ხილვადობა.",
  );
  const [tone, setTone] = useState("friendly-professional");
  const [audienceTab, setAudienceTab] = useState<"roles" | "users">("roles");
  const [selectedRoles, setSelectedRoles] = useState<Set<Role>>(
    new Set(["renter", "seller"]),
  );
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [includeSelf, setIncludeSelf] = useState(false);

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserOption[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countingRecipients, setCountingRecipients] = useState(false);

  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const searchDebounce = useRef<NodeJS.Timeout | null>(null);

  // Live user search (debounced).
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, role, phone")
          .or(`display_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(20);
        setUserResults((data ?? []) as UserOption[]);
      } finally {
        setSearchingUsers(false);
      }
    }, 250);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [userQuery, supabase]);

  // Live recipient count preview.
  useEffect(() => {
    const roles = Array.from(selectedRoles);
    const userIds = selectedUsers.map((u) => u.id);
    if (roles.length === 0 && userIds.length === 0) {
      setRecipientCount(0);
      return;
    }
    let cancelled = false;
    setCountingRecipients(true);
    (async () => {
      try {
        const ids = new Set<string>();
        if (roles.length > 0) {
          const { data } = await supabase
            .from("profiles")
            .select("id")
            .in("role", roles);
          for (const r of data ?? []) ids.add(r.id);
        }
        for (const id of userIds) ids.add(id);
        if (!includeSelf) {
          const { data: me } = await supabase.auth.getUser();
          if (me.user?.id) ids.delete(me.user.id);
        }
        if (!cancelled) setRecipientCount(ids.size);
      } finally {
        if (!cancelled) setCountingRecipients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRoles, selectedUsers, includeSelf, supabase]);

  const toggleRole = useCallback((role: Role) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }, []);

  const applyPreset = useCallback((roles: Role[]) => {
    setSelectedRoles(new Set(roles));
  }, []);

  const addUser = useCallback((u: UserOption) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x.id === u.id) ? prev : [...prev, u],
    );
    setUserQuery("");
    setUserResults([]);
  }, []);

  const removeUser = useCallback((id: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

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
        body: JSON.stringify({
          audience: Array.from(selectedRoles).join(","),
          tone,
          prompt: message,
          channel,
        }),
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
    if (!title.trim()) {
      toast.error("სათაური სავალდებულოა");
      return;
    }
    if (!message.trim()) {
      toast.error("ტექსტი სავალდებულოა");
      return;
    }
    const roles = Array.from(selectedRoles);
    const userIds = selectedUsers.map((u) => u.id);
    if (roles.length === 0 && userIds.length === 0) {
      toast.error("აირჩიეთ მინიმუმ ერთი როლი ან კონკრეტული მომხმარებელი");
      return;
    }
    if (severity === "critical") {
      const ok = window.confirm(
        "კრიტიკული შეტყობინება გამოჩნდება მოდალური ფანჯრით ყველა ადრესატთან შემდეგი შესვლისას. გავაგრძელოთ?",
      );
      if (!ok) return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          severity,
          channel,
          title: title.trim(),
          subject: subject.trim() || undefined,
          message: message.trim(),
          target_roles: roles,
          target_user_ids: userIds,
          include_self: includeSelf,
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

  const selectedUserIds = useMemo(
    () => new Set(selectedUsers.map((u) => u.id)),
    [selectedUsers],
  );

  return (
    <div className="flex min-h-full w-full flex-1 flex-col pb-10">
      <div className="mx-auto w-full max-w-[1000px] space-y-8">
        <header className="space-y-2">
          <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A] lg:whitespace-nowrap">
            შეტყობინებები
          </h1>
          <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
            მასობრივი დაგზავნა, კრიტიკული შეტყობინებები და AI-ს დახმარებით
            გაფორმებული ტექსტი.
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

          <div className="space-y-6">
            {/* 1. Severity */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                1. სიმძიმე
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {SEVERITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = severity === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSeverity(opt.id)}
                      className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition ${
                        active
                          ? opt.accent
                          : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <div
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                          active ? opt.bg : "bg-[#F1F5F9]"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            active ? "text-white" : "text-[#64748B]"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[13px] font-bold ${
                          active ? opt.text : "text-[#1E293B]"
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="text-[11px] font-medium leading-[15px] text-[#64748B]">
                        {opt.helper}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Audience */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                2. აუდიტორია
              </p>
              <div className="inline-flex max-w-full flex-wrap rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                <button
                  type="button"
                  onClick={() => setAudienceTab("roles")}
                  className={`h-9 min-w-0 rounded-lg px-4 text-[12px] font-bold transition ${
                    audienceTab === "roles"
                      ? "bg-white text-[#2563EB] shadow-sm"
                      : "text-[#64748B]"
                  }`}
                >
                  როლების მიხედვით
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceTab("users")}
                  className={`h-9 min-w-0 rounded-lg px-4 text-[12px] font-bold transition ${
                    audienceTab === "users"
                      ? "bg-white text-[#2563EB] shadow-sm"
                      : "text-[#64748B]"
                  }`}
                >
                  კონკრეტული მომხმარებლები
                </button>
              </div>

              {audienceTab === "roles" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {ROLE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.roles)}
                        className="inline-flex h-8 items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[11px] font-bold text-[#475569] transition hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {ROLES.map((r) => {
                      const active = selectedRoles.has(r.id);
                      return (
                        <label
                          key={r.id}
                          className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[12px] font-bold transition ${
                            active
                              ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                              : "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleRole(r.id)}
                            className="sr-only"
                          />
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border-2 ${
                              active
                                ? "border-[#2563EB] bg-[#2563EB]"
                                : "border-[#CBD5E1] bg-white"
                            }`}
                          >
                            {active ? (
                              <svg
                                viewBox="0 0 12 12"
                                className="h-2.5 w-2.5 text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path
                                  d="M2 6L5 9L10 3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </span>
                          <span className="truncate">{r.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="ძიება სახელით ან ტელეფონით..."
                      className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 text-[13px] font-medium text-[#1E293B] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                    />
                    {searchingUsers ? (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#94A3B8]" />
                    ) : null}
                  </div>
                  {userResults.length > 0 ? (
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-2">
                      {userResults.map((u) => {
                        const alreadyAdded = selectedUserIds.has(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => addUser(u)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-[#F8FAFC] disabled:opacity-50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-bold text-[#1E293B]">
                                {u.display_name}
                              </p>
                              <p className="text-[11px] font-medium text-[#64748B]">
                                {u.phone ?? "—"} ·{" "}
                                {ROLES.find((r) => r.id === u.role)?.label ??
                                  u.role}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold text-[#2563EB]">
                              {alreadyAdded ? "✓" : "+ დამატება"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {selectedUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-[#2563EB]/30 bg-[#EFF6FF] pl-3 pr-1 text-[12px] font-bold text-[#2563EB]"
                        >
                          <span className="min-w-0 truncate">
                            {u.display_name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeUser(u.id)}
                            aria-label="წაშლა"
                            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[#2563EB]/10"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] font-medium text-[#94A3B8]">
                      მოძებნეთ და დაამატეთ კონკრეტული მომხმარებლები
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#2563EB]">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold text-[#1E293B]">
                      ეს გავა{" "}
                      {countingRecipients ? "..." : (recipientCount ?? 0)}{" "}
                      მომხმარებელზე
                    </p>
                    <p className="text-[11px] font-medium text-[#64748B]">
                      როლები + კონკრეტული მომხმარებლები (გადახურვები
                      ჩამოშორებულია)
                    </p>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-bold text-[#475569]">
                  <input
                    type="checkbox"
                    checked={includeSelf}
                    onChange={(e) => setIncludeSelf(e.target.checked)}
                    className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB]"
                  />
                  ჩემზეც გავაგზავნო (ტესტი)
                </label>
              </div>
            </div>

            {/* 3. Channel */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                3. საკომუნიკაციო არხი
              </p>
              <div className="space-y-3">
                {CHANNELS.map((option) => {
                  const Icon = option.icon;
                  const checked = channel === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex min-h-[60px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 sm:py-0 transition ${
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

            {/* 4. Title */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                4. სათაური
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="მაგ: VIP ფასდაკლება"
                className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[13px] font-medium text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
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

            {/* 5. Tone */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                5. ტონალობა (AI draft-ისთვის)
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

            {/* 6. Message */}
            <div className="space-y-2">
              <label
                htmlFor="broadcast-message"
                className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]"
              >
                6. ტექსტი
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
                className={`inline-flex h-[53px] min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-50 ${
                  severity === "critical"
                    ? "bg-[#DC2626] shadow-[0px_8px_20px_rgba(220,38,38,0.25)]"
                    : severity === "warning"
                      ? "bg-[#F59E0B] shadow-[0px_8px_20px_rgba(245,158,11,0.25)]"
                      : "bg-[#2563EB] shadow-[0px_8px_20px_rgba(37,99,235,0.25)]"
                }`}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {severity === "critical"
                  ? "კრიტიკულის გაშვება"
                  : "დაგზავნის გაშვება"}
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
