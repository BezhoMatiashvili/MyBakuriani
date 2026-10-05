"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { MousePointerClick, RotateCcw, Send, X } from "lucide-react";
import { SUPPORT_LIMITS } from "@/lib/support/plan";
import { JevAvatar } from "./JevAvatar";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tone?: "info" | "error";
  /** A question Jev can also walk through on screen. */
  showMe?: string;
  /** Jev's simple choices, refining `goal`. */
  options?: string[];
  goal?: string;
  /** What the user had already done when Jev asked. */
  progress?: string[];
};

type Props = {
  entries: ChatEntry[];
  busy: "answer" | "plan" | null;
  draft: string;
  quickActions: string[];
  reduceMotion: boolean;
  onDraft: (value: string) => void;
  onSend: () => void;
  onShowMe: (question: string) => void;
  onOption: (goal: string, option: string, progress?: string[]) => void;
  onQuick: (text: string) => void;
  onReset: () => void;
  onClose: () => void;
};

export function SupportPanel({
  entries,
  busy,
  draft,
  quickActions,
  reduceMotion,
  onDraft,
  onSend,
  onShowMe,
  onOption,
  onQuick,
  onReset,
  onClose,
}: Props) {
  const t = useTranslations("Support");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight });
  }, [entries.length, busy]);

  // Grow the box with its text, up to about four lines.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, [draft]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSend = draft.trim() !== "" && busy === null;

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-[84] bg-[#0F172A]/30 sm:hidden"
        onClick={onClose}
      />
      <motion.section
        id="jev-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="jev-panel-title"
        data-testid="jev-panel"
        className="fixed inset-x-0 bottom-0 z-[85] flex h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-3xl border border-[#E2E8F0] bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(620px,calc(100dvh-2rem))] sm:w-[380px] sm:rounded-2xl lg:bottom-6 lg:right-6"
        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }
        }
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <header className="flex items-center gap-3 border-b border-[#EEF1F4] py-2 pl-4 pr-2">
          <JevAvatar size="md" />
          <div className="min-w-0 flex-1">
            <h2
              id="jev-panel-title"
              className="text-[15px] font-extrabold leading-tight text-[#0F172A]"
            >
              Jev
            </h2>
            <p className="truncate text-[12px] font-medium text-[#64748B]">
              {t("subtitle")}
            </p>
          </div>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              aria-label={t("reset")}
              title={t("reset")}
              className="flex size-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <RotateCcw className="size-4.5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex size-11 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div
          ref={listRef}
          aria-live="polite"
          className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {entries.length === 0 && (
            <div>
              <div className="rounded-2xl bg-gradient-to-br from-[#EFF6FF] to-[#EEF2FF] p-4">
                <p className="text-[15px] font-extrabold text-[#0F172A]">
                  {t("greetingTitle")}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#334155]">
                  {t("greetingBody")}
                </p>
              </div>
              {quickActions.length > 0 && (
                <>
                  <p className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("quickTitle")}
                  </p>
                  <div className="flex flex-col gap-2">
                    {quickActions.map((text) => (
                      <button
                        key={text}
                        type="button"
                        onClick={() => onQuick(text)}
                        disabled={busy !== null}
                        className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-left text-[13px] font-semibold text-[#1E293B] transition-colors hover:border-[#BFDBFE] hover:bg-[#F8FAFF] disabled:opacity-50"
                      >
                        <MousePointerClick
                          className="size-4 shrink-0 text-[#2563EB]"
                          aria-hidden
                        />
                        {text}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {entries.map((entry) =>
            entry.role === "user" ? (
              <div key={entry.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-[#2563EB] px-3.5 py-2.5 text-[14px] leading-snug text-white">
                  {entry.text}
                </p>
              </div>
            ) : (
              <div key={entry.id} className="flex items-end gap-2">
                <JevAvatar size="sm" />
                <div
                  className={`max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[14px] leading-snug ${
                    entry.tone === "error"
                      ? "bg-[#FEF2F2] text-[#991B1B]"
                      : entry.tone === "info"
                        ? "bg-[#EFF6FF] text-[#1E3A8A]"
                        : "bg-[#F1F5F9] text-[#0F172A]"
                  }`}
                >
                  <p className="whitespace-pre-line break-words">
                    {entry.text}
                  </p>
                  {entry.showMe && (
                    <button
                      type="button"
                      onClick={() => onShowMe(entry.showMe!)}
                      disabled={busy !== null}
                      className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-bold text-[#2563EB] shadow-sm ring-1 ring-[#DBEAFE] transition-colors hover:bg-[#EFF6FF] disabled:opacity-50"
                    >
                      <MousePointerClick className="size-3.5" aria-hidden />
                      {t("showMe")}
                    </button>
                  )}
                  {entry.goal && entry.options && entry.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            onOption(entry.goal!, option, entry.progress)
                          }
                          disabled={busy !== null}
                          className="min-h-11 rounded-full bg-white px-3.5 text-[13px] font-semibold text-[#1E3A8A] ring-1 ring-[#BFDBFE] transition-colors hover:bg-[#EFF6FF] disabled:opacity-50"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="flex items-end gap-2" role="status">
              <JevAvatar size="sm" />
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[#F1F5F9] px-3.5 py-3 text-[13px] text-[#475569]">
                <span className="flex gap-1" aria-hidden>
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      className="size-1.5 rounded-full bg-[#2563EB]"
                      animate={
                        reduceMotion ? undefined : { opacity: [0.3, 1, 0.3] }
                      }
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: dot * 0.18,
                      }}
                    />
                  ))}
                </span>
                {busy === "plan" ? t("looking") : t("thinking")}
              </div>
            </div>
          )}
        </div>

        <form
          className="border-t border-[#EEF1F4] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) onSend();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={SUPPORT_LIMITS.message}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) onSend();
                }
              }}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              className="min-h-11 flex-1 resize-none rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-[14px] leading-snug text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:bg-white"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("send")}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8] disabled:bg-[#CBD5E1]"
            >
              <Send className="size-4.5" aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[#94A3B8]">
            {t("disclaimer")}
          </p>
        </form>
      </motion.section>
    </>
  );
}
