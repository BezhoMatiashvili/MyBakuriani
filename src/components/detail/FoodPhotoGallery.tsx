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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] md:h-10 md:w-10"
          aria-label={t("share")}
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favoriteBusy}
          aria-pressed={isFavorited}
          className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-60 md:h-10 md:w-10 ${
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

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr] md:grid-rows-2">
        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[24px] md:row-span-2 md:rounded-r-none md:rounded-l-[24px]"
          onClick={() => openLightbox(0)}
        >
          <Image
            src={main}
            alt={`${title} - 1`}
            fill
            sizes="(max-width: 768px) 100vw, 60vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
            priority
          />
        </div>

        <div
          className="relative hidden aspect-[3/2] cursor-pointer overflow-hidden md:block md:rounded-tr-[24px]"
          onClick={() => openLightbox(1)}
        >
          <Image
            src={sideTop}
            alt={`${title} - 2`}
            fill
            sizes="30vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>

        <div
          className="relative hidden aspect-[3/2] cursor-pointer overflow-hidden md:block md:rounded-br-[24px]"
          onClick={() => openLightbox(2)}
        >
          <Image
            src={sideBottom}
            alt={`${title} - 3`}
            fill
            sizes="30vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
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

        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => openLightbox(0)}
            className="mt-2 text-sm font-medium text-brand-accent underline md:hidden"
          >
            {t("viewAllPhotos", { count: photos.length })}
          </button>
        )}
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
                className="absolute left-4 hidden size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:flex"
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
                sizes="90vw"
                className="object-contain"
              />
            </motion.div>

            {photos.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                aria-label="Next photo"
                className="absolute right-4 hidden size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:flex"
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
