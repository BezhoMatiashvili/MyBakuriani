"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export type MediaValue = { url: string; type: "image" | "video" } | null;

const ACCEPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
];
const ACCEPT_ATTR = ACCEPT_TYPES.join(",");
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const IMAGE_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;

type Props = {
  value: MediaValue;
  onChange: (v: MediaValue) => void;
  kind: "banner" | "blog";
  label?: string;
  helper?: string;
  poster?: string | null;
  onPosterChange?: (url: string | null) => void;
};

export default function MediaUploader({
  value,
  onChange,
  kind,
  label,
  helper,
  poster,
  onPosterChange,
}: Props) {
  const t = useTranslations("MediaUploader");
  const displayLabel = label ?? t("defaultLabel");
  const displayHelper = helper ?? t("defaultHelper");
  const mainInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [posterUploading, setPosterUploading] = useState(false);

  async function uploadFile(
    file: File,
    opts: { posterOnly?: boolean },
  ): Promise<{ url: string; type: "image" | "video" } | null> {
    if (!ACCEPT_TYPES.includes(file.type)) {
      toast.error(t("invalidFileType", { type: file.type }));
      return null;
    }
    const isImage = IMAGE_TYPES.has(file.type);
    const isVideo = VIDEO_TYPES.has(file.type);

    if (opts.posterOnly && !isImage) {
      toast.error(t("posterMustBeImage"));
      return null;
    }

    const cap = isImage ? IMAGE_MAX : VIDEO_MAX;
    if (file.size > cap) {
      const mb = (cap / 1024 / 1024).toFixed(0);
      toast.error(t("fileTooLarge", { mb }));
      return null;
    }

    try {
      const signRes = await fetch("/api/admin/media/sign-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          kind,
        }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) {
        if (signed?.code === "file_too_large") {
          throw new Error(t("fileTooLarge", { mb: signed.maxMb }));
        }
        throw new Error(signed.error ?? t("uploadFailed"));
      }

      const putRes = await fetch(signed.signedUrl as string, {
        method: "PUT",
        headers: {
          "content-type": file.type,
          "x-upsert": "true",
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(t("fileUploadFailed"));
      }

      return {
        url: signed.publicUrl as string,
        type: isVideo ? "video" : "image",
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
      return null;
    }
  }

  async function onMain(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const next = await uploadFile(file, {});
    setUploading(false);
    if (next) onChange(next);
  }

  async function onPoster(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onPosterChange) return;
    setPosterUploading(true);
    const next = await uploadFile(file, { posterOnly: true });
    setPosterUploading(false);
    if (next) onPosterChange(next.url);
  }

  function clearMain() {
    onChange(null);
    if (onPosterChange) onPosterChange(null);
  }

  function clearPoster() {
    if (onPosterChange) onPosterChange(null);
  }

  return (
    <div className="space-y-2">
      <label className="block pl-1 text-xs font-bold leading-[18px] text-[#334155]">
        {displayLabel}
      </label>

      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
          {value.type === "video" ? (
            <video
              src={value.url}
              poster={poster ?? undefined}
              controls
              muted
              playsInline
              className="block max-h-[260px] w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.url}
              alt=""
              className="block max-h-[260px] w-full object-cover"
            />
          )}
          <button
            type="button"
            onClick={clearMain}
            className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#B91C1C] shadow-sm"
            aria-label={t("delete")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => mainInputRef.current?.click()}
          disabled={uploading}
          className="flex h-[120px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[13px] font-bold text-[#475569] transition hover:border-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("uploading")}
            </>
          ) : (
            <>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#2563EB] shadow-sm">
                <ImagePlus className="h-4 w-4" />
              </span>
              {t("chooseFile")}
              <span className="text-[11px] font-medium text-[#94A3B8]">
                {displayHelper}
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={mainInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={onMain}
        className="hidden"
      />

      {value?.type === "video" && onPosterChange && (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {poster ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={poster}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1E293B]">
                      {t("videoPoster")}
                    </p>
                    <p className="text-[11px] font-medium text-[#94A3B8]">
                      {t("posterImageOnly")}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#64748B]">
                    <Video className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1E293B]">
                      {t("videoPosterOptional")}
                    </p>
                    <p className="text-[11px] font-medium text-[#94A3B8]">
                      {t("posterPreviewHint")}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => posterInputRef.current?.click()}
                disabled={posterUploading}
                className="inline-flex h-9 min-h-[36px] items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[11px] font-bold text-[#475569] disabled:opacity-60"
              >
                {posterUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                {poster ? t("change") : t("choose")}
              </button>
              {poster && (
                <button
                  type="button"
                  onClick={clearPoster}
                  aria-label={t("delete")}
                  className="inline-flex h-9 min-h-[36px] items-center gap-1.5 rounded-lg border border-[#FECACA] bg-white px-3 text-[11px] font-bold text-[#B91C1C]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <input
            ref={posterInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPoster}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
