"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Share2, Heart } from "lucide-react";

interface PhotoGalleryProps {
  photos: string[];
  title: string;
}

export function PhotoGallery({ photos, title }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((index: number) => {
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

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/9] w-full rounded-[24px] bg-[#F8FAFC] flex items-center justify-center">
        <span className="text-[#94A3B8]">ფოტო არ არის</span>
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
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
          aria-label="გაზიარება"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-red-500"
          aria-label="ფავორიტებში დამატება"
        >
          <Heart className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Gallery Grid — desktop: 3-col (1.5fr 1fr 1fr), 2 rows */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.5fr_1fr_1fr] md:grid-rows-2">
        {/* Main photo — spans both rows */}
        <div
          className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[24px] md:row-span-2 md:rounded-none md:rounded-l-[24px]"
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
          className="relative hidden aspect-[4/3] cursor-pointer overflow-hidden md:block"
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
          className="relative hidden aspect-[4/3] cursor-pointer overflow-hidden rounded-tr-[24px] md:block"
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
          className="relative hidden aspect-[4/3] cursor-pointer overflow-hidden md:block"
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
          className="relative hidden aspect-[4/3] cursor-pointer overflow-hidden rounded-br-[24px] md:block"
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
                ყველა ფოტო ({photos.length})
              </span>
            </div>
          )}
        </div>

        {photos.length > 1 && (
          <button
            onClick={() => openLightbox(0)}
            className="mt-2 text-sm font-medium text-brand-accent underline md:hidden"
          >
            ყველა ფოტოს ნახვა ({photos.length})
          </button>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={closeLightbox}
          >
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Counter */}
            <div className="absolute top-4 left-4 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-sm">
              {lightboxIndex + 1} / {photos.length}
            </div>

            {/* Previous */}
            {photos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className="absolute left-4 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
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
              className="relative h-[80vh] w-[90vw] max-w-5xl"
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

            {/* Next */}
            {photos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className="absolute right-4 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
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
