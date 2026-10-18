"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Mail,
  MousePointerClick,
  Phone,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  SUPPORT_LIMITS,
  type SupportButton,
  type SupportCabinet,
} from "@/lib/support/plan";
import { isExternalHref } from "@/lib/support/actions";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
} from "@/lib/site-contact";
import { JevAvatar } from "./JevAvatar";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tone?: "info" | "error";
  /** Buttons that open a page or a form; links built by the server. */
  actions?: SupportButton[];
  /** A walkthrough goal offered as "Show me on screen". */
  guide?: string;
  /** Follow-up questions, shown under the latest answer. */
  suggestions?: string[];
  /** The answer's ref for 👍/👎 ("canned:<key>" for a pre-written one). */
  ref?: string;
  rating?: "up" | "down";
  /** The assistant's simple choices, refining `goal`. */
  options?: string[];
  goal?: string;
  /** What the user had already done when the assistant asked. */
  progress?: string[];
};

/** A quick question offered before the first message. */
export type QuickChip = { key: string; text: string };

type Translate = ReturnType<typeof useTranslations<"Support">>;

type Props = {
  entries: ChatEntry[];
  busy: "answer" | "plan" | null;
  draft: string;
  quickChips: QuickChip[];
  cabinet: SupportCabinet;
  reduceMotion: boolean;
  onDraft: (value: string) => void;
  onSend: () => void;
  onShowMe: (goal: string) => void;
  onOption: (goal: string, option: string, progress?: string[]) => void;
  onQuick: (chip: QuickChip) => void;
  onAction: (button: SupportButton, label: string) => void;
  onSuggestion: (text: string) => void;
  onRate: (entryId: string, rating: "up" | "down") => void;
  onReset: () => void;
  onClose: () => void;
};

// "25.12": short, and the same in every locale (browsers without Georgian
// month names would print "Dec").
function shortDate(day: string): string {
  const [, month, date] = day.split("-");
  return month && date ? `${date}.${month}` : day;
}

/**
 * A button's label in the site's own words (Support.actions.*) and, below
 * it, what it will fill in ("20 დეკ – 25 დეკ · 4 სტუმარი"), both built here
 * from the checked params, never from model text.
 */
export function describeButton(
  button: SupportButton,
  t: Translate,
  cabinet: SupportCabinet,
): { label: string; detail: string } {
  const p = button.params ?? {};
  const parts: string[] = [];
  const number = (value: unknown) =>
    typeof value === "number" ? value : undefined;
  let label: string;
  if (button.id === "browse" && typeof p.category === "string") {
    label = t(`browse.${p.category}` as never);
  } else if (button.id === "orders" && cabinet === "employment") {
    label = t("actions.cvs");
  } else {
    label = t(`actions.${button.id}` as never);
  }
  if (button.id === "add_listing" && typeof p.category === "string")
    parts.push(t(`create.${p.category}` as never));
  if (typeof p.zone === "string") parts.push(p.zone);
  if (typeof p.check_in === "string" && typeof p.check_out === "string")
    parts.push(`${shortDate(p.check_in)} – ${shortDate(p.check_out)}`);
  else if (typeof p.check_in === "string")
    parts.push(t("params.from", { date: shortDate(p.check_in) }));
  const guests = number(p.guests);
  if (guests) parts.push(t("params.guests", { count: guests }));
  const rooms = number(p.rooms);
  if (rooms) parts.push(t("params.rooms", { count: rooms }));
  if (Array.isArray(p.types))
    parts.push(p.types.map((type) => t(`types.${type}` as never)).join(", "));
  const priceMax = number(p.price_max);
  if (priceMax) parts.push(t("params.priceMax", { amount: priceMax }));
  const budgetMin = number(p.budget_min);
  const budgetMax = number(p.budget_max);
  if (budgetMin !== undefined && budgetMax !== undefined)
    parts.push(t("params.budget", { min: budgetMin, max: budgetMax }));
  else if (budgetMax !== undefined)
    parts.push(t("params.priceMax", { amount: budgetMax }));
  else if (budgetMin !== undefined)
    parts.push(t("params.budgetFrom", { amount: budgetMin }));
  const amount = number(p.amount);
  if (amount) parts.push(t("params.amount", { amount }));
  if (typeof p.tab === "string") parts.push(t(`tabs.${p.tab}` as never));
  if (typeof p.query === "string") parts.push(`„${p.query}“`);
  return { label, detail: parts.join(" · ") };
}

/**
 * Phones: the on-screen keyboard covers fixed elements instead of shrinking
 * the page (iOS Safari, Android Chrome), so while it is open the sheet is
 * lifted to the visible area's bottom and fitted into it.
 */
function useKeyboardFit(): React.CSSProperties | undefined {
  const [fit, setFit] = useState<React.CSSProperties>();
  useEffect(() => {
    const view = window.visualViewport;
    const phone = window.matchMedia("(max-width: 639px)");
    if (!view) return;
    const update = () => {
      const covered = window.innerHeight - view.height - view.offsetTop;
      // A pinch zoom also shrinks the visual viewport: only a keyboard counts.
      if (!phone.matches || covered < 80 || Math.abs(view.scale - 1) > 0.01) {
        setFit(undefined);
        return;
      }
      setFit({
        bottom: Math.round(covered),
        height: Math.round(Math.min(view.height - 8, 640)),
      });
    };
    update();
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
    };
  }, []);
  return fit;
}

const ACTION_CLASS =
  "flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-[#2563EB] px-3.5 py-2 text-left text-white shadow-sm transition-colors hover:bg-[#1D4ED8] disabled:opacity-50";

function ActionButton({
  button,
  label,
  detail,
  disabled,
  onPress,
}: {
  button: SupportButton;
  label: string;
  detail: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold leading-tight">
          {label}
        </span>
        {detail && (
          <span className="mt-0.5 line-clamp-2 block text-[12px] font-medium text-white/80">
            {detail}
          </span>
        )}
      </span>
      {button.href.startsWith("tel:") ? (
        <Phone className="size-4 shrink-0" aria-hidden />
      ) : button.href.startsWith("mailto:") ? (
        <Mail className="size-4 shrink-0" aria-hidden />
      ) : (
        <ArrowUpRight className="size-4 shrink-0" aria-hidden />
      )}
    </>
  );
  // Phone and mail open the device's own app: a plain link.
  if (isExternalHref(button.href))
    return (
      <a
        href={button.href}
        className={ACTION_CLASS}
        data-testid="jev-action"
        data-action={button.id}
        onClick={onPress}
      >
        {body}
      </a>
    );
  return (
    <button
      type="button"
      className={ACTION_CLASS}
      data-testid="jev-action"
      data-action={button.id}
      disabled={disabled}
      onClick={onPress}
    >
      {body}
    </button>
  );
}

const PILL_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-bold text-[#2563EB] ring-1 ring-[#DBEAFE] transition-colors hover:bg-[#EFF6FF]";

export function SupportPanel({
  entries,
  busy,
  draft,
  quickChips,
  cabinet,
  reduceMotion,
  onDraft,
  onSend,
  onShowMe,
  onOption,
  onQuick,
  onAction,
  onSuggestion,
  onRate,
  onReset,
  onClose,
}: Props) {
  const t = useTranslations("Support");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keyboardFit = useKeyboardFit();

  // Only with a mouse: on a phone the keyboard would cover the quick questions.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches)
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
  const lastId = entries[entries.length - 1]?.id;

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
        style={keyboardFit}
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
              {t("name")}
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
              {quickChips.length > 0 && (
                <>
                  <p className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("quickTitle")}
                  </p>
                  <div className="flex flex-col gap-2">
                    {quickChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => onQuick(chip)}
                        disabled={busy !== null}
                        data-testid="jev-quick"
                        className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-left text-[13px] font-semibold text-[#1E293B] transition-colors hover:border-[#BFDBFE] hover:bg-[#F8FAFF] disabled:opacity-50"
                      >
                        <MousePointerClick
                          className="size-4 shrink-0 text-[#2563EB]"
                          aria-hidden
                        />
                        {chip.text}
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
                <div className="min-w-0 max-w-[85%] flex-1">
                  <div
                    className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[14px] leading-snug ${
                      entry.tone === "error"
                        ? "bg-[#FEF2F2] text-[#991B1B]"
                        : entry.tone === "info"
                          ? "bg-[#EFF6FF] text-[#1E3A8A]"
                          : "bg-[#F1F5F9] text-[#0F172A]"
                    }`}
                  >
                    {entry.text && (
                      <p className="whitespace-pre-line break-words">
                        {entry.text}
                      </p>
                    )}
                    {entry.actions && entry.actions.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-2">
                        {entry.actions.map((button) => {
                          const { label, detail } = describeButton(
                            button,
                            t,
                            cabinet,
                          );
                          return (
                            <ActionButton
                              key={`${button.id}-${button.href}`}
                              button={button}
                              label={label}
                              detail={detail}
                              disabled={busy !== null}
                              onPress={() => onAction(button, label)}
                            />
                          );
                        })}
                      </div>
                    )}
                    {entry.guide && (
                      <button
                        type="button"
                        onClick={() => onShowMe(entry.guide!)}
                        disabled={busy !== null}
                        data-testid="jev-show-me"
                        className={`mt-2 shadow-sm disabled:opacity-50 ${PILL_LINK}`}
                      >
                        <MousePointerClick className="size-3.5" aria-hidden />
                        {t("showMe")}
                      </button>
                    )}
                    {entry.goal &&
                      entry.options &&
                      entry.options.length > 0 && (
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
                    {entry.rating === "down" && (
                      <div className="mt-2.5 border-t border-[#E2E8F0] pt-2.5">
                        <p className="text-[12px] font-semibold text-[#475569]">
                          {t("feedback.sorry")}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a
                            href={`tel:${CONTACT_PHONE_E164}`}
                            className={PILL_LINK}
                          >
                            <Phone className="size-3.5" aria-hidden />
                            {CONTACT_PHONE_DISPLAY}
                          </a>
                          <a
                            href={`mailto:${CONTACT_EMAIL}`}
                            className={PILL_LINK}
                          >
                            <Mail className="size-3.5" aria-hidden />
                            {t("actions.email_support")}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                  {entry.ref && !entry.tone && (
                    <div className="mt-0.5 flex items-center gap-0.5">
                      {(["up", "down"] as const).map((rating) => {
                        const Icon = rating === "up" ? ThumbsUp : ThumbsDown;
                        const chosen = entry.rating === rating;
                        return (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => onRate(entry.id, rating)}
                            disabled={Boolean(entry.rating)}
                            aria-pressed={chosen}
                            aria-label={t(`feedback.${rating}`)}
                            title={t(`feedback.${rating}`)}
                            data-testid={`jev-rate-${rating}`}
                            className={`flex size-11 items-center justify-center rounded-full transition-colors disabled:cursor-default ${
                              chosen
                                ? "text-[#2563EB]"
                                : "text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] disabled:opacity-40 disabled:hover:bg-transparent"
                            }`}
                          >
                            <Icon
                              className="size-4"
                              fill={chosen ? "currentColor" : "none"}
                              aria-hidden
                            />
                          </button>
                        );
                      })}
                      {entry.rating === "up" && (
                        <span className="text-[12px] font-medium text-[#64748B]">
                          {t("feedback.thanks")}
                        </span>
                      )}
                    </div>
                  )}
                  {entry.id === lastId &&
                    entry.suggestions &&
                    entry.suggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.suggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => onSuggestion(suggestion)}
                            disabled={busy !== null}
                            data-testid="jev-suggestion"
                            className="min-h-11 rounded-full border border-[#DBEAFE] bg-white px-3.5 py-2 text-left text-[13px] font-semibold leading-snug text-[#1E3A8A] transition-colors hover:bg-[#EFF6FF] disabled:opacity-50"
                          >
                            {suggestion}
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
              className="min-h-11 flex-1 resize-none rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-[16px] leading-snug sm:text-[14px] text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:bg-white"
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
