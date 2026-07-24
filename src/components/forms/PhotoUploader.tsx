"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
  type ReactNode,
  type DragEvent,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import { Camera, Loader2, Star, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { watermarkFile } from "@/lib/utils/watermark";
import { createUploadClient } from "@/lib/supabase/client";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "property-photos";
// Longest-edge cap and hard size ceiling — kept in sync with the bucket's 5MB
// `file_size_limit` so a watermarked photo never gets rejected by Storage.
const MAX_EDGE = 2560;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type UploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: "too_large" | "convert" | "upload" };

/** iPhones default to HEIC/HEIF; the MIME is often empty, so check the name too. */
function isHeicFile(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/** Browser-only HEIC→JPEG conversion. Dynamically imported to stay out of the main bundle. */
async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const renamed = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  const name = renamed.toLowerCase().endsWith(".jpg")
    ? renamed
    : `${renamed}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}

interface PhotoUploaderProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  variant?: "default" | "figma";
}

/** Badge marking the cover photo (always photos[0]). */
function MainBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute z-10 flex items-center gap-1 rounded-full bg-[#2563EB] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ${className ?? ""}`}
    >
      <Star className="size-3 fill-white" strokeWidth={0} />
      {label}
    </span>
  );
}

/** Promotes a non-cover photo to be the main/cover image. */
function SetMainButton({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={`absolute z-10 flex items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-[#2563EB] ${className ?? ""}`}
    >
      <Star className="size-5 lg:size-3.5" />
    </button>
  );
}

/** Delete (✕) control shared by every photo tile. */
function RemoveButton({
  onClick,
  className,
  iconClassName = "size-5 lg:size-3.5",
}: {
  onClick: () => void;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute z-10 flex items-center justify-center rounded-full bg-black/60 text-white ${className ?? ""}`}
    >
      <X className={iconClassName} />
    </button>
  );
}

/** Placeholder tile shown while a photo is uploading to Storage. */
function UploadingTile({ label }: { label: string }) {
  return (
    <div
      className="flex aspect-square items-center justify-center rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]"
      title={label}
      aria-label={label}
    >
      <Loader2 className="size-6 animate-spin text-[#94A3B8]" />
    </div>
  );
}

/**
 * A draggable, sortable photo tile. The whole tile is the drag surface; the
 * ✕ / ★ buttons inside stop pointer propagation so taps on them never start a
 * drag. Sensors use a movement/hold threshold, so a plain click/tap still fires.
 */
function SortablePhoto({
  id,
  ariaLabel,
  className,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  id: string;
  ariaLabel: string;
  className?: string;
  onClick?: () => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={ariaLabel}
      className={`cursor-grab active:cursor-grabbing ${
        isDragging ? "z-20 opacity-40" : ""
      } ${className ?? ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export default function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 10,
  variant = "default",
}: PhotoUploaderProps) {
  const t = useTranslations("PhotoUploader");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Lazily-created upload-scoped client (60s timeout) for auth lookup + Storage
  // I/O. Created on first upload only — never during render/prerender, so the
  // create forms don't require Supabase env vars at static-export time.
  const uploadClientRef = useRef<ReturnType<typeof createUploadClient> | null>(
    null,
  );
  const getUploadClient = useCallback(() => {
    uploadClientRef.current ??= createUploadClient();
    return uploadClientRef.current;
  }, []);
  const userIdRef = useRef<string | null>(null);
  const uploadingRef = useRef(0);
  // Mirror the controlled `photos` so async uploads append to the latest
  // committed list instead of an earlier closure's snapshot.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const setUploading = useCallback((n: number) => {
    uploadingRef.current = n;
    setUploadingCount(n);
  }, []);

  const getUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current;
    const { data } = await getUploadClient().auth.getUser();
    userIdRef.current = data.user?.id ?? null;
    return userIdRef.current;
  }, [getUploadClient]);

  const uploadOne = useCallback(
    async (
      file: File,
      userId: string,
      heic: boolean,
    ): Promise<UploadResult> => {
      let working = file;
      if (heic) {
        try {
          working = await convertHeicToJpeg(file);
        } catch {
          return { ok: false, reason: "convert" };
        }
      }

      // Watermark + downscale + re-encode to JPEG so screenshots/large photos
      // stay comfortably under the 5MB Storage limit.
      const processed = await watermarkFile(working, {
        outputType: "image/jpeg",
        maxEdge: MAX_EDGE,
        opacity: 0.5,
      });
      if (processed.size > MAX_UPLOAD_BYTES) {
        return { ok: false, reason: "too_large" };
      }

      const mime = processed.type || "image/jpeg";
      const ext =
        mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      // First path segment must be the user id — Storage RLS requires it.
      // `-wm` suffix marks the object as already-watermarked so the backfill
      // script skips it (idempotency) and never double-stamps.
      const path = `${userId}/${crypto.randomUUID()}-wm.${ext}`;

      const client = getUploadClient();
      const { error } = await client.storage
        .from(BUCKET)
        .upload(path, processed, { contentType: mime, upsert: false });
      if (error) return { ok: false, reason: "upload" };

      const { data } = client.storage.from(BUCKET).getPublicUrl(path);
      return data?.publicUrl
        ? { ok: true, url: data.publicUrl }
        : { ok: false, reason: "upload" };
    },
    [getUploadClient],
  );

  // Stable id ↔ url model. The public contract stays `string[]`, but dnd-kit
  // needs ids that survive reorder/add/remove and tolerate duplicate images.
  // Ids are reused by matching url (consuming matches so duplicates get distinct
  // ids) and minted from a counter otherwise.
  const idCounterRef = useRef(0);
  const prevItemsRef = useRef<{ id: string; url: string }[]>([]);
  const items = useMemo(() => {
    const pool = new Map<string, string[]>();
    for (const item of prevItemsRef.current) {
      const bucket = pool.get(item.url);
      if (bucket) bucket.push(item.id);
      else pool.set(item.url, [item.id]);
    }
    const next = photos.map((url) => {
      const bucket = pool.get(url);
      const reused = bucket?.shift();
      if (reused) return { id: reused, url };
      idCounterRef.current += 1;
      return { id: `photo-${idCounterRef.current}`, url };
    });
    prevItemsRef.current = next;
    return next;
  }, [photos]);

  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const activeUrl = activeId
    ? (items.find((item) => item.id === activeId)?.url ?? null)
    : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      onPhotosChange(arrayMove(items, oldIndex, newIndex).map((it) => it.url));
    },
    [items, onPhotosChange],
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files);
      const heicFiles = incoming.filter(isHeicFile);
      const acceptedFiles = incoming.filter(
        (f) => !isHeicFile(f) && ACCEPTED_TYPES.includes(f.type),
      );
      const invalidCount =
        incoming.length - heicFiles.length - acceptedFiles.length;

      // Reserve capacity against both stored and in-flight photos.
      const remaining = Math.max(
        0,
        maxPhotos - photosRef.current.length - uploadingRef.current,
      );
      const queued = [...acceptedFiles, ...heicFiles].slice(0, remaining);
      const skippedByLimit =
        acceptedFiles.length + heicFiles.length - queued.length;

      const baseMsgs: string[] = [];
      if (invalidCount > 0)
        baseMsgs.push(t("skippedInvalid", { count: invalidCount }));
      if (skippedByLimit > 0)
        baseMsgs.push(
          t("skippedByLimit", { count: skippedByLimit, max: maxPhotos }),
        );

      if (queued.length === 0) {
        setErrorMessage(baseMsgs.join(" • "));
        return;
      }

      const userId = await getUserId();
      if (!userId) {
        setErrorMessage(
          [...baseMsgs, t("uploadFailed", { count: queued.length })].join(
            " • ",
          ),
        );
        return;
      }

      setErrorMessage(baseMsgs.join(" • "));
      setUploading(uploadingRef.current + queued.length);

      const results = await Promise.allSettled(
        queued.map((file) => uploadOne(file, userId, isHeicFile(file))),
      );

      setUploading(Math.max(0, uploadingRef.current - queued.length));

      const urls: string[] = [];
      const reasons = { too_large: 0, convert: 0, upload: 0 };
      for (const r of results) {
        if (r.status === "rejected") {
          reasons.upload += 1;
          continue;
        }
        const value = r.value;
        if (value.ok) urls.push(value.url);
        else reasons[value.reason] += 1;
      }

      if (urls.length > 0) {
        onPhotosChange([...photosRef.current, ...urls]);
      }

      const finalMsgs = [...baseMsgs];
      if (reasons.too_large > 0)
        finalMsgs.push(t("tooLarge", { count: reasons.too_large }));
      if (reasons.convert > 0)
        finalMsgs.push(t("convertFailed", { count: reasons.convert }));
      if (reasons.upload > 0)
        finalMsgs.push(t("uploadFailed", { count: reasons.upload }));
      setErrorMessage(finalMsgs.join(" • "));
    },
    [maxPhotos, t, getUserId, uploadOne, setUploading, onPhotosChange],
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

  // Move the chosen photo to the front so every photos[0] reader shows it as
  // the cover; the order of the remaining photos is preserved.
  const handleSetMain = useCallback(
    (index: number) => {
      if (index <= 0 || index >= photos.length) return;
      const next = [...photos];
      const [picked] = next.splice(index, 1);
      onPhotosChange([picked, ...next]);
    },
    [photos, onPhotosChange],
  );

  // Floating clone shown while dragging — keeps a consistent thumbnail size even
  // when the dragged tile (e.g. the big cover) has a different footprint.
  const dragOverlay = (
    <DragOverlay modifiers={[restrictToWindowEdges]}>
      {activeUrl ? (
        <div className="relative size-24 overflow-hidden rounded-2xl border-2 border-white shadow-xl">
          <Image
            src={activeUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
            draggable={false}
          />
        </div>
      ) : null}
    </DragOverlay>
  );

  if (variant === "figma") {
    const coverItem = items[0];
    const thumbItems = [items[1], items[2], items[3], items[4]];
    const extraItems = items.slice(5);

    return (
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
              {/* Large cover tile — col-span 1, row-span 2 */}
              {coverItem ? (
                <SortablePhoto
                  id={coverItem.id}
                  ariaLabel={t("dragHandleLabel")}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="relative col-span-2 h-[200px] overflow-hidden rounded-2xl border border-[#E2E8F0] md:col-span-1 md:row-span-2 md:h-auto"
                >
                  <Image
                    src={coverItem.url}
                    alt="Photo 1"
                    fill
                    className="object-cover"
                    unoptimized
                    draggable={false}
                  />
                  <RemoveButton
                    onClick={() => handleRemove(0)}
                    className="right-2 top-2 size-11 lg:size-7"
                    iconClassName="size-5 lg:size-4"
                  />
                  <MainBadge label={t("mainBadge")} className="left-2 top-2" />
                </SortablePhoto>
              ) : (
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
                  className={`relative col-span-2 flex h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-[#F8FAFC] p-6 transition-colors md:col-span-1 md:h-auto md:aspect-auto md:row-span-2 ${
                    isDragging
                      ? "border-[#2563EB] bg-[#EFF6FF]"
                      : "border-[#2563EB]/60 hover:border-[#2563EB]"
                  } ${photos.length >= maxPhotos ? "pointer-events-none opacity-50" : ""}`}
                >
                  <div className="flex size-12 items-center justify-center rounded-full border border-[#E2E8F0] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                    <Upload className="size-5 text-[#94A3B8]" />
                  </div>
                  <span className="text-[15px] font-black text-[#0F172A]">
                    {t("uploadPhotos")}
                  </span>
                  <span className="text-xs font-normal text-[#64748B]">
                    {t("dropHereOrClick")}
                  </span>
                  <span className="rounded-md bg-[#DCFCE7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#166534]">
                    {t("maxPhotos", { max: maxPhotos })}
                  </span>
                </div>
              )}

              {/* 2x2 thumbnail grid */}
              {thumbItems.map((slotItem, slotIdx) => {
                const photoIndex = slotIdx + 1;
                if (slotItem) {
                  return (
                    <SortablePhoto
                      key={slotItem.id}
                      id={slotItem.id}
                      ariaLabel={t("dragHandleLabel")}
                      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]"
                    >
                      <Image
                        src={slotItem.url}
                        alt={`Photo ${photoIndex + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                        draggable={false}
                      />
                      <RemoveButton
                        onClick={() => handleRemove(photoIndex)}
                        className="right-1 top-1 size-11 opacity-100 transition-opacity group-hover:opacity-100 lg:size-6 lg:opacity-0"
                      />
                      <SetMainButton
                        onClick={() => handleSetMain(photoIndex)}
                        label={t("setAsMain")}
                        className="left-1 top-1 size-11 opacity-100 group-hover:opacity-100 lg:size-6 lg:opacity-0"
                      />
                    </SortablePhoto>
                  );
                }
                return (
                  <div
                    key={`empty-${slotIdx}`}
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#94A3B8]"
                  >
                    <Camera
                      className="size-7 text-[#CBD5E1]"
                      strokeWidth={1.5}
                    />
                  </div>
                );
              })}
            </div>

            {extraItems.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {extraItems.map((item, idx) => {
                  const photoIndex = idx + 5;
                  return (
                    <SortablePhoto
                      key={item.id}
                      id={item.id}
                      ariaLabel={t("dragHandleLabel")}
                      className="group relative aspect-square overflow-hidden rounded-2xl border border-[#E2E8F0]"
                    >
                      <Image
                        src={item.url}
                        alt={`Photo ${photoIndex + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                        draggable={false}
                      />
                      <RemoveButton
                        onClick={() => handleRemove(photoIndex)}
                        className="right-1 top-1 size-11 opacity-100 transition-opacity group-hover:opacity-100 lg:size-6 lg:opacity-0"
                      />
                      <SetMainButton
                        onClick={() => handleSetMain(photoIndex)}
                        label={t("setAsMain")}
                        className="left-1 top-1 size-11 opacity-100 group-hover:opacity-100 lg:size-6 lg:opacity-0"
                      />
                    </SortablePhoto>
                  );
                })}
              </div>
            )}
          </SortableContext>
          {dragOverlay}
        </DndContext>

        {uploadingCount > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {Array.from({ length: uploadingCount }).map((_, i) => (
              <UploadingTile key={`uploading-${i}`} label={t("uploading")} />
            ))}
          </div>
        )}

        {items.length > 1 && (
          <div className="space-y-0.5">
            <p className="text-xs text-[#64748B]">{t("mainHint")}</p>
            <p className="text-xs text-[#94A3B8]">{t("reorderHint")}</p>
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
          {t("uploadPhotosAlt")}
        </span>
        <span className="text-xs font-normal text-[#64748B]">
          {t("dropHereOrClickSelect")}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Photo count */}
      <span className="inline-block rounded-lg bg-[#EEF1F4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[1px] text-[#8B5CF6]">
        {t("photoCount", { count: photos.length, max: maxPhotos })}
      </span>

      {/* Preview grid */}
      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map(({ id, url }, index) => (
                <SortablePhoto
                  key={id}
                  id={id}
                  ariaLabel={t("dragHandleLabel")}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-[#E2E8F0]"
                >
                  <Image
                    src={url}
                    alt={`Photo ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                    draggable={false}
                  />
                  <RemoveButton
                    onClick={() => handleRemove(index)}
                    className="right-1 top-1 size-11 opacity-100 transition-opacity group-hover:opacity-100 lg:size-6 lg:opacity-0"
                  />
                  {index === 0 ? (
                    <MainBadge
                      label={t("mainBadge")}
                      className="left-1 top-1"
                    />
                  ) : (
                    <SetMainButton
                      onClick={() => handleSetMain(index)}
                      label={t("setAsMain")}
                      className="left-1 top-1 size-11 opacity-100 group-hover:opacity-100 lg:size-6 lg:opacity-0"
                    />
                  )}
                </SortablePhoto>
              ))}
            </div>
          </SortableContext>
          {dragOverlay}
        </DndContext>
      )}
      {uploadingCount > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {Array.from({ length: uploadingCount }).map((_, i) => (
            <UploadingTile key={`uploading-${i}`} label={t("uploading")} />
          ))}
        </div>
      )}
      {items.length > 1 && (
        <div className="space-y-0.5">
          <p className="text-xs text-[#64748B]">{t("mainHint")}</p>
          <p className="text-xs text-[#94A3B8]">{t("reorderHint")}</p>
        </div>
      )}
      {errorMessage && (
        <p className="text-xs font-medium text-[#DC2626]">{errorMessage}</p>
      )}
    </div>
  );
}
