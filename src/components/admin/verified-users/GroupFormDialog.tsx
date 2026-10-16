"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Field,
  Notice,
  buttonClass,
  inputClass,
  textareaClass,
} from "@/components/admin/finance/ui";
import Modal from "@/components/shared/Modal";
import { cn } from "@/lib/utils";
import {
  USER_GROUP_MAX_MEMBERS,
  USER_GROUP_NAME_MAX,
  USER_GROUP_NOTE_MAX,
  addMember,
  groupToDraft,
  memberPickReason,
  parseGroupInput,
  pickPayer,
  removeMember,
  type GroupDraft,
  type PickerUser,
  type UserGroupErrorCode,
  type UserGroupRow,
} from "@/lib/user-groups";
import {
  isUncertainFailure,
  saveGroup,
  useVerifiedUsersErrorText,
} from "./api";
import {
  ConfirmPanel,
  DIALOG_BODY_CLASS,
  DIALOG_FOOTER_CLASS,
} from "./ConfirmDialog";
import UserIdentity from "./UserIdentity";
import UserPicker from "./UserPicker";

// Create or edit a payer group (C52): name, ONE payer, the people they paid
// for, an admin-only note. An edit sends the whole desired state; the server
// replaces the member set atomically. The parent gives every opening a new
// `key`, so the form always starts from `group` (or empty) and never from the
// previous opening.

type FieldName = "name" | "note" | "payer" | "members";
type FocusTarget =
  | { to: "name" | "note" | "payerInput" | "payerChange" | "membersInput" }
  | { to: "memberRemove"; index: number };

function fieldOf(code: UserGroupErrorCode): FieldName {
  switch (code) {
    case "name_required":
    case "name_too_long":
      return "name";
    case "note_too_long":
      return "note";
    case "payer_required":
    case "payer_in_members":
      return "payer";
    default:
      return "members";
  }
}

// Compared as sets: order never matters for what is saved.
function peopleKey(draft: GroupDraft) {
  return [
    draft.payer?.id ?? "",
    ...draft.members.map((member) => member.id).sort(),
  ].join("|");
}

export default function GroupFormDialog({
  open,
  group,
  onClose,
  onSaved,
  onGone,
  onUncertain,
  saveGated,
}: {
  open: boolean;
  /** The group to edit, or null to create one. */
  group: UserGroupRow | null;
  onClose: () => void;
  /** Saved: the parent toasts, reloads and closes. `name` is the saved name. */
  onSaved: (name: string, created: boolean) => void;
  /** The group no longer exists (deleted meanwhile). */
  onGone: () => void;
  /** A create may have gone through although it failed: reload the list. */
  onUncertain: () => void;
  /** True until that reload has finished: another save would add a twin. */
  saveGated: boolean;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const tShared = useTranslations("DashboardShared");
  const errorText = useVerifiedUsersErrorText();
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const noteId = `${baseId}-note`;
  const payerLabelId = `${baseId}-payer-label`;
  const payerInputId = `${baseId}-payer`;
  const membersInputId = `${baseId}-members`;

  const [start] = useState(() => ({
    name: group?.name ?? "",
    note: group?.note ?? "",
    draft: group ? groupToDraft(group) : { payer: null, members: [] },
  }));
  const [name, setName] = useState(start.name);
  const [note, setNote] = useState(start.note);
  const [draft, setDraft] = useState<GroupDraft>(start.draft);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, UserGroupErrorCode>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<FocusTarget | null>(null);

  const submitting = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const payerInputRef = useRef<HTMLInputElement>(null);
  const payerChangeRef = useRef<HTMLButtonElement>(null);
  const membersInputRef = useRef<HTMLInputElement>(null);
  const membersListRef = useRef<HTMLUListElement>(null);
  const resume = useRef<{
    pending: boolean;
    scroll: number;
    focus: HTMLElement | null;
  }>({ pending: false, scroll: 0, focus: null });

  const dirty =
    name !== start.name ||
    note !== start.note ||
    peopleKey(draft) !== peopleKey(start.draft);
  const nameLength = Array.from(name).length;
  const noteLength = Array.from(note).length;

  // Creating starts on the name with a mouse; on a phone the soft keyboard
  // would cover the sheet. Runs after the Modal's own first focus (timer 0),
  // and only from there: someone who already moved into the form keeps their
  // place (focus is never pulled away from a field being typed in).
  useEffect(() => {
    if (!open || group || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      nameRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [open, group]);

  // Focus never falls to the page behind: whatever was focused and unmounts
  // (the payer input after a pick, a removed member's button) hands over here.
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.to === "memberRemove") {
      const buttons =
        membersListRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-member-remove]",
        );
      const target =
        buttons && buttons.length > 0
          ? buttons[Math.min(focusRequest.index, buttons.length - 1)]
          : membersInputRef.current;
      target?.focus();
      return;
    }
    const refs = {
      name: nameRef,
      note: noteRef,
      payerInput: payerInputRef,
      payerChange: payerChangeRef,
      membersInput: membersInputRef,
    };
    refs[focusRequest.to].current?.focus();
  }, [focusRequest]);

  // Back from the discard question: the form comes back where it was.
  useEffect(() => {
    if (discarding || !resume.current.pending) return;
    const { scroll, focus } = resume.current;
    resume.current.pending = false;
    const scroller = rootRef.current?.parentElement;
    if (scroller) scroller.scrollTop = scroll;
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    else nameRef.current?.focus({ preventScroll: true });
  }, [discarding]);

  function requestClose() {
    if (saving) return;
    if (discarding) {
      // Escape, the X or the backdrop on the question itself: keep editing.
      setDiscarding(false);
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    resume.current = {
      pending: true,
      // The Modal's scrolling body is the parent of this root element.
      scroll: rootRef.current?.parentElement?.scrollTop ?? 0,
      focus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    };
    setDiscarding(true);
  }

  function clearError(field: FieldName) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function choosePayer(user: PickerUser) {
    if (saving) return;
    const wasMember = draft.members.some(
      (member) => member.id.toLowerCase() === user.id.toLowerCase(),
    );
    setDraft(pickPayer(draft, user));
    clearError("payer");
    clearError("members");
    // The picker is replaced by the chosen person and focus lands on "Change":
    // without this a screen reader would not hear who was chosen.
    setAnnouncement(
      t(
        wasMember ? "form.announce.movedToPayer" : "form.announce.payerChosen",
        { name: user.display_name },
      ),
    );
    setFocusRequest({ to: "payerChange" });
  }

  function changePayer() {
    if (saving) return;
    setDraft({ ...draft, payer: null });
    setFocusRequest({ to: "payerInput" });
  }

  function chooseMember(user: PickerUser) {
    if (saving) return;
    const result = addMember(draft, user);
    // A refused pick is shown in the picker as the option's reason.
    if (!result.ok) return;
    setDraft(result.draft);
    clearError("members");
    setAnnouncement(
      t("form.announce.added", {
        name: user.display_name,
        count: result.draft.members.length,
        max: USER_GROUP_MAX_MEMBERS,
      }),
    );
  }

  function dropMember(member: PickerUser, index: number) {
    if (saving) return;
    const next = removeMember(draft, member.id);
    setDraft(next);
    setAnnouncement(
      t("form.announce.removed", {
        name: member.display_name,
        count: next.members.length,
        max: USER_GROUP_MAX_MEMBERS,
      }),
    );
    setFocusRequest({ to: "memberRemove", index });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // A ref: a held Enter submits again before the next render.
    if (submitting.current || saveGated) return;
    const parsed = parseGroupInput({
      name,
      note,
      payerId: draft.payer?.id,
      memberIds: draft.members.map((member) => member.id),
    });
    if (!parsed.ok) {
      const field = fieldOf(parsed.error);
      setFieldErrors({ [field]: parsed.error });
      setSubmitError(null);
      setFocusRequest({
        to:
          field === "payer"
            ? draft.payer
              ? "payerChange"
              : "payerInput"
            : field === "members"
              ? "membersInput"
              : field,
      });
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    submitting.current = true;
    setSaving(true);
    const result = await saveGroup(parsed.value, group?.id ?? null);
    submitting.current = false;
    if (result.ok) {
      onSaved(parsed.value.name, !group);
      return;
    }
    setSaving(false);
    if (group && result.error.code === "not_found") {
      onGone();
      return;
    }
    // A create is not idempotent: it may have committed before the failure, so
    // the list is reloaded behind the dialog and the message says to look at it
    // before creating the group again.
    if (!group && isUncertainFailure(result.error)) {
      onUncertain();
      setSubmitError("uncertain");
      return;
    }
    setSubmitError(result.error.code);
  }

  // Called, not rendered as a component: a component type declared inside
  // another one is a new type on every render.
  function fieldError(field: FieldName) {
    const code = fieldErrors[field];
    if (!code) return null;
    return (
      <p
        id={`${baseId}-${field}-error`}
        className="text-[12px] font-semibold text-[#B91C1C]"
      >
        {errorText(code)}
      </p>
    );
  }
  const errorId = (field: FieldName) =>
    fieldErrors[field] ? `${baseId}-${field}-error` : undefined;

  return (
    <Modal
      isOpen={open}
      onClose={requestClose}
      title={group ? t("form.editTitle") : t("groups.create")}
      size="lg"
      bodyClassName={DIALOG_BODY_CLASS}
    >
      <div ref={rootRef}>
        <form
          hidden={discarding}
          noValidate
          onSubmit={(event) => void submit(event)}
          data-testid="group-form"
          className="space-y-5"
        >
          <Field label={t("form.name")} htmlFor={nameId}>
            <input
              id={nameId}
              ref={nameRef}
              type="text"
              value={name}
              readOnly={saving}
              autoComplete="off"
              placeholder={t("form.namePlaceholder")}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={errorId("name")}
              onChange={(event) => {
                setName(event.target.value);
                clearError("name");
              }}
              className={cn(inputClass, "text-[16px]")}
            />
            <p
              className={cn(
                "text-right text-[12px] tabular-nums",
                nameLength > USER_GROUP_NAME_MAX
                  ? "font-bold text-[#B91C1C]"
                  : "text-[#64748B]",
              )}
            >
              {t("form.counter", {
                count: nameLength,
                max: USER_GROUP_NAME_MAX,
              })}
            </p>
            {fieldError("name")}
          </Field>

          <div
            role="group"
            aria-labelledby={payerLabelId}
            className="min-w-0 space-y-1.5"
          >
            <label
              id={payerLabelId}
              htmlFor={payerInputId}
              className="block text-[13px] font-semibold text-[#475569]"
            >
              {t("form.payer")}
            </label>
            <p className="text-[12px] leading-[18px] text-[#64748B]">
              {t("form.payerHint")}
            </p>
            {group && !group.payer && !draft.payer && (
              <Notice tone="warning">{t("form.payerDeleted")}</Notice>
            )}
            {draft.payer ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1">
                <UserIdentity
                  user={draft.payer}
                  verified={draft.payer.is_verified}
                  className="flex-[1_1_12rem]"
                />
                <button
                  ref={payerChangeRef}
                  type="button"
                  onClick={changePayer}
                  data-jev-label={t("form.payerChange")}
                  className={cn(buttonClass("secondary"), "shrink-0")}
                >
                  {t("form.payerChange")}
                </button>
              </div>
            ) : (
              <UserPicker
                id={payerInputId}
                ref={payerInputRef}
                label={t("form.payer")}
                onSelect={choosePayer}
                invalid={Boolean(fieldErrors.payer)}
                describedBy={errorId("payer")}
              />
            )}
            {fieldError("payer")}
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor={membersInputId}
                className="block text-[13px] font-semibold text-[#475569]"
              >
                {t("form.members")}
              </label>
              <span className="text-[12px] tabular-nums text-[#64748B]">
                {t("form.counter", {
                  count: draft.members.length,
                  max: USER_GROUP_MAX_MEMBERS,
                })}
              </span>
            </div>
            <p className="text-[12px] leading-[18px] text-[#64748B]">
              {t("form.membersHint")}
            </p>
            <UserPicker
              id={membersInputId}
              ref={membersInputRef}
              label={t("form.members")}
              disabledReason={(user) => {
                const reason = memberPickReason(draft, user.id);
                return reason ? t(`picker.${reason}`) : null;
              }}
              onSelect={chooseMember}
              invalid={Boolean(fieldErrors.members)}
              describedBy={errorId("members")}
            />
            {fieldError("members")}
            {draft.members.length === 0 ? (
              <p className="text-[13px] text-[#64748B]">
                {t("form.membersEmpty")}
              </p>
            ) : (
              <ul
                ref={membersListRef}
                aria-label={t("form.members")}
                data-testid="group-form-members"
                className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-[#E2E8F0] p-1.5"
              >
                {draft.members.map((member, index) => (
                  <li key={member.id} className="flex items-center gap-2">
                    <UserIdentity
                      user={member}
                      verified={member.is_verified}
                      compact
                      className="flex-1"
                    />
                    {/* Never disabled: the person's name is in the label. */}
                    <button
                      type="button"
                      data-member-remove
                      aria-label={t("form.memberRemoveAria", {
                        name: member.display_name,
                      })}
                      aria-busy={saving || undefined}
                      data-jev-label={t("form.memberRemove")}
                      onClick={() => dropMember(member, index)}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#B91C1C]"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Field label={t("form.note")} htmlFor={noteId}>
            <textarea
              id={noteId}
              ref={noteRef}
              value={note}
              rows={4}
              readOnly={saving}
              aria-invalid={fieldErrors.note ? true : undefined}
              aria-describedby={errorId("note")}
              onChange={(event) => {
                setNote(event.target.value);
                clearError("note");
              }}
              className={cn(textareaClass, "text-[16px]")}
            />
            <p
              className={cn(
                "text-right text-[12px] tabular-nums",
                noteLength > USER_GROUP_NOTE_MAX
                  ? "font-bold text-[#B91C1C]"
                  : "text-[#64748B]",
              )}
            >
              {t("form.counter", {
                count: noteLength,
                max: USER_GROUP_NOTE_MAX,
              })}
            </p>
            {fieldError("note")}
          </Field>

          <Notice tone="neutral">{t("form.money")}</Notice>

          {submitError && (
            <div role="alert">
              <Notice tone="danger">{errorText(submitError)}</Notice>
            </div>
          )}

          <div className={DIALOG_FOOTER_CLASS}>
            <button
              type="button"
              disabled={saving}
              onClick={requestClose}
              data-jev-label={tShared("cancel")}
              className={cn(buttonClass("secondary"), "w-full sm:w-auto")}
            >
              {tShared("cancel")}
            </button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={saveGated}
              data-jev-label={group ? tShared("save") : t("form.submitCreate")}
              className="w-full sm:w-auto"
            >
              {group ? tShared("save") : t("form.submitCreate")}
            </Button>
          </div>
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </form>
        {discarding && (
          // The same confirmation as the other dialogs, but inside this modal:
          // a second Modal would answer the same Escape. It follows the hidden
          // form in the DOM because the Modal's Tab trap wraps from the first
          // to the last control it finds, and the last one must be here.
          <ConfirmPanel
            tone="danger"
            heading={t("form.discardTitle")}
            notice={t("form.discard")}
            confirmLabel={t("form.discardConfirm")}
            cancelLabel={t("form.keepEditing")}
            onConfirm={onClose}
            onCancel={() => setDiscarding(false)}
          />
        )}
      </div>
    </Modal>
  );
}
