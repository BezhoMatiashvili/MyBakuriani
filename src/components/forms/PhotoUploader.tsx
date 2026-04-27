"use client";

import { useRef, useState, useCallback, DragEvent, ChangeEvent } from "react";
import Image from "next/image";
import { Camera, Upload, X } from "lucide-react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface PhotoUploaderProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  variant?: "default" | "figma";
}

export default function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 10,
  variant = "default",
}: PhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const validFiles = Array.from(files).filter((file) =>
        ACCEPTED_TYPES.includes(file.type),
      );
      const invalidCount = Array.from(files).length - validFiles.length;

      const remaining = maxPhotos - photos.length;
      const filesToProcess = validFiles.slice(0, remaining);
      const skippedByLimit = Math.max(
        validFiles.length - filesToProcess.length,
        0,
      );

      if (invalidCount > 0 || skippedByLimit > 0) {
        setErrorMessage(
          [
            invalidCount > 0
              ? `${invalidCount} ფაილი გამოტოვებულია (მხოლოდ JPG/PNG/WEBP)`
              : "",
            skippedByLimit > 0
              ? `${skippedByLimit} ფაილი გამოტოვებულია (მაქს. ${maxPhotos} ფოტო)`
              : "",
          ]
            .filter(Boolean)
            .join(" • "),
        );
      } else {
        setErrorMessage("");
      }

      const encoded = await Promise.all(
        filesToProcess.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const result = e.target?.result as string;
                if (result) {
                  resolve(result);
                  return;
                }
                reject(new Error("Failed to read image"));
              };
              reader.onerror = () => reject(new Error("Failed to read image"));
              reader.readAsDataURL(file);
            }),
        ),
      ).catch(() => []);

      if (encoded.length > 0) {
        onPhotosChange([...photos, ...encoded]);
      }
    },
    [photos, onPhotosChange, maxPhotos],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [processFiles],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onPhotosChange(photos.filter((_, i) => i !== index));
    },
    [photos, onPhotosChange],
  );

  if (variant === "figma") {
    const dropZonePhoto = photos[0];
    const thumbSlots = [photos[1], photos[2], photos[3], photos[4]];
    const extraPhotos = photos.slice(5);

    return (
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Large drop zone — col-span 1, row-span 2 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-[#F8FAFC] p-6 transition-colors md:aspect-auto md:row-span-2 ${
              isDragging
                ? "border-[#2563EB] bg-[#EFF6FF]"
                : "border-[#2563EB]/60 hover:border-[#2563EB]"
            } ${photos.length >= maxPhotos ? "pointer-events-none opacity-50" : ""}`}
          >
            {dropZonePhoto ? (
              <>
                <Image
                  src={dropZonePhoto}
                  alt="Photo 1"
                  fill
                  className="rounded-2xl object-cover"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(0);
                  }}
                  className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <>
                <div className="flex size-12 items-center justify-center rounded-full border border-[#E2E8F0] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                  <Upload className="size-5 text-[#94A3B8]" />
                </div>
                <span className="text-[15px] font-black text-[#0F172A]">
                  ფოტოების ატვირთვა
                </span>
                <span className="text-xs font-normal text-[#64748B]">
                  ჩააგდეთ ფოტოები აქ ან დააჭირეთ
                </span>
                <span className="rounded-md bg-[#DCFCE7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#166534]">
                  მაქს. {maxPhotos} ფოტო
                </span>
              </>
            )}
          </div>

          {/* 2x2 thumbnail grid */}
          {thumbSlots.map((slotPhoto, slotIdx) => {
            const photoIndex = slotIdx + 1;
            return (
              <div
                key={slotIdx}
                onClick={() => {
                  if (!slotPhoto) fileInputRef.current?.click();
                }}
                className={`group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] ${
                  !slotPhoto ? "cursor-pointer hover:border-[#94A3B8]" : ""
                }`}
              >
                {slotPhoto ? (
                  <>
                    <Image
                      src={slotPhoto}
                      alt={`Photo ${photoIndex + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(photoIndex);
                      }}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <Camera className="size-7 text-[#CBD5E1]" strokeWidth={1.5} />
                )}
              </div>
            );
          })}
        </div>

        {extraPhotos.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {extraPhotos.map((photo, idx) => {
              const photoIndex = idx + 5;
              return (
                <div
                  key={photoIndex}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-[#E2E8F0]"
                >
                  <Image
                    src={photo}
                    alt={`Photo ${photoIndex + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(photoIndex)}
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {errorMessage && (
          <p className="text-xs font-medium text-[#DC2626]">{errorMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drag-drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-8 transition-colors ${
          isDragging
            ? "border-[#2563EB] bg-[#EFF6FF]"
            : "hover:border-[#94A3B8]"
        } ${photos.length >= maxPhotos ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="flex size-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <Upload className="size-4 text-[#94A3B8]" />
        </div>
        <span className="text-[15px] font-black text-[#1E293B]">
          ატვირთეთ ფოტოები
        </span>
        <span className="text-xs font-normal text-[#64748B]">
          ჩააგდეთ ფოტოები აქ ან დააჭირეთ ასარჩევად
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Photo count */}
      <span className="inline-block rounded-lg bg-[#EEF1F4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[1px] text-[#8B5CF6]">
        {photos.length} / {maxPhotos} ფოტო
      </span>

      {/* Preview grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((photo, index) => (
            <div
              key={index}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-[#E2E8F0]"
            >
              <Image
                src={photo}
                alt={`Photo ${index + 1}`}
                fill
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {errorMessage && (
        <p className="text-xs font-medium text-[#DC2626]">{errorMessage}</p>
      )}
    </div>
  );
}
