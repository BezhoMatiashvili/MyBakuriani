"use client";

import { useTranslations } from "next-intl";
import Modal from "@/components/shared/Modal";
import ChangeForm, { type ChangeFormProps } from "./ChangeForm";

// The change form in a modal (bulk bar and row "manage" buttons). Mounted
// only while open, so every opening starts from empty inputs.

export default function ChangeDialog({
  open,
  ...props
}: ChangeFormProps & { open: boolean }) {
  const t = useTranslations("AdminStatuses");
  return (
    <Modal
      isOpen={open}
      onClose={props.onClose}
      title={t("dialog.title")}
      size="xl"
    >
      {open && <ChangeForm {...props} />}
    </Modal>
  );
}
