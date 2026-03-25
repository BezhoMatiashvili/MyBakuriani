"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  User,
  Phone,
  FileText,
  Shield,
  CheckCircle2,
  Clock,
  XCircle,
  Camera,
  Save,
  CreditCard,
  Settings,
} from "lucide-react";
import Image from "next/image";
import { useProfile } from "@/lib/hooks/useProfile";
import { useBalance } from "@/lib/hooks/useBalance";
import { formatPrice, formatPhone } from "@/lib/utils/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function RenterProfilePage() {
  const { profile, loading, updateProfile } = useProfile();
  const { balance } = useBalance();
  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "profile" | "subscription" | "settings"
  >("profile");

  // Initialize form when profile loads
  if (profile && !displayName && !editMode) {
    setDisplayName(profile.display_name);
    setBio(profile.bio ?? "");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName,
        bio: bio || null,
      });
      setEditMode(false);
    } catch {
      // error handled by hook
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "profile" as const, label: "პროფილი", icon: User },
    { id: "subscription" as const, label: "გამოწერა", icon: CreditCard },
    { id: "settings" as const, label: "პარამეტრები", icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">პროფილი</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მართეთ თქვენი პროფილის ინფორმაცია
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-brand-surface-border bg-brand-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-brand-accent text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === "profile" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 rounded-[var(--radius-card)]" />
              <Skeleton className="h-48 rounded-[var(--radius-card)]" />
            </div>
          ) : (
            <>
              {/* Avatar + name card */}
              <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="h-20 w-20 overflow-hidden rounded-full bg-muted">
                      {profile?.avatar_url ? (
                        <Image
                          src={profile.avatar_url}
                          alt={profile.display_name}
                          width={80}
                          height={80}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                          {profile?.display_name?.charAt(0) ?? "?"}
                        </div>
                      )}
                    </div>
                    <button className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-white shadow-md">
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-foreground">
                      {profile?.display_name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {profile?.phone ? formatPhone(profile.phone) : ""}
                    </p>
                    <div className="mt-1">
                      {profile?.is_verified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          ვერიფიცირებული
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-warning">
                          <Clock className="h-3.5 w-3.5" />
                          ვერიფიკაცია მოლოდინში
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="rounded-lg border border-brand-surface-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {editMode ? "გაუქმება" : "რედაქტირება"}
                  </button>
                </div>
              </div>

              {/* Edit form or info display */}
              <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]">
                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        სახელი
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full rounded-lg border border-brand-surface-border bg-white px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-brand-accent focus:ring-1 focus:ring-brand-accent"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        ბიო
                      </label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-brand-surface-border bg-white px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-brand-accent focus:ring-1 focus:ring-brand-accent"
                        placeholder="მოკლედ თქვენს შესახებ..."
                      />
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent-hover disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? "შენახვა..." : "შენახვა"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">სახელი</p>
                        <p className="text-sm font-medium text-foreground">
                          {profile?.display_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          ტელეფონი
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {profile?.phone ? formatPhone(profile.phone) : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">ბიო</p>
                        <p className="text-sm text-foreground">
                          {profile?.bio ?? "არ არის მითითებული"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          ვერიფიკაცია
                        </p>
                        {profile?.is_verified ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-success">
                            <CheckCircle2 className="h-4 w-4" />
                            ვერიფიცირებული
                          </span>
                        ) : (
                          <button className="text-sm font-medium text-brand-accent hover:text-brand-accent-hover">
                            ვერიფიკაციის გავლა
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Subscription tab */}
      {activeTab === "subscription" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Current plan */}
          <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]">
            <h3 className="text-sm font-bold text-foreground">
              მიმდინარე გეგმა
            </h3>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-foreground">
                  {balance && balance.amount > 50 ? "პრემიუმ" : "უფასო"}
                </p>
                <p className="text-xs text-muted-foreground">
                  ბალანსი: {formatPrice(balance?.amount ?? 0)}
                </p>
              </div>
              <button className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-hover">
                განახლება
              </button>
            </div>
          </div>

          {/* Plan options */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border-2 border-brand-surface-border bg-brand-surface p-5 shadow-[var(--shadow-card)]">
              <h4 className="text-sm font-bold text-foreground">სტანდარტი</h4>
              <p className="mt-1 text-2xl font-bold text-foreground">უფასო</p>
              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />3
                  განცხადება
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />
                  ძირითადი სტატისტიკა
                </li>
                <li className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                  Smart Match
                </li>
              </ul>
            </div>

            <div className="rounded-[var(--radius-card)] border-2 border-brand-accent bg-brand-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground">პრემიუმ</h4>
                <span className="rounded-full bg-brand-accent-light px-2 py-0.5 text-xs font-medium text-brand-accent">
                  რეკომენდებული
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">
                29 ₾
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / თვე
                </span>
              </p>
              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />
                  შეუზღუდავი განცხადებები
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />
                  დეტალური სტატისტიკა
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />
                  Smart Match
                </li>
              </ul>
              <button className="mt-4 w-full rounded-lg bg-brand-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-accent-hover">
                გააქტიურება
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Settings tab */}
      {activeTab === "settings" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]"
        >
          <h3 className="text-sm font-bold text-foreground">შეტყობინებები</h3>
          <div className="mt-4 space-y-3">
            {[
              {
                label: "ახალი ჯავშნები",
                description: "შეტყობინება ახალი ჯავშნის შესახებ",
              },
              {
                label: "Smart Match",
                description: "ახალი Smart Match მოთხოვნები",
              },
              {
                label: "შეტყობინებები",
                description: "ახალი SMS შეტყობინებები",
              },
              { label: "მარკეტინგი", description: "აქციები და სიახლეები" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-brand-surface-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                <button className="h-6 w-10 rounded-full bg-brand-accent p-0.5 transition-colors">
                  <span className="block h-5 w-5 translate-x-4 rounded-full bg-white shadow-sm transition-transform" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
