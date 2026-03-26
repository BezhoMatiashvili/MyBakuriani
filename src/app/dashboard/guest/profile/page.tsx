"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { User, Phone, Save, Camera, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

export default function GuestProfilePage() {
  const { user, signOut } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!user) return;

    async function fetchProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name);
        setBio(data.bio ?? "");
      }
      setLoading(false);
    }

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSuccessMsg("");

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        bio: bio || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (!error) {
      setSuccessMsg("პროფილი წარმატებით განახლდა");
      setTimeout(() => setSuccessMsg(""), 3000);
    }
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, displayName, bio]);

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!user || !e.target.files?.[0]) return;

      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `avatars/${user.id}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("property-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) return;

      const {
        data: { publicUrl },
      } = supabase.storage.from("property-photos").getPublicUrl(filePath);

      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
      </div>
    );
  }

  const initials =
    profile?.display_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2) ?? "U";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-foreground">პროფილი</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მართეთ თქვენი პირადი ინფორმაცია
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]"
      >
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative">
            <Avatar className="h-20 w-20">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={displayName} />
              )}
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-accent text-white shadow-md transition-transform hover:scale-110"
            >
              <Camera className="h-4 w-4" />
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </label>
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              {profile?.display_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {profile?.is_verified ? "ვერიფიცირებული" : "არა ვერიფიცირებული"}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              სახელი
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
                placeholder="თქვენი სახელი"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              ტელეფონი
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="tel"
                value={profile?.phone ?? ""}
                disabled
                className="w-full rounded-lg border border-border bg-muted py-2.5 pl-10 pr-4 text-sm text-muted-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ტელეფონის ნომრის შეცვლა შეუძლებელია
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              ბიო
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
              placeholder="მოკლე აღწერა თქვენს შესახებ..."
            />
          </div>

          {successMsg && (
            <p className="text-sm font-medium text-brand-success">
              {successMsg}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "ინახება..." : "შენახვა"}
            </Button>
            <Button variant="destructive" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              გასვლა
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
