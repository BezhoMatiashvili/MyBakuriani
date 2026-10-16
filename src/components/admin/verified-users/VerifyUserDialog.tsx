"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Field, Notice, buttonClass } from "@/components/admin/finance/ui";
import Modal from "@/components/shared/Modal";
import { cn } from "@/lib/utils";
import type { PickerUser } from "@/lib/user-groups";
import { setVerified, useVerifiedUsersErrorText } from "./api";
import { DIALOG_BODY_CLASS, DIALOG_FOOTER_CLASS } from "./ConfirmDialog";
import UserIdentity from "./UserIdentity";
import UserPicker from "./UserPicker";

// "Verify a user" (C52): find any account, then confirm. Verification sets
// profiles.is_verified through the shared toggle route; the public badge on
// the account's listings follows the page caches within minutes.

function VerifyBody({
  onClose,
  onDone,
  busyRef,
}: {
  onClose: () => void;
  onDone: () => void;
  busyRef: MutableRefObject<boolean>;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const tClient = useTranslations("AdminClientDetail");
  const tShared = useTranslations("DashboardShared");
  const errorText = useVerifiedUsersErrorText();
  const inputId = useId();
  const stepRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const stepChanged = useRef(false);
  const [chosen, setChosen] = useState<PickerUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search is the point of the first step, so it starts focused with a mouse
  // (after the Modal's own first focus); on a phone the soft keyboard would
  // cover most of the sheet. Never pulls focus off a field already in use.
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const timer = window.setTimeout(() => {
      if (stepRef.current?.contains(document.activeElement)) return;
      pickerRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, []);

  // A step change removes the focused element: put focus on the new step's
  // control instead of letting it fall to the page behind.
  useEffect(() => {
    if (!stepChanged.current) return;
    (chosen ? confirmRef : pickerRef).current?.focus();
  }, [chosen]);

  async function confirm() {
    if (!chosen || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const result = await setVerified(chosen.id, true);
    busyRef.current = false;
    if (!result.ok) {
      setBusy(false);
      setError(errorText(result.error.code));
      return;
    }
    if (result.data.changed) toast.success(t("verify.done"));
    else toast.info(t("verify.alreadyDone"));
    onDone();
    onClose();
  }

  if (!chosen) {
    return (
      <div ref={stepRef} className="space-y-4">
        <Field label={t("verify.pickLabel")} htmlFor={inputId}>
          <UserPicker
            id={inputId}
            ref={pickerRef}
            label={t("verify.pickLabel")}
            disabledReason={(user) =>
              user.is_verified ? t("picker.alreadyVerified") : null
            }
            onSelect={(user) => {
              stepChanged.current = true;
              setChosen(user);
            }}
          />
          {/* The kit's Field hint is #94A3B8 (2.6:1 on white): own line, AA colour. */}
          <p className="text-[12px] leading-[18px] text-[#64748B]">
            {t("verify.pickHint")}
          </p>
        </Field>
        <div className={DIALOG_FOOTER_CLASS}>
          <button
            type="button"
            onClick={onClose}
            data-jev-label={tShared("cancel")}
            className={cn(buttonClass("secondary"), "w-full sm:w-auto")}
          >
            {tShared("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
        <UserIdentity user={chosen} verified={chosen.is_verified} />
      </div>
      <Notice tone="info">{t("verify.notice")}</Notice>
      {error && (
        <div role="alert">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <div className={DIALOG_FOOTER_CLASS}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            stepChanged.current = true;
            setError(null);
            setChosen(null);
          }}
          data-jev-label={t("verify.change")}
          className={cn(buttonClass("secondary"), "w-full sm:w-auto")}
        >
          {t("verify.change")}
        </button>
        <button
          ref={confirmRef}
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          data-jev-label={tClient("markVerified")}
          className={cn(buttonClass("primary"), "w-full sm:w-auto")}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {tClient("markVerified")}
        </button>
      </div>
    </div>
  );
}

/** Mounted only while open, so every opening starts at the search step. */
export default function VerifyUserDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The account was verified (or already was): reload the list. */
  onDone: () => void;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const busyRef = useRef(false);
  const requestClose = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen={open}
      onClose={requestClose}
      title={t("users.verifyAction")}
      size="md"
      bodyClassName={DIALOG_BODY_CLASS}
    >
      {open && (
        <VerifyBody onClose={onClose} onDone={onDone} busyRef={busyRef} />
      )}
    </Modal>
  );
}
