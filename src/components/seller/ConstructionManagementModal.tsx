"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ka } from "date-fns/locale";
import { CalendarDays, Check, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";
import {
  CONSTRUCTION_STAGES,
  STATUS_OPTIONS,
  percentFromStages,
  stagesUpToPercent,
} from "@/lib/constants/construction";
import { formatDate } from "@/lib/utils/format";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { StyledSelect } from "@/components/ui/styled-select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface Props {
  property: Tables<"properties"> | null;
  onClose: () => void;
  onSaved: (updated: Tables<"properties">) => void;
}

const NOTE_MAX = 1000;

export default function ConstructionManagementModal({
  property,
  onClose,
  onSaved,
}: Props) {
  const open = property !== null;

  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [updateDate, setUpdateDate] = useState<Date>(() => new Date());
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!property) return;
    const stored = property.construction_stages ?? [];
    setSelectedStages(
      stored.length > 0
        ? stored
        : stagesUpToPercent(property.construction_progress_percent ?? 0),
    );
    setStatus("");
    setNote("");
    setMedia([]);
    setVideoUrl("");
    setUpdateDate(new Date());
    setError(null);
  }, [property]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  const percent = percentFromStages(selectedStages);

  function toggleStage(key: string) {
    setSelectedStages((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handlePublish() {
    if (!property) return;
    if (!note.trim()) {
      setError("შეავსეთ აღწერა (რა გაკეთდა).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();

      const { data, error: updateError } = await supabase
        .from("properties")
        .update({
          construction_stages: selectedStages,
          construction_progress_percent: percent,
          progress_note: note.trim(),
          progress_note_updated_at: nowIso,
        })
        .eq("id", property.id)
        .eq("owner_id", property.owner_id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      // Best-effort: append to the project_updates history feed. A failure here
      // must not undo the property update or block the modal from closing.
      const { error: feedError } = await supabase
        .from("project_updates")
        .insert({
          property_id: property.id,
          owner_id: property.owner_id,
          status: status || null,
          note: note.trim(),
          photos: media,
          video_url: videoUrl.trim() || null,
          update_date: format(updateDate, "yyyy-MM-dd"),
        });

      if (feedError) {
        toast.error("განახლება შენახულია, თუმცა ისტორიაში ვერ დაემატა.");
      }

      if (data) {
        toast.success("განახლება გამოქვეყნდა 🚀");
        onSaved(data as Tables<"properties">);
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "შენახვა ვერ მოხერხდა, სცადეთ თავიდან.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && property && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#F1F5F9] px-6 py-5">
              <div>
                <h2 className="text-[17px] font-black text-[#0F172A]">
                  მშენებლობის მართვა
                </h2>
                <p className="mt-0.5 truncate text-[12px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
                  {property.title}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F1F5F9]"
                aria-label="დახურვა"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto px-6 py-5">
              {/* Work stages */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-bold text-[#334155]">
                    სამუშაო ეტაპები
                  </span>
                  <span className="text-[18px] font-black text-[#2563EB]">
                    {percent}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {CONSTRUCTION_STAGES.map((stage) => {
                    const selected = selectedStages.includes(stage.key);
                    return (
                      <button
                        type="button"
                        key={stage.key}
                        onClick={() => toggleStage(stage.key)}
                        className={
                          selected
                            ? "flex items-center gap-2.5 rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2.5 text-left transition-colors"
                            : "flex items-center gap-2.5 rounded-[12px] border border-[#F1F5F9] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#E2E8F0]"
                        }
                      >
                        <span
                          className={
                            selected
                              ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white"
                              : "flex size-5 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-transparent"
                          }
                        >
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <span
                          className={
                            selected
                              ? "text-[13px] font-bold text-[#1D4ED8]"
                              : "text-[13px] font-medium text-[#475569]"
                          }
                        >
                          {stage.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Photo / video */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-bold text-[#334155]">
                    ფოტო / ვიდეო განახლება
                  </span>
                  <span className="text-[11px] font-medium text-[#94A3B8]">
                    მაქს. 10MB/30MB
                  </span>
                </div>
                <PhotoUploader
                  photos={media}
                  onPhotosChange={setMedia}
                  maxPhotos={5}
                  variant="figma"
                />
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="ვიდეოს ბმული (სურვილისამებრ) — https://..."
                  className="mt-2 h-[44px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
                />
              </div>

              {/* Date + status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-bold text-[#334155]">
                    თარიღი
                  </label>
                  <Popover>
                    <PopoverTrigger className="flex h-[48px] w-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-left text-sm font-medium text-[#0F172A] outline-none transition-colors hover:border-[#CBD5E1] data-[popup-open]:border-[#2563EB] data-[popup-open]:ring-2 data-[popup-open]:ring-[#DBEAFE]">
                      <CalendarDays className="size-4 shrink-0 text-[#94A3B8]" />
                      {formatDate(updateDate)}
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto">
                      <Calendar
                        mode="single"
                        selected={updateDate}
                        onSelect={(d) => d && setUpdateDate(d)}
                        locale={ka}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-bold text-[#334155]">
                    სტატუსი
                  </label>
                  <StyledSelect
                    value={status}
                    onValueChange={setStatus}
                    options={STATUS_OPTIONS}
                    placeholder="აირჩიე"
                    accent="blue"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[13px] font-bold text-[#334155]">
                    აღწერა (რა გაკეთდა)
                  </label>
                  <span className="text-[10px] font-medium text-[#94A3B8]">
                    {note.length} / {NOTE_MAX}
                  </span>
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                  placeholder="მაგ: დაასრულდა მე-4 სართულის გადახურვა, დაიწყო ფასადის მონტაჟი…"
                  rows={4}
                  className="min-h-[110px] w-full resize-y rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {error}
                </p>
              )}
            </div>

            <div className="border-t border-[#F1F5F9] px-6 py-4">
              <button
                type="button"
                onClick={handlePublish}
                disabled={saving || !note.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] py-3.5 text-[14px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                {saving ? "ქვეყნდება…" : "განახლების გამოქვეყნება 🚀"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
