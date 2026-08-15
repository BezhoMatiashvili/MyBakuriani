"use client";

import { useRef, useState } from "react";
import { Upload, ImageIcon, Loader2, X } from "lucide-react";
import { createUploadClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Single-image uploader for company branding (logo / cover). Unlike PhotoUploader
// it does NOT watermark — logos/covers must stay clean — and writes to the public
// `logos` bucket (authenticated upload, public read). Returns the public URL.
const BUCKET = "logos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface SingleImageUploaderProps {
  value: string | null;
  onChange: (url: string | null) => void;
  userId: string;
  label: string;
  hint?: string;
  variant?: "logo" | "cover";
  accent?: "green" | "blue";
}

export default function SingleImageUploader({
  value,
  onChange,
  userId,
  label,
  hint,
  variant = "logo",
  accent = "green",
}: SingleImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("ნებადართულია მხოლოდ JPG, PNG ან WebP სურათი");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("მაქსიმალური ზომა: 5MB");
      return;
    }
    setUploading(true);
    try {
      const client = createUploadClient();
      const ext =
        (file.name.split(".").pop() || "png")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "") || "png";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await client.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = client.storage.from(BUCKET).getPublicUrl(path);
      onChange(data?.publicUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ატვირთვა ვერ მოხერხდა");
    } finally {
      setUploading(false);
    }
  }

  const hoverRing =
    accent === "green" ? "hover:border-[#16A34A]" : "hover:border-[#2563EB]";
  const Icon = variant === "logo" ? Upload : ImageIcon;
  const previewHeight = variant === "cover" ? "h-[140px]" : "h-[180px]";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#E2E8F0]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className={cn("w-full bg-[#F8FAFC] object-contain", previewHeight)}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#64748B] shadow transition-colors hover:text-[#EF4444]"
            aria-label="Remove"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] py-10 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            hoverRing,
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" />
            ) : (
              <Icon className="h-5 w-5 text-[#64748B]" />
            )}
          </span>
          <span className="text-[14px] font-bold text-[#334155]">{label}</span>
          {hint && (
            <span className="text-[11px] font-medium text-[#94A3B8]">
              {hint}
            </span>
          )}
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-[#EF4444]">{error}</p>}
    </div>
  );
}
