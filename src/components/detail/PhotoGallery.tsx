"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Share2, Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { shareListing } from "@/lib/share";
import { useFavorite } from "@/lib/hooks/useFavorite";

interface PhotoGalleryProps {
  photos: string[];
  title: string;
  propertyId: string;
}

export function PhotoGallery({ photos, title, propertyId }: PhotoGalleryProps) {
  const t = useTranslations("PhotoGallery");
  const tShare = useTranslations("ShareListing");
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ propertyId });
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

  /* 1 main + 4 in 2x2 grid on right — Figma layout */
  const displayPhotos = [
    photos[0],
    photos[1] ?? photos[0],
    photos[2] ?? photos[0],
    photos[3] ?? photos[0],
    photos[4] ?? photos[0],
  ];

  return (
    <>
      {/* Share / Favorite actions above gallery */}
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
          aria-label={t("addToFavorites")}
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-[#E2E8F0] bg-white transition-colors hover:bg-[#F8FAFC] disabled:opacity-60 lg:h-10 lg:w-10 ${
            isFavorited ? "text-red-500" : "text-[#64748B] hover:text-red-500"
          }`}
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
              sizes="100vw"
              className="object-cover"
              priority={index === 0}
            />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
              {index + 1} / {photos.length}
            </span>
          </button>
        ))}
      </div>

      {/* Gallery Grid — desktop: 3-col (1.5fr 1fr 1fr), 2 rows */}
      <div className="hidden grid-cols-[1.5fr_1fr_1fr] grid-rows-2 gap-2 lg:grid">
        {/* Main photo — spans both rows */}
        <div
          className="relative row-span-2 aspect-[4/3] cursor-pointer overflow-hidden rounded-l-[24px]"
          onClick={() => openLightbox(0)}
        >
          <Image
            src={displayPhotos[0]}
            alt={`${title} - 1`}
            fill
            sizes="(max-width: 768px) 100vw, 60vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
            priority
          />
        </div>

        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden"
          onClick={() => openLightbox(1)}
        >
          <Image
            src={displayPhotos[1]}
            alt={`${title} - 2`}
            fill
            sizes="20vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>

        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-tr-[24px]"
          onClick={() => openLightbox(2)}
        >
          <Image
            src={displayPhotos[2]}
            alt={`${title} - 3`}
            fill
            sizes="20vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>

        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden"
          onClick={() => openLightbox(3)}
        >
          <Image
            src={displayPhotos[3]}
            alt={`${title} - 4`}
            fill
            sizes="20vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        </div>

        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-br-[24px]"
          onClick={() => openLightbox(4)}
        >
          <Image
            src={displayPhotos[4]}
            alt={`${title} - 5`}
            fill
            sizes="20vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
          {photos.length > 5 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-sm font-semibold text-white">
                {t("allPhotos", { count: photos.length })}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Lightbox */}
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
            {/* Close button */}
            <button
              type="button"
              onClick={closeLightbox}
              aria-label={t("close")}
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Counter */}
            <div className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top))] rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm">
              {lightboxIndex + 1} / {photos.length}
            </div>

            {/* Previous */}
            {photos.length > 1 && (
              <button
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

            {/* Image */}
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
                draggable={false}
              />
            </motion.div>

            {/* Next */}
            {photos.length > 1 && (
              <button
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
