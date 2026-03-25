"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, Camera, Bell, Settings, Save } from "lucide-react";
import { useProfile } from "@/lib/hooks/useProfile";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatPhone } from "@/lib/utils/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function GuestProfilePage() {
  const { profile, loading, updateProfile } = useProfile();
  const { signOut } = useAuth();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
      });
      setEditing(false);
    } catch {
      // error handled in hook
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const initials = (profile?.display_name ?? "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">პროფილი</h1>

      {/* Avatar + name */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
      >
        <div className="relative">
          <Avatar className="size-16">
            {profile?.avatar_url && (
              <AvatarImage
                src={profile.avatar_url}
                alt={profile.display_name}
              />
            )}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <button className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-brand-accent text-white shadow-sm">
            <Camera className="size-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-foreground">
            {profile?.display_name}
          </p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Phone className="size-3.5" />
            {profile?.phone ? formatPhone(profile.phone) : "—"}
          </p>
          {profile?.is_verified && (
            <span className="mt-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              ვერიფიცირებული
            </span>
          )}
        </div>
      </motion.div>

      {/* Edit form / display info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            პირადი ინფორმაცია
          </h2>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEditing}>
              რედაქტირება
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                სახელი
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-brand-surface-border bg-white px-3 py-2 text-sm text-foreground focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                ბიო
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="მოკლედ თქვენს შესახებ..."
                className="w-full resize-none rounded-lg border border-brand-surface-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving}
                onClick={handleSave}
                className="gap-1.5"
              >
                <Save className="size-3.5" />
                {saving ? "ინახება..." : "შენახვა"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                გაუქმება
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">სახელი</p>
              <p className="text-sm font-medium text-foreground">
                {profile?.display_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ტელეფონი</p>
              <p className="text-sm font-medium text-foreground">
                {profile?.phone ? formatPhone(profile.phone) : "—"}
              </p>
            </div>
            {profile?.bio && (
              <div>
                <p className="text-xs text-muted-foreground">ბიო</p>
                <p className="text-sm text-foreground">{profile.bio}</p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Notification preferences */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell className="size-4" />
          შეტყობინებების პარამეტრები
        </h2>
        <div className="space-y-3">
          <NotificationToggle
            label="ახალი ჯავშნების შეტყობინებები"
            defaultChecked
          />
          <NotificationToggle label="Smart Match შეთავაზებები" defaultChecked />
          <NotificationToggle label="ფასის ცვლილების შეტყობინებები" />
        </div>
      </motion.div>

      {/* Account settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Settings className="size-4" />
          ანგარიშის პარამეტრები
        </h2>
        <Button variant="destructive" size="sm" onClick={() => signOut()}>
          გასვლა
        </Button>
      </motion.div>
    </div>
  );
}

function NotificationToggle({
  label,
  defaultChecked = false,
}: {
  label: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => setChecked(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-brand-accent" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </label>
  );
}
