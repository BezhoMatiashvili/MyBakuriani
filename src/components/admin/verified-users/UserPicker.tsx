"use client";

import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { inputClass } from "@/components/admin/finance/ui";
import { ApiError } from "@/components/admin/statuses/shared";
import { cn } from "@/lib/utils";
import {
  USER_SEARCH_LIMIT,
  USER_SEARCH_MIN_CHARS,
  normalizeSearchTerm,
  type PickerUser,
} from "@/lib/user-groups";
import { searchUsers, useVerifiedUsersErrorText } from "./api";
import UserIdentity from "./UserIdentity";

// Search any account by name, phone or ID and pick one (C52). A WAI-ARIA
// combobox whose results sit IN the page flow under the input: the picker lives
// in a modal body that scrolls, where an absolutely positioned list would be
// clipped. It owns no selection: the parent decides what a pick means and which
// accounts cannot be picked (and says why).

const DEBOUNCE_MS = 250;

export default function UserPicker({
  id,
  label,
  placeholder,
  disabledReason,
  onSelect,
  invalid = false,
  describedBy,
  ref,
}: {
  /** The input's id: the parent's visible <label> points at it. */
  id: string;
  /** Names the input and its results list for screen readers. */
  label: string;
  placeholder?: string;
  /** Why this account cannot be picked now, or null when it can. */
  disabledReason?: (user: PickerUser) => string | null;
  onSelect: (user: PickerUser) => void;
  invalid?: boolean;
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const tStatuses = useTranslations("AdminStatuses");
  const errorText = useVerifiedUsersErrorText();
  // useId has colons: ids are only ever looked up with getElementById.
  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const optionId = (userId: string) => `${baseId}-opt-${userId}`;

  const [text, setText] = useState("");
  const [results, setResults] = useState<PickerUser[] | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const term = normalizeSearchTerm(text);
  const searchable = Array.from(term).length >= USER_SEARCH_MIN_CHARS;

  useEffect(() => {
    if (!searchable) {
      setResults(null);
      setPending(false);
      setFailure(null);
      return;
    }
    // Aborting on cleanup is the stale-response guard: an answer for an older
    // term never lands (the signal check also covers a response that settled
    // just before the abort).
    const controller = new AbortController();
    setPending(true);
    const timer = window.setTimeout(() => {
      searchUsers(term, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setResults(found);
          setFailure(null);
          setActiveId(null);
          setPending(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFailure(error instanceof ApiError ? error.code : "network");
          setPending(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, searchable, attempt]);

  const panelVisible = focused && !dismissed && searchable;
  const found = results ?? [];
  const listVisible =
    panelVisible && !failure && results !== null && found.length > 0;
  const reasonOf = (user: PickerUser) => disabledReason?.(user) ?? null;
  const enabled = found.filter((user) => !reasonOf(user));
  const tooShort = focused && text.trim() !== "" && !searchable;

  let announcement = "";
  if (panelVisible) {
    if (failure) announcement = errorText(failure);
    else if (results === null || (pending && found.length === 0)) {
      announcement = t("picker.loading");
    } else if (found.length === 0) announcement = t("picker.none");
    else announcement = t("picker.count", { count: found.length });
  }

  function select(user: PickerUser) {
    onSelect(user);
    setText("");
    setDismissed(false);
    setActiveId(null);
  }

  function move(step: 1 | -1) {
    if (enabled.length === 0) return;
    const at = enabled.findIndex((user) => user.id === activeId);
    const next =
      at === -1
        ? step === 1
          ? 0
          : enabled.length - 1
        : (at + step + enabled.length) % enabled.length;
    setActiveId(enabled[next].id);
    document
      .getElementById(optionId(enabled[next].id))
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        // Reopens a list closed with Escape; the keys never move the caret.
        event.preventDefault();
        setDismissed(false);
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      case "Enter": {
        // Never submits the form this picker sits in.
        event.preventDefault();
        // The panel closes on Tab, so its Retry button is out of the keyboard's
        // reach: Enter asks again.
        if (panelVisible && failure) {
          setAttempt((n) => n + 1);
          return;
        }
        const user = enabled.find((item) => item.id === activeId);
        if (listVisible && user) select(user);
        return;
      }
      case "Escape":
        // Closes the list only while it is open; otherwise the Escape reaches
        // the modal. React's root listener stops it before the modal's.
        if (panelVisible) {
          event.stopPropagation();
          setDismissed(true);
          setActiveId(null);
        }
        return;
      case "Tab":
        setDismissed(true);
        return;
    }
  }

  return (
    <div className="min-w-0">
      <input
        id={id}
        ref={ref}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listVisible ? listId : undefined}
        aria-activedescendant={
          listVisible && activeId ? optionId(activeId) : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={
          [describedBy, tooShort ? hintId : null].filter(Boolean).join(" ") ||
          undefined
        }
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={placeholder ?? t("picker.placeholder")}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setDismissed(false);
          setActiveId(null);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className={cn(inputClass, "text-[16px]")}
      />
      {tooShort && (
        <p id={hintId} className="mt-1.5 text-[12px] text-[#64748B]">
          {t("picker.hint", { min: USER_SEARCH_MIN_CHARS })}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {panelVisible && (
        // mousedown would blur the input before the click lands (and would
        // drop the keyboard on a phone): keep the focus where it is.
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="mt-2 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
        >
          {failure ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1 text-[13px] text-[#991B1B]">
              <span>{errorText(failure)}</span>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex min-h-11 items-center font-bold text-[#2563EB] underline-offset-2 hover:underline"
              >
                {tStatuses("common.retry")}
              </button>
            </div>
          ) : results === null || (pending && found.length === 0) ? (
            <p className="flex min-h-11 items-center gap-2 px-3 text-[13px] text-[#64748B]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("picker.loading")}
            </p>
          ) : found.length === 0 ? (
            <div className="px-3 py-3">
              <p className="text-[13px] font-semibold text-[#334155]">
                {t("picker.none")}
              </p>
              <p className="mt-0.5 text-[12px] text-[#64748B]">
                {t("picker.noneHint")}
              </p>
            </div>
          ) : (
            <>
              <ul
                id={listId}
                role="listbox"
                aria-label={label}
                aria-busy={pending || undefined}
                className={cn(
                  "max-h-72 overflow-y-auto overscroll-contain py-1",
                  pending && "opacity-60",
                )}
              >
                {found.map((user) => {
                  const reason = reasonOf(user);
                  const active = user.id === activeId;
                  return (
                    <li
                      key={user.id}
                      id={optionId(user.id)}
                      role="option"
                      aria-selected={active}
                      aria-disabled={reason ? true : undefined}
                      onClick={() => {
                        if (!reason) select(user);
                      }}
                      onMouseMove={() => {
                        if (!reason && !active) setActiveId(user.id);
                      }}
                      className={cn(
                        "min-h-11 px-3 py-1",
                        reason
                          ? "cursor-not-allowed bg-[#F8FAFC]"
                          : "cursor-pointer",
                        active && "bg-[#EFF6FF]",
                      )}
                    >
                      <UserIdentity
                        user={user}
                        verified={user.is_verified}
                        compact
                        extra={
                          reason ? (
                            <p className="text-[12px] font-semibold leading-4 text-[#B45309]">
                              {reason}
                            </p>
                          ) : null
                        }
                      />
                    </li>
                  );
                })}
              </ul>
              {found.length >= USER_SEARCH_LIMIT && (
                <p className="border-t border-[#F1F5F9] px-3 py-2 text-[12px] text-[#64748B]">
                  {t("picker.limitHint", { count: USER_SEARCH_LIMIT })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
