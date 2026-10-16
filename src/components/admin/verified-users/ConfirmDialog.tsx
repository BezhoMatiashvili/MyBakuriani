"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Button, Notice, buttonClass } from "@/components/admin/finance/ui";
import Modal from "@/components/shared/Modal";
import { cn } from "@/lib/utils";
import { useVerifiedUsersErrorText } from "./api";

// The one confirmation of this page (C52): remove a verification, delete a
// group, and (as a bare ConfirmPanel inside the form's own modal) discard an
// unsaved group. Two stacked Modals would both answer one Escape, so the
// form never opens a second one.

export type ConfirmTone = "danger" | "neutral";

// On a phone every Modal is a bottom sheet and the support launcher (fixed,
// bottom-right, z-80) floats above it: stacked full-width buttons with Save on
// top, and room under them inside the sheet's scrolling body.
export const DIALOG_BODY_CLASS = "pb-[calc(6rem+env(safe-area-inset-bottom))]";
export const DIALOG_FOOTER_CLASS =
  "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

export function ConfirmPanel({
  tone,
  heading,
  target,
  notice,
  error,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  tone: ConfirmTone;
  heading?: string;
  /** Who or what is affected, shown above the explanation. */
  target?: ReactNode;
  notice?: string;
  /** Already worded; fixed error strings only, never a name. */
  error?: string | null;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The safe choice gets focus, after the Modal's own first focus (its close
  // button, timer 0).
  useEffect(() => {
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      {heading && (
        <p className="text-[15px] font-bold text-[#0F172A]">{heading}</p>
      )}
      {target}
      {notice && (
        <Notice tone={tone === "danger" ? "warning" : "info"}>{notice}</Notice>
      )}
      {error && (
        <div role="alert">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <div className={DIALOG_FOOTER_CLASS}>
        <button
          ref={cancelRef}
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-jev-label={cancelLabel}
          className={cn(buttonClass("secondary"), "w-full sm:w-auto")}
        >
          {cancelLabel}
        </button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          loading={busy}
          onClick={onConfirm}
          data-jev-label={confirmLabel}
          className="w-full sm:w-auto"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function ConfirmBody({
  tone,
  confirmLabel,
  notice,
  target,
  onConfirm,
  onClose,
  busyRef,
}: {
  tone: ConfirmTone;
  confirmLabel: string;
  notice?: string;
  target?: ReactNode;
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
  busyRef: MutableRefObject<boolean>;
}) {
  const tShared = useTranslations("DashboardShared");
  const errorText = useVerifiedUsersErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    // A ref, not the state: a held Enter fires again before a render.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    let code: string | null;
    try {
      code = await onConfirm();
    } catch {
      code = "server_error";
    }
    busyRef.current = false;
    if (code) {
      setBusy(false);
      setError(errorText(code));
      return;
    }
    onClose();
  }

  return (
    <ConfirmPanel
      tone={tone}
      target={target}
      notice={notice}
      error={error}
      confirmLabel={confirmLabel}
      cancelLabel={tShared("cancel")}
      busy={busy}
      onConfirm={() => void run()}
      onCancel={onClose}
    />
  );
}

/**
 * `onConfirm` runs the action and answers an error code, or null when it
 * worked (the caller shows its own toast and reloads). It runs once; the
 * dialog cannot be closed while it is in flight. Mounted only while open, so
 * every opening starts without a busy state or an old error.
 */
export default function ConfirmDialog({
  open,
  title,
  tone,
  confirmLabel,
  notice,
  target,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  tone: ConfirmTone;
  confirmLabel: string;
  notice?: string;
  target?: ReactNode;
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}) {
  const busyRef = useRef(false);
  const requestClose = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen={open}
      onClose={requestClose}
      title={title}
      size="md"
      bodyClassName={DIALOG_BODY_CLASS}
    >
      {open && (
        <ConfirmBody
          tone={tone}
          confirmLabel={confirmLabel}
          notice={notice}
          target={target}
          onConfirm={onConfirm}
          onClose={onClose}
          busyRef={busyRef}
        />
      )}
    </Modal>
  );
}
