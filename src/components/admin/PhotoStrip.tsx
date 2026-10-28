"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { renderableImageUrl } from "@/lib/banner-creative";

export type PhotoBadge = { text: string; tone: "cover" | "added" | "removed" };

const BADGE_CLASSES: Record<PhotoBadge["tone"], string> = {
  cover: "bg-[#2563EB]",
  added: "bg-[#16A34A]",
  removed: "bg-[#DC2626]",
};

/** Read-only 80 px thumbnails for admin review. No built-in text: callers
 * pass the label and badges. Every URL goes through renderableImageUrl (C6):
 * one that fails stays visible as text, never as a link or an image. */
export default function PhotoStrip({
  urls,
  label,
  badges,
}: {
  urls: string[];
  label: string;
  badges?: (url: string, index: number) => PhotoBadge[];
}) {
  if (urls.length === 0) return <p className="text-[#94A3B8]">—</p>;
  return (
    <ol className="flex flex-wrap gap-2">
      {urls.map((url, i) => {
        const tones = badges?.(url, i) ?? [];
        const added = tones.some((b) => b.tone === "added");
        const removed = tones.some((b) => b.tone === "removed");
        return (
          <li
            key={`${i}-${url}`}
            className={`relative size-20 shrink-0 overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] ${added ? "ring-2 ring-[#16A34A]" : ""} ${removed ? "opacity-75 ring-2 ring-[#DC2626]" : ""}`}
          >
            <Tile url={url} alt={`${label} ${i + 1}`} />
            {tones.length > 0 && (
              <span className="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-0.5">
                {tones.map((b) => (
                  <span
                    key={b.tone}
                    className={`rounded px-1 text-[9px] font-bold leading-[14px] text-white ${BADGE_CLASSES[b.tone]}`}
                  >
                    {b.text}
                  </span>
                ))}
              </span>
            )}
            {urls.length > 1 && (
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-bold leading-[14px] text-white">
                {i + 1}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Tile({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const safe = renderableImageUrl(url); // after-values are unvalidated
  if (!safe) {
    return (
      <span
        title={url}
        className="block size-full overflow-hidden break-all p-1 text-[9px] leading-tight text-[#64748B]"
      >
        {url}
      </span>
    );
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={alt}
      className="flex size-full items-center justify-center"
    >
      {failed ? (
        <ImageOff className="size-5 text-[#94A3B8]" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- no optimizer cache for unreviewed photos
        <img
          src={safe}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </a>
  );
}
