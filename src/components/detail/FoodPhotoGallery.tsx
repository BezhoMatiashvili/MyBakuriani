"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Share2,
  Heart,
  Image as ImageIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { shareListing } from "@/lib/share";
import { useFavorite } from "@/lib/hooks/useFavorite";
import { CARD_BLUR_DATA_URL } from "@/lib/image-blur";

// Lightbox frame is `w-[90vw] max-w-5xl` => hard-capped at 1024px; 1024/0.9 = 1137.
const LIGHTBOX_SIZES = "(max-width: 1137px) 90vw, 1024px";
// Desktop side tiles are 1fr of `grid-cols-[2fr_1fr] gap-2` in the 1248px
// content column => ~413px; the 2fr hero is ~827px (it declared 700px).
// 384px, not the true ~413px slot: the `50vw` clause floors the srcset at 384,
// so declaring 413 selects w=640 at DPR1 while 384 selects w=384 for a 7%
// upscale nobody can see — and every DPR1 desktop then shares one transform.
const TILE_SIZES = "(max-width: 1023px) 50vw, 384px";
const HERO_SIZES = "(max-width: 1023px) 100vw, 827px";

interface Props {
  photos: string[];
  title: string;
  serviceId: string;
}

export function FoodPhotoGallery({ photos, title, serviceId }: Props) {
  const t = useTranslations("PhotoGallery");
  const tShare = useTranslations("ShareListing");
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ serviceId });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Which lightbox photo has finished decoding. The neighbour prefetch below
  // waits for this: the origin is a single vCPU, so firing the active image and
  // both neighbours together makes sharp queue all three and the photo the user
  // is actually looking at lands ~3x later. Prefetch only once the active one
  // is on screen. The key={lightboxIndex} remount re-fires onLoad, so this
  // needs no reset effect.
  const [loadedIndex, setLoadedIndex] = useState<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const openLightbox = useCallback((index: number) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setLightboxIndex(index);
    document.body.style.overflow = "hidden";
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    document.body.style.overflow = "";
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % photos.length : null,
    );
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + photos.length) % photos.length : null,
    );
  }, [photos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [lightboxIndex, closeLightbox, goNext, goPrev]);

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/9] w-full rounded-[24px] bg-[#F8FAFC] flex items-center justify-center">
        <span className="text-[#94A3B8]">{t("noPhotos")}</span>
      </div>
    );
  }

  const main = photos[0];
  const sideTop = photos[1] ?? photos[0];
  const sideBottom = photos[2] ?? photos[1] ?? photos[0];
  const showOverlay = photos.length > 3;

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            shareListing(title, {
              copied: tShare("copied"),
              error: tShare("error"),
            })
          }
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] lg:h-10 lg:w-10"
          aria-label={t("share")}
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favoriteBusy}
          aria-pressed={isFavorited}
          className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-60 lg:h-10 lg:w-10 ${
            isFavorited
              ? "border-red-500 bg-red-50 text-red-500"
              : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC] hover:text-red-500"
          }`}
          aria-label={t("addToFavorites")}
        >
          <Heart
            className={`h-[18px] w-[18px] ${isFavorited ? "fill-current" : ""}`}
          />
        </button>
      </div>

      <div
        data-mobile-gallery
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 lg:hidden"
      >
        {photos.map((photo, index) => (
          <button
            key={`${photo}-${index}`}
            type="button"
            onClick={() => openLightbox(index)}
            className="relative aspect-[8/5] w-[calc(100vw-32px)] shrink-0 snap-center overflow-hidden rounded-[20px]"
          >
            <Image
              src={photo}
              alt={`${title} - ${index + 1}`}
              fill
              // Must stay byte-identical to what HERO_SIZES resolves to on
              // mobile, or the hero's preload stops deduping with this img and
              // mobile pays two fetches instead of one.
              sizes="100vw"
              className="object-cover"
              placeholder="blur"
              blurDataURL={CARD_BLUR_DATA_URL}
              // Fully lazy, including index 0. React hoists a preload <link>
              // for ANY img that is not loading="lazy" (react-dom-server,
              // `case "img":`), so the earlier priority->eager change dropped
              // the duplicate <link> but NOT the duplicate fetch: on desktop
              // this rail is display:none yet index 0 still fetched the w=1920
              // rung for pixels nothing paints.
              loading="lazy"
            />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
              {index + 1} / {photos.length}
            </span>
          </button>
        ))}
      </div>

      <div className="hidden grid-cols-[2fr_1fr] grid-rows-2 gap-2 lg:grid">
        <div
          className="relative row-span-2 aspect-[4/3] cursor-pointer overflow-hidden rounded-l-[24px]"
          onClick={() => openLightbox(0)}
        >
          <Image
            src={main}
            alt={`${title} - 1`}
            fill
            // The page's one priority preload; on mobile it fetches the same
            // 100vw URL the rail's first image renders, on desktop the ~660px
            // slot this 2fr tile actually paints.
            sizes={HERO_SIZES}
            className="object-cover transition-transform duration-300 hover:scale-105"
            placeholder="blur"
            blurDataURL={CARD_BLUR_DATA_URL}
            priority
          />
        </div>

        <div
          className="relative aspect-[3/2] cursor-pointer overflow-hidden rounded-tr-[24px]"
          onClick={() => openLightbox(1)}
        >
          <Image
            src={sideTop}
            alt={`${title} - 2`}
            fill
            sizes={TILE_SIZES}
            className="object-cover transition-transform duration-300 hover:scale-105"
            placeholder="blur"
            blurDataURL={CARD_BLUR_DATA_URL}
          />
        </div>

        <div
          className="relative aspect-[3/2] cursor-pointer overflow-hidden rounded-br-[24px]"
          onClick={() => openLightbox(2)}
        >
          <Image
            src={sideBottom}
            alt={`${title} - 3`}
            fill
            sizes={TILE_SIZES}
            className="object-cover transition-transform duration-300 hover:scale-105"
            placeholder="blur"
            blurDataURL={CARD_BLUR_DATA_URL}
          />
          {showOverlay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openLightbox(0);
              }}
              className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#1E293B] shadow-md backdrop-blur-sm transition-colors hover:bg-white"
            >
              <ImageIcon className="h-4 w-4" />
              {t("allPhotos", { count: photos.length })}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            role="dialog"
            aria-modal="true"
            aria-label={t("viewAllPhotos", { count: photos.length })}
            onClick={closeLightbox}
          >
            <button
              type="button"
              onClick={closeLightbox}
              aria-label={t("close")}
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top))] rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm">
              {lightboxIndex + 1} / {photos.length}
            </div>

            {photos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                aria-label="Previous photo"
                className="absolute left-4 hidden size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 lg:flex"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              drag={photos.length > 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80) goPrev();
                else if (info.offset.x < -80) goNext();
              }}
              className="relative h-[80dvh] w-[90vw] max-w-5xl touch-pan-y"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={photos[lightboxIndex]}
                alt={`${title} - ${lightboxIndex + 1}`}
                fill
                sizes={LIGHTBOX_SIZES}
                className="object-contain"
                onLoad={() => setLoadedIndex(lightboxIndex)}
              />
            </motion.div>

            {/* Neighbour prefetch — see PhotoGallery.tsx for the full rationale.
                Must stay positioned, really sized and opacity-hidden (never
                display:none, which would suppress the fetch), and
                pointer-events-none so it cannot eat the click-to-close. */}
            {loadedIndex === lightboxIndex && photos.length > 1 && (
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-[80dvh] w-[90vw] max-w-5xl opacity-0"
              >
                {Array.from(
                  new Set([
                    (lightboxIndex + 1) % photos.length,
                    (lightboxIndex - 1 + photos.length) % photos.length,
                  ]),
                )
                  .filter((neighbour) => neighbour !== lightboxIndex)
                  .map((neighbour) => (
                    <Image
                      key={neighbour}
                      src={photos[neighbour]}
                      alt=""
                      fill
                      sizes={LIGHTBOX_SIZES}
                      className="object-contain"
                    />
                  ))}
              </div>
            )}

            {photos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                aria-label="Next photo"
                className="absolute right-4 hidden size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 lg:flex"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
